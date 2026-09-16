/**
 * Every request settles. That is the whole of it.
 *
 * An audit of the flight journey on 16 Sep 2026 found that not one `fetch` on
 * it carried a timeout or an `AbortSignal` deadline - price config, feature
 * flag, fare price, fare rules, the traveller re-price, search, the upsell, and
 * the payment callback. A rejected request is caught everywhere; a STALLED one
 * never settles at all, and each of those sits behind a spinner with no
 * escape. The worst is after the card is charged: a stalled callback leaves the
 * customer on "Checking Your Payment..." for ever, on a page that renders no
 * navbar, no footer and no phone number, while the order is never created.
 *
 * The same shape had already cost us once - `supabase.auth.getSession()` waits
 * on a cross-tab Web Lock with no acquire timeout, and left the review page
 * spinning through a booking attempt (PR #145).
 *
 * The fix is not a helper each call site must remember to use. Forty-three call
 * sites already forgot, and that discipline is exactly what failed. So the
 * deadline is installed once, on `fetch` itself, and applies to code that has
 * not been written yet.
 *
 * What it deliberately does NOT do:
 *
 * - It does not touch a request that already carries its own deadline. A
 *   caller that knows better - a long upload, a deliberate poll - keeps it.
 * - It does not cancel a caller's own AbortController. Those are used for
 *   "the component unmounted, stop caring", and they are combined with the
 *   deadline rather than replaced, so both still work.
 * - It does not retry. A retry on a slow network is how one stalled request
 *   becomes three.
 *
 * A timeout rejects with a DOMException named `TimeoutError`, which is how a
 * caller tells "we waited long enough" apart from "the user navigated away"
 * (`AbortError`). `isTimeout()` is here so that difference is written once.
 */

/**
 * How long to wait.
 *
 * Longer than it sounds, and the number is derived rather than picked. The
 * server's own worst case for a flight call is its Amadeus slot wait plus the
 * call itself - `AMADEUS_WS_QUEUE_TIMEOUT_MS` 8s + `AMADEUS_WS_TIMEOUT_MS` 25s
 * = 33 seconds - and a cold search measured 7.6s on a good connection. A
 * deadline that undercuts the server turns a working request into a failed one
 * and a customer into a retrier, which is worse than waiting.
 *
 * 45s clears that worst case with room for the network either side. It is a
 * backstop against a socket that has stopped answering, not a latency budget:
 * the thing it exists to prevent is not slowness but a wait with no end.
 *
 * The one request deliberately outside this is the booking POST, which the
 * server may legitimately hold for minutes while the chain commits and issues -
 * it carries its own, longer deadline.
 */
export const DEFAULT_TIMEOUT_MS = 45_000;

/** Whether a rejection is our deadline rather than a caller's own cancel. */
export const isTimeout = (error) => error?.name === 'TimeoutError'
  || (error?.name === 'AbortError' && /timed? ?out/i.test(String(error?.message ?? '')));

/** Whether a rejection is a deliberate cancel - an unmount, a newer search. */
export const isAbort = (error) => error?.name === 'AbortError' && !isTimeout(error);

/**
 * Combine the caller's signal with a deadline.
 *
 * `AbortSignal.any` is the only way to abort on either without owning the
 * caller's controller. Where it is missing (Safari below 17.4, Chrome below
 * 116) the caller's signal is returned untouched: a browser that cannot do
 * this keeps today's behaviour rather than losing the unmount cancel, which
 * would be a worse trade than no deadline.
 */
const withDeadline = (signal, timeoutMs) => {
  const deadline = AbortSignal.timeout(timeoutMs);
  if (!signal) return deadline;
  if (typeof AbortSignal.any !== 'function') return signal;
  return AbortSignal.any([signal, deadline]);
};

let installed = false;

/**
 * Patch `fetch` once, for the life of the page.
 *
 * Guarded because React's StrictMode mounts twice in development and a second
 * patch would wrap the first - two deadlines on one request, the inner one
 * firing first and reporting the wrong thing.
 */
export function installFetchTimeout({
  timeoutMs = DEFAULT_TIMEOUT_MS,
  scope = typeof globalThis !== 'undefined' ? globalThis : undefined,
} = {}) {
  if (installed || !scope || typeof scope.fetch !== 'function') return () => {};
  // Nothing to attach a deadline to.
  if (typeof AbortSignal === 'undefined' || typeof AbortSignal.timeout !== 'function') return () => {};

  const original = scope.fetch;
  installed = true;

  const patched = function fetchWithDeadline(input, init) {
    // A Request object carries its own signal; leaving it alone keeps
    // `new Request(...)` behaving exactly as the caller built it.
    if (typeof Request !== 'undefined' && input instanceof Request && !init) {
      return original.call(this, input, init);
    }
    const signal = init?.signal;
    // Already aborted: nothing to put a deadline on.
    if (signal?.aborted) return original.call(this, input, init);

    /**
     * A caller that named its own deadline keeps it, longer or shorter.
     *
     * This is how the flight booking POST survives: it allows five minutes,
     * because the server's own budget for committing and issuing a ticket is
     * about four, and the generic deadline firing first would tell a customer
     * their booking had failed while it was being completed behind them. The
     * axios shim forwards `config.timeout` here as `timeoutMs`.
     */
    const requested = Number(init?.timeoutMs);
    const deadlineMs = Number.isFinite(requested) && requested > 0 ? requested : timeoutMs;

    try {
      const next = { ...(init || {}), signal: withDeadline(signal, deadlineMs) };
      delete next.timeoutMs;
      return original.call(this, input, next);
    } catch {
      // Anything unexpected about the signals must not stop the request.
      return original.call(this, input, init);
    }
  };

  patched.__deadlineInstalled = true;
  scope.fetch = patched;

  return () => {
    scope.fetch = original;
    installed = false;
  };
}
