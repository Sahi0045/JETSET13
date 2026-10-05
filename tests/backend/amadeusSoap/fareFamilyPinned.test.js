import axios from 'axios';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildInformativePricingBody } from '../../../backend/services/amadeusSoap/operations/informativePricing.js';
import { buildPricePnrBody } from '../../../backend/services/amadeusSoap/operations/ticketing.js';
import { applyPricingToOffer } from '../../../backend/services/amadeusSoap/mappers/pricing.js';
import { mapMasterPricerReply } from '../../../backend/services/amadeusSoap/mappers/offer.js';
import { parseSoap, unwrapEnvelope } from '../../../backend/services/amadeusSoap/parseXml.js';

/**
 * The fare family the customer was quoted is the one ticketed.
 *
 * An airline can sell several families in one booking class. On PDT (1 Oct
 * 2026) Lufthansa LH4462 FRA-JFK class B priced ECOLIGHT at 2375.89 and
 * ECOFLEX at 2735.89, and Fare_PricePNRWithBookingClass on the held seat
 * answered ECOLIGHT unless told otherwise - so a customer who paid for Flex
 * would have been ticketed Light. Amadeus's Airline Fare Families
 * certification requires the pricing that makes the TST to name the family.
 */

const PFF_ECOFLEX = '<pricingOptionGroup><pricingOptionKey><pricingOptionKey>PFF</pricingOptionKey></pricingOptionKey>'
  + '<optionDetail><criteriaDetails><attributeType>FF</attributeType><attributeDescription>ECOFLEX</attributeDescription></criteriaDetails></optionDetail></pricingOptionGroup>';

const segments = [{
  legIndex: 0, boardPoint: 'FRA', offPoint: 'JFK', departureDate: '111126', departureTime: '1015',
  arrivalDate: '111126', marketingCarrier: 'LH', flightNumber: '4462', rbd: 'B',
}];
const paxRefs = [{ ref: '1', ptc: 'ADULT' }];

// The quote each family was priced at on PDT.
const QUOTED = { ECOLIGHT: '2375.89', ECOFLEX: '2735.89' };

const lufthansa = (fareFamily) => ({
  id: '1',
  source: 'GDS',
  price: { total: QUOTED[fareFamily ?? 'ECOLIGHT'], currency: 'USD' },
  validatingAirlineCodes: ['LH'],
  itineraries: [{ segments: [{ id: '1' }] }],
  travelerPricings: [{
    travelerId: '1',
    travelerType: 'ADULT',
    price: { currency: 'USD', total: QUOTED[fareFamily ?? 'ECOLIGHT'] },
    fareDetailsBySegment: [{ segmentId: '1', fareBasis: '', brandedFare: null, class: 'B' }],
  }],
  _ama: {
    wsap: '1ASIWJETJEC',
    officeId: 'SCK1S2400',
    searchedAt: new Date().toISOString(),
    paxRefs,
    segments,
    ...(fareFamily ? { fareFamily } : {}),
  },
});

describe('the pricing requests', () => {
  it('name the family in the form PDT accepted, on the informative pricing', () => {
    const xml = buildInformativePricingBody({ paxRefs, segments, currency: 'USD', validatingCarrier: 'LH', fareFamily: 'ECOFLEX' });

    expect(xml).toContain(PFF_ECOFLEX);
  });

  it('name the family on the PNR pricing the TST is made from', () => {
    expect(buildPricePnrBody({ currency: 'USD', validatingCarrier: 'LH', fareFamily: 'ECOFLEX' })).toContain(PFF_ECOFLEX);
  });

  it('pin nothing when no family was chosen', () => {
    expect(buildInformativePricingBody({ paxRefs, segments })).not.toContain('PFF');
    expect(buildPricePnrBody({ currency: 'USD' })).not.toContain('PFF');
  });

  // The name rides back from the client inside the offer.
  it('refuse a name that is not a fare family name, rather than send it', () => {
    expect(() => buildPricePnrBody({ fareFamily: 'ECO</attributeDescription><x>' })).toThrow(/can no longer be booked/);
    expect(() => buildInformativePricingBody({ paxRefs, segments, fareFamily: 'eco flex' })).toThrow(/can no longer be booked/);
  });

  // Refused as a fare that cannot be sold (409), not a server error.
  it('refuse it as a fare that cannot be booked', () => {
    const error = (() => { try { buildPricePnrBody({ fareFamily: '<x>' }); } catch (e) { return e; } return null; })();
    expect(error).toMatchObject({ name: 'AmadeusSoapError', code: 409 });
  });

  it('accept the punctuation family names can carry', () => {
    expect(buildPricePnrBody({ fareFamily: 'ECO-LIGHT' })).toContain('<attributeDescription>ECO-LIGHT</attributeDescription>');
  });
});

const load = (name) => {
  const xml = readFileSync(new URL(`../../fixtures/amadeus/${name}.xml`, import.meta.url), 'utf8');
  const { body } = unwrapEnvelope(parseSoap(xml));
  return body[Object.keys(body).find((k) => k !== 'Fault')];
};

describe('a pricing reply', () => {
  it('records the family it priced, without pinning a fare nobody chose', () => {
    // LH4462/B priced with PFF ECOFLEX on PDT, 1 Oct 2026.
    const { offer, priced } = applyPricingToOffer(load('informative-pricing-ecoflex'), lufthansa());

    expect(priced).toBe(true);
    expect(offer.price.total).toBe('2735.89');
    expect(offer._ama.pricedFareFamily).toBe('ECOFLEX');
    expect(offer._ama.fareFamily).toBeUndefined();
    expect(offer.travelerPricings[0].fareDetailsBySegment[0].brandedFare).toBe('ECOFLEX');
  });

  it('keeps the family the customer chose', () => {
    const { offer } = applyPricingToOffer(load('informative-pricing-ecoflex'), lufthansa('ECOFLEX'));

    expect(offer._ama.fareFamily).toBe('ECOFLEX');
  });

  // A lap infant's fare can name no family. The pin is what PFF priced, so a
  // reply that names it on some passengers only must not drop it.
  it('keeps the chosen family when a passenger group names none', () => {
    const withoutName = readFileSync(new URL('../../fixtures/amadeus/informative-pricing-ecoflex.xml', import.meta.url), 'utf8')
      .replace(/<fareFamilyDetails><fareFamilyname>ECOFLEX<\/fareFamilyname><\/fareFamilyDetails>/, '');
    const { body } = unwrapEnvelope(parseSoap(withoutName));

    const { offer } = applyPricingToOffer(body[Object.keys(body).find((k) => k !== 'Fault')], lufthansa('ECOFLEX'));

    expect(offer._ama.fareFamily).toBe('ECOFLEX');
    expect(offer._ama.pricedFareFamily).toBeNull();
  });

  it('records one family across every segment and leg', () => {
    const config = { wsap: '1ASIWJETJEC', officeId: 'SCK1S2400', currency: 'USD' };
    const search = mapMasterPricerReply(load('mptbs-roundtrip'), { config, searchSignature: 'test' }).offers[0];

    const { offer } = applyPricingToOffer(load('informative-pricing-rt'), search);

    expect(offer._ama.pricedFareFamily).toBe('DISCOUNT');
    expect(offer.travelerPricings[0].fareDetailsBySegment.map((d) => d.brandedFare)).toEqual(['DISCOUNT', 'DISCOUNT', 'DISCOUNT', 'DISCOUNT']);
  });

  it('names no single family when the legs are in different families, or one leg is in none', () => {
    const config = { wsap: '1ASIWJETJEC', officeId: 'SCK1S2400', currency: 'USD' };
    const search = mapMasterPricerReply(load('mptbs-roundtrip'), { config, searchSignature: 'test' }).offers[0];
    const xml = readFileSync(new URL('../../fixtures/amadeus/informative-pricing-rt.xml', import.meta.url), 'utf8');
    const reparse = (text) => {
      const { body } = unwrapEnvelope(parseSoap(text));
      return body[Object.keys(body).find((k) => k !== 'Fault')];
    };
    let n = 0;
    const twoFamilies = xml.replace(/<fareFamilyname>DISCOUNT</g, (m) => (++n === 2 ? '<fareFamilyname>BASIC<' : m));
    const oneWithout = xml.replace(/<fareFamilyDetails><fareFamilyname>DISCOUNT<\/fareFamilyname><\/fareFamilyDetails>/, '');

    const mixed = applyPricingToOffer(reparse(twoFamilies), search).offer;
    expect(mixed._ama.pricedFareFamily).toBeNull();
    expect(mixed.travelerPricings[0].fareDetailsBySegment.map((d) => d.brandedFare)).toEqual(['DISCOUNT', 'DISCOUNT', 'BASIC', 'BASIC']);
    expect(applyPricingToOffer(reparse(oneWithout), search).offer._ama.pricedFareFamily).toBeNull();
  });
});

const envelope = (name, inner, session) => `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:awsse="http://xml.amadeus.com/2010/06/Session_v3">
  <soap:Header>${session ? '<awsse:Session TransactionStatusCode="InSeries"><awsse:SessionId>S1</awsse:SessionId><awsse:SequenceNumber>1</awsse:SequenceNumber><awsse:SecurityToken>T</awsse:SecurityToken></awsse:Session>' : ''}</soap:Header>
  <soap:Body><${name}>${inner}</${name}></soap:Body>
</soap:Envelope>`;
const reply = (xml) => ({ status: 200, data: xml, headers: {} });
const sold = envelope('Air_SellFromRecommendationReply',
  '<itineraryDetails><segmentInformation><actionDetails><quantity>1</quantity><statusCode>OK</statusCode></actionDetails></segmentInformation></itineraryDetails>', true);
const pricedPnr = (amount) => envelope('Fare_PricePNRWithBookingClassReply',
  '<fareList><fareReference><uniqueReference>1</uniqueReference></fareReference><paxSegReference><refDetails><refQualifier>PA</refQualifier><refNumber>1</refNumber></refDetails></paxSegReference>'
  + `<fareDataInformation><fareDataSupInformation><fareDataQualifier>712</fareDataQualifier><fareAmount>${amount}</fareAmount><fareCurrency>USD</fareCurrency></fareDataSupInformation></fareDataInformation></fareList>`, true);
const ok = (name) => envelope(name, '<dummy/>', true);
const tstOk = envelope('Ticket_CreateTSTFromPricingReply', '<tstList><tstReference><uniqueReference>1</uniqueReference></tstReference></tstList>', true);
const commitOk = envelope('PNR_Reply',
  '<pnrHeader><reservationInfo><reservation><controlNumber>ABC123</controlNumber><date>011026</date></reservation></reservationInfo></pnrHeader>'
  + '<originDestinationDetails><itineraryInfo><elementManagementItinerary><segmentName>AIR</segmentName></elementManagementItinerary>'
  + '<itineraryReservationInfo><reservation><controlNumber>LH7XY2</controlNumber></reservation></itineraryReservationInfo></itineraryInfo></originDestinationDetails>', true);
const signOut = envelope('Security_SignOutReply', '<dummy/>');

const replies = (...xmls) => {
  axios.post.mockReset();
  for (const xml of xmls) axios.post.mockResolvedValueOnce(reply(xml));
  axios.post.mockResolvedValue(reply(signOut));
};
const sent = (operation) => axios.post.mock.calls.map(([, body]) => String(body)).filter((body) => body.includes(`<${operation}`));

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('AMADEUS_WS_ENDPOINT', 'https://node.test.invalid/1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_WSAP', '1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_USERNAME', 'WSTEST');
  vi.stubEnv('AMADEUS_WS_PASSWORD', 'pw');
  vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
  vi.stubEnv('AMADEUS_WS_BOOKING_ENABLED', 'true');
  vi.stubEnv('AMADEUS_WS_AUTO_TICKET', 'false');
  vi.stubEnv('AMADEUS_WS_MIN_PAYMENT_RATIO', '0');
  vi.stubEnv('AMADEUS_WS_AIRLINE_LOCATOR_WAIT_MS', '0');
  vi.resetModules();
});

describe('every pricing after the family is known', () => {
  it('pins it when the fare is checked again', async () => {
    const { default: provider } = await import('../../../backend/services/amadeusSoap/index.js');
    replies(readFileSync(new URL('../../fixtures/amadeus/informative-pricing-ecoflex.xml', import.meta.url), 'utf8'));

    await provider.priceFlightOffer(lufthansa('ECOFLEX'));

    expect(sent('Fare_InformativePricingWithoutPNR')[0]).toContain(PFF_ECOFLEX);
  });

  it('pins it on the seat check before payment', async () => {
    vi.stubEnv('AMADEUS_WS_PRICE_CHECK_BEFORE_PAYMENT', 'true');
    const { confirmSeats } = await import('../../../backend/services/amadeusSoap/bookingChain.js');
    replies(sold, pricedPnr('2735.89'));

    await confirmSeats(lufthansa('ECOFLEX'));

    expect(sent('Fare_PricePNRWithBookingClass')).toHaveLength(1);
    expect(sent('Fare_PricePNRWithBookingClass')[0]).toContain(PFF_ECOFLEX);
  });

  it('pins it on the PNR pricing the booking makes its TST from', async () => {
    const { runBookingChain } = await import('../../../backend/services/amadeusSoap/bookingChain.js');
    replies(sold, ok('PNR_Reply'), ok('FOP_CreateFormOfPaymentReply'), pricedPnr('2735.89'), tstOk, commitOk);

    await runBookingChain({ offer: lufthansa('ECOFLEX'), travelers: [{ firstName: 'John', lastName: 'Smith', gender: 'MALE' }] });

    expect(sent('Fare_PricePNRWithBookingClass')[0]).toContain(PFF_ECOFLEX);
  });
});
