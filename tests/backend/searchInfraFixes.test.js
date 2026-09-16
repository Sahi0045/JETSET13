import { describe, expect, it, vi } from 'vitest';
import { searchFilterKey } from '../../backend/routes/flight.routes.js';
import { cutoverRisks } from '../../backend/services/amadeusSoap/config.js';
import { inspectReply } from '../../backend/services/amadeusSoap/errors.js';

/**
 * Search, configuration and queue defects from the 16 Sep audit (PR C).
 */

describe('the search cache key', () => {
  // The bug: a filtered result set served to an unfiltered search for 5 minutes.
  it('separates a filtered search from an unfiltered one', () => {
    const unfiltered = searchFilterKey({}, []);
    const baOnly = searchFilterKey({ includedAirlineCodes: ['BA'] }, []);

    expect(baOnly).not.toBe(unfiltered);
  });

  it('separates an exclusion from an inclusion of the same carrier', () => {
    expect(searchFilterKey({ includedAirlineCodes: ['BA'] }, []))
      .not.toBe(searchFilterKey({ excludedAirlineCodes: ['BA'] }, []));
  });

  // maxPrice is accepted by the route and changes what a customer should see.
  it('separates searches that asked for different price ceilings', () => {
    expect(searchFilterKey({ maxPrice: 500 }, [])).not.toBe(searchFilterKey({ maxPrice: 900 }, []));
  });

  // Change the blocklist and yesterday's answers must not be reused.
  it('changes when the blocked-carrier list changes', () => {
    expect(searchFilterKey({}, ['AI', 'EK'])).not.toBe(searchFilterKey({}, ['AI']));
  });

  it('is stable for the same search, so caching still works', () => {
    expect(searchFilterKey({ includedAirlineCodes: ['BA', 'LH'] }, ['AI']))
      .toBe(searchFilterKey({ includedAirlineCodes: ['BA', 'LH'] }, ['AI']));
  });

  /**
   * Seen in a browser, after B6-LH was blocked: the date strip went on
   * advertising its fare - the cheapest of the day, and one we would no longer
   * sell - because the calendar's cache key did not know the policy had moved.
   * The strip and the search it links to have to be built under the same rules.
   */
  it('changes when the interline policy changes', () => {
    const allowed = searchFilterKey({}, [], { blockAll: false, blocked: [] });
    const oneBlocked = searchFilterKey({}, [], { blockAll: false, blocked: ['B6-LH'] });
    const allBlocked = searchFilterKey({}, [], { blockAll: true, blocked: [] });

    expect(oneBlocked).not.toBe(allowed);
    expect(allBlocked).not.toBe(allowed);
    expect(allBlocked).not.toBe(oneBlocked);
  });

  it('separates two different blocked-pair lists', () => {
    expect(searchFilterKey({}, [], { blocked: ['B6-LH'] }))
      .not.toBe(searchFilterKey({}, [], { blocked: ['B6-LH', 'DL-UA'] }));
  });
});

/**
 * `errorInfo` is where Fare_CheckRules reports a refusal, and it was missing
 * from the container list - so a rejected rules request read as `ok`, the
 * caller logged nothing, and the panel looked exactly as it does when an
 * airline files no penalties at all.
 */
describe('reading an Amadeus error container', () => {
  const withErrorInfo = {
    errorInfo: {
      errorDetails: { errorCode: '67', errorCategory: 'EC' },
      errorFreeText: 'CHECK FORMAT',
    },
  };

  it('sees a refusal reported in errorInfo', () => {
    const status = inspectReply(withErrorInfo, 'Fare_CheckRules');

    expect(status.ok).not.toBe(true);
  });

  it('still reads a clean reply as fine', () => {
    expect(inspectReply({ tariffInfo: [{ fareRuleInfo: {} }] }, 'Fare_CheckRules').ok).toBe(true);
  });
});

/**
 * Settings whose default is only right for the PDT test office. Each fails
 * silently: unset, the unticketable list is the 19-carrier PDT blocklist rather
 * than "none", and those carriers simply stop appearing in search.
 */
describe('cutoverRisks', () => {
  const production = {
    AMADEUS_WS_UNTICKETABLE_CARRIERS: '',
    AMADEUS_WS_QUEUE_NUMBER: 'Q8',
    AMADEUS_WS_OFFICE_TIME_ZONE: 'America/New_York',
    AMADEUS_WS_FOP_CODE: 'CASH',
    AMADEUS_WS_MARKET_IATA_CODE: 'US',
    AMADEUS_WS_ENDPOINT: 'https://nodeD1.production.webservices.amadeus.com/1ASIWJETJEC',
  };

  it('names every setting still on a PDT-shaped default', () => {
    const risks = cutoverRisks({}).map((r) => r.setting);

    expect(risks).toContain('AMADEUS_WS_UNTICKETABLE_CARRIERS');
    expect(risks).toContain('AMADEUS_WS_QUEUE_NUMBER');
    expect(risks).toContain('AMADEUS_WS_OFFICE_TIME_ZONE');
    expect(risks).toContain('AMADEUS_WS_FOP_CODE');
    expect(risks).toContain('AMADEUS_WS_MARKET_IATA_CODE');
  });

  it('says so while the endpoint still points at the test node', () => {
    const risks = cutoverRisks({ ...production, AMADEUS_WS_ENDPOINT: 'https://nodeD2.test.webservices.amadeus.com/1ASIWJETJEC' });

    expect(risks.map((r) => r.setting)).toContain('AMADEUS_WS_ENDPOINT');
  });

  it('is empty once every one of them has been set for production', () => {
    expect(cutoverRisks(production)).toEqual([]);
  });

  it('explains each risk rather than only naming it', () => {
    for (const risk of cutoverRisks({})) {
      expect(String(risk.risk).length, risk.setting).toBeGreaterThan(20);
    }
  });
});

/**
 * The queue worker took the 50 oldest queued rows and discarded the other
 * environment's afterwards, so 50+ foreign rows at the front starved this
 * environment's paid bookings. Dev and production share this database, which is
 * the whole premise of the label.
 */
describe('the booking queue worker', () => {
  it('asks the database for its own environment, not for everyone and then filters', async () => {
    vi.resetModules();
    const filters = [];
    const chain = () => {
      const c = {
        select: vi.fn(() => c),
        not: vi.fn(() => c),
        eq: vi.fn((column, value) => { filters.push([column, value]); return c; }),
        order: vi.fn(() => c),
        limit: vi.fn(() => c),
        then: (resolve) => resolve({ data: [], error: null }),
      };
      return c;
    };
    const supabase = (await import('../../backend/config/supabase.js')).default;
    supabase.from.mockImplementation(chain);
    const { findRunnable } = await import('../../backend/jobs/bookingQueue.job.js');

    await findRunnable({ env: 'production' });

    expect(filters).toContainEqual(['booking_details->>queued_env', 'production']);
  });
});
