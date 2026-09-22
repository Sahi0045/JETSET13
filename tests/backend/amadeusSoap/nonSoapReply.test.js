import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A reply that is not a SOAP envelope.
 *
 * Amadeus answers a fault with HTTP 500 and an envelope, so the transport reads
 * every status. Whatever else comes back on that same path - a gateway's HTML
 * 502/503/504 page, an empty body, an envelope cut off mid-reply - used to
 * parse to an empty body with no Fault and no error container in it, and
 * inspectReply({}) answers ok. A PNR_Cancel answered that way was reported as
 * cancelled, and the cancel handler refunded the customer while the PNR was
 * still live; a PNR_Retrieve answered that way read as "no tickets", so the
 * void was skipped over a live ticket.
 *
 * Nobody saw the airline's answer to any of these, which is exactly what a
 * timeout means - so they are the same error as a timeout: the outcome is
 * unknown, not refused and not succeeded.
 */

const SESSION_XML = '<awsse:Session TransactionStatusCode="InSeries"><awsse:SessionId>S1</awsse:SessionId>'
  + '<awsse:SequenceNumber>1</awsse:SequenceNumber><awsse:SecurityToken>T</awsse:SecurityToken></awsse:Session>';

const envelope = (name, inner) => `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:awsse="http://xml.amadeus.com/2010/06/Session_v3">
  <soap:Header>${SESSION_XML}</soap:Header>
  <soap:Body><${name}>${inner}</${name}></soap:Body>
</soap:Envelope>`;

const reply = (xml, status = 200) => ({ status, data: xml, headers: {} });

// An unticketed PNR - every production booking while AUTO_TICKET is off.
const retrievedNoTicket = envelope('PNR_Reply',
  '<pnrHeader><reservationInfo><reservation><companyId>1A</companyId><controlNumber>ABC123</controlNumber></reservation></reservationInfo></pnrHeader>'
  + '<originDestinationDetails><itineraryInfo><elementManagementItinerary><segmentName>AIR</segmentName></elementManagementItinerary>'
  + '<relatedProduct><quantity>1</quantity><status>HK</status></relatedProduct></itineraryInfo></originDestinationDetails>');

/** Today as Amadeus writes it on a ticket: the office's date (see cancelVoid.test.js). */
const todayDDMMMYY = () => {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const [year, month, day] = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }).split('-');
  return `${day}${months[Number(month) - 1]}${year.slice(-2)}`;
};

const retrievedTicketedToday = () => envelope('PNR_Reply',
  '<pnrHeader><reservationInfo><reservation><controlNumber>ABC123</controlNumber></reservation></reservationInfo></pnrHeader>'
  + '<dataElementsMaster><dataElementsIndiv>'
  + '<elementManagementData><segmentName>FA</segmentName></elementManagementData>'
  + `<otherDataFreetext><longFreetext>PAX 057-2412345678/ETAI/USD221.70/${todayDDMMMYY()}/SCK1S2400/12345678</longFreetext></otherDataFreetext>`
  + '</dataElementsIndiv></dataElementsMaster>');

const cancelledOk = envelope('PNR_Reply',
  '<pnrHeader><reservationInfo><reservation><controlNumber>ABC123</controlNumber></reservation></reservationInfo></pnrHeader>');
const signOutOk = envelope('Security_SignOutReply', '<dummy/>');

// What a gateway in front of Amadeus actually sends when it gives up.
const NOT_SOAP = [
  ['an HTML 503 page', { status: 503, data: '<html><head><title>503 Service Unavailable</title></head><body><h1>503 Service Unavailable</h1></body></html>', headers: {} }],
  ['an empty 200 body', { status: 200, data: '', headers: {} }],
  // Cut off mid-reply. The parser is lenient and closes what it was given, so
  // this parses to an envelope with a body - just not the whole one.
  ['a truncated envelope', { status: 200, data: cancelledOk.slice(0, cancelledOk.indexOf('</pnrHeader>')), headers: {} }],
  ['a 504 with an empty body', { status: 504, data: '', headers: {} }],
  ['plain text', { status: 502, data: 'Bad Gateway', headers: {} }],
];

const actionsSent = () => axios.post.mock.calls.map(([, , cfg]) => cfg?.headers?.SOAPAction ?? '');
const sent = (fragment) => actionsSent().some((a) => a.includes(fragment));

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv('AMADEUS_WS_ENDPOINT', 'https://node.test.invalid/1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_WSAP', '1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_USERNAME', 'WSTEST');
  vi.stubEnv('AMADEUS_WS_PASSWORD', 'pw');
  vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
  vi.stubEnv('AMADEUS_WS_OFFICE_TIME_ZONE', 'America/New_York');
  vi.stubEnv('AMADEUS_WS_CANCEL_RETRY_DELAY_MS', '0');
  vi.stubEnv('AMADEUS_WS_VOID_RETRY_DELAY_MS', '0');
  vi.resetModules();
  vi.doUnmock('../../../backend/services/amadeusSoap/semaphore.js');
  axios.post.mockReset();
});

describe('the transport', () => {
  const loadSession = async () => import('../../../backend/services/amadeusSoap/session.js');

  it.each(NOT_SOAP)('throws a transport error for %s', async (_label, answer) => {
    const { callStateless } = await loadSession();
    axios.post.mockResolvedValueOnce(answer);

    const error = await callStateless('PNR_Retrieve', '<b/>').catch((e) => e);

    expect(error).toMatchObject({ name: 'AmadeusSoapError', code: 504, retryable: true, operation: 'PNR_Retrieve' });
    expect(error.technicalError).toMatch(/not a SOAP envelope/i);
    // Not a timeout: the void path retries a timeout, and must not read this as one.
    expect(error.technicalError).not.toMatch(/timeout of \d+ms exceeded/i);
  });

  it('throws a transport error for a reply the parser cannot read at all', async () => {
    const { callStateless } = await loadSession();
    axios.post.mockResolvedValueOnce(reply(cancelledOk.slice(0, cancelledOk.indexOf('<soap:Body>') + 8)));

    await expect(callStateless('PNR_Retrieve', '<b/>')).rejects.toMatchObject({ name: 'AmadeusSoapError', code: 504 });
  });

  // ---- fences: what must not change ----

  it('still returns a normal reply', async () => {
    const { callStateless } = await loadSession();
    axios.post.mockResolvedValueOnce(reply(cancelledOk));

    const result = await callStateless('PNR_Retrieve', '<b/>');

    expect(result.status).toBe(200);
    expect(result.body.PNR_Reply.pnrHeader.reservationInfo.reservation.controlNumber).toBe('ABC123');
  });

  it('still reads an HTTP 500 SOAP fault as a fault, with its session kept', async () => {
    const { withSession } = await loadSession();
    const fault = `<?xml version="1.0"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:awsse="http://xml.amadeus.com/2010/06/Session_v3">
  <soap:Header>${SESSION_XML}</soap:Header>
  <soap:Body><soap:Fault><faultcode>soap:Server</faultcode><faultstring>1931|Application|NO MATCH FOR RECORD LOCATOR</faultstring></soap:Fault></soap:Body>
</soap:Envelope>`;
    axios.post.mockResolvedValueOnce(reply(fault, 500)).mockResolvedValue(reply(signOutOk));

    const error = await withSession((ctx) => ctx.call('PNR_Retrieve', '<a/>')).catch((e) => e);

    expect(error).toMatchObject({ name: 'AmadeusSoapError', httpStatus: 500 });
    expect(error.technicalError).toContain('1931');
    expect(error.session).toMatchObject({ sessionId: 'S1', sequenceNumber: '1' });
    expect(sent('VLSSOQ')).toBe(true);
  });

  it('still reads a timeout as a transport error', async () => {
    const { callStateless } = await loadSession();
    axios.post.mockRejectedValueOnce(Object.assign(new Error('timeout of 25000ms exceeded'), { code: 'ECONNABORTED' }));

    await expect(callStateless('PNR_Retrieve', '<b/>'))
      .rejects.toMatchObject({ code: 504, technicalError: 'timeout of 25000ms exceeded' });
  });

  it('still answers a full semaphore with 503 "too many concurrent requests"', async () => {
    vi.doMock('../../../backend/services/amadeusSoap/semaphore.js', () => ({
      getSemaphore: () => ({ run: () => Promise.reject(Object.assign(new Error('full'), { code: 503, retryAfter: 2 })) }),
    }));
    const { callStateless } = await loadSession();

    await expect(callStateless('PNR_Retrieve', '<b/>'))
      .rejects.toMatchObject({ code: 503, retryAfter: 2, message: 'Too many concurrent requests, please retry' });
    expect(axios.post).not.toHaveBeenCalled();
  });

  it.each(NOT_SOAP)('a sign-out answered with %s does not throw', async (_label, answer) => {
    const { signOutQuietly } = await loadSession();
    axios.post.mockResolvedValue(answer);

    await expect(signOutQuietly({ sessionId: 'S1', sequenceNumber: '1', securityToken: 'T' })).resolves.toBe(false);
  });
});

describe('cancelling a booking', () => {
  const loadProvider = async () => (await import('../../../backend/services/amadeusSoap/index.js')).default;
  const loadChain = async () => import('../../../backend/services/amadeusSoap/bookingChain.js');

  // operations.handlers.js refunds on `gds.success`. Nobody saw the airline's
  // answer, so this must not come back as a success.
  it.each(NOT_SOAP)('is not reported as cancelled when PNR_Cancel is answered with %s', async (_label, answer) => {
    axios.post
      .mockResolvedValueOnce(reply(retrievedNoTicket)) // PNR_Retrieve
      .mockResolvedValueOnce(answer) // PNR_Cancel
      .mockResolvedValue(reply(signOutOk));

    const provider = await loadProvider();
    const outcome = await provider.cancelFlightOrder('ABC123').catch((error) => ({ threw: error }));

    expect(outcome.success).not.toBe(true);
    expect(outcome.threw).toMatchObject({ step: 'cancel', committed: true, pnr: 'ABC123', code: 504 });
    // The session is still closed.
    expect(sent('VLSSOQ')).toBe(true);
  });

  it.each(NOT_SOAP)('neither voids nor cancels when PNR_Retrieve is answered with %s', async (_label, answer) => {
    const { cancelBooking } = await loadChain();
    axios.post.mockResolvedValueOnce(answer).mockResolvedValue(reply(signOutOk));

    await expect(cancelBooking('ABC123')).rejects.toMatchObject({ step: 'retrieve', code: 504 });
    // Read as "no tickets", the void was skipped and PNR_Cancel went ahead
    // over what may be a live ticket.
    expect(sent('TRCANQ')).toBe(false);
    expect(sent('PNRXCL')).toBe(false);
  });

  it.each(NOT_SOAP)('leaves the itinerary alone when the void is answered with %s', async (_label, answer) => {
    const { cancelBooking } = await loadChain();
    axios.post
      .mockResolvedValueOnce(reply(retrievedTicketedToday()))
      .mockResolvedValueOnce(answer) // Ticket_CancelDocument
      .mockResolvedValue(reply(signOutOk));

    await expect(cancelBooking('ABC123')).rejects.toMatchObject({ step: 'voidTicket', ticketed: true });
    expect(sent('PNRXCL')).toBe(false);
  });

  it('still cancels when only the sign-out is answered with something that is not SOAP', async () => {
    const { cancelBooking } = await loadChain();
    axios.post
      .mockResolvedValueOnce(reply(retrievedNoTicket))
      .mockResolvedValueOnce(reply(cancelledOk))
      .mockResolvedValue(NOT_SOAP[0][1]);

    await expect(cancelBooking('ABC123')).resolves.toMatchObject({ cancelled: true });
  });

  // Fence: 8111 is an answer, not a missing one - it is still retried.
  it('still redisplays and cancels again after 8111', async () => {
    const { cancelBooking } = await loadChain();
    const simultaneous = envelope('PNR_Reply',
      '<generalErrorInfo><errorOrWarningCodeDetails><errorDetails><errorCode>8111</errorCode></errorDetails></errorOrWarningCodeDetails>'
      + '<errorFreeText>SIMULTANEOUS CHANGES TO PNR - USE WRA/RT TO PRINT OR IGNORE</errorFreeText></generalErrorInfo>');
    axios.post
      .mockResolvedValueOnce(reply(retrievedNoTicket))
      .mockResolvedValueOnce(reply(simultaneous))
      .mockResolvedValueOnce(reply(retrievedNoTicket))
      .mockResolvedValueOnce(reply(cancelledOk))
      .mockResolvedValue(reply(signOutOk));

    await expect(cancelBooking('ABC123')).resolves.toMatchObject({ cancelled: true });
    expect(actionsSent().filter((a) => a.includes('PNRXCL'))).toHaveLength(2);
  });
});

describe('the booking chain', () => {
  const S = '<awsse:Session TransactionStatusCode="InSeries"><awsse:SessionId>SESS1</awsse:SessionId><awsse:SequenceNumber>1</awsse:SequenceNumber><awsse:SecurityToken>TOK</awsse:SecurityToken></awsse:Session>';
  const env = (name, inner) => envelope(name, inner).replace(SESSION_XML, S);
  const sellOk = env('Air_SellFromRecommendationReply',
    '<itineraryDetails><segmentInformation><actionDetails><quantity>1</quantity><statusCode>OK</statusCode></actionDetails></segmentInformation></itineraryDetails>');
  const addOk = env('PNR_Reply', '<dummy/>');
  const fopOk = env('FOP_CreateFormOfPaymentReply', '<dummy/>');
  const priceOk = env('Fare_PricePNRWithBookingClassReply',
    '<fareList><fareReference><uniqueReference>1</uniqueReference></fareReference><fareDataInformation><fareDataSupInformation><fareDataQualifier>712</fareDataQualifier><fareAmount>76.00</fareAmount><fareCurrency>USD</fareCurrency></fareDataSupInformation></fareDataInformation></fareList>');
  const tstOk = env('Ticket_CreateTSTFromPricingReply', '<tstList><tstReference><uniqueReference>1</uniqueReference></tstReference></tstList>');
  const commitOk = env('PNR_Reply',
    '<pnrHeader><reservationInfo><reservation><controlNumber>ABC123</controlNumber><date>040926</date></reservation></reservationInfo></pnrHeader>'
    + '<originDestinationDetails><itineraryInfo>'
    + '<elementManagementItinerary><segmentName>AIR</segmentName></elementManagementItinerary>'
    + '<itineraryReservationInfo><reservation><controlNumber>LH7XY2</controlNumber></reservation></itineraryReservationInfo>'
    + '</itineraryInfo></originDestinationDetails>');
  const offer = () => ({
    id: '1',
    source: 'GDS',
    price: { total: '76.00', currency: 'USD' },
    validatingAirlineCodes: ['AI'],
    travelerPricings: [{ travelerId: '1', travelerType: 'ADULT' }],
    itineraries: [{ segments: [{ id: '1' }] }],
    _ama: {
      wsap: '1ASIWJETJEC',
      officeId: 'SCK1S2400',
      searchedAt: new Date().toISOString(),
      paxRefs: [{ ref: '1', ptc: 'ADT' }],
      segments: [{
        legIndex: 0, boardPoint: 'DEL', offPoint: 'BOM', departureDate: '250926',
        arrivalDate: '250926', marketingCarrier: 'AI', flightNumber: '9484', rbd: 'S',
      }],
    },
  });
  const travelers = [{ firstName: 'John', lastName: 'Smith', gender: 'MALE' }];

  beforeEach(() => {
    vi.stubEnv('AMADEUS_WS_BOOKING_ENABLED', 'true');
    vi.stubEnv('AMADEUS_WS_MIN_PAYMENT_RATIO', '0');
    vi.stubEnv('AMADEUS_WS_AIRLINE_LOCATOR_WAIT_MS', '0');
    vi.stubEnv('AMADEUS_WS_ISSUE_RETRY_DELAY_MS', '0');
  });

  // The route refunds only a chain that is not committed; 'unknown' goes to a person.
  it('reports a commit answered with something that is not SOAP as possibly committed', async () => {
    vi.stubEnv('AMADEUS_WS_AUTO_TICKET', 'false');
    const { runBookingChain } = await import('../../../backend/services/amadeusSoap/bookingChain.js');
    for (const xml of [sellOk, addOk, fopOk, priceOk, tstOk]) axios.post.mockResolvedValueOnce(reply(xml));
    axios.post.mockResolvedValueOnce(NOT_SOAP[0][1]).mockResolvedValue(reply(signOutOk));

    await expect(runBookingChain({ offer: offer(), travelers }))
      .rejects.toMatchObject({ step: 'commit', committed: 'unknown', code: 504 });
  });

  // Read as an empty reply, issuance looked like "not issued": the chain
  // returned a normal, unticketed booking. The ticket may well exist, so it is
  // a post-commit failure instead - flagged for a person, as a timed-out
  // issuance already is, and never refunded (committed) or issued again here.
  it('fails after commit when DocIssuance is answered with something that is not SOAP', async () => {
    vi.stubEnv('AMADEUS_WS_AUTO_TICKET', 'true');
    const { runBookingChain } = await import('../../../backend/services/amadeusSoap/bookingChain.js');
    for (const xml of [sellOk, addOk, fopOk, priceOk, tstOk, commitOk, fopOk]) axios.post.mockResolvedValueOnce(reply(xml));
    axios.post.mockResolvedValueOnce(NOT_SOAP[1][1]).mockResolvedValue(reply(signOutOk));

    const failure = await runBookingChain({ offer: offer(), travelers }).catch((error) => error);

    expect(failure).toBeInstanceOf(Error);
    expect(failure).toMatchObject({ step: 'issueTicket', committed: true, pnr: 'ABC123', code: 504 });
    // Issued once, never again blind.
    expect(actionsSent().filter((a) => a.includes('TTKTIQ'))).toHaveLength(1);
  });
});
