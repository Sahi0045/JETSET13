import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The seat check checkout runs before the card is charged.
 *
 * Search availability is a copy. Gulf Air GF131 DEL-BAH on 22 Sep 2026 was
 * offered in class W with 7 seats, and every sell answered UNS / 288 - after the
 * customer had paid. confirmSeats sells once and signs out without naming or
 * committing anything, so the airline's answer is known before payment and no
 * booking is left behind.
 */

const envelope = (name, inner, session) => `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:awsse="http://xml.amadeus.com/2010/06/Session_v3">
  <soap:Header>${session ? '<awsse:Session TransactionStatusCode="InSeries"><awsse:SessionId>S1</awsse:SessionId><awsse:SequenceNumber>1</awsse:SequenceNumber><awsse:SecurityToken>T</awsse:SecurityToken></awsse:Session>' : ''}</soap:Header>
  <soap:Body><${name}>${inner}</${name}></soap:Body>
</soap:Envelope>`;
const reply = (xml) => ({ status: 200, data: xml, headers: {} });

const sold = envelope('Air_SellFromRecommendationReply',
  '<itineraryDetails><segmentInformation><actionDetails><quantity>1</quantity><statusCode>OK</statusCode></actionDetails></segmentInformation>'
  + '<segmentInformation><actionDetails><quantity>1</quantity><statusCode>OK</statusCode></actionDetails></segmentInformation></itineraryDetails>', true);
const refused = envelope('Air_SellFromRecommendationReply',
  '<errorAtMessageLevel><errorSegment><errorDetails><errorCode>288</errorCode><errorCategory>EC</errorCategory></errorDetails></errorSegment></errorAtMessageLevel>'
  + '<itineraryDetails><segmentInformation><actionDetails><quantity>1</quantity><statusCode>UNS</statusCode></actionDetails></segmentInformation>'
  + '<segmentInformation><actionDetails><quantity>1</quantity><statusCode>X</statusCode></actionDetails></segmentInformation></itineraryDetails>', true);
const noStatus = envelope('Air_SellFromRecommendationReply', '<dummy/>', true);
const signOut = envelope('Security_SignOutReply', '<dummy/>');

const offer = (types = ['ADULT']) => ({
  id: '1',
  price: { total: '276.76', currency: 'USD' },
  validatingAirlineCodes: ['GF'],
  travelerPricings: types.map((travelerType, i) => ({ travelerId: String(i + 1), travelerType })),
  _ama: {
    wsap: '1ASIWJETJEC',
    segments: [
      { legIndex: 0, boardPoint: 'DEL', offPoint: 'BAH', departureDate: '220926', marketingCarrier: 'GF', flightNumber: '131', rbd: 'W' },
      { legIndex: 0, boardPoint: 'BAH', offPoint: 'LHR', departureDate: '220926', marketingCarrier: 'GF', flightNumber: '3', rbd: 'W' },
    ],
  },
});

const replies = (...xmls) => {
  axios.post.mockReset();
  for (const xml of xmls) axios.post.mockResolvedValueOnce(reply(xml));
  axios.post.mockResolvedValue(reply(signOut));
};
const bodiesSent = () => axios.post.mock.calls.map(([, body]) => String(body));
const actionsSent = () => axios.post.mock.calls.map(([, , cfg]) => cfg?.headers?.SOAPAction ?? '');
const load = async () => (await import('../../../backend/services/amadeusSoap/bookingChain.js')).confirmSeats;

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('AMADEUS_WS_ENDPOINT', 'https://node.test.invalid/1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_WSAP', '1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_USERNAME', 'WSTEST');
  vi.stubEnv('AMADEUS_WS_PASSWORD', 'pw');
  vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
  vi.resetModules();
});

describe('confirming the seats before payment', () => {
  it('sells once, signs out, and books nothing', async () => {
    const confirmSeats = await load();
    replies(sold);

    await expect(confirmSeats(offer())).resolves.toMatchObject({ available: true, statuses: ['OK', 'OK'] });

    expect(bodiesSent().filter((body) => body.includes('<Air_SellFromRecommendation'))).toHaveLength(1);
    // No names, no commit: the session ends with no PNR.
    expect(bodiesSent().some((body) => body.includes('<PNR_AddMultiElements'))).toBe(false);
    expect(actionsSent().some((action) => action.includes('VLSSOQ'))).toBe(true);
  });

  it('holds no seat for an infant on a lap', async () => {
    const confirmSeats = await load();
    replies(sold);

    await confirmSeats(offer(['ADULT', 'HELD_INFANT']));

    const sell = bodiesSent().find((body) => body.includes('<Air_SellFromRecommendation'));
    expect(sell.match(/<quantity>(\d+)<\/quantity>/g)).toEqual(['<quantity>1</quantity>', '<quantity>1</quantity>']);
  });

  it('refuses with a 409 the checkout reads as a fare that cannot be sold', async () => {
    const confirmSeats = await load();
    const { isFareRefusal } = await import('../../../backend/services/flightCheckout.service.js');
    replies(refused);

    const error = await confirmSeats(offer()).catch((e) => e);

    expect(error).toMatchObject({ name: 'AmadeusSoapError', code: 409, operation: 'Air_SellFromRecommendation' });
    expect(error.technicalError).toContain('UNS');
    expect(isFareRefusal(error)).toBe(true);
    expect(bodiesSent().some((body) => body.includes('<PNR_AddMultiElements'))).toBe(false);
    expect(actionsSent().some((action) => action.includes('VLSSOQ'))).toBe(true);
  });

  it('does not call a reply without a seat status a refusal', async () => {
    const confirmSeats = await load();
    const { isFareRefusal } = await import('../../../backend/services/flightCheckout.service.js');
    replies(noStatus);

    const error = await confirmSeats(offer()).catch((e) => e);

    expect(error).toBeInstanceOf(Error);
    expect(isFareRefusal(error)).toBe(false);
  });

  it('refuses an offer that did not come from this provider before calling Amadeus', async () => {
    const confirmSeats = await load();
    axios.post.mockReset();

    await expect(confirmSeats({ id: '1', price: {} })).rejects.toMatchObject({ code: 409 });
    expect(axios.post).not.toHaveBeenCalled();
  });
});
