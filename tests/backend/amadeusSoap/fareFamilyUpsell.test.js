import { readFileSync } from 'node:fs';
import axios from 'axios';
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { errorHandler } from '../../../backend/middleware/errorHandler.js';
import { buildFareFamilyDescriptionBody, buildUpsellBody } from '../../../backend/services/amadeusSoap/operations/fareFamilies.js';
import { describeOption, mapFareFamilyDescriptions, mapUpsellReply } from '../../../backend/services/amadeusSoap/mappers/fareFamilies.js';
import { parseSoap, unwrapEnvelope } from '../../../backend/services/amadeusSoap/parseXml.js';

/**
 * Airline Fare Families: the upsell and the family description, the flow
 * Amadeus's certification asks for ("Upsell after Shopping").
 *
 * The fixtures are PDT replies recorded on 5 Oct 2026 for LH4462 FRA-JFK:
 * nine families, five economy in class B and four premium economy in class G,
 * for one adult and for two adults, a child and an infant.
 */

const fixture = (name) => readFileSync(new URL(`../../fixtures/amadeus/${name}.xml`, import.meta.url), 'utf8');
const bodyOf = (xml) => {
  const { body } = unwrapEnvelope(parseSoap(xml));
  return body[Object.keys(body).find((k) => k !== 'Fault')];
};

const segments = [{
  legIndex: 0, boardPoint: 'FRA', offPoint: 'JFK', departureDate: '141126', departureTime: '1015',
  arrivalDate: '141126', marketingCarrier: 'LH', flightNumber: '4462', rbd: 'B',
}];

const lufthansa = (types = ['ADULT']) => {
  const travelerPricings = types.map((travelerType, index) => {
    const infant = travelerType === 'HELD_INFANT';
    return {
      travelerId: String(index + 1),
      ...(infant ? { associatedAdultId: '1' } : {}),
      fareOption: 'STANDARD',
      travelerType,
      price: { currency: 'USD', total: '2362.69', base: '1937.00' },
      fareDetailsBySegment: [{ segmentId: '1', cabin: 'ECONOMY', fareBasis: 'BLOXKXBQ', brandedFare: null, class: 'B', amenities: [] }],
    };
  });
  const ptc = { ADULT: 'ADT', CHILD: 'CHD', HELD_INFANT: 'INF' };
  return {
    type: 'flight-offer',
    id: '1-1',
    source: 'GDS',
    itineraries: [{ duration: 'PT8H55M', segments: [{ id: '1', carrierCode: 'LH', number: '4462', departure: { iataCode: 'FRA', at: '2026-11-14T10:15:00' }, arrival: { iataCode: 'JFK', at: '2026-11-14T13:10:00' }, aircraft: { code: '333' }, numberOfStops: 0 }] }],
    price: { currency: 'USD', total: '2362.69', base: '1937.00', grandTotal: '2362.69', fees: [] },
    validatingAirlineCodes: ['LH'],
    travelerPricings,
    _ama: {
      wsap: '1ASIWJETJEC',
      officeId: 'SCK1S2400',
      searchedAt: new Date().toISOString(),
      paxRefs: types.map((type, index) => ({ ref: type === 'HELD_INFANT' ? '1' : String(index + 1), ptc: ptc[type] })),
      segments,
    },
  };
};

const FAMILIES = ['ECOLIGHT', 'ECOCMFT', 'ECOCMFTPLS', 'ECOGREIC', 'ECOFLEX', 'PRELIGHT', 'PRECMFT', 'PRECMFTPLS', 'PREGREIC'];

describe('the requests', () => {
  it('ask for the upsell with the options in Amadeus\'s own example', () => {
    const xml = buildUpsellBody({ paxRefs: [{ ref: '1', ptc: 'ADT' }], segments, currency: 'USD', validatingCarrier: 'LH' });

    expect(xml).toContain('<Fare_PriceUpsellWithoutPNR xmlns="http://xml.amadeus.com/TIUNRQ_23_1_1A">');
    for (const key of ['VC', 'RP', 'RLO', 'FCO']) expect(xml).toContain(`<pricingOptionKey><pricingOptionKey>${key}</pricingOptionKey></pricingOptionKey>`);
    expect(xml).toContain('<otherCompany>LH</otherCompany>');
    expect(xml).toContain('<currencyIsoCode>USD</currencyIsoCode>');
    expect(xml).toContain('<bookingClass>B</bookingClass>');
  });

  it('describe every family in one call, each with its market and owner', () => {
    const xml = buildFareFamilyDescriptionBody([
      { family: 'ECOLIGHT', carrier: 'LH', origin: 'FRA', destination: 'NYC' },
      { family: 'ECOFLEX', carrier: 'LH', origin: 'FRA', destination: 'NYC' },
    ]);

    expect(xml).toContain('<Fare_GetFareFamilyDescription xmlns="http://xml.amadeus.com/TFQFRQ_18_1_1A">');
    expect(xml.match(/<standaloneDescriptionRequest>/g)).toHaveLength(2);
    expect(xml).toContain('<fareInformation><discountDetails><fareQualifier>FF</fareQualifier><rateCategory>ECOFLEX</rateCategory></discountDetails></fareInformation>'
      + '<itineraryInformation><origin>FRA</origin><destination>NYC</destination></itineraryInformation>'
      + '<carrierInformation><companyIdentification><otherCompany>LH</otherCompany></companyIdentification></carrierInformation>');
  });
});

describe('the upsell reply', () => {
  it('is one bookable option per family, each priced and pinned to its family', () => {
    const options = mapUpsellReply(bodyOf(fixture('upsell-lh-1adt')), lufthansa());

    expect(options.map((o) => o._ama.fareFamily)).toEqual(FAMILIES);
    const flex = options.find((o) => o._ama.fareFamily === 'ECOFLEX');
    expect(flex.price).toMatchObject({ currency: 'USD', total: '2720.69', grandTotal: '2720.69' });
    expect(flex.travelerPricings[0].fareDetailsBySegment[0]).toMatchObject({ brandedFare: 'ECOFLEX', fareBasis: 'BLOXKMFF', class: 'B' });
    expect(flex.isUpsellOffer).toBe(true);
    expect(new Set(options.map((o) => o.id)).size).toBe(9);
  });

  // Premium economy is sold in class G, not the class the search found.
  it('sells a family in its own booking class', () => {
    const premium = mapUpsellReply(bodyOf(fixture('upsell-lh-1adt')), lufthansa()).find((o) => o._ama.fareFamily === 'PRELIGHT');

    expect(premium._ama.segments[0].rbd).toBe('G');
    expect(premium.travelerPricings[0].fareDetailsBySegment[0].class).toBe('G');
    expect(premium.price.total).toBe('3417.59');
  });

  it('prices every traveller their own fare: adults, a child and an infant on a lap', () => {
    const offer = lufthansa(['ADULT', 'ADULT', 'CHILD', 'HELD_INFANT']);
    const flex = mapUpsellReply(bodyOf(fixture('upsell-lh-family')), offer).find((o) => o._ama.fareFamily === 'ECOFLEX');

    expect(flex.travelerPricings.map((t) => [t.travelerType, t.price.total])).toEqual([
      ['ADULT', '2720.69'], ['ADULT', '2720.69'], ['CHILD', '2147.69'], ['HELD_INFANT', '271.99'],
    ]);
    expect(flex.price.total).toBe('7861.06');
  });

  it('takes nothing about the fare from the one that was clicked', () => {
    const clicked = lufthansa();
    clicked._ama.refundable = false;
    clicked.numberOfBookableSeats = 2;

    const premium = mapUpsellReply(bodyOf(fixture('upsell-lh-1adt')), clicked).find((o) => o._ama.fareFamily === 'PRELIGHT');

    expect(premium._ama.refundable).toBeUndefined();
    expect(premium.numberOfBookableSeats).toBe(9);
    expect(premium._ama.segments[0]).toMatchObject({ rbd: 'G', cabinDesignator: 'W', fareBasis: 'GXOXKYBO' });
  });

  it('leaves the base unknown rather than borrow the clicked fare\'s', () => {
    const noEquivalent = fixture('upsell-lh-1adt').replace(
      /(<fareDataSupInformation><fareDataQualifier>E<\/fareDataQualifier><fareAmount>2295\.00<\/fareAmount><fareCurrency>USD<\/fareCurrency><\/fareDataSupInformation>)/,
      '',
    );

    const flex = mapUpsellReply(bodyOf(noEquivalent), lufthansa()).find((o) => o._ama.fareFamily === 'ECOFLEX');

    expect(flex.price.total).toBe('2720.69');
    expect(flex.price.base).toBeUndefined();
    expect(flex.travelerPricings[0].price.base).toBeUndefined();
  });

  // A lap infant's fare can name no family; the seated passengers' fares do.
  it('keeps an option whose lap infant fare names no family', () => {
    const offer = lufthansa(['ADULT', 'ADULT', 'CHILD', 'HELD_INFANT']);
    const infantUnnamed = fixture('upsell-lh-family').replace(/<fareList>(?:(?!<\/fareList>)[\s\S])*?<refQualifier>PI<\/refQualifier>[\s\S]*?<\/fareList>/g,
      (fareList) => fareList.replace(/<fareFamilyDetails>[\s\S]*?<\/fareFamilyDetails>/, ''));

    const flex = mapUpsellReply(bodyOf(infantUnnamed), offer).find((o) => o._ama.fareFamily === 'ECOFLEX');

    expect(flex.price.total).toBe('7861.06');
  });

  it('leaves out a family whose name cannot be sent back to Amadeus', () => {
    const odd = fixture('upsell-lh-1adt').replace('<fareFamilyname>ECOLIGHT</fareFamilyname>', '<fareFamilyname>ECO*LIGHT</fareFamilyname>');

    expect(mapUpsellReply(bodyOf(odd), lufthansa()).map((o) => o._ama.fareFamily)).toEqual(FAMILIES.filter((f) => f !== 'ECOLIGHT'));
  });

  it('leaves out an option not in one family on every segment', () => {
    const withoutLight = fixture('upsell-lh-1adt').replace('<fareFamilyname>ECOLIGHT</fareFamilyname>', '');

    const options = mapUpsellReply(bodyOf(withoutLight), lufthansa());

    expect(options.map((o) => o._ama.fareFamily)).toEqual(FAMILIES.filter((f) => f !== 'ECOLIGHT'));
  });
});

describe('the family description', () => {
  const requests = FAMILIES.map((family) => ({ family, carrier: 'LH', origin: 'FRA', destination: 'NYC' }));
  const descriptions = mapFareFamilyDescriptions(bodyOf(fixture('fare-family-description-lh')), requests);
  const described = (family) => describeOption(
    mapUpsellReply(bodyOf(fixture('upsell-lh-1adt')), lufthansa()).find((o) => o._ama.fareFamily === family),
    descriptions,
  );

  it('names each family as the airline does', () => {
    expect(described('ECOFLEX').travelerPricings[0].fareDetailsBySegment[0].brandedFareLabel).toBe('ECONOMY FLEX');
    expect(described('PRELIGHT').travelerPricings[0].fareDetailsBySegment[0].brandedFareLabel).toBe('PREMIUM ECONOMY LIGHT');
  });

  it('says what is included and what is at a charge, and leaves out what is not offered', () => {
    const amenities = described('ECOFLEX').travelerPricings[0].fareDetailsBySegment[0].amenities;

    expect(amenities).toContainEqual(expect.objectContaining({ description: '1 CHECKED BAG UP TO 23KG', isChargeable: false }));
    expect(amenities).toContainEqual(expect.objectContaining({ description: 'LOUNGE ACCESS', isChargeable: true }));
    expect(described('ECOFLEX').travelerPricings[0].fareDetailsBySegment[0].includedCabinBags).toEqual({ weight: 8, weightUnit: 'KG' });
  });

  it('reads refundability from the family, not from a guess', () => {
    expect(described('ECOFLEX')._ama.refundable).toBe(true);
    expect(described('ECOLIGHT')._ama.refundable).toBe(false);
  });

  it('keeps the request it was asked for out of the offer', () => {
    expect(described('ECOFLEX')).not.toHaveProperty('fareFamilyDescriptionRequest');
  });
});

const sessionHeader = (status, sequence) => `<soap:Header><awsse:Session TransactionStatusCode="${status}"><awsse:SessionId>SESS1</awsse:SessionId><awsse:SequenceNumber>${sequence}</awsse:SequenceNumber><awsse:SecurityToken>TOK</awsse:SecurityToken></awsse:Session></soap:Header>`;
const inSession = (xml, sequence) => xml.replace('<soap:Header/>', sessionHeader('InSeries', sequence));
const envelope = (name, inner) => `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:awsse="http://xml.amadeus.com/2010/06/Session_v3"><soap:Header/><soap:Body><${name}>${inner}</${name}></soap:Body></soap:Envelope>`;
const reply = (xml, status = 200) => ({ status, data: xml, headers: {} });
const signOut = envelope('Security_SignOutReply', '<dummy/>');
const noAgreement = `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><soap:Fault><faultcode>soap:Server</faultcode><faultstring> 17|Session|No agreement on destination</faultstring></soap:Fault></soap:Body></soap:Envelope>`;

const replies = (...xmls) => {
  axios.post.mockReset();
  for (const xml of xmls) axios.post.mockResolvedValueOnce(Array.isArray(xml) ? reply(...xml) : reply(xml));
  axios.post.mockResolvedValue(reply(signOut));
};
const sent = () => axios.post.mock.calls.map(([, body, cfg]) => ({ body: String(body), action: cfg?.headers?.SOAPAction ?? '' }));

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('AMADEUS_WS_ENDPOINT', 'https://node.test.invalid/1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_WSAP', '1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_USERNAME', 'WSTEST');
  vi.stubEnv('AMADEUS_WS_PASSWORD', 'pw');
  vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
  vi.stubEnv('AMADEUS_WS_ENABLED', 'true');
  vi.resetModules();
});

const provider = async () => (await import('../../../backend/services/amadeusSoap/index.js')).default;

describe('getBrandedFareUpsell', () => {
  it('prices the families and describes them in the same session', async () => {
    replies(inSession(fixture('upsell-lh-1adt'), 1), inSession(fixture('fare-family-description-lh'), 2));

    const result = await (await provider()).getBrandedFareUpsell(lufthansa());

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(9);
    expect(result.data.find((o) => o._ama.fareFamily === 'ECOFLEX').travelerPricings[0].fareDetailsBySegment[0].brandedFareLabel).toBe('ECONOMY FLEX');
    const [upsell, description] = sent();
    expect(upsell.action).toContain('TIUNRQ_23_1_1A');
    expect(description.action).toContain('TFQFRQ_18_1_1A');
    expect(description.body).toContain('<awsse:SessionId>SESS1</awsse:SessionId>');
    expect(description.body.match(/<standaloneDescriptionRequest>/g)).toHaveLength(9);
  });

  // Amadeus's certification workbook: NO FARES FOUND means the flight has no
  // fare families, which is not a failure.
  it('answers with no options for a flight without fare families', async () => {
    replies(inSession(envelope('Fare_PriceUpsellWithoutPNRReply',
      '<applicationError><errorOrWarningCodeDetails><errorDetails><errorCode>0</errorCode><errorCategory>EC</errorCategory></errorDetails></errorOrWarningCodeDetails><errorWarningDescription><freeText>NO FARES FOUND</freeText></errorWarningDescription></applicationError>'), 1));

    const result = await (await provider()).getBrandedFareUpsell(lufthansa());

    expect(result).toMatchObject({ success: true, data: [] });
    expect(sent().some((call) => call.action.includes('TFQFRQ'))).toBe(false);
  });

  // SpiceJet and Hahn Air on PDT, 5 Oct 2026: the airline files no families.
  it('answers with no options, not a failure, for an airline without fare families', async () => {
    replies(inSession(fixture('upsell-not-available'), 1));

    const result = await (await provider()).getBrandedFareUpsell(lufthansa());

    expect(result).toMatchObject({ success: true, data: [] });
    expect(sent().some((call) => call.action.includes('TFQFRQ'))).toBe(false);
  });

  it('still offers the families when the description is refused', async () => {
    replies(inSession(fixture('upsell-lh-1adt'), 1), [noAgreement, 500]);

    const result = await (await provider()).getBrandedFareUpsell(lufthansa());

    expect(result.success).toBe(true);
    expect(result.data.map((o) => o._ama.fareFamily)).toEqual(FAMILIES);
    expect(result.data[0].travelerPricings[0].fareDetailsBySegment[0].brandedFareLabel).toBeUndefined();
  });

  it('reports the upsell being refused instead of throwing', async () => {
    replies([noAgreement, 500]);

    const result = await (await provider()).getBrandedFareUpsell(lufthansa());

    expect(result).toMatchObject({ success: false, data: [], reason: 'upsell_failed' });
  });

  it('asks nothing for an offer that did not come from this provider', async () => {
    axios.post.mockReset();

    const result = await (await provider()).getBrandedFareUpsell({ id: '1', price: { total: '100.00' } });

    expect(result).toMatchObject({ success: false, reason: 'not_from_this_provider' });
    expect(axios.post).not.toHaveBeenCalled();
  });
});

describe('POST /api/flights/upsell', () => {
  it('returns each family as a fare card the options popup shows', async () => {
    replies(inSession(fixture('upsell-lh-1adt'), 1), inSession(fixture('fare-family-description-lh'), 2));
    const routes = (await import('../../../backend/routes/flight.routes.js')).default;
    const app = express();
    app.use(express.json());
    app.use('/api/flights', routes);
    app.use(errorHandler);

    const res = await request(app).post('/api/flights/upsell').send({ flightOffer: lufthansa() });

    expect(res.status).toBe(200);
    expect(res.body.meta).toMatchObject({ available: true, count: 9 });
    const flex = res.body.data.find((card) => card.brandedFare === 'ECOFLEX');
    expect(flex).toMatchObject({ brandedFareLabel: 'ECONOMY FLEX', bookingClass: 'B', fareBasis: 'BLOXKMFF', refundable: true, isUpsellOffer: true });
    expect(flex.price).toMatchObject({ total: '2720.69', currency: 'USD' });
    expect(flex.baggageDetails.checked).toEqual({ quantity: 1 });
    expect(flex.originalOffer._ama).toMatchObject({ fareFamily: 'ECOFLEX', segments: [expect.objectContaining({ rbd: 'B' })] });
  });
});
