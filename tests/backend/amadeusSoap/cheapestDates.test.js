import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * getCalendarPrices answers null when no date priced, deliberately - it tells
 * withCache there is nothing to store. getCheapestFlightDates then read
 * `result.success` off that null: a TypeError, which withCache took for a cache
 * failure and answered by running all seven live searches a second time, before
 * the route swallowed the second TypeError as an empty strip. Any route whose
 * sampled week had no priceable fare - or a WSAP outage - paid for it twice.
 */

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('AMADEUS_WS_ENDPOINT', 'https://node.test.invalid/1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_WSAP', '1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_USERNAME', 'WSTEST');
  vi.stubEnv('AMADEUS_WS_PASSWORD', 'pw');
  vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
  vi.resetModules();
});

const inAMonth = () => new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

describe('cheapest dates when no date can be priced', () => {
  it('answers a soft failure instead of throwing', async () => {
    const { default: provider } = await import('../../../backend/services/amadeusSoap/index.js');
    axios.post.mockReset();
    axios.post.mockRejectedValue(Object.assign(new Error('network down'), { code: 'ECONNRESET' }));

    const result = await provider.getCheapestFlightDates('DEL', 'BOM', { departureDate: inAMonth() });

    expect(result).toMatchObject({ success: false, data: [] });
  });
});
