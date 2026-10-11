import { describe, expect, it } from 'vitest';
import { getWsConfig, officeTimeZoneOf } from '../../backend/services/amadeusSoap/config.js';

/**
 * The ticketing office's time zone decides the free cancellation window, which
 * every customer cancel reads - one with no airline reservation too. It must be
 * readable on a host that has no Amadeus credentials.
 */
describe('officeTimeZoneOf', () => {
  it('reads the zone without Amadeus credentials', () => {
    expect(officeTimeZoneOf({})).toBe('America/New_York');
    expect(officeTimeZoneOf({ AMADEUS_WS_OFFICE_TIME_ZONE: ' America/Los_Angeles ' })).toBe('America/Los_Angeles');
  });

  it('is the zone the Amadeus config uses', () => {
    const env = {
      AMADEUS_WS_ENDPOINT: 'https://node.test.invalid/X', AMADEUS_WS_USERNAME: 'u', AMADEUS_WS_PASSWORD: 'p', AMADEUS_WS_OFFICE_ID: 'o',
      AMADEUS_WS_OFFICE_TIME_ZONE: 'Asia/Kolkata',
    };
    expect(officeTimeZoneOf(env)).toBe('Asia/Kolkata');
    expect(getWsConfig.length).toBeLessThanOrEqual(1);
  });
});
