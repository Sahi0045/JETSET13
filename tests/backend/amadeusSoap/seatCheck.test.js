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
 *
 * In the same session it prices what it sold. JetBlue B6 3982/L JFK-LAX on PDT
 * was quoted $193.40 by search and informative pricing, and PNR pricing answered
 * NO FARE FOR BOOKING CODE - found by the booking chain, after payment.
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
const waitlisted = (status) => envelope('Air_SellFromRecommendationReply',
  `<itineraryDetails><segmentInformation><actionDetails><quantity>1</quantity><statusCode>${status}</statusCode></actionDetails></segmentInformation>`
  + `<segmentInformation><actionDetails><quantity>1</quantity><statusCode>${status}</statusCode></actionDetails></segmentInformation></itineraryDetails>`, true);
const noStatus = envelope('Air_SellFromRecommendationReply', '<dummy/>', true);
const signOut = envelope('Security_SignOutReply', '<dummy/>');

// Without names PDT prices one adult: one fare, PA1, per-passenger amounts.
const priced = (amount) => envelope('Fare_PricePNRWithBookingClassReply',
  '<fareList><paxSegReference><refDetails><refQualifier>PA</refQualifier><refNumber>1</refNumber></refDetails></paxSegReference>'
  + `<fareDataInformation><fareDataSupInformation><fareDataQualifier>712</fareDataQualifier><fareAmount>${amount}</fareAmount><fareCurrency>USD</fareCurrency></fareDataSupInformation></fareDataInformation></fareList>`, true);
const pricingError = (code, text) => envelope('Fare_PricePNRWithBookingClassReply',
  `<applicationError><errorOrWarningCodeDetails><errorDetails><errorCode>${code}</errorCode><errorCategory>EC</errorCategory></errorDetails></errorOrWarningCodeDetails>`
  + `<errorWarningDescription><freeTextDetails><textSubjectQualifier>3</textSubjectQualifier></freeTextDetails><freeText>${text}</freeText></errorWarningDescription></applicationError>`, true);
const noFare = pricingError('0', 'NO FARE FOR BOOKING CODE-TRY OTHER PRICING OPTIONS');

const offer = (types = ['ADULT'], totals = []) => ({
  id: '1',
  price: { total: '276.76', currency: 'USD' },
  validatingAirlineCodes: ['GF'],
  travelerPricings: types.map((travelerType, i) => ({
    travelerId: String(i + 1),
    travelerType,
    ...(totals[i] ? { price: { currency: 'USD', total: totals[i] } } : {}),
  })),
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
const sent = (operation) => bodiesSent().filter((body) => body.includes(`<${operation}`));
const load = async () => (await import('../../../backend/services/amadeusSoap/bookingChain.js')).confirmSeats;
const refusal = async () => (await import('../../../backend/services/flightCheckout.service.js')).isFareRefusal;

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
  it('sells once, prices what it sold, signs out, and books nothing', async () => {
    const confirmSeats = await load();
    replies(sold, priced('276.76'));

    await expect(confirmSeats(offer(['ADULT'], ['276.76']))).resolves.toMatchObject({
      available: true,
      statuses: ['OK', 'OK'],
      fare: { adultTotal: 276.76, currency: 'USD' },
    });

    expect(sent('Air_SellFromRecommendation')).toHaveLength(1);
    expect(sent('Fare_PricePNRWithBookingClass')).toHaveLength(1);
    // No names, no TST, no commit: the session ends with no PNR.
    expect(sent('PNR_AddMultiElements')).toHaveLength(0);
    expect(sent('Ticket_CreateTSTFromPricing')).toHaveLength(0);
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
    const isFareRefusal = await refusal();
    replies(refused);

    const error = await confirmSeats(offer()).catch((e) => e);

    expect(error).toMatchObject({ name: 'AmadeusSoapError', code: 409, operation: 'Air_SellFromRecommendation' });
    expect(error.technicalError).toContain('UNS');
    expect(isFareRefusal(error)).toBe(true);
    // Seats the airline refused are not priced.
    expect(sent('Fare_PricePNRWithBookingClass')).toHaveLength(0);
    expect(sent('PNR_AddMultiElements')).toHaveLength(0);
    expect(actionsSent().some((action) => action.includes('VLSSOQ'))).toBe(true);
  });

  // A waitlist is not a seat. China Eastern's MU551 came back WL on PDT
  // (16 Sep 2026) and failed as "no usable reply" rather than as the plain
  // refusal it is; HL, "holding waitlist", used to count as sold, which would
  // have charged a customer for a seat the airline never gave them.
  it.each(['WL', 'HL'])('refuses a waitlisted seat (%s) as a fare that cannot be sold', async (status) => {
    const confirmSeats = await load();
    const isFareRefusal = await refusal();
    replies(waitlisted(status));

    const error = await confirmSeats(offer()).catch((e) => e);

    expect(error).toMatchObject({ name: 'AmadeusSoapError', code: 409, operation: 'Air_SellFromRecommendation' });
    expect(error.technicalError).toContain(status);
    expect(isFareRefusal(error)).toBe(true);
    // Nothing waitlisted is priced or booked.
    expect(sent('Fare_PricePNRWithBookingClass')).toHaveLength(0);
    expect(sent('PNR_AddMultiElements')).toHaveLength(0);
  });

  // A round trip whose return the airline refused: the outbound answered OK and
  // the return only an itinerary-level 288, with no segment at all (the XSD
  // lets segmentInformation be absent). "Every status is sold" was true of the
  // one status there was, so the check said available, the customer paid, and
  // the booking chain found the refusal and refunded.
  it('refuses a round trip when the airline answered for the outbound only', async () => {
    const confirmSeats = await load();
    const isFareRefusal = await refusal();
    replies(envelope('Air_SellFromRecommendationReply',
      '<itineraryDetails><segmentInformation><actionDetails><quantity>1</quantity><statusCode>OK</statusCode></actionDetails></segmentInformation></itineraryDetails>'
      + '<itineraryDetails><errorItinerarylevel><errorSpecification><errorDetails><errorCode>288</errorCode><errorCategory>EC</errorCategory></errorDetails></errorSpecification>'
      + '<textInformation><freeText>UNABLE TO SATISFY, NEED CONFIRMED FLIGHT STATUS</freeText></textInformation></errorItinerarylevel></itineraryDetails>', true));

    const error = await confirmSeats(offer()).catch((e) => e);

    expect(error).toBeInstanceOf(Error);
    expect(isFareRefusal(error)).toBe(true);
    expect(sent('Fare_PricePNRWithBookingClass')).toHaveLength(0);
  });

  it('does not call a reply without a seat status a refusal', async () => {
    const confirmSeats = await load();
    const isFareRefusal = await refusal();
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

describe('pricing what the seat check sold, before payment', () => {
  it('refuses a fare the airline will not price for the booked class', async () => {
    const confirmSeats = await load();
    const isFareRefusal = await refusal();
    replies(sold, noFare);

    const error = await confirmSeats(offer(['ADULT'], ['193.40'])).catch((e) => e);

    expect(error).toMatchObject({ name: 'AmadeusSoapError', code: 409, operation: 'Fare_PricePNRWithBookingClass' });
    expect(error.technicalError).toContain('NO FARE FOR BOOKING CODE');
    expect(isFareRefusal(error)).toBe(true);
    expect(sent('PNR_AddMultiElements')).toHaveLength(0);
    expect(actionsSent().some((action) => action.includes('VLSSOQ'))).toBe(true);
  });

  it('refuses an adult fare that prices higher than quoted', async () => {
    const confirmSeats = await load();
    const isFareRefusal = await refusal();
    replies(sold, priced('1743.50'));

    const error = await confirmSeats(offer(['ADULT'], ['294.50'])).catch((e) => e);

    expect(error).toMatchObject({ name: 'AmadeusSoapError', code: 409, operation: 'Fare_PricePNRWithBookingClass' });
    expect(error.technicalError).toContain('1743.5');
    expect(error.technicalError).toContain('294.50');
    expect(isFareRefusal(error)).toBe(true);
  });

  it('lets a fare through that prices lower than quoted', async () => {
    const confirmSeats = await load();
    replies(sold, priced('180.00'));

    await expect(confirmSeats(offer(['ADULT'], ['193.40']))).resolves.toMatchObject({ fare: { adultTotal: 180 } });
  });

  it('allows a rise within the configured tolerance', async () => {
    vi.stubEnv('AMADEUS_WS_PRICE_TOLERANCE', '1');
    const confirmSeats = await load();
    replies(sold, priced('194.00'));

    await expect(confirmSeats(offer(['ADULT'], ['193.40']))).resolves.toMatchObject({ available: true });
  });

  it('compares the adult fare, not the party total', async () => {
    const confirmSeats = await load();
    // Two adults, a child and a lap infant: priced without names, PDT answers
    // one adult fare, which matches the adult total quoted.
    replies(sold, priced('193.40'));

    await expect(confirmSeats(offer(['ADULT', 'ADULT', 'CHILD', 'HELD_INFANT'], ['193.40', '193.40', '150.00', '20.00'])))
      .resolves.toMatchObject({ fare: { adultTotal: 193.4 } });

    const sell = sent('Air_SellFromRecommendation')[0];
    expect(sell.match(/<quantity>(\d+)<\/quantity>/g)).toEqual(['<quantity>3</quantity>', '<quantity>3</quantity>']);
  });

  it('does not stop checkout when pricing fails for another reason', async () => {
    const confirmSeats = await load();
    replies(sold, pricingError('1', 'UNABLE TO PROCESS - SYSTEM ERROR'));

    await expect(confirmSeats(offer(['ADULT'], ['193.40']))).resolves.toMatchObject({ available: true, fare: null });
  });

  it('does not stop checkout when the pricing call itself fails', async () => {
    const confirmSeats = await load();
    axios.post.mockReset();
    axios.post.mockResolvedValueOnce(reply(sold));
    axios.post.mockRejectedValueOnce(Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }));
    axios.post.mockResolvedValue(reply(signOut));

    await expect(confirmSeats(offer(['ADULT'], ['193.40']))).resolves.toMatchObject({ available: true, fare: null });
  });

  it('can be switched off without a deploy', async () => {
    vi.stubEnv('AMADEUS_WS_PRICE_CHECK_BEFORE_PAYMENT', 'false');
    const confirmSeats = await load();
    replies(sold, noFare);

    await expect(confirmSeats(offer(['ADULT'], ['193.40']))).resolves.toMatchObject({ available: true, fare: null });
    expect(sent('Fare_PricePNRWithBookingClass')).toHaveLength(0);
  });
});
