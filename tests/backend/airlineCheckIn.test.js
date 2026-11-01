import { describe, expect, it } from 'vitest';
import { checkInFor, checkInsOf } from '../../shared/airlineCheckIn.js';

const segment = (carrierCode, departureDate = '2099-12-01') => ({
  carrierCode, flightNumber: `${carrierCode}100`, origin: 'SFO', destination: 'EWR', departureDate, departureTime: '10:00',
});
const ticketed = (segments, over = {}) => ({
  type: 'flight',
  status: 'confirmed',
  payment_status: 'paid',
  pnr: 'Q7XK2M',
  departureDate: segments[0].departureDate,
  tickets: [{ number: '016-7491175288', travelerId: '1' }],
  travelers: [{ id: '1', firstName: 'Jane', lastName: 'Doe' }],
  itineraries: [{ direction: 'outbound', origin: 'SFO', destination: 'EWR', departureDate: segments[0].departureDate, segments }],
  ...over,
});

describe("an airline's online check-in", () => {
  it("is its own check-in page, and when check-in opens", () => {
    expect(checkInFor('KL')).toEqual({
      carrierCode: 'KL', airline: 'KLM', url: 'https://www.klm.com/check-in', opensHoursBefore: 30, usFlightsHoursBefore: 24,
    });
  });

  it('is nothing for an airline whose check-in page we do not know', () => {
    expect(checkInFor('ZZ')).toBeNull();
    expect(checkInFor('')).toBeNull();
  });

  it('only links to https pages', () => {
    expect(checkInFor('UA').url.startsWith('https://')).toBe(true);
  });
});

describe('the check-ins a booking offers', () => {
  it("is one per airline, with that airline's own booking code", () => {
    const booking = ticketed([segment('UA'), segment('UA'), segment('AI')], {
      airlineLocators: [{ carrierCode: 'UA', locator: 'H8KQ2P' }, { carrierCode: 'AI', locator: '5TZ9LW' }],
    });

    expect(checkInsOf(booking, { today: '2026-10-25' })).toEqual([
      expect.objectContaining({ carrierCode: 'UA', airline: 'United', code: 'H8KQ2P' }),
      expect.objectContaining({ carrierCode: 'AI', airline: 'Air India', code: '5TZ9LW' }),
    ]);
  });

  it('uses our code for an airline that has not sent its own, and says the ticket number works too', () => {
    const [checkIn] = checkInsOf(ticketed([segment('LH')]), { today: '2026-10-25' });

    expect(checkIn).toEqual(expect.objectContaining({ carrierCode: 'LH', code: 'Q7XK2M', codeIsAirlines: false }));
  });

  it('is nothing before the ticket is issued, once the trip has flown, or after a cancel', () => {
    expect(checkInsOf(ticketed([segment('UA')], { tickets: [], status: 'pending_ticketing' }), { today: '2026-10-25' })).toEqual([]);
    expect(checkInsOf(ticketed([segment('UA', '2026-10-01')]), { today: '2026-10-25' })).toEqual([]);
    expect(checkInsOf(ticketed([segment('UA')], { status: 'cancelled' }), { today: '2026-10-25' })).toEqual([]);
  });

  it('leaves out an airline whose check-in page we do not know', () => {
    expect(checkInsOf(ticketed([segment('ZZ')]), { today: '2026-10-25' })).toEqual([]);
  });
});

describe('when check-in opens, in words', () => {
  it('names the US exception', async () => {
    const { checkInOpensText } = await import('../../shared/airlineCheckIn.js');

    expect(checkInOpensText(checkInFor('KL'))).toBe('Opens 30 hours before departure (24 hours on flights to or from the US)');
    expect(checkInOpensText(checkInFor('UA'))).toBe('Opens 24 hours before departure');
    expect(checkInOpensText(checkInFor('AK'))).toBe('Opens 14 days before departure');
    expect(checkInOpensText(checkInFor('GF'))).toBe('');
  });
});
