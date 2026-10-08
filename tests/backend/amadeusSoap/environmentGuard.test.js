import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mapMasterPricerReply } from '../../../backend/services/amadeusSoap/mappers/offer.js';
import { parseSoap, unwrapEnvelope } from '../../../backend/services/amadeusSoap/parseXml.js';
import { readFileSync } from 'node:fs';

/**
 * An offer found on one Amadeus environment must never be sold on the other.
 *
 * Amadeus issued production (8 Oct 2026) under the same WSAP name as PDT,
 * 1ASIWJETJEC, with the same office. The guard compared only the WSAP name, so
 * a PDT offer passed it on the production node. The node host is the one thing
 * that differs: nodeD2.test.webservices.amadeus.com vs
 * nodeD2.production.webservices.amadeus.com.
 */

const PRODUCTION = 'https://nodeD2.production.webservices.amadeus.com/1ASIWJETJEC';
const PDT_NODE = 'nodeD2.test.webservices.amadeus.com';
const PRODUCTION_NODE = 'nodeD2.production.webservices.amadeus.com';

const offer = (node) => ({
  id: '1',
  source: 'GDS',
  price: { total: '76.00', currency: 'USD' },
  validatingAirlineCodes: ['AI'],
  travelerPricings: [{ travelerId: '1', travelerType: 'ADULT', price: { currency: 'USD', total: '76.00' } }],
  itineraries: [{ segments: [{ id: '1' }] }],
  _ama: {
    wsap: '1ASIWJETJEC',
    node,
    officeId: 'SCK1S2400',
    searchedAt: new Date().toISOString(),
    paxRefs: [{ ref: '1', ptc: 'ADT' }],
    segments: [{
      legIndex: 0, boardPoint: 'DEL', offPoint: 'BOM', departureDate: '251126',
      arrivalDate: '251126', marketingCarrier: 'AI', flightNumber: '9484', rbd: 'S',
    }],
  },
});

const travelers = [{ firstName: 'John', lastName: 'Smith', gender: 'MALE' }];

const envelope = (name, inner, session) => `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:awsse="http://xml.amadeus.com/2010/06/Session_v3">
  <soap:Header>${session ? '<awsse:Session TransactionStatusCode="InSeries"><awsse:SessionId>S1</awsse:SessionId><awsse:SequenceNumber>1</awsse:SequenceNumber><awsse:SecurityToken>T</awsse:SecurityToken></awsse:Session>' : ''}</soap:Header>
  <soap:Body><${name}>${inner}</${name}></soap:Body>
</soap:Envelope>`;
const reply = (xml) => ({ status: 200, data: xml, headers: {} });
const sold = envelope('Air_SellFromRecommendationReply',
  '<itineraryDetails><segmentInformation><actionDetails><quantity>1</quantity><statusCode>OK</statusCode></actionDetails></segmentInformation></itineraryDetails>', true);
const priced = envelope('Fare_PricePNRWithBookingClassReply',
  '<fareList><paxSegReference><refDetails><refQualifier>PA</refQualifier><refNumber>1</refNumber></refDetails></paxSegReference>'
  + '<fareDataInformation><fareDataSupInformation><fareDataQualifier>712</fareDataQualifier><fareAmount>76.00</fareAmount><fareCurrency>USD</fareCurrency></fareDataSupInformation></fareDataInformation></fareList>', true);
const signOut = envelope('Security_SignOutReply', '<dummy/>');

const loadChain = async () => import('../../../backend/services/amadeusSoap/bookingChain.js');

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('AMADEUS_WS_ENDPOINT', PRODUCTION);
  vi.stubEnv('AMADEUS_WS_WSAP', '1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_USERNAME', 'WSTEST');
  vi.stubEnv('AMADEUS_WS_PASSWORD', 'pw');
  vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
  vi.stubEnv('AMADEUS_WS_BOOKING_ENABLED', 'true');
  vi.stubEnv('AMADEUS_WS_MIN_PAYMENT_RATIO', '0');
  vi.resetModules();
  axios.post.mockReset();
  axios.post.mockResolvedValue(reply(signOut));
});

describe('telling PDT and production apart under one WSAP name', () => {
  it('reads the node from the endpoint', async () => {
    const { getWsConfig } = await import('../../../backend/services/amadeusSoap/config.js');

    expect(getWsConfig().node).toBe(PRODUCTION_NODE.toLowerCase());
  });

  it('stamps each search offer with the node that found it', () => {
    const xml = readFileSync(new URL('../../fixtures/amadeus/mptbs-nonstop-business.xml', import.meta.url), 'utf8');
    const { body } = unwrapEnvelope(parseSoap(xml));
    const masterPricer = body[Object.keys(body).find((k) => k !== 'Fault')];
    const config = { wsap: '1ASIWJETJEC', node: PRODUCTION_NODE, officeId: 'SCK1S2400', currency: 'USD' };

    const { offers } = mapMasterPricerReply(masterPricer, { config, searchSignature: 'test' });

    expect(offers.length).toBeGreaterThan(0);
    expect(offers.every((o) => o._ama.node === PRODUCTION_NODE)).toBe(true);
  });

  it('refuses to book a PDT offer on production, before anything is sold', async () => {
    const { runBookingChain } = await loadChain();

    await expect(runBookingChain({ offer: offer(PDT_NODE), travelers }))
      .rejects.toMatchObject({ step: 'validate', committed: false, code: 409 });
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('refuses the seat check on a PDT offer, before the card is charged', async () => {
    const { confirmSeats } = await loadChain();

    const error = await confirmSeats(offer(PDT_NODE)).catch((e) => e);

    expect(error).toMatchObject({ name: 'AmadeusSoapError', code: 409 });
    expect(error.technicalError).toContain(PDT_NODE);
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('lets the seat check run on an offer this node found', async () => {
    const { confirmSeats } = await loadChain();
    axios.post.mockReset();
    axios.post.mockResolvedValueOnce(reply(sold)).mockResolvedValueOnce(reply(priced)).mockResolvedValue(reply(signOut));

    await expect(confirmSeats(offer(PRODUCTION_NODE))).resolves.toMatchObject({ available: true });
  });
});
