import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The booking chain's failure behaviour.
 *
 * The customer has already paid when this runs, so the only question any of
 * these tests asks is: after this failure, is it safe to give the money back?
 * That turns entirely on whether a PNR was committed. Get it wrong in one
 * direction and a customer is charged for a booking nobody knows about; get it
 * wrong in the other and a refund is issued for a flight they are still on.
 */

const envelope = (name, inner, session) => `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:awsse="http://xml.amadeus.com/2010/06/Session_v3">
  <soap:Header>${session ? `<awsse:Session TransactionStatusCode="${session.status}"><awsse:SessionId>${session.id}</awsse:SessionId><awsse:SequenceNumber>${session.seq}</awsse:SequenceNumber><awsse:SecurityToken>TOK</awsse:SecurityToken></awsse:Session>` : ''}</soap:Header>
  <soap:Body><${name}>${inner}</${name}></soap:Body>
</soap:Envelope>`;

const reply = (xml) => ({ status: 200, data: xml, headers: {} });

const SESSION = { status: 'InSeries', id: 'SESS1', seq: '1' };

const sellOk = envelope('Air_SellFromRecommendationReply',
  '<itineraryDetails><segmentInformation><actionDetails><quantity>1</quantity><statusCode>OK</statusCode></actionDetails></segmentInformation></itineraryDetails>', SESSION);
const sellUc = envelope('Air_SellFromRecommendationReply',
  '<itineraryDetails><segmentInformation><actionDetails><statusCode>UC</statusCode></actionDetails></segmentInformation></itineraryDetails>', SESSION);
const addOk = envelope('PNR_Reply', '<dummy/>', SESSION);
const priceOk = envelope('Fare_PricePNRWithBookingClassReply',
  '<fareList><fareReference><uniqueReference>1</uniqueReference></fareReference><fareDataInformation><fareDataSupInformation><fareDataQualifier>712</fareDataQualifier><fareAmount>76.00</fareAmount><fareCurrency>USD</fareCurrency></fareDataSupInformation></fareDataInformation></fareList>', SESSION);
const priceDrifted = envelope('Fare_PricePNRWithBookingClassReply',
  '<fareList><fareReference><uniqueReference>1</uniqueReference></fareReference><fareDataInformation><fareDataSupInformation><fareDataQualifier>712</fareDataQualifier><fareAmount>129.00</fareAmount><fareCurrency>USD</fareCurrency></fareDataSupInformation></fareDataInformation></fareList>', SESSION);
const tstOk = envelope('Ticket_CreateTSTFromPricingReply',
  '<tstList><tstReference><uniqueReference>1</uniqueReference></tstReference></tstList>', SESSION);
const fopOk = envelope('FOP_CreateFormOfPaymentReply', '<dummy/>', SESSION);
const commitOk = envelope('PNR_Reply',
  '<pnrHeader><reservationInfo><reservation><controlNumber>ABC123</controlNumber><date>040926</date></reservation></reservationInfo></pnrHeader>'
  + '<travellerInfo><elementManagementPassenger><reference><number>1</number></reference></elementManagementPassenger>'
  + '<passengerData><travellerInformation><traveller><surname>SMITH</surname></traveller><passenger><firstName>JOHN MR</firstName></passenger></travellerInformation></passengerData></travellerInfo>', SESSION);
const errorReply = (text) => envelope('PNR_Reply',
  `<generalErrorInfo><errorOrWarningCodeDetails><errorDetails><errorCode>999</errorCode></errorDetails></errorOrWarningCodeDetails><errorFreeText>${text}</errorFreeText></generalErrorInfo>`, SESSION);
const signOutOk = envelope('Security_SignOutReply', '<dummy/>')
const issueOk = envelope('DocIssuance_IssueTicketReply', '<processingStatus><statusCode>O</statusCode></processingStatus>', SESSION)
const pnrHeaderXml = '<pnrHeader><reservationInfo><reservation><controlNumber>ABC123</controlNumber><date>040926</date></reservation></reservationInfo></pnrHeader>'
  + '<travellerInfo><elementManagementPassenger><reference><number>1</number></reference></elementManagementPassenger>'
  + '<passengerData><travellerInformation><traveller><surname>SMITH</surname></traveller><passenger><firstName>JOHN MR</firstName></passenger></travellerInformation></passengerData></travellerInfo>'
// A PNR_Retrieve reply whose FA element does not yet carry a ticket number.
const retrieveNoTicket = envelope('PNR_Reply', pnrHeaderXml, SESSION)
// The same, once the ticket number has landed in the FA free text.
const retrieveWithTicket = envelope('PNR_Reply',
  pnrHeaderXml
  + '<dataElementsMaster><dataElementsIndiv><elementManagementData><segmentName>FA</segmentName></elementManagementData>'
  + '<otherDataFreetext><longFreetext>FA PAX 057-2412345678/ETAI/USD221.70/04SEP26/SCK1S2400</longFreetext></otherDataFreetext>'
  + '</dataElementsIndiv></dataElementsMaster>', SESSION);

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

/** Queue every reply the chain will consume, in order. */
const queueReplies = (...xmls) => {
  axios.post.mockReset();
  for (const xml of xmls) axios.post.mockResolvedValueOnce(reply(xml));
  // Sign-out, and anything else that runs after the interesting part.
  axios.post.mockResolvedValue(reply(signOutOk));
};

const loadChain = async () => (await import('../../../backend/services/amadeusSoap/bookingChain.js'));

beforeEach(() => {
  // Without this a stub set inside one test leaks into every test after it.
  vi.unstubAllEnvs();
  vi.stubEnv('AMADEUS_WS_ENDPOINT', 'https://node.test.invalid/1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_WSAP', '1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_USERNAME', 'WSTEST');
  vi.stubEnv('AMADEUS_WS_PASSWORD', 'pw');
  vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
  vi.stubEnv('AMADEUS_WS_BOOKING_ENABLED', 'true');
  vi.stubEnv('AMADEUS_WS_AUTO_TICKET', 'false');
  // These tests are about the GDS steps, so the payment guard is switched off
  // here. It is on by default in the app, and 'the payment-coverage guard'
  // below exercises it at that default.
  vi.stubEnv('AMADEUS_WS_MIN_PAYMENT_RATIO', '0');
  // No waiting for the airline's record locator unless a test is about it.
  vi.stubEnv('AMADEUS_WS_AIRLINE_LOCATOR_WAIT_MS', '0');
  vi.stubEnv('AMADEUS_WS_ISSUE_RETRY_DELAY_MS', '0');
  vi.resetModules();
});

describe('refusing before anything is sold', () => {
  it('rejects an offer that never came from this provider', async () => {
    const { runBookingChain } = await loadChain();
    axios.post.mockReset();

    await expect(runBookingChain({ offer: { price: {} }, travelers }))
      .rejects.toMatchObject({ step: 'validate', committed: false, code: 409 });
    expect(axios.post).not.toHaveBeenCalled();
  });

  // A standard PNR caps at 9 seat-holders; 10+ is a group booking the airline
  // rejects. Refuse it up front rather than commit something that will bounce.
  it('refuses more than 9 passengers before touching the GDS', async () => {
    const { runBookingChain } = await loadChain();
    axios.post.mockReset();
    const tooMany = Array.from({ length: 10 }, (_, i) => ({ firstName: `P${i + 1}`, lastName: 'Test', gender: 'MALE' }));

    await expect(runBookingChain({ offer: offer(), travelers: tooMany }))
      .rejects.toMatchObject({ step: 'validate', committed: false, code: 400 });
    expect(axios.post).not.toHaveBeenCalled();
  });

  // The abandoned-checkout job books up to hours after checkout, and a customer
  // can take a while to choose. What matters is when the airline last priced
  // the fare - the order route re-prices it, or stamps checkout's verification.
  it('ages a fare from when it was last priced, not from the search', async () => {
    const { runBookingChain } = await loadChain();
    queueReplies(sellOk, addOk, fopOk, priceOk, tstOk,commitOk);
    const repriced = offer();
    repriced._ama = { ...repriced._ama, searchedAt: new Date(Date.now() - 60 * 60000).toISOString(), pricedAt: new Date().toISOString() };

    const result = await runBookingChain({ offer: repriced, travelers, expectedTotal: 76 });
    expect(result.pnr).toBe('ABC123');
  });

  it('still refuses an old search that nobody has priced since', async () => {
    const { runBookingChain } = await loadChain();
    axios.post.mockReset();
    const stale = offer();
    stale._ama = { ...stale._ama, searchedAt: new Date(Date.now() - 60 * 60000).toISOString() };

    await expect(runBookingChain({ offer: stale, travelers, expectedTotal: 76 }))
      .rejects.toMatchObject({ step: 'validate', committed: false, code: 409 });
    expect(axios.post).not.toHaveBeenCalled();
  });

  // A PDT offer refers to inventory that does not exist in production, and the
  // reverse. Selling one against the other books the wrong thing.
  it('rejects an offer found on a different WSAP', async () => {
    const { runBookingChain } = await loadChain();
    axios.post.mockReset();
    const stale = offer();
    stale._ama.wsap = '1ASIWSOMETHINGELSE';

    await expect(runBookingChain({ offer: stale, travelers }))
      .rejects.toMatchObject({ step: 'validate', committed: false });
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('rejects an offer older than the staleness limit', async () => {
    vi.stubEnv('AMADEUS_WS_OFFER_MAX_AGE_MIN', '30');
    const { runBookingChain } = await loadChain();
    axios.post.mockReset();
    const stale = offer();
    stale._ama.searchedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    await expect(runBookingChain({ offer: stale, travelers }))
      .rejects.toMatchObject({ step: 'validate', committed: false });
    expect(axios.post).not.toHaveBeenCalled();
  });

  it('rejects a booking with no passengers', async () => {
    const { runBookingChain } = await loadChain();
    axios.post.mockReset();

    await expect(runBookingChain({ offer: offer(), travelers: [] }))
      .rejects.toMatchObject({ step: 'validate', code: 400 });
    expect(axios.post).not.toHaveBeenCalled();
  });
});

describe('failing before the PNR is committed', () => {
  // The customer paid, nothing was created, so a refund is the honest outcome.
  // `committed: false` is what tells the route that.
  it('reports UC on sell as uncommitted, so the route can refund', async () => {
    const { runBookingChain } = await loadChain();
    queueReplies(sellUc);

    await expect(runBookingChain({ offer: offer(), travelers }))
      .rejects.toMatchObject({ step: 'sell', committed: false, code: 409 });
  });

  it('reports a failure while adding names as uncommitted', async () => {
    const { runBookingChain } = await loadChain();
    queueReplies(sellOk, errorReply('SOMETHING WENT WRONG'));

    await expect(runBookingChain({ offer: offer(), travelers }))
      .rejects.toMatchObject({ step: 'addElements', committed: false });
  });

  // The fare moved between the quote and the PNR. Booking it anyway charges the
  // customer one price and bills the airline another.
  it('aborts when the priced fare drifts beyond tolerance', async () => {
    vi.stubEnv('AMADEUS_WS_PRICE_TOLERANCE', '0');
    const { runBookingChain } = await loadChain();
    queueReplies(sellOk, addOk, fopOk, priceDrifted);

    await expect(runBookingChain({ offer: offer(), travelers, expectedTotal: 76 }))
      .rejects.toMatchObject({ step: 'priceCheck', committed: false, code: 409 });
  });

  it('accepts drift inside the configured tolerance', async () => {
    vi.stubEnv('AMADEUS_WS_PRICE_TOLERANCE', '60');
    const { runBookingChain } = await loadChain();
    queueReplies(sellOk, addOk, fopOk, priceDrifted, tstOk,commitOk);

    const result = await runBookingChain({ offer: offer(), travelers, expectedTotal: 76 });
    expect(result.pnr).toBe('ABC123');
  });

  // Compared against the fare quoted, never against the charged amount, which
  // includes an admin service fee Amadeus knows nothing about.
  it('does not compare against a charged total it was never given', async () => {
    vi.stubEnv('AMADEUS_WS_PRICE_TOLERANCE', '0');
    const { runBookingChain } = await loadChain();
    queueReplies(sellOk, addOk, fopOk, priceOk, tstOk,commitOk);

    const result = await runBookingChain({ offer: offer(), travelers, expectedTotal: 76 });
    expect(result.pnr).toBe('ABC123');
    expect(result.priced.total).toBe(76);
  });

  // Two adults and a child: 85.85 x 2 + 80.20 is 251.89999999999998 in
  // floating point, against a quote of 251.90. Compared as floats with zero
  // tolerance, the booking was refused after the customer had paid.
  it('compares the fare in whole cents', async () => {
    vi.stubEnv('AMADEUS_WS_PRICE_TOLERANCE', '0');
    const { runBookingChain } = await loadChain();
    const fare = (ref, pax, amount) => '<fareList>'
      + `<fareReference><uniqueReference>${ref}</uniqueReference></fareReference>`
      + `<paxSegReference>${pax.map((n) => `<refDetails><refQualifier>PA</refQualifier><refNumber>${n}</refNumber></refDetails>`).join('')}</paxSegReference>`
      + `<fareDataInformation><fareDataSupInformation><fareDataQualifier>712</fareDataQualifier><fareAmount>${amount}</fareAmount><fareCurrency>USD</fareCurrency></fareDataSupInformation></fareDataInformation>`
      + '</fareList>';
    const priceFamily = envelope('Fare_PricePNRWithBookingClassReply', fare(1, [1, 2], '85.85') + fare(2, [3], '80.20'), SESSION);
    queueReplies(sellOk, addOk, fopOk, priceFamily, tstOk, commitOk);

    const result = await runBookingChain({ offer: offer(), travelers, expectedTotal: 251.9 });
    expect(result.pnr).toBe('ABC123');
    expect(result.priced.total).toBe(251.9);
  });

  // A fare that prices lower than the customer paid for costs nobody anything;
  // refusing it refunded the customer out of a cheaper seat.
  it('books a fare that came in lower than the customer paid for', async () => {
    vi.stubEnv('AMADEUS_WS_PRICE_TOLERANCE', '0');
    const { runBookingChain } = await loadChain();
    queueReplies(sellOk, addOk, fopOk, priceOk, tstOk,commitOk);

    const result = await runBookingChain({ offer: offer(), travelers, expectedTotal: 90 });
    expect(result.pnr).toBe('ABC123');
  });
});

// The fare-drift guard checks the fare is stable; it does NOT check the
// customer paid enough to cover it. The ARC charge is client-supplied at
// hosted checkout and never re-validated, so a tampered token payment would
// otherwise buy this full-price ticket. paidAmount is read server-side from
// the booking row by the route, so the shortfall is caught here, before the
// PNR is committed, and the route reverses the charge.
describe('a chain that no longer holds its booking', () => {
  // A chain slower than its claim, or one whose heartbeat failed, could be
  // taken over by a retry or the queue - and both committed a PNR against one
  // payment. The route is asked just before the commit.
  it('stops before committing when the claim was taken over', async () => {
    const { runBookingChain } = await loadChain();
    queueReplies(sellOk, addOk, fopOk, priceOk, tstOk,commitOk);
    const beforeCommit = vi.fn().mockResolvedValue('lost');

    await expect(runBookingChain({ offer: offer(), travelers, expectedTotal: 76, beforeCommit }))
      .rejects.toMatchObject({ step: 'claim', committed: false, code: 409, claimLost: true });
    expect(beforeCommit).toHaveBeenCalledTimes(1);
    const sent = axios.post.mock.calls.map(([, body]) => String(body));
    expect(sent.some((body) => body.includes('PNR_AddMultiElements') && body.includes('<optionCode>11'))).toBe(false);
  });

  it('stops too when the database cannot say who holds it', async () => {
    const { runBookingChain } = await loadChain();
    queueReplies(sellOk, addOk, fopOk, priceOk, tstOk,commitOk);

    await expect(runBookingChain({ offer: offer(), travelers, expectedTotal: 76, beforeCommit: async () => 'unavailable' }))
      .rejects.toMatchObject({ step: 'claim', committed: false, claimUnavailable: true });
  });

  it('commits as before while the claim is held', async () => {
    const { runBookingChain } = await loadChain();
    queueReplies(sellOk, addOk, fopOk, priceOk, tstOk,commitOk);

    const result = await runBookingChain({ offer: offer(), travelers, expectedTotal: 76, beforeCommit: async () => 'held' });
    expect(result.pnr).toBe('ABC123');
  });
});

describe('the payment-coverage guard', () => {
  // Unset is the case that matters: a guard that is only on when someone
  // remembers to configure it is off in practice.
  it('refuses a token payment with the ratio unset', async () => {
    vi.stubEnv('AMADEUS_WS_MIN_PAYMENT_RATIO', '');
    const { runBookingChain } = await loadChain();
    queueReplies(sellOk, addOk, fopOk, priceOk);

    await expect(runBookingChain({ offer: offer(), travelers, expectedTotal: 76, paidAmount: 1 }))
      .rejects.toMatchObject({ step: 'paymentCoverage', committed: false, code: 402 });
  });

  // The largest flight coupon is 20% off, and the charge also carries the 2.5%
  // service fee: 76 * 0.8 * 1.025 = 62.32, which must still book.
  it('lets a 20%-off coupon through at the default', async () => {
    vi.stubEnv('AMADEUS_WS_MIN_PAYMENT_RATIO', '');
    const { runBookingChain } = await loadChain();
    queueReplies(sellOk, addOk, fopOk, priceOk, tstOk,commitOk);

    const result = await runBookingChain({ offer: offer(), travelers, expectedTotal: 76, paidAmount: 62.32 });
    expect(result.pnr).toBe('ABC123');
  });

  // No booking row means no evidence of payment: a direct POST to /order with a
  // missing or made-up bookingReference must not ticket for free.
  it('refuses when there is no payment on record at all', async () => {
    vi.stubEnv('AMADEUS_WS_MIN_PAYMENT_RATIO', '');
    const { runBookingChain } = await loadChain();
    queueReplies(sellOk, addOk, fopOk, priceOk);

    await expect(runBookingChain({ offer: offer(), travelers, expectedTotal: 76, bookingReference: 'MADE-UP' }))
      .rejects.toMatchObject({ step: 'paymentCoverage', committed: false, code: 402 });
  });

  it('aborts before ticketing when the captured payment is below the fare floor', async () => {
    vi.stubEnv('AMADEUS_WS_MIN_PAYMENT_RATIO', '0.5'); // floor = 76 * 0.5 = 38.00
    const { runBookingChain } = await loadChain();
    queueReplies(sellOk, addOk, fopOk, priceOk);

    await expect(runBookingChain({ offer: offer(), travelers, expectedTotal: 76, paidAmount: 1 }))
      .rejects.toMatchObject({ step: 'paymentCoverage', committed: false, code: 402 });
  });

  it('proceeds when the captured payment clears the floor', async () => {
    vi.stubEnv('AMADEUS_WS_MIN_PAYMENT_RATIO', '0.5');
    const { runBookingChain } = await loadChain();
    queueReplies(sellOk, addOk, fopOk, priceOk, tstOk,commitOk);

    const result = await runBookingChain({ offer: offer(), travelers, expectedTotal: 76, paidAmount: 76 });
    expect(result.pnr).toBe('ABC123');
  });

  // The ratio alone refused every coupon over a fifth off - after payment. With
  // the charge checkout verified, the floor is exactly that charge.
  it('holds the payment to the verified charge, whatever the coupon took off', async () => {
    vi.stubEnv('AMADEUS_WS_MIN_PAYMENT_RATIO', '');
    const { runBookingChain } = await loadChain();
    queueReplies(sellOk, addOk, fopOk, priceOk, tstOk,commitOk);

    const result = await runBookingChain({ offer: offer(), travelers, expectedTotal: 76, paidAmount: 40, verifiedChargeTotal: 40 });
    expect(result.pnr).toBe('ABC123');
  });

  it('refuses a payment short of the verified charge, even above the ratio', async () => {
    vi.stubEnv('AMADEUS_WS_MIN_PAYMENT_RATIO', '');
    const { runBookingChain } = await loadChain();
    queueReplies(sellOk, addOk, fopOk, priceOk);

    await expect(runBookingChain({ offer: offer(), travelers, expectedTotal: 76, paidAmount: 77.5, verifiedChargeTotal: 77.9 }))
      .rejects.toMatchObject({ step: 'paymentCoverage', committed: false, code: 402 });
  });

  // 0 is the explicit off switch - a token payment, or none at all, books.
  it('is disabled only when the ratio is explicitly 0', async () => {
    vi.stubEnv('AMADEUS_WS_MIN_PAYMENT_RATIO', '0');
    const { runBookingChain } = await loadChain();
    queueReplies(sellOk, addOk, fopOk, priceOk, tstOk,commitOk);

    const result = await runBookingChain({ offer: offer(), travelers, expectedTotal: 76 });
    expect(result.pnr).toBe('ABC123');
  });
});

describe('waiting for an Amadeus slot', () => {
  // Nothing may be sent before the slot is held: a booking that times out here
  // sold nothing, which is what lets the route queue it instead of refunding.
  it('gives up in the booking lane before any GDS call', async () => {
    vi.stubEnv('AMADEUS_WS_MAX_CONCURRENCY', '1');
    vi.stubEnv('AMADEUS_WS_BOOKING_QUEUE_TIMEOUT_MS', '30');
    const { runBookingChain } = await loadChain();
    const { getSemaphore, withBookingPriority } = await import('../../../backend/services/amadeusSoap/semaphore.js');
    const { getWsConfig } = await import('../../../backend/services/amadeusSoap/config.js');
    axios.post.mockReset();
    await getSemaphore(getWsConfig()).acquire(); // the only slot, held elsewhere

    const err = await withBookingPriority(() => runBookingChain({ offer: offer(), travelers })).catch((e) => e);

    expect(err).toMatchObject({ slotTimeout: true, priority: true, code: 503 });
    expect(axios.post).not.toHaveBeenCalled();
    getSemaphore(getWsConfig()).release();
  });
});

describe('committing', () => {
  it('returns the record locator and what was priced', async () => {
    const { runBookingChain } = await loadChain();
    queueReplies(sellOk, addOk, fopOk, priceOk, tstOk,commitOk);

    const result = await runBookingChain({ offer: offer(), travelers, bookingReference: 'ARC1' });

    expect(result.pnr).toBe('ABC123');
    expect(result.ticketed).toBe(false);
    expect(result.tstRefs).toEqual(['1']);
    expect(result.priced).toEqual({ total: 76, currency: 'USD' });
    expect(result.order.travelers[0].name).toEqual({ firstName: 'JOHN', lastName: 'SMITH' });
  });

  // The whole point of the callback: a crash after this line leaves a booking
  // that can be found, a crash before it leaves one only Amadeus knows about.
  it('hands the PNR over before queueing or ticketing is attempted', async () => {
    const { runBookingChain } = await loadChain();
    queueReplies(sellOk, addOk, fopOk, priceOk, tstOk,commitOk);

    const callsAtCommit = { value: null };
    await runBookingChain({
      offer: offer(),
      travelers,
      onCommitted: async ({ pnr }) => {
        expect(pnr).toBe('ABC123');
        callsAtCommit.value = axios.post.mock.calls.length;
      },
    });

    // Six calls in: sell, add, FOP, price, TST, commit - and nothing after.
    expect(callsAtCommit.value).toBe(6);
  });

  // Amadeus prices OB fees from the form of payment already on the PNR, so the
  // FOP goes on before pricing - on the whole PNR, since no TST exists yet.
  it('adds the form of payment before pricing, not tied to a TST', async () => {
    const { runBookingChain } = await loadChain();
    queueReplies(sellOk, addOk, fopOk, priceOk, tstOk, commitOk);

    await runBookingChain({ offer: offer(), travelers });

    const sent = axios.post.mock.calls.map(([, body]) => String(body));
    const fopAt = sent.findIndex((body) => body.includes('<FOP_CreateFormOfPayment'));
    const priceAt = sent.findIndex((body) => body.includes('<Fare_PricePNRWithBookingClass'));
    const tstAt = sent.findIndex((body) => body.includes('<Ticket_CreateTSTFromPricing'));
    expect(fopAt).toBeGreaterThan(-1);
    expect(fopAt).toBeLessThan(priceAt);
    expect(priceAt).toBeLessThan(tstAt);
    expect(sent[fopAt]).not.toContain('pnrElementAssociation');
  });

  it('still returns the booking when persisting the PNR throws', async () => {
    const { runBookingChain } = await loadChain();
    queueReplies(sellOk, addOk, fopOk, priceOk, tstOk,commitOk);

    const result = await runBookingChain({
      offer: offer(),
      travelers,
      onCommitted: async () => { throw new Error('database down'); },
    });

    // The PNR is real whatever our database did with it.
    expect(result.pnr).toBe('ABC123');
  });

  it('treats a commit that returns no locator as a failure', async () => {
    const { runBookingChain } = await loadChain();
    queueReplies(sellOk, addOk, fopOk, priceOk, tstOk,envelope('PNR_Reply', '<dummy/>', SESSION));

    await expect(runBookingChain({ offer: offer(), travelers }))
      .rejects.toMatchObject({ step: 'commit', committed: false });
  });
});

describe('after the PNR exists', () => {
  // A booking that is not on a queue is still a booking. Refunding one over a
  // filing error would be far worse than leaving it for the desk to find.
  it('keeps the booking when queueing fails', async () => {
    const { runBookingChain } = await loadChain();
    queueReplies(sellOk, addOk, fopOk, priceOk, tstOk,commitOk, errorReply('QUEUE UNAVAILABLE'));

    const result = await runBookingChain({ offer: offer(), travelers });
    expect(result.pnr).toBe('ABC123');
    expect(result.queued).toBe(false);
  });

  // Both the queue and its category are settings: 90 C0 on PDT, whatever
  // Amadeus assigns in production.
  it('files the PNR on the queue and category the environment names', async () => {
    vi.stubEnv('AMADEUS_WS_QUEUE_NUMBER', '90');
    vi.stubEnv('AMADEUS_WS_QUEUE_CATEGORY', '3');
    const { runBookingChain } = await loadChain();
    queueReplies(sellOk, addOk, fopOk, priceOk, tstOk, commitOk, fopOk);

    const result = await runBookingChain({ offer: offer(), travelers });

    const queued = axios.post.mock.calls.map(([, body]) => String(body)).find((body) => body.includes('<Queue_PlacePNR'));
    expect(result.queued).toBe(true);
    expect(queued).toContain('<queueDetails><number>90</number></queueDetails>');
    expect(queued).toContain('<identificationType>C</identificationType><itemNumber>3</itemNumber>');
  });

  it('uses queue 50 in category 0 when neither is set', async () => {
    const { runBookingChain } = await loadChain();
    queueReplies(sellOk, addOk, fopOk, priceOk, tstOk, commitOk, fopOk);

    await runBookingChain({ offer: offer(), travelers });

    const queued = axios.post.mock.calls.map(([, body]) => String(body)).find((body) => body.includes('<Queue_PlacePNR'));
    expect(queued).toContain('<queueDetails><number>50</number></queueDetails>');
    expect(queued).toContain('<identificationType>C</identificationType><itemNumber>0</itemNumber>');
  });

  // IB4001 MAD-JFK (operated by AA) came back from commit with status TK, and
  // issuance answered 1969 VERIFY ITINERARY. Amadeus: end with change advice.
  const withSegmentStatus = (status) => envelope('PNR_Reply', pnrHeaderXml
    + '<originDestinationDetails><itineraryInfo><elementManagementItinerary><segmentName>AIR</segmentName></elementManagementItinerary>'
    + `<relatedProduct><quantity>1</quantity><status>${status}</status></relatedProduct>`
    + '<itineraryReservationInfo><reservation><companyId>AA</companyId><controlNumber>XYZ123</controlNumber></reservation></itineraryReservationInfo>'
    + '</itineraryInfo></originDestinationDetails>', SESSION);
  const commitOptions = () => axios.post.mock.calls.map(([, body]) => String(body))
    .filter((body) => body.includes('<PNR_AddMultiElements'))
    .map((body) => body.match(/<optionCode>(\d+)<\/optionCode>/)?.[1]);

  it('accepts a segment the airline changed, with change advice, before queueing', async () => {
    const { runBookingChain } = await loadChain();
    queueReplies(sellOk, addOk, fopOk, priceOk, tstOk, withSegmentStatus('TK'), withSegmentStatus('HK'), fopOk);

    const result = await runBookingChain({ offer: offer(), travelers });

    expect(commitOptions()).toEqual(['0', '11', '13']);
    const sent = axios.post.mock.calls.map(([, body]) => String(body));
    expect(sent.findIndex((body) => body.includes('<optionCode>13</optionCode>')))
      .toBeLessThan(sent.findIndex((body) => body.includes('<Queue_PlacePNR')));
    expect(result.pnr).toBe('ABC123');
  });

  it('sends no change advice when no segment was changed', async () => {
    const { runBookingChain } = await loadChain();
    queueReplies(sellOk, addOk, fopOk, priceOk, tstOk, withSegmentStatus('HK'), fopOk);

    await runBookingChain({ offer: offer(), travelers });

    expect(commitOptions()).toEqual(['0', '11']);
  });

  // The route reads `committed` to decide whether refunding is safe. A ticketed
  // booking that gets refunded leaves the customer flying for free and the
  // airline billing us.
  it('marks a post-commit failure as committed so no refund is issued', async () => {
    vi.stubEnv('AMADEUS_WS_AUTO_TICKET', 'true');
    const { runBookingChain } = await loadChain();
    queueReplies(sellOk, addOk, fopOk, priceOk, tstOk,commitOk, fopOk, errorReply('TICKETING FAILED'));

    await expect(runBookingChain({ offer: offer(), travelers }))
      .rejects.toMatchObject({ step: 'issueTicket', committed: true, pnr: 'ABC123' });
  });

  // The ticket number takes a moment to land in the PNR after issuance, so a
  // single retrieve can miss it. We wait, retrieve, and retry until it appears.
  it('retries reading the ticket number until it appears in the PNR', async () => {
    vi.stubEnv('AMADEUS_WS_AUTO_TICKET', 'true')
    vi.stubEnv('AMADEUS_WS_TICKET_RETRIEVE_INITIAL_MS', '0')
    vi.stubEnv('AMADEUS_WS_TICKET_RETRIEVE_DELAY_MS', '0')
    vi.stubEnv('AMADEUS_WS_TICKET_RETRIEVE_RETRIES', '3')
    const { runBookingChain } = await loadChain()
    // after commit: queue, issue, retrieve#1 (no number yet), retrieve#2 (number present)
    queueReplies(sellOk, addOk, fopOk, priceOk, tstOk,commitOk, fopOk, issueOk, retrieveNoTicket, retrieveWithTicket)

    const result = await runBookingChain({ offer: offer(), travelers })
    expect(result.ticketed).toBe(true)
    expect(result.tickets.length).toBeGreaterThan(0)
    expect(result.order.needsReview).toBeUndefined()
  })

  // An airline Amadeus does not host sends its record locator after commit and
  // refuses the ticket until then. A retrieve in the session that committed
  // never showed it (Royal Brunei on PDT, 90-117 s); a new session did, after
  // 12 s - which is Amadeus's own advice. So the chain signs out first.
  it('waits for the airline record locator in new sessions, then issues', async () => {
    vi.stubEnv('AMADEUS_WS_AUTO_TICKET', 'true');
    vi.stubEnv('AMADEUS_WS_AIRLINE_LOCATOR_WAIT_MS', '5000');
    vi.stubEnv('AMADEUS_WS_AIRLINE_LOCATOR_POLL_MS', '0');
    vi.stubEnv('AMADEUS_WS_TICKET_RETRIEVE_INITIAL_MS', '0');
    const segment = (locator) => '<originDestinationDetails><itineraryInfo><elementManagementItinerary><segmentName>AIR</segmentName></elementManagementItinerary>'
      + (locator ? `<itineraryReservationInfo><reservation><companyId>BI</companyId><controlNumber>${locator}</controlNumber></reservation></itineraryReservationInfo>` : '')
      + '</itineraryInfo></originDestinationDetails>';
    const commitWithoutLocator = envelope('PNR_Reply', pnrHeaderXml + segment(''), SESSION);
    const withoutLocator = envelope('PNR_Reply', pnrHeaderXml + segment(''), SESSION);
    const withLocator = envelope('PNR_Reply', pnrHeaderXml + segment('13Z0L2'), SESSION);
    const { runBookingChain } = await loadChain();
    queueReplies(sellOk, addOk, fopOk, priceOk, tstOk, commitWithoutLocator, fopOk, signOutOk,
      withoutLocator, signOutOk,
      withLocator, issueOk, retrieveWithTicket);

    const result = await runBookingChain({ offer: offer(), travelers });

    const sent = axios.post.mock.calls.map(([, body]) => String(body));
    const firstSignOut = sent.findIndex((body) => body.includes('Security_SignOut'));
    const issuedAt = sent.findIndex((body) => body.includes('<DocIssuance_IssueTicket'));
    // Nothing is retrieved or issued in the session that committed.
    expect(firstSignOut).toBeGreaterThan(0);
    expect(sent.slice(0, firstSignOut).some((body) => body.includes('<PNR_Retrieve') || body.includes('<DocIssuance_IssueTicket'))).toBe(false);
    // The booking session, one look without the locator, one with it.
    expect(sent.filter((body) => body.includes('TransactionStatusCode="Start"'))).toHaveLength(3);
    expect(sent.slice(firstSignOut, issuedAt).filter((body) => body.includes('<PNR_Retrieve'))).toHaveLength(2);
    expect(result.pnr).toBe('ABC123');
    expect(result.ticketed).toBe(true);
    expect(result.tickets.length).toBeGreaterThan(0);
  });

  it('issues in the booking session when the airline locator is already there', async () => {
    vi.stubEnv('AMADEUS_WS_AUTO_TICKET', 'true');
    vi.stubEnv('AMADEUS_WS_TICKET_RETRIEVE_INITIAL_MS', '0');
    const hosted = envelope('PNR_Reply', pnrHeaderXml
      + '<originDestinationDetails><itineraryInfo><elementManagementItinerary><segmentName>AIR</segmentName></elementManagementItinerary>'
      + '<itineraryReservationInfo><reservation><companyId>LH</companyId><controlNumber>LHABC1</controlNumber></reservation></itineraryReservationInfo>'
      + '</itineraryInfo></originDestinationDetails>', SESSION);
    const { runBookingChain } = await loadChain();
    queueReplies(sellOk, addOk, fopOk, priceOk, tstOk, hosted, fopOk, issueOk, retrieveWithTicket);

    const result = await runBookingChain({ offer: offer(), travelers });

    const sent = axios.post.mock.calls.map(([, body]) => String(body));
    expect(sent.filter((body) => body.includes('TransactionStatusCode="Start"'))).toHaveLength(1);
    expect(result.ticketed).toBe(true);
  });

  const notReadyReply = () => envelope('DocIssuance_IssueTicketReply',
    '<processingStatus><statusCode>X</statusCode></processingStatus><errorGroup><errorOrWarningCodeDetails><errorDetails><errorCode>9125</errorCode></errorDetails></errorOrWarningCodeDetails>'
    + '<errorWarningDescription><freeText>ETKT DISALLOWED - NEED AIRLINE R/LOC-RETRY</freeText></errorWarningDescription></errorGroup>', SESSION);

  it('retries issuance the airline refused because it was not ready, in a new session', async () => {
    vi.stubEnv('AMADEUS_WS_AUTO_TICKET', 'true');
    vi.stubEnv('AMADEUS_WS_TICKET_RETRIEVE_INITIAL_MS', '0');
    const { runBookingChain } = await loadChain();
    queueReplies(sellOk, addOk, fopOk, priceOk, tstOk, commitOk, fopOk, notReadyReply(), signOutOk,
      retrieveNoTicket, issueOk, retrieveWithTicket);

    const result = await runBookingChain({ offer: offer(), travelers });

    const sent = axios.post.mock.calls.map(([, body]) => String(body));
    expect(sent.filter((body) => body.includes('<DocIssuance_IssueTicket'))).toHaveLength(2);
    expect(sent.filter((body) => body.includes('TransactionStatusCode="Start"'))).toHaveLength(2);
    expect(result.ticketed).toBe(true);
  });

  // La Compagnie's B0100 answered 9125 for the whole 90 s wait on PDT
  // (16 Sep 2026) and ticketed on a later look, once its record locator arrived.
  // Spending the two quick retries on a locator that has not arrived fails a
  // booking the airline was only slow to confirm.
  it('keeps looking for a late record locator instead of spending the retries', async () => {
    vi.stubEnv('AMADEUS_WS_AUTO_TICKET', 'true');
    vi.stubEnv('AMADEUS_WS_AIRLINE_LOCATOR_WAIT_MS', '0');
    vi.stubEnv('AMADEUS_WS_AIRLINE_LOCATOR_MAX_WAIT_MS', '5000');
    vi.stubEnv('AMADEUS_WS_AIRLINE_LOCATOR_POLL_MS', '0');
    vi.stubEnv('AMADEUS_WS_ISSUE_RETRIES', '1');
    vi.stubEnv('AMADEUS_WS_TICKET_RETRIEVE_INITIAL_MS', '0');
    const segment = (locator) => '<originDestinationDetails><itineraryInfo><elementManagementItinerary><segmentName>AIR</segmentName></elementManagementItinerary>'
      + (locator ? `<itineraryReservationInfo><reservation><companyId>B0</companyId><controlNumber>${locator}</controlNumber></reservation></itineraryReservationInfo>` : '')
      + '</itineraryInfo></originDestinationDetails>';
    const withoutLocator = envelope('PNR_Reply', pnrHeaderXml + segment(''), SESSION);
    const withLocator = envelope('PNR_Reply', pnrHeaderXml + segment('004DX4'), SESSION);
    const { runBookingChain } = await loadChain();
    // Commit without a locator, then three looks that still have none and are
    // refused 9125, then one with the locator that issues.
    queueReplies(sellOk, addOk, fopOk, priceOk, tstOk, withoutLocator, fopOk, signOutOk,
      withoutLocator, notReadyReply(), signOutOk,
      withoutLocator, notReadyReply(), signOutOk,
      withLocator, issueOk, retrieveWithTicket);

    const result = await runBookingChain({ offer: offer(), travelers });

    const sent = axios.post.mock.calls.map(([, body]) => String(body));
    // Three issuance attempts although only one retry is configured: a missing
    // locator is waiting, not a retry.
    expect(sent.filter((body) => body.includes('<DocIssuance_IssueTicket'))).toHaveLength(3);
    expect(result.ticketed).toBe(true);
    expect(result.tickets.length).toBeGreaterThan(0);
  });

  it('never issues again when the new session finds a ticket already on the PNR', async () => {
    vi.stubEnv('AMADEUS_WS_AUTO_TICKET', 'true');
    const { runBookingChain } = await loadChain();
    queueReplies(sellOk, addOk, fopOk, priceOk, tstOk, commitOk, fopOk, notReadyReply(), signOutOk, retrieveWithTicket);

    const result = await runBookingChain({ offer: offer(), travelers });

    const sent = axios.post.mock.calls.map(([, body]) => String(body));
    expect(sent.filter((body) => body.includes('<DocIssuance_IssueTicket'))).toHaveLength(1);
    expect(result.ticketed).toBe(true);
    expect(result.tickets.length).toBeGreaterThan(0);
  });

  it('stops after the configured not-ready refusals and keeps the booking', async () => {
    vi.stubEnv('AMADEUS_WS_AUTO_TICKET', 'true');
    vi.stubEnv('AMADEUS_WS_ISSUE_RETRIES', '1');
    const { runBookingChain } = await loadChain();
    queueReplies(sellOk, addOk, fopOk, priceOk, tstOk, commitOk, fopOk, notReadyReply(), signOutOk,
      retrieveNoTicket, notReadyReply());

    await expect(runBookingChain({ offer: offer(), travelers }))
      .rejects.toMatchObject({ step: 'issueTicket', committed: true, pnr: 'ABC123' });
  });

  // If the number never surfaces, the ticket still exists — leave the PNR for
  // manual follow-up rather than silently confirm a booking with no number.
  it('flags for manual follow-up when the ticket number never appears', async () => {
    vi.stubEnv('AMADEUS_WS_AUTO_TICKET', 'true')
    vi.stubEnv('AMADEUS_WS_TICKET_RETRIEVE_INITIAL_MS', '0')
    vi.stubEnv('AMADEUS_WS_TICKET_RETRIEVE_DELAY_MS', '0')
    vi.stubEnv('AMADEUS_WS_TICKET_RETRIEVE_RETRIES', '2') // 3 attempts total
    const { runBookingChain } = await loadChain()
    queueReplies(sellOk, addOk, fopOk, priceOk, tstOk,commitOk, fopOk, issueOk, retrieveNoTicket, retrieveNoTicket, retrieveNoTicket)

    const result = await runBookingChain({ offer: offer(), travelers })
    expect(result.ticketed).toBe(true)
    expect(result.tickets?.length ?? 0).toBe(0)
    expect(result.order.needsReview?.reason).toBe('ticket_numbers_not_retrieved')
  })
});

describe('session hygiene', () => {
  it('signs out even when the chain throws', async () => {
    const { runBookingChain } = await loadChain();
    queueReplies(sellUc);

    await expect(runBookingChain({ offer: offer(), travelers })).rejects.toThrow();

    const actions = axios.post.mock.calls.map(([, , cfg]) => cfg?.headers?.SOAPAction ?? '');
    expect(actions.some((a) => a.includes('VLSSOQ'))).toBe(true);
  });

  it('opens exactly one session for the whole chain', async () => {
    const { runBookingChain } = await loadChain();
    queueReplies(sellOk, addOk, fopOk, priceOk, tstOk,commitOk);

    await runBookingChain({ offer: offer(), travelers });

    const starts = axios.post.mock.calls.filter(([, body]) => String(body).includes('TransactionStatusCode="Start"'));
    expect(starts).toHaveLength(1);
  });
});
