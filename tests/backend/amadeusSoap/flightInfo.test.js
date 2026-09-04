import { describe, expect, it } from 'vitest';
import {
  buildFlightInfoBody,
  readFlightInfoError,
  readFlightInfoReply,
} from '../../../backend/services/amadeusSoap/operations/flightInfo.js';

/**
 * Air_FlightInfo - schedule lookup for one flight on one date.
 *
 * The reply fixture below is the real shape this WSAP returns, recorded from a
 * live call for AI9484 DEL-BOM. It is narrower than the schema allows, and the
 * fields it does send are not always where the schema puts them.
 */

describe('the request', () => {
  it('sends the date as DDMMYY, whichever form the caller used', () => {
    expect(buildFlightInfoBody({ carrier: 'AI', flightNumber: '9484', date: '2026-09-25' }))
      .toContain('<departureDate>250926</departureDate>');
    expect(buildFlightInfoBody({ carrier: 'AI', flightNumber: '9484', date: '250926' }))
      .toContain('<departureDate>250926</departureDate>');
  });

  // Clients hand over "AI9484" as readily as "9484", and flightNumber accepts
  // at most 4 characters.
  it('strips a carrier prefix from the flight number', () => {
    expect(buildFlightInfoBody({ carrier: 'AI', flightNumber: 'AI9484', date: '2026-09-25' }))
      .toContain('<flightNumber>9484</flightNumber>');
  });

  it('refuses a request it cannot make', () => {
    expect(() => buildFlightInfoBody({ carrier: 'AI', date: '2026-09-25' })).toThrow(/required/);
    expect(() => buildFlightInfoBody({ carrier: 'AI', flightNumber: '9484', date: 'nonsense' })).toThrow(/Invalid date/);
  });
});

/** Recorded from the live WSAP. */
const liveReply = {
  flightScheduleDetails: {
    generalFlightInfo: {
      flightDate: { departureDate: '250926' },
      boardPointDetails: { trueLocationId: 'DEL' },
      offPointDetails: { trueLocationId: 'BOM' },
      companyDetails: { marketingCompany: 'AI' },
      productIdDetails: { flightNumber: '9484' },
    },
    additionalProductDetails: {
      legDetails: { numberOfStops: '0', daysOfOperation: '5' },
      facilitiesInformation: { description: '0225' },
    },
    interactiveFreeText: [
      { freeText: 'DEL BOM   - COMMERCIAL DUPLICATE - OPERATED BY' },
      { freeText: '            AIR INDIA EXPRESS' },
      { freeText: 'DEL BOM   - OPERATIONAL LEG IX 1235' },
      { freeText: 'DEL BOM   - DEPARTS TERMINAL 1' },
      { freeText: 'DEL BOM   - ARRIVES TERMINAL 2' },
    ],
  },
};

describe('the reply', () => {
  it('reads the route and date', () => {
    const [leg] = readFlightInfoReply(liveReply);
    expect(leg.flightNumber).toBe('AI9484');
    expect(leg.departure.airport).toBe('DEL');
    expect(leg.arrival.airport).toBe('BOM');
    expect(leg.departure.scheduledDate).toBe('2026-09-25');
  });

  // The elapsed time arrives as facilitiesInformation/description in HHMM, not
  // in legDetails/duration where the schema suggests it would be. 0225 is the
  // 2h25m the search reply gives for the same flight.
  it('finds the duration where this WSAP actually puts it', () => {
    expect(readFlightInfoReply(liveReply)[0].duration).toBe('PT2H25M');
  });

  // Terminals and the operating leg are sent as free text rather than in the
  // structured fields provided for them. Reading them there fills the fields
  // the clients expect from data Amadeus did send.
  it('recovers the terminals from the free text', () => {
    const [leg] = readFlightInfoReply(liveReply);
    expect(leg.departure.terminal).toBe('1');
    expect(leg.arrival.terminal).toBe('2');
  });

  it('recovers the operating carrier from the free text', () => {
    const [leg] = readFlightInfoReply(liveReply);
    expect(leg.operatingCarrier).toBe('IX');
    expect(leg.operatingFlightNumber).toBe('IX1235');
  });

  // Reporting a field as null would say "the airline has no terminal", which is
  // a different claim from "this operation does not carry one".
  it('omits fields this WSAP does not send rather than reporting them empty', () => {
    const [leg] = readFlightInfoReply(liveReply);
    expect(leg.departure).not.toHaveProperty('scheduledTime', null);
    expect(leg.aircraft).toBeUndefined();
  });

  it('reads a multi-leg flight as separate legs', () => {
    const legs = readFlightInfoReply({
      flightScheduleDetails: [
        liveReply.flightScheduleDetails,
        {
          generalFlightInfo: {
            flightDate: { departureDate: '250926' },
            boardPointDetails: { trueLocationId: 'BOM' },
            offPointDetails: { trueLocationId: 'GOI' },
            companyDetails: { marketingCompany: 'AI' },
            productIdDetails: { flightNumber: '9484' },
          },
        },
      ],
    });
    expect(legs).toHaveLength(2);
    expect(legs[1].arrival.airport).toBe('GOI');
  });

  it('drops an entry with no route rather than emitting a blank one', () => {
    expect(readFlightInfoReply({ flightScheduleDetails: { generalFlightInfo: {} } })).toHaveLength(0);
  });
});

describe('a flight that is not scheduled', () => {
  // Amadeus reports this in a responseError, not a fault. It is an empty
  // answer, not a failure: the caller asked about a flight that does not fly
  // that day.
  it('is recognised as an error node, not a schedule', () => {
    const failure = readFlightInfoError({
      responseError: {
        errorInfo: { errorDetails: { errorCode: '911' } },
        interactiveFreeText: { freeText: 'NO FLIGHT FOUND' },
      },
    });
    expect(failure).toMatchObject({ code: '911' });
    expect(failure.text).toContain('NO FLIGHT');
  });

  it('is absent from a good reply', () => {
    expect(readFlightInfoError(liveReply)).toBeNull();
  });
});
