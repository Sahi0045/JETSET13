import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { arcItineraries, returnLegOf } from '../../frontend/src/utils/reviewTrip.js';
import { tripDates } from '../../shared/travellerDetails.js';

/**
 * A round trip on the review page is the whole trip.
 *
 * The results page kept the return in `returnLeg`, which the review page never
 * read: the flight home was not on the page the customer paid on, the traveller
 * checks stopped at the outbound, and the airline data sent with the charge
 * carried the outbound legs only.
 */

const segment = (carrierCode, number, from, to, departs, arrives) => ({
  carrierCode, number, departure: { iataCode: from, at: departs }, arrival: { iataCode: to, at: arrives }, duration: 'PT8H',
});

const roundTrip = {
  itineraries: [
    { duration: 'PT8H', segments: [segment('LH', '401', 'JFK', 'FRA', '2026-10-04T18:00:00', '2026-10-05T08:00:00')] },
    {
      duration: 'PT11H',
      segments: [
        segment('LH', '900', 'FRA', 'LHR', '2026-10-20T07:00:00', '2026-10-20T07:45:00'),
        segment('BA', '117', 'LHR', 'JFK', '2026-10-20T11:00:00', '2026-10-20T14:00:00'),
      ],
    },
  ],
};

describe('tripDates', () => {
  it('runs from the first departure to the last arrival home', () => {
    expect(tripDates(roundTrip)).toEqual({ firstDate: '2026-10-04', lastDate: '2026-10-20' });
  });

  it('is the outbound alone for a one-way trip, and nothing without flights', () => {
    expect(tripDates({ itineraries: [roundTrip.itineraries[0]] })).toEqual({ firstDate: '2026-10-04', lastDate: '2026-10-05' });
    expect(tripDates(null)).toEqual({ firstDate: null, lastDate: null });
  });
});

describe('returnLegOf', () => {
  it("takes the results page's own return, with its airline names", () => {
    const described = [{ departure: { airport: 'FRA' }, arrival: { airport: 'JFK' }, airline: { code: 'LH', name: 'Lufthansa' }, flightNumber: 'LH 400' }];
    const leg = returnLegOf({ originalOffer: roundTrip, returnLeg: { segments: described, duration: 'PT9H' } });

    expect(leg.segments).toBe(described);
    expect(leg.duration).toBe('PT9H');
  });

  it("reads the offer's second itinerary when the results page gave none", () => {
    const leg = returnLegOf({ originalOffer: roundTrip });

    expect(leg.segments.map((s) => s.flightNumber)).toEqual(['LH 900', 'BA 117']);
    expect(leg.segments[1]).toMatchObject({ departure: { airport: 'LHR', at: '2026-10-20T11:00:00' }, arrival: { airport: 'JFK' }, airline: { code: 'BA' } });
    expect(leg.duration).toBe('PT11H');
  });

  it('is null for a one-way trip', () => {
    expect(returnLegOf({ originalOffer: { itineraries: [roundTrip.itineraries[0]] } })).toBeNull();
  });
});

describe('arcItineraries', () => {
  it('sends every leg of the trip, the flights home included', () => {
    const legs = arcItineraries(roundTrip);

    expect(legs).toHaveLength(2);
    expect(legs[1].segments).toEqual([
      { carrierCode: 'LH', number: '900', departure: { iataCode: 'FRA', at: '2026-10-20T07:00:00' }, arrival: { iataCode: 'LHR', at: '2026-10-20T07:45:00' } },
      { carrierCode: 'BA', number: '117', departure: { iataCode: 'LHR', at: '2026-10-20T11:00:00' }, arrival: { iataCode: 'JFK', at: '2026-10-20T14:00:00' } },
    ]);
  });

  it('falls back to what the page built only when the offer has no itineraries', () => {
    const fallback = [{ segments: [{ carrierCode: 'AI', number: '101' }] }];
    expect(arcItineraries({}, fallback)).toBe(fallback);
  });
});

describe('the review page reads the whole trip', () => {
  // From the working directory: under jsdom, import.meta.url is not a file URL.
  const review = readFileSync(path.resolve(process.cwd(), 'frontend/src/Pages/Common/flights/FlightBookingConfirmation.jsx'), 'utf8');

  it('checks travellers against the last day of every itinerary', () => {
    expect(review).toMatch(/const trip = tripDates\(reviewState\?\.flightData\?\.originalOffer\)/);
    expect(review).toMatch(/lastDate: trip\.lastDate/);
  });

  it('draws the return leg with its segments', () => {
    expect(review).toMatch(/const returnLeg = returnLegOf\(flightData\)/);
    expect(review).toMatch(/renderSegmentList\(bookingDetails\.flight\.returnLeg\.segments\)/);
  });

  it("sends the airline every leg from the offer's itineraries", () => {
    expect(review).toMatch(/itineraries: arcItineraries\(rawFlightData\?\.originalOffer,/);
  });
});
