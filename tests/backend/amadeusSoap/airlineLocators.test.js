import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildFlightOrder, readAirlineLocators } from '../../../backend/services/amadeusSoap/mappers/flightOrder.js';
import { parseSoap, unwrapEnvelope } from '../../../backend/services/amadeusSoap/parseXml.js';

const fixture = (name) => readFileSync(new URL(`../../fixtures/amadeus/${name}`, import.meta.url), 'utf8');
const pnrReply = (xml) => unwrapEnvelope(parseSoap(xml)).body.PNR_Reply;

const air = (carrier, number, reservation) => ({
  elementManagementItinerary: { segmentName: 'AIR' },
  travelProduct: { companyDetail: { identification: carrier }, productDetails: { identification: number } },
  ...(reservation ? { itineraryReservationInfo: { reservation } } : {}),
});
const reply = (segments, header = [{ companyId: '1A', controlNumber: 'Q7XK2M' }]) => ({
  pnrHeader: header.map((reservation) => ({ reservationInfo: { reservation } })),
  originDestinationDetails: { itineraryInfo: segments },
});

describe("the airline's own booking code on each flight", () => {
  it('is read from a real PNR', () => {
    expect(readAirlineLocators(pnrReply(fixture('pnr-retrieve-booked.xml')))).toEqual([
      { carrierCode: 'LH', locator: '2OY43E' },
    ]);
  });

  it('is kept per airline, in the order the airlines fly', () => {
    const pnr = reply([
      air('UA', '20', { companyId: 'UA', controlNumber: 'H8KQ2P' }),
      air('UA', '881', { companyId: 'UA', controlNumber: 'H8KQ2P' }),
      air('AI', '144', { companyId: 'AI', controlNumber: '5TZ9LW' }),
    ]);

    expect(readAirlineLocators(pnr)).toEqual([
      { carrierCode: 'UA', locator: 'H8KQ2P' },
      { carrierCode: 'AI', locator: '5TZ9LW' },
    ]);
  });

  it("is never Amadeus's own code, and nothing while the airline has not sent one", () => {
    const pnr = reply([
      air('LH', '760', { companyId: '1A', controlNumber: 'Q7XK2M' }),
      air('LH', '761'),
      air('6E', '22', { companyId: '6E', controlNumber: '' }),
    ]);

    expect(readAirlineLocators(pnr)).toEqual([]);
  });

  it('keeps a code in the form the airline sends it', () => {
    const pnr = reply([air('OZ', '201', { companyId: 'oz', controlNumber: ' 0243-3166 ' })]);

    expect(readAirlineLocators(pnr)).toEqual([{ carrierCode: 'OZ', locator: '0243-3166' }]);
  });

  it('is read from the PNR header when the flights do not carry it yet', () => {
    const pnr = reply([air('OZ', '201')], [
      { companyId: '1A', controlNumber: 'BA67KD' },
      { companyId: 'OZ', controlNumber: '0243-3166' },
    ]);

    expect(readAirlineLocators(pnr)).toEqual([{ carrierCode: 'OZ', locator: '0243-3166' }]);
  });

  it('is part of the order the booking saves', () => {
    const order = buildFlightOrder(pnrReply(fixture('pnr-retrieve-booked.xml')), { bookingReference: 'FLT1' });

    expect(order.id).toBe('2OY43E');
    expect(order.airlineLocators).toEqual([{ carrierCode: 'LH', locator: '2OY43E' }]);
  });

  it('is an empty list on a reply with no flights', () => {
    expect(readAirlineLocators({})).toEqual([]);
    expect(readAirlineLocators(undefined)).toEqual([]);
  });
});
