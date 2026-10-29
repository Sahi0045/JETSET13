import { readFileSync } from 'node:fs';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The date strip quoted each day's cheapest total for every traveller, so two
 * adults read twice the ticket price. It now also carries each day's cheapest
 * fare for one traveller - an adult's own, from Amadeus's per-passenger fare -
 * and keeps the totals, which the phone app reads.
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

describe('the date strip for two adults and a child', () => {
  it("prices each day per adult, and still gives the totals", async () => {
    const xml = readFileSync(new URL('../fixtures/amadeus/mptbs-family-del-bom.xml', import.meta.url), 'utf8');
    const { default: provider } = await import('../../backend/services/amadeusSoap/index.js');
    axios.post.mockReset();
    axios.post.mockResolvedValue({ status: 200, data: xml, headers: {} });
    const day = inAMonth();

    const result = await provider.getCalendarPrices({ from: 'DEL', to: 'BOM', adults: 2, children: 1, dates: [day] });

    expect(result.dateWisePrices[day]).toBe(286.7);
    expect(result.pricesEach[day]).toBe(98);
    expect(result.lowestPriceEach).toBe(98);
  });
});
