import { readFileSync } from 'node:fs';
import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildMiniRulesBody } from '../../../backend/services/amadeusSoap/operations/miniRules.js';

/**
 * MiniRules runs in the session informative pricing opened, after it, and is
 * advisory: a refusal costs the customer the fee table, never the price.
 */

const fixture = (name) => readFileSync(new URL(`../../fixtures/amadeus/${name}`, import.meta.url), 'utf8');
const sessionHeader = (status, sequence) => `<soap:Header><awsse:Session TransactionStatusCode="${status}"><awsse:SessionId>SESS1</awsse:SessionId><awsse:SequenceNumber>${sequence}</awsse:SequenceNumber><awsse:SecurityToken>TOK</awsse:SecurityToken></awsse:Session></soap:Header>`;
const inSession = (xml, sequence) => xml.replace('<soap:Header/>', sessionHeader('InSeries', sequence));
const reply = (xml) => ({ status: 200, data: xml, headers: {} });
const signOut = '<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Header/><soap:Body><Security_SignOutReply><dummy/></Security_SignOutReply></soap:Body></soap:Envelope>';
const noAgreement = '<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><soap:Fault><faultcode>soap:Server</faultcode><faultstring> 17|Session|No agreement on destination</faultstring></soap:Fault></soap:Body></soap:Envelope>';
const replies = (...xmls) => {
  axios.post.mockReset();
  for (const xml of xmls) axios.post.mockResolvedValueOnce(reply(xml));
  axios.post.mockResolvedValue(reply(signOut));
};
const actions = () => axios.post.mock.calls.map(([, , cfg]) => cfg?.headers?.SOAPAction ?? '');

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

describe('MiniRule_GetFromRec request', () => {
  it('asks for every pricing record of the session', () => {
    expect(buildMiniRulesBody()).toBe('<MiniRule_GetFromRec xmlns="http://xml.amadeus.com/TMRXRQ_23_1_1A"><groupRecords><recordID><referenceType>FRN</referenceType><uniqueReference>ALL</uniqueReference></recordID></groupRecords></MiniRule_GetFromRec>');
  });
});

describe('getFiledFareRules with MiniRules', () => {
  it('asks MiniRules after pricing, in the same session, and returns the fees', async () => {
    replies(inSession(fixture('informative-pricing-ecoflex.xml'), 1), inSession(fixture('minirules-lh-ecolight.xml'), 2));
    const result = await (await provider()).getFiledFareRules(lufthansa(), { sections: [] });
    expect(actions().slice(0, 2).map((a) => a.split('/').pop())).toEqual(['TIPNRQ_24_3_1A', 'TMRXRQ_23_1_1A']);
    expect(result.penalties.change.before).toEqual({ allowed: true, amount: 338, varies: false });
  });

  // The results page gives up on the fare check after 15 s; an advisory call
  // must not spend the session's whole 25 s budget.
  it('gives MiniRules a short timeout', async () => {
    replies(inSession(fixture('informative-pricing-ecoflex.xml'), 1), inSession(fixture('minirules-lh-ecolight.xml'), 2));
    await (await provider()).getFiledFareRules(lufthansa(), { sections: [] });
    const miniRules = axios.post.mock.calls.find(([, , cfg]) => String(cfg?.headers?.SOAPAction).endsWith('TMRXRQ_23_1_1A'));
    expect(miniRules[2].timeout).toBeLessThanOrEqual(5000);
  });

  it('keeps the price when MiniRules is refused', async () => {
    replies(inSession(fixture('informative-pricing-ecoflex.xml'), 1), noAgreement);
    const result = await (await provider()).getFiledFareRules(lufthansa(), { sections: [] });
    expect(result.success).toBe(true);
    expect(result.penalties).toBeNull();
  });
});
