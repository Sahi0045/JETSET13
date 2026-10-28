import { describe, expect, it } from 'vitest';
import { airlineLocatorsOf, bookingCodeOf } from '../../shared/eTicket.js';

describe('the code a customer gives the airline', () => {
  it("is the airline's own code, with ours beside it when they differ", () => {
    expect(bookingCodeOf({ pnr: 'Q7XK2M', airlineLocators: [{ carrierCode: 'UA', locator: 'H8KQ2P' }] })).toEqual({
      label: 'Airline PNR', value: 'H8KQ2P', amadeusReference: 'Q7XK2M', isAirlines: true,
    });
  });

  it('is one code when the airline books inside Amadeus and keeps ours', () => {
    expect(bookingCodeOf({ pnr: '2OY43E', airlineLocators: [{ carrierCode: 'LH', locator: '2OY43E' }] })).toEqual({
      label: 'Airline PNR', value: '2OY43E', amadeusReference: null, isAirlines: true,
    });
  });

  it('names each airline when the trip has several', () => {
    const code = bookingCodeOf({
      pnr: 'Q7XK2M',
      airlineLocators: [{ carrierCode: 'UA', locator: 'H8KQ2P' }, { carrierCode: 'AI', locator: '5TZ9LW' }],
    });

    expect(code).toEqual({ label: 'Airline PNRs', value: 'UA H8KQ2P · AI 5TZ9LW', amadeusReference: 'Q7XK2M', isAirlines: true });
  });

  it('does not call our code the airline\'s while the airline has not sent one', () => {
    expect(bookingCodeOf({ pnr: 'Q7XK2M', airlineLocators: [] })).toEqual({
      label: 'Booking code (PNR)', value: 'Q7XK2M', amadeusReference: null, isAirlines: false,
    });
  });

  it('is nothing before there is a booking', () => {
    expect(bookingCodeOf({})).toBeNull();
  });

  it('reads the codes from every shape a booking arrives in', () => {
    const codes = [{ carrierCode: 'UA', locator: 'H8KQ2P' }];

    expect(airlineLocatorsOf({ airlineLocators: codes })).toEqual(codes);
    expect(airlineLocatorsOf({ booking_details: { airline_locators: codes } })).toEqual(codes);
    expect(airlineLocatorsOf({ bookingDetails: { airline_locators: codes } })).toEqual(codes);
    expect(airlineLocatorsOf({ airlineLocators: [{ carrierCode: 'UA' }, null] })).toEqual([]);
    expect(airlineLocatorsOf(null)).toEqual([]);
  });
});
