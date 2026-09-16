import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_TIMEOUT_MS, installFetchTimeout, isAbort, isTimeout,
} from '../../frontend/src/utils/fetchTimeout.js';

/**
 * Every request settles.
 *
 * An audit of the flight journey on 16 Sep 2026 found that not one `fetch` on
 * it carried a timeout or a deadline - price config, feature flag, fare price,
 * fare rules, the traveller re-price, search, the upsell, the payment callback.
 * A REJECTED request is caught everywhere; a STALLED one never settles, and
 * each of those sits behind a spinner with no escape. The worst is after the
 * card is charged, where a stalled callback leaves the customer on "Checking
 * Your Payment..." for ever on a page that renders no navigation at all.
 *
 * Forty-three call sites had already forgotten, so the deadline is installed
 * once on `fetch` itself rather than left to each of them to remember.
 */

/** A fetch that never answers - what a stalled socket looks like from here. */
const stalls = () => vi.fn((_input, init) => new Promise((_resolve, reject) => {
  init?.signal?.addEventListener('abort', () => reject(init.signal.reason));
}));

const scopeWith = (impl) => ({ fetch: impl });

let uninstall = () => {};
afterEach(() => { uninstall(); uninstall = () => {}; });

describe('a request that never answers', () => {
  it('rejects once the deadline passes, instead of hanging for ever', async () => {
    const scope = scopeWith(stalls());
    uninstall = installFetchTimeout({ timeoutMs: 20, scope });

    await expect(scope.fetch('/api/anything')).rejects.toSatisfy(isTimeout);
  });

  /**
   * The difference matters: a caller that treats every abort as "the component
   * unmounted, ignore it" would swallow the deadline and leave the spinner
   * exactly where it was.
   */
  it('rejects as a TimeoutError, which a caller can tell from its own cancel', async () => {
    const scope = scopeWith(stalls());
    uninstall = installFetchTimeout({ timeoutMs: 20, scope });

    const error = await scope.fetch('/api/anything').catch((e) => e);

    expect(error.name).toBe('TimeoutError');
    expect(isTimeout(error)).toBe(true);
    expect(isAbort(error)).toBe(false);
  });
});

describe('a caller that cancels for itself', () => {
  it('still cancels - an unmount is not broken by the deadline', async () => {
    const scope = scopeWith(stalls());
    uninstall = installFetchTimeout({ timeoutMs: 10_000, scope });
    const controller = new AbortController();

    const pending = scope.fetch('/api/anything', { signal: controller.signal });
    controller.abort();
    const error = await pending.catch((e) => e);

    expect(isAbort(error)).toBe(true);
    expect(isTimeout(error)).toBe(false);
  });

  it('is still given a deadline of its own, so its own signal is not the only way out', async () => {
    const scope = scopeWith(stalls());
    uninstall = installFetchTimeout({ timeoutMs: 20, scope });
    const controller = new AbortController();

    await expect(scope.fetch('/api/anything', { signal: controller.signal })).rejects.toSatisfy(isTimeout);
  });

  // Nothing to wait for; do not build a signal around it.
  it('passes an already-aborted request straight through', async () => {
    const inner = vi.fn(async () => 'answered');
    const scope = scopeWith(inner);
    uninstall = installFetchTimeout({ timeoutMs: 20, scope });
    const controller = new AbortController();
    controller.abort();

    await scope.fetch('/api/anything', { signal: controller.signal });

    expect(inner.mock.calls[0][1].signal.aborted).toBe(true);
  });
});

describe('a request that answers normally', () => {
  it('is untouched', async () => {
    const inner = vi.fn(async () => ({ ok: true }));
    const scope = scopeWith(inner);
    uninstall = installFetchTimeout({ timeoutMs: 50, scope });

    await expect(scope.fetch('/api/fine')).resolves.toEqual({ ok: true });
  });

  it('keeps the caller\'s own options', async () => {
    const inner = vi.fn(async () => ({ ok: true }));
    const scope = scopeWith(inner);
    uninstall = installFetchTimeout({ timeoutMs: 50, scope });

    await scope.fetch('/api/fine', { method: 'POST', headers: { 'X-Test': '1' }, body: 'hello' });

    expect(inner.mock.calls[0][1]).toMatchObject({ method: 'POST', headers: { 'X-Test': '1' }, body: 'hello' });
  });
});

describe('installing it', () => {
  /**
   * React StrictMode mounts twice in development. A second patch would wrap the
   * first, putting two deadlines on one request, the inner one firing first and
   * reporting the wrong thing.
   */
  it('patches once, however many times it is called', () => {
    const inner = vi.fn(async () => ({ ok: true }));
    const scope = scopeWith(inner);
    uninstall = installFetchTimeout({ timeoutMs: 50, scope });
    const first = scope.fetch;
    installFetchTimeout({ timeoutMs: 50, scope });

    expect(scope.fetch).toBe(first);
  });

  it('gives back the original when undone', () => {
    const inner = vi.fn(async () => ({ ok: true }));
    const scope = scopeWith(inner);
    const undo = installFetchTimeout({ timeoutMs: 50, scope });

    expect(scope.fetch).not.toBe(inner);
    undo();
    expect(scope.fetch).toBe(inner);
  });

  it('does nothing rather than throwing where there is no fetch', () => {
    expect(() => installFetchTimeout({ scope: {} })).not.toThrow();
  });
});

/**
 * The server's own worst case for a flight call is its Amadeus slot wait plus
 * the call itself - 8s + 25s - so a deadline under that turns a working request
 * into a failed one and a customer into a retrier.
 */
describe('the default', () => {
  it('outlasts the server it is waiting for', () => {
    const serverWorstCase = 8_000 + 25_000;

    expect(DEFAULT_TIMEOUT_MS).toBeGreaterThan(serverWorstCase);
  });

  it('is still a bounded wait, not an hour', () => {
    expect(DEFAULT_TIMEOUT_MS).toBeLessThanOrEqual(60_000);
  });
});

/**
 * The one request that must outlast the deadline, not be cut short by it.
 *
 * `axios` in this app is an in-tree shim over `fetch` (vite.config.js aliases
 * it), so the global deadline applies to every axios call too. The flight
 * booking POST allows five minutes on purpose: the server's own budget for
 * committing a PNR and issuing a ticket is about four, and a generic
 * 45-second deadline firing first would tell a customer their booking had
 * failed while it was being completed behind them - the worst outcome
 * available, because they have already paid.
 */
describe('a caller that asks to wait longer', () => {
  it('gets the deadline it asked for, not the default', async () => {
    const stalled = stalls();
    const scope = scopeWith(stalled);
    uninstall = installFetchTimeout({ timeoutMs: 20, scope });

    const pending = scope.fetch('/api/flights/order', { method: 'POST', timeoutMs: 10_000 });
    const settled = await Promise.race([
      pending.then(() => 'resolved', (e) => e.name),
      new Promise((r) => setTimeout(() => r('still waiting'), 120)),
    ]);

    expect(settled).toBe('still waiting');
  });

  it('does not pass its own bookkeeping on to fetch', async () => {
    const inner = vi.fn(async () => ({ ok: true }));
    const scope = scopeWith(inner);
    uninstall = installFetchTimeout({ timeoutMs: 50, scope });

    await scope.fetch('/api/flights/order', { method: 'POST', timeoutMs: 10_000 });

    expect(inner.mock.calls[0][1]).not.toHaveProperty('timeoutMs');
    expect(inner.mock.calls[0][1].method).toBe('POST');
  });

  it('falls back to the default for a nonsense value', async () => {
    const scope = scopeWith(stalls());
    uninstall = installFetchTimeout({ timeoutMs: 20, scope });

    await expect(scope.fetch('/api/anything', { timeoutMs: 'soon' })).rejects.toSatisfy(isTimeout);
  });
});

/**
 * The shim has to report a deadline that fired as a timeout, whoever set it.
 * Mapping the global one to ERR_NETWORK made it identical to a dropped
 * connection, so the order page's friendly rewrite never matched and a customer
 * read the raw DOMException text - "signal timed out" - straight after paying.
 */
describe('the axios shim, over a deadline that fired', () => {
  it('reports a TimeoutError as a timeout, not as a dead network', async () => {
    const { default: axios } = await import('../../frontend/src/utils/axiosShim.js');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new DOMException('signal timed out', 'TimeoutError'); }));

    const error = await axios.post('/api/flights/order', {}).catch((e) => e);

    expect(error.code).toBe('ECONNABORTED');
    expect(error.message).toMatch(/timeout/i);
    vi.unstubAllGlobals();
  });

  it('still reports a genuinely dead network as one', async () => {
    const { default: axios } = await import('../../frontend/src/utils/axiosShim.js');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));

    const error = await axios.post('/api/anything', {}).catch((e) => e);

    expect(error.code).toBe('ERR_NETWORK');
    vi.unstubAllGlobals();
  });

  it('forwards a caller timeout to the global deadline', async () => {
    const { default: axios } = await import('../../frontend/src/utils/axiosShim.js');
    const inner = vi.fn(async () => { throw new TypeError('Failed to fetch'); });
    vi.stubGlobal('fetch', inner);

    await axios.post('/api/flights/order', {}, { timeout: 300_000 }).catch(() => {});

    expect(inner.mock.calls[0][1].timeoutMs).toBe(300_000);
    vi.unstubAllGlobals();
  });
});
