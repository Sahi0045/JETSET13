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
const signOutOk = envelope('Security_SignOutReply', '<dummy/>');

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
  vi.stubEnv('AMADEUS_WS_ENDPOINT', 'https://node.test.invalid/1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_WSAP', '1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_USERNAME', 'WSTEST');
  vi.stubEnv('AMADEUS_WS_PASSWORD', 'pw');
  vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
  vi.stubEnv('AMADEUS_WS_BOOKING_ENABLED', 'true');
  vi.stubEnv('AMADEUS_WS_AUTO_TICKET', 'false');
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
    queueReplies(sellOk, addOk, priceDrifted);

    await expect(runBookingChain({ offer: offer(), travelers, expectedTotal: 76 }))
      .rejects.toMatchObject({ step: 'priceCheck', committed: false, code: 409 });
  });

  it('accepts drift inside the configured tolerance', async () => {
    vi.stubEnv('AMADEUS_WS_PRICE_TOLERANCE', '60');
    const { runBookingChain } = await loadChain();
    queueReplies(sellOk, addOk, priceDrifted, tstOk, fopOk, commitOk);

    const result = await runBookingChain({ offer: offer(), travelers, expectedTotal: 76 });
    expect(result.pnr).toBe('ABC123');
  });

  // Compared against the fare quoted, never against the charged amount, which
  // includes an admin service fee Amadeus knows nothing about.
  it('does not compare against a charged total it was never given', async () => {
    vi.stubEnv('AMADEUS_WS_PRICE_TOLERANCE', '0');
    const { runBookingChain } = await loadChain();
    queueReplies(sellOk, addOk, priceOk, tstOk, fopOk, commitOk);

    const result = await runBookingChain({ offer: offer(), travelers, expectedTotal: 76 });
    expect(result.pnr).toBe('ABC123');
    expect(result.priced.total).toBe(76);
  });
});

describe('committing', () => {
  it('returns the record locator and what was priced', async () => {
    const { runBookingChain } = await loadChain();
    queueReplies(sellOk, addOk, priceOk, tstOk, fopOk, commitOk);

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
    queueReplies(sellOk, addOk, priceOk, tstOk, fopOk, commitOk);

    const callsAtCommit = { value: null };
    await runBookingChain({
      offer: offer(),
      travelers,
      onCommitted: async ({ pnr }) => {
        expect(pnr).toBe('ABC123');
        callsAtCommit.value = axios.post.mock.calls.length;
      },
    });

    // Six calls in: sell, add, price, TST, FOP, commit - and nothing after.
    expect(callsAtCommit.value).toBe(6);
  });

  it('still returns the booking when persisting the PNR throws', async () => {
    const { runBookingChain } = await loadChain();
    queueReplies(sellOk, addOk, priceOk, tstOk, fopOk, commitOk);

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
    queueReplies(sellOk, addOk, priceOk, tstOk, fopOk, envelope('PNR_Reply', '<dummy/>', SESSION));

    await expect(runBookingChain({ offer: offer(), travelers }))
      .rejects.toMatchObject({ step: 'commit', committed: false });
  });
});

describe('after the PNR exists', () => {
  // A booking that is not on a queue is still a booking. Refunding one over a
  // filing error would be far worse than leaving it for the desk to find.
  it('keeps the booking when queueing fails', async () => {
    const { runBookingChain } = await loadChain();
    queueReplies(sellOk, addOk, priceOk, tstOk, fopOk, commitOk, errorReply('QUEUE UNAVAILABLE'));

    const result = await runBookingChain({ offer: offer(), travelers });
    expect(result.pnr).toBe('ABC123');
    expect(result.queued).toBe(false);
  });

  // The route reads `committed` to decide whether refunding is safe. A ticketed
  // booking that gets refunded leaves the customer flying for free and the
  // airline billing us.
  it('marks a post-commit failure as committed so no refund is issued', async () => {
    vi.stubEnv('AMADEUS_WS_AUTO_TICKET', 'true');
    const { runBookingChain } = await loadChain();
    queueReplies(sellOk, addOk, priceOk, tstOk, fopOk, commitOk, fopOk, errorReply('TICKETING FAILED'));

    await expect(runBookingChain({ offer: offer(), travelers }))
      .rejects.toMatchObject({ step: 'issueTicket', committed: true, pnr: 'ABC123' });
  });
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
    queueReplies(sellOk, addOk, priceOk, tstOk, fopOk, commitOk);

    await runBookingChain({ offer: offer(), travelers });

    const starts = axios.post.mock.calls.filter(([, body]) => String(body).includes('TransactionStatusCode="Start"'));
    expect(starts).toHaveLength(1);
  });
});
