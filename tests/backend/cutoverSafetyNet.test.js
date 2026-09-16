import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cutoverRisks, logCutoverRisks } from '../../backend/services/amadeusSoap/config.js';
import { isTestNode } from '../../scripts/lib/gdsGuard.mjs';

/**
 * What has to be true on the day AMADEUS_WS_ENDPOINT moves to production.
 *
 * Every setting below fails SILENTLY. A production office running the PDT
 * carrier list looks exactly like an office with no Emirates inventory; a stale
 * Redis entry looks exactly like a real fare. There is no error to search for
 * afterwards, which is why each of these has to be caught before anyone looks.
 */

describe('the cutover checklist', () => {
  /**
   * The flaw in the first version: it asked "is this set?" and never "is this
   * value the test one?". Queue 90 is the queue Amadeus created for PDT
   * testing, and it IS set - so a presence test reported it as fine. At cutover
   * you edit the endpoint, the office and the credentials and leave the rest,
   * which is precisely the shape a presence test cannot see.
   */
  it('names a setting that is SET to a PDT value, not only one that is missing', () => {
    const risks = cutoverRisks({ AMADEUS_WS_QUEUE_NUMBER: '90' });
    const queue = risks.find((r) => r.setting === 'AMADEUS_WS_QUEUE_NUMBER');

    expect(queue).toBeDefined();
    expect(queue.kind).toBe('PDT');
  });

  it('accepts a production queue without complaint', () => {
    expect(cutoverRisks({ AMADEUS_WS_QUEUE_NUMBER: 'Q8' }).map((r) => r.setting))
      .not.toContain('AMADEUS_WS_QUEUE_NUMBER');
  });

  /**
   * The WSAP is not just a credential. It is stamped onto every offer and
   * compared by the booking chain's cross-environment guard. Left pinned to the
   * test WSAP while the endpoint moves, that guard compares PDT to PDT, agrees,
   * and lets a cached PDT offer be sold on the production node.
   */
  it('catches the WSAP left pinned to the test one', () => {
    const wsap = cutoverRisks({ AMADEUS_WS_WSAP: '1ASIWJETJEC' }).find((r) => r.setting === 'AMADEUS_WS_WSAP');

    expect(wsap?.kind).toBe('PDT');
  });

  it('catches the PDT office id', () => {
    expect(cutoverRisks({ AMADEUS_WS_OFFICE_ID: 'SCK1S2400' }).find((r) => r.setting === 'AMADEUS_WS_OFFICE_ID')?.kind)
      .toBe('PDT');
  });

  /**
   * "Unset" is not "none" for either list - it is the PDT-learned list. The
   * carrier list hides 19 airlines; the pair list hides B6-LH. Both were
   * missing from the first version of this check.
   */
  it('names both PDT-learned lists when neither is set', () => {
    const settings = cutoverRisks({}).map((r) => r.setting);

    expect(settings).toContain('AMADEUS_WS_UNTICKETABLE_CARRIERS');
    expect(settings).toContain('AMADEUS_WS_INTERLINE_BLOCKED_PAIRS');
  });

  // Present-but-empty is the deliberate way to say "block nothing".
  it('is satisfied by an empty list, which is how you turn one off', () => {
    const settings = cutoverRisks({ AMADEUS_WS_UNTICKETABLE_CARRIERS: '', AMADEUS_WS_INTERLINE_BLOCKED_PAIRS: '' })
      .map((r) => r.setting);

    expect(settings).not.toContain('AMADEUS_WS_UNTICKETABLE_CARRIERS');
    expect(settings).not.toContain('AMADEUS_WS_INTERLINE_BLOCKED_PAIRS');
  });

  it('is empty once every setting has been moved to production', () => {
    expect(cutoverRisks({
      AMADEUS_WS_ENDPOINT: 'https://nodeD1.production.webservices.amadeus.com/1ASIWPRODXX',
      AMADEUS_WS_WSAP: '1ASIWPRODXX',
      AMADEUS_WS_OFFICE_ID: 'NYC1S2100',
      AMADEUS_WS_UNTICKETABLE_CARRIERS: '',
      AMADEUS_WS_INTERLINE_BLOCKED_PAIRS: '',
      AMADEUS_WS_QUEUE_NUMBER: 'Q8',
      AMADEUS_WS_QUEUE_CATEGORY: '0',
      AMADEUS_WS_OFFICE_TIME_ZONE: 'America/New_York',
      AMADEUS_WS_FOP_CODE: 'CASH',
      AMADEUS_WS_MARKET_IATA_CODE: 'US',
      AMADEUS_WS_DUTY_CODE: 'SU',
    })).toEqual([]);
  });

  it('explains each risk rather than only naming it', () => {
    for (const risk of cutoverRisks({})) {
      expect(String(risk.risk).length, risk.setting).toBeGreaterThan(20);
    }
  });
});

/**
 * The check existed before this and was called by nothing - its own docstring
 * claimed a boot banner printed it. A warning nobody sees is the same as no
 * warning, which is why the caller is pinned here and in both server entries.
 */
describe('the boot banner', () => {
  const capture = () => { const lines = []; return { lines, log: { warn: (...a) => lines.push(a.join(' ')) } }; };

  it('prints every risk it found', () => {
    const { lines, log } = capture();
    logCutoverRisks({ AMADEUS_WS_QUEUE_NUMBER: '90' }, log);

    expect(lines.join('\n')).toMatch(/AMADEUS_WS_QUEUE_NUMBER/);
    expect(lines.join('\n')).toMatch(/fails silently/i);
  });

  it('says nothing at all when the cutover is complete', () => {
    const { lines, log } = capture();
    logCutoverRisks({
      AMADEUS_WS_ENDPOINT: 'https://nodeD1.production.webservices.amadeus.com/1ASIWPRODXX',
      AMADEUS_WS_WSAP: '1ASIWPRODXX', AMADEUS_WS_OFFICE_ID: 'NYC1S2100',
      AMADEUS_WS_UNTICKETABLE_CARRIERS: '', AMADEUS_WS_INTERLINE_BLOCKED_PAIRS: '',
      AMADEUS_WS_QUEUE_NUMBER: 'Q8', AMADEUS_WS_QUEUE_CATEGORY: '0',
      AMADEUS_WS_OFFICE_TIME_ZONE: 'America/New_York', AMADEUS_WS_FOP_CODE: 'CASH',
      AMADEUS_WS_MARKET_IATA_CODE: 'US', AMADEUS_WS_DUTY_CODE: 'SU',
    }, log);

    expect(lines).toEqual([]);
  });

  // A boot that dies over a warning is worse than the warning.
  it('never throws, whatever it is handed', () => {
    const { log } = capture();
    expect(() => logCutoverRisks(null, log)).not.toThrow();
  });

  it('is actually called by both server entry points', () => {
    for (const entry of ['server.js', 'backend/server.js']) {
      const source = readFileSync(new URL(`../../${entry}`, import.meta.url), 'utf8');
      expect(source, entry).toMatch(/logCutoverRisks\(\)/);
      expect(source, entry).toMatch(/import \{ logCutoverRisks \}/);
    }
  });
});

/**
 * Two scripts turn booking ON themselves, because that is the only way to
 * exercise the chain on PDT. That is safe while the endpoint is the test node
 * and stops being safe the moment it is not: the same command then creates a
 * real reservation on the real office, and with the ticket flag issues a real
 * ticket against real stock. The habit of running them is exactly what survives
 * a cutover.
 */
describe('the test-node guard on scripts that book', () => {
  it('recognises the PDT node', () => {
    expect(isTestNode('https://nodeD2.test.webservices.amadeus.com/1ASIWJETJEC')).toBe(true);
  });

  it('refuses the production node', () => {
    expect(isTestNode('https://nodeD1.production.webservices.amadeus.com/1ASIWJETJEC')).toBe(false);
  });

  /**
   * The test has to be positive - the endpoint must SAY test - rather than
   * "does not say prod". A production host that simply omits the word would
   * pass the negative form.
   */
  it('refuses a host that says neither', () => {
    expect(isTestNode('https://gds.example.com/1ASIWJETJEC')).toBe(false);
    expect(isTestNode('')).toBe(false);
    expect(isTestNode(undefined)).toBe(false);
  });

  it('guards both scripts, before they force the booking flag on', () => {
    for (const script of ['scripts/smoke-amadeus-ws.mjs', 'scripts/record-amadeus-fixture.mjs']) {
      const source = readFileSync(new URL(`../../${script}`, import.meta.url), 'utf8');
      const guard = source.indexOf('refuseUnlessTestNode(');
      const forcesBooking = source.indexOf("AMADEUS_WS_BOOKING_ENABLED = 'true'");

      expect(guard, script).toBeGreaterThan(-1);
      expect(forcesBooking, script).toBeGreaterThan(-1);
      expect(guard, `${script}: the guard must run before the flag is forced on`).toBeLessThan(forcesBooking);
    }
  });
});

/**
 * A cached answer is only meaningful for the Amadeus environment that produced
 * it. Without the GDS in the key, moving the endpoint leaves Redis serving test
 * prices and test availability to real customers under a key that looks
 * identical - five minutes on a search, six to twelve hours on the date strip
 * and the browse endpoints. The customer clicks a price the live airline never
 * quoted.
 */
describe('the flight cache key', () => {
  // The tag is read once per process, like the Amadeus config itself, so the
  // module exposes a seam to forget it rather than being re-imported here.
  const keysFor = async (endpoint, wsap, office) => {
    const { CacheKeys, resetGdsTag } = await import('../../backend/services/cache.service.js');
    vi.stubEnv('AMADEUS_WS_ENDPOINT', endpoint);
    vi.stubEnv('AMADEUS_WS_WSAP', wsap);
    vi.stubEnv('AMADEUS_WS_OFFICE_ID', office);
    resetGdsTag();
    return {
      search: CacheKeys.flightSearch('BOM', 'DXB', '2026-10-22', '1-0-0'),
      strip: CacheKeys.flightBrowse('date-prices', ['BOM', 'DXB']),
    };
  };

  const pdt = () => keysFor('https://nodeD2.test.webservices.amadeus.com/1ASIWJETJEC', '1ASIWJETJEC', 'SCK1S2400');
  const prod = () => keysFor('https://nodeD1.production.webservices.amadeus.com/1ASIWPRODXX', '1ASIWPRODXX', 'NYC1S2100');

  beforeEach(async () => {
    vi.unstubAllEnvs();
    const { resetGdsTag } = await import('../../backend/services/cache.service.js');
    resetGdsTag();
  });

  it('cannot read a PDT search after the endpoint moves to production', async () => {
    expect((await pdt()).search).not.toBe((await prod()).search);
  });

  // The date strip and the browse endpoints are the long ones - up to 12 hours.
  it('cannot read a PDT date strip either', async () => {
    expect((await pdt()).strip).not.toBe((await prod()).strip);
  });

  it('is unchanged for the same GDS, so caching still works', async () => {
    expect((await pdt()).search).toBe((await pdt()).search);
  });

  // The same host with a different WSAP is a different set of contracts and a
  // different ticketing office.
  it('separates two WSAPs on the same host', async () => {
    const a = await keysFor('https://nodeD1.production.webservices.amadeus.com/A', 'AAAAAAAAAAA', 'NYC1S2100');
    const b = await keysFor('https://nodeD1.production.webservices.amadeus.com/B', 'BBBBBBBBBBB', 'NYC1S2100');

    expect(a.search).not.toBe(b.search);
  });

  it('carries no identifying value into a key that gets logged', async () => {
    const { search } = await pdt();

    expect(search).not.toMatch(/JETJEC|SCK1S2400|amadeus/i);
  });
});
