import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A failure after the PNR is committed is a post-commit failure, whatever
 * raised it.
 *
 * `withSession` takes its Amadeus semaphore permit itself, OUTSIDE `callStep`,
 * so a `SlotTimeoutError` raised while opening a session is never wrapped in a
 * `BookingChainError`: it carries no `committed` and no `pnr`. Every look in
 * `issueInFreshSessions` opens a new session, and every one of them happens
 * AFTER the commit.
 *
 * The order route reads `slotTimeout && !committed` as "nothing was sold": it
 * queues the booking, overwrites the `committed` marker in `gds_chain` with
 * `queued`, and answers 202 "your booking is being confirmed" - for a
 * reservation the airline already holds. `flagForReview`, `reportError`, the
 * held-for-review email and the PNR-bearing 202 are all skipped, so nothing
 * records that a real PNR exists; only the 15-minute paid-not-ticketed alarm
 * would eventually notice.
 *
 * No existing test covered it: every slot-timeout case in bookingQueue.test.js
 * mocks the rejection before anything is committed, and the fresh-session cases
 * in bookingChain.test.js never touch the semaphore.
 */

const envelope = (name, inner, session = true) => `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:awsse="http://xml.amadeus.com/2010/06/Session_v3">
  <soap:Header>${session ? '<awsse:Session TransactionStatusCode="InSeries"><awsse:SessionId>SESS1</awsse:SessionId><awsse:SequenceNumber>1</awsse:SequenceNumber><awsse:SecurityToken>TOK</awsse:SecurityToken></awsse:Session>' : ''}</soap:Header>
  <soap:Body><${name}>${inner}</${name}></soap:Body>
</soap:Envelope>`;

const reply = (xml) => ({ status: 200, data: xml, headers: {} });

const sellOk = envelope('Air_SellFromRecommendationReply',
  '<itineraryDetails><segmentInformation><actionDetails><quantity>1</quantity><statusCode>OK</statusCode></actionDetails></segmentInformation></itineraryDetails>');
const addOk = envelope('PNR_Reply', '<dummy/>');
const fopOk = envelope('FOP_CreateFormOfPaymentReply', '<dummy/>');
const priceOk = envelope('Fare_PricePNRWithBookingClassReply',
  '<fareList><fareReference><uniqueReference>1</uniqueReference></fareReference><fareDataInformation><fareDataSupInformation>'
  + '<fareDataQualifier>712</fareDataQualifier><fareAmount>76.00</fareAmount><fareCurrency>USD</fareCurrency>'
  + '</fareDataSupInformation></fareDataInformation></fareList>');
const tstOk = envelope('Ticket_CreateTSTFromPricingReply',
  '<tstList><tstReference><uniqueReference>1</uniqueReference></tstReference></tstList>');

/**
 * A committed PNR whose air segment carries NO airline record locator, which is
 * what sends the chain into issueInFreshSessions (B6, VS, AA, DL, BI on PDT).
 */
const commitAwaitingLocator = envelope('PNR_Reply',
  '<pnrHeader><reservationInfo><reservation><controlNumber>ABC123</controlNumber><date>040926</date></reservation></reservationInfo></pnrHeader>'
  + '<travellerInfo><elementManagementPassenger><reference><number>1</number></reference></elementManagementPassenger>'
  + '<passengerData><travellerInformation><traveller><surname>SMITH</surname></traveller>'
  + '<passenger><firstName>JOHN MR</firstName></passenger></travellerInformation></passengerData></travellerInfo>'
  + '<originDestinationDetails><itineraryInfo>'
  + '<elementManagementItinerary><segmentName>AIR</segmentName></elementManagementItinerary>'
  + '<relatedProduct><status>HK</status></relatedProduct>'
  + '</itineraryInfo></originDestinationDetails>');

const offer = () => ({
  id: '1',
  source: 'GDS',
  price: { total: '76.00', currency: 'USD' },
  validatingAirlineCodes: ['B6'],
  travelerPricings: [{ travelerId: '1', travelerType: 'ADULT' }],
  itineraries: [{ segments: [{ id: '1' }] }],
  _ama: {
    wsap: '1ASIWJETJEC',
    officeId: 'SCK1S2400',
    searchedAt: new Date().toISOString(),
    pricedAt: new Date().toISOString(),
    paxRefs: [{ ref: '1', ptc: 'ADT' }],
    segments: [{
      legIndex: 0, boardPoint: 'JFK', offPoint: 'LAX', departureDate: '250926',
      arrivalDate: '250926', marketingCarrier: 'B6', flightNumber: '323', rbd: 'L',
    }],
  },
});

const travelers = [{ firstName: 'John', lastName: 'Smith', gender: 'MALE' }];

/**
 * The real semaphore, except that only the first session gets a permit. The
 * booking session takes it; the first post-commit look does not.
 */
const oneSessionOnly = async () => {
  const actual = await vi.importActual('../../../backend/services/amadeusSoap/semaphore.js');
  let granted = 0;
  vi.doMock('../../../backend/services/amadeusSoap/semaphore.js', () => ({
    ...actual,
    getSemaphore: () => ({
      acquire: async () => {
        granted += 1;
        if (granted > 1) throw new actual.SlotTimeoutError(true);
      },
      release: () => {},
      snapshot: () => ({}),
    }),
  }));
};

beforeEach(() => {
  vi.stubEnv('AMADEUS_WS_ENDPOINT', 'https://node.test.invalid/1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_WSAP', '1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_USERNAME', 'WSTEST');
  vi.stubEnv('AMADEUS_WS_PASSWORD', 'pw');
  vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
  vi.stubEnv('AMADEUS_WS_BOOKING_ENABLED', 'true');
  vi.stubEnv('AMADEUS_WS_AUTO_TICKET', 'true');
  vi.stubEnv('AMADEUS_WS_MIN_PAYMENT_RATIO', '0');
  vi.stubEnv('AMADEUS_WS_AIRLINE_LOCATOR_WAIT_MS', '0');
  vi.stubEnv('AMADEUS_WS_ISSUE_RETRY_DELAY_MS', '0');
  vi.resetModules();
  axios.post.mockReset();
});

describe('a slot timeout after the PNR is committed', () => {
  const commitThenNoSlot = () => {
    axios.post
      .mockResolvedValueOnce(reply(sellOk))
      .mockResolvedValueOnce(reply(addOk))
      .mockResolvedValueOnce(reply(fopOk))
      .mockResolvedValueOnce(reply(priceOk))
      .mockResolvedValueOnce(reply(tstOk))
      .mockResolvedValueOnce(reply(commitAwaitingLocator))
      .mockResolvedValue(reply(envelope('Security_SignOutReply', '<dummy/>', false)));
  };

  // The bug, exactly: this used to escape as a bare SlotTimeoutError.
  it('is reported as a committed failure, not as "nothing was sold"', async () => {
    await oneSessionOnly();
    const { runBookingChain } = await import('../../../backend/services/amadeusSoap/bookingChain.js');
    commitThenNoSlot();

    const failure = await runBookingChain({ offer: offer(), travelers, expectedTotal: 76 })
      .then(() => null, (error) => error);

    expect(failure, 'the chain must fail, not return').toBeTruthy();
    expect(failure.committed, 'the airline holds a real PNR').toBe(true);
    expect(failure.pnr).toBe('ABC123');
  });

  it('carries the step, so the review record says where it stopped', async () => {
    await oneSessionOnly();
    const { runBookingChain } = await import('../../../backend/services/amadeusSoap/bookingChain.js');
    commitThenNoSlot();

    const failure = await runBookingChain({ offer: offer(), travelers, expectedTotal: 76 })
      .then(() => null, (error) => error);

    expect(failure.step).toBe('issueTicket');
    expect(failure.ticketed).toBe(false);
  });

  // The seats were sold: the commit went through before the slot ran out.
  it('sold the seats before it ran out of slots', async () => {
    await oneSessionOnly();
    const { runBookingChain } = await import('../../../backend/services/amadeusSoap/bookingChain.js');
    commitThenNoSlot();

    await runBookingChain({ offer: offer(), travelers, expectedTotal: 76 }).catch(() => {});

    const actions = axios.post.mock.calls.map(([, , cfg]) => cfg?.headers?.SOAPAction ?? '');
    expect(actions.some((a) => a.includes('TAUSRQ') || a.includes('ITAREQ')), 'seats were sold').toBe(true);
  });
});
