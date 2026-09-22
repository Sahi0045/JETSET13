import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TICKET_NUMBERS_MISSING, attentionOf, flagsInForce, liveTicketNumbersMissingOf, ticketNumbersMissingOf,
} from '../../shared/reviewQueue.js';

/**
 * A schedule change and missing ticket numbers on the same booking.
 *
 * The chain accepts a TK schedule change at commit and, after issuing, flags
 * the ticket numbers it could not read back. createFlightOrder kept one of the
 * two - `order.needsReview ?? scheduleChange` - so the numbers flag won and the
 * schedule change was dropped. Ticket sync then read the numbers and resolved
 * that flag, and no person ever learnt the flight had been retimed: the
 * customer kept a confirmation with the times they searched.
 *
 * Now the numbers flag goes on top, where ticket sync looks for it, with the
 * schedule change kept under it as `previous`. The desk and the alarm find the
 * schedule change anywhere in force in the chain (flagInForce), and ticket
 * sync, when it resolves the numbers, lifts the schedule change back on top so
 * its resolution settles the numbers only.
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
const addOk = envelope('PNR_Reply', '<dummy/>', SESSION);
const fopOk = envelope('FOP_CreateFormOfPaymentReply', '<dummy/>', SESSION);
const priceOk = envelope('Fare_PricePNRWithBookingClassReply',
  '<fareList><fareReference><uniqueReference>1</uniqueReference></fareReference><paxSegReference><refDetails><refQualifier>PA</refQualifier><refNumber>1</refNumber></refDetails></paxSegReference><fareDataInformation><fareDataSupInformation><fareDataQualifier>712</fareDataQualifier><fareAmount>76.00</fareAmount><fareCurrency>USD</fareCurrency></fareDataSupInformation></fareDataInformation></fareList>', SESSION);
const tstOk = envelope('Ticket_CreateTSTFromPricingReply', '<tstList><tstReference><uniqueReference>1</uniqueReference></tstReference></tstList>', SESSION);
const pnrHeaderXml = '<pnrHeader><reservationInfo><reservation><companyId>1A</companyId><controlNumber>ABC123</controlNumber><date>040926</date></reservation></reservationInfo></pnrHeader>'
  + '<travellerInfo><elementManagementPassenger><reference><qualifier>PT</qualifier><number>2</number></reference></elementManagementPassenger>'
  + '<passengerData><travellerInformation><traveller><surname>SMITH</surname></traveller><passenger><firstName>JOHN MR</firstName></passenger></travellerInformation></passengerData></travellerInfo>';
const withSegmentStatus = (status) => envelope('PNR_Reply', pnrHeaderXml
  + '<originDestinationDetails><itineraryInfo><elementManagementItinerary><segmentName>AIR</segmentName></elementManagementItinerary>'
  + `<relatedProduct><quantity>1</quantity><status>${status}</status></relatedProduct>`
  + '<itineraryReservationInfo><reservation><companyId>AA</companyId><controlNumber>XYZ123</controlNumber></reservation></itineraryReservationInfo>'
  + '</itineraryInfo></originDestinationDetails>', SESSION);
const queueOk = envelope('Queue_PlacePNRReply', '<dummy/>', SESSION);
const issueOk = envelope('DocIssuance_IssueTicketReply', '<processingStatus><statusCode>O</statusCode></processingStatus>', SESSION);
const signOutOk = envelope('Security_SignOutReply', '<dummy/>');

const offer = () => ({
  id: '1',
  source: 'GDS',
  price: { total: '76.00', currency: 'USD' },
  validatingAirlineCodes: ['IB'],
  travelerPricings: [{ travelerId: '1', travelerType: 'ADULT' }],
  itineraries: [{ segments: [{ id: '1' }] }],
  _ama: {
    wsap: '1ASIWJETJEC',
    officeId: 'SCK1S2400',
    searchedAt: new Date().toISOString(),
    paxRefs: [{ ref: '1', ptc: 'ADT' }],
    segments: [{
      legIndex: 0, boardPoint: 'MAD', offPoint: 'JFK', departureDate: '011126', arrivalDate: '011126', marketingCarrier: 'IB', flightNumber: '4001', rbd: 'S',
    }],
  },
});

const stubChainEnv = () => {
  vi.unstubAllEnvs();
  vi.stubEnv('AMADEUS_WS_ENDPOINT', 'https://node.test.invalid/1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_WSAP', '1ASIWJETJEC');
  vi.stubEnv('AMADEUS_WS_USERNAME', 'WSTEST');
  vi.stubEnv('AMADEUS_WS_PASSWORD', 'pw');
  vi.stubEnv('AMADEUS_WS_OFFICE_ID', 'SCK1S2400');
  vi.stubEnv('AMADEUS_WS_BOOKING_ENABLED', 'true');
  vi.stubEnv('AMADEUS_WS_AUTO_TICKET', 'true');
  vi.stubEnv('AMADEUS_WS_MIN_PAYMENT_RATIO', '0');
  vi.stubEnv('AMADEUS_WS_AIRLINE_LOCATOR_WAIT_MS', '0');
  vi.stubEnv('AMADEUS_WS_TICKET_RETRIEVE_INITIAL_MS', '0');
  vi.stubEnv('AMADEUS_WS_TICKET_RETRIEVE_RETRIES', '0');
  vi.stubEnv('AMADEUS_WS_TICKET_RETRIEVE_DELAY_MS', '0');
};

/**
 * A booking through the chain: the segment comes back TK at commit (the
 * change is accepted), the ticket is issued, and the retrieve after it shows
 * `faLine` as the FA line - or none.
 */
const book = async ({ commitStatus, faLine }) => {
  stubChainEnv();
  vi.resetModules();
  axios.post.mockReset();
  const retrieveAfterIssue = faLine
    ? envelope('PNR_Reply', pnrHeaderXml
      + '<originDestinationDetails><itineraryInfo><elementManagementItinerary><segmentName>AIR</segmentName></elementManagementItinerary>'
      + '<relatedProduct><quantity>1</quantity><status>HK</status></relatedProduct></itineraryInfo></originDestinationDetails>'
      + '<dataElementsMaster><dataElementsIndiv><elementManagementData><segmentName>FA</segmentName></elementManagementData>'
      + `<otherDataFreetext><freetextDetail><subjectQualifier>3</subjectQualifier><type>P06</type></freetextDetail><longFreetext>PAX ${faLine}/ETIB/USD76.00/01NOV26/SCK1S2400/00000000</longFreetext></otherDataFreetext>`
      + '<referenceForDataElement><reference><qualifier>PT</qualifier><number>2</number></reference></referenceForDataElement>'
      + '</dataElementsIndiv></dataElementsMaster>', SESSION)
    : withSegmentStatus('HK');
  // A TK at commit is accepted with one more PNR_AddMultiElements (optionCode 13).
  const accepted = commitStatus === 'TK' ? [withSegmentStatus('HK')] : [];
  for (const xml of [sellOk, addOk, fopOk, priceOk, tstOk, withSegmentStatus(commitStatus), ...accepted, queueOk, issueOk, retrieveAfterIssue]) {
    axios.post.mockResolvedValueOnce(reply(xml));
  }
  axios.post.mockResolvedValue(reply(signOutOk));
  const provider = (await import('../../backend/services/amadeusSoap/index.js')).default;
  return provider.createFlightOrder({
    data: { flightOffers: [offer()], travelers: [{ id: '1', name: { firstName: 'John', lastName: 'Smith' }, gender: 'MALE' }] },
  }, { bookingReference: 'FLT1', expectedTotal: 76 });
};

// The row buildBookingRow writes from that order.
const rowFrom = (order, over = {}) => ({
  booking_reference: 'FLTSCN1',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 76,
  created_at: new Date().toISOString(),
  booking_details: { pnr: 'ABC123', gds: { ticketed: order.ticketed }, tickets: order.tickets || [], needs_review: order.needsReview },
  ...over,
});

describe('what the chain records when the airline retimed a flight and the numbers did not come back', () => {
  beforeEach(() => vi.unstubAllEnvs());

  it('keeps both: the numbers flag on top, the schedule change under it', async () => {
    const order = await book({ commitStatus: 'TK' });
    expect(order.ticketed).toBe(true);
    expect(order.needsReview).toMatchObject({
      reason: TICKET_NUMBERS_MISSING,
      previous: { reason: 'schedule_changed_by_airline', statuses: ['TK'] },
    });
    // Ticket sync looks for the numbers flag on top, unresolved.
    expect(liveTicketNumbersMissingOf(rowFrom(order))).toBe(order.needsReview);
  });

  it('is shown on the desk and in Slack as both', async () => {
    const row = rowFrom(await book({ commitStatus: 'TK' }));
    const { selectUnannounced, buildMessage } = await import('../../backend/jobs/needsReviewAlert.job.js');
    expect(attentionOf(row)).toMatchObject({ kind: 'review', reason: 'ticket_numbers_not_retrieved; schedule_changed_by_airline' });
    expect(selectUnannounced([row])).toHaveLength(1);
    const text = buildMessage([row]);
    expect(text).toMatch(/ticketed, ticket numbers not read back/);
    expect(text).toMatch(/the airline also changed the schedule \(segment status: TK\): tell the customer the new times/);
  });

  // Fences: each flag alone is recorded exactly as before.
  it('a schedule change alone is the schedule change, with nothing under it', async () => {
    const order = await book({ commitStatus: 'TK', faLine: '075-1234567890' });
    expect(order.needsReview).toEqual({ reason: 'schedule_changed_by_airline', statuses: ['TK'], at: expect.any(String) });
  });

  it('numbers missing alone is the numbers flag, with nothing under it', async () => {
    const order = await book({ commitStatus: 'HK' });
    expect(order.needsReview).toEqual({ reason: TICKET_NUMBERS_MISSING, expected: 1, got: 0, at: expect.any(String) });
  });
});

/*
 * Ticket sync over the same row. The table double and the flight.routes
 * stand-in are the ones ticketSyncNumbersMissing.test.js uses.
 */
let rows = [];
const valueAt = (row, path) => path.split(/->>?/).reduce((value, key) => (value == null ? undefined : value[key]), row);
const text = (value) => (value == null ? null : String(value));
const table = () => {
  const filters = [];
  let cap = Infinity;
  const chain = {
    select: () => chain,
    in: (column, list) => { filters.push((row) => list.includes(valueAt(row, column))); return chain; },
    eq: (column, value) => { filters.push((row) => text(valueAt(row, column)) === String(value)); return chain; },
    is: (column) => { filters.push((row) => valueAt(row, column) == null); return chain; },
    not: (column, op, value) => {
      if (op === 'is') filters.push((row) => valueAt(row, column) != null);
      else {
        const list = String(value).replace(/^\(|\)$/g, '').split(',');
        filters.push((row) => valueAt(row, column) != null && !list.includes(String(valueAt(row, column))));
      }
      return chain;
    },
    or: (expression) => {
      const any = expression.split(',').map((clause) => {
        const [, column, op, value] = /^(.+?)\.(is|eq)\.(.*)$/.exec(clause);
        return (row) => (op === 'is' ? valueAt(row, column) == null : text(valueAt(row, column)) === value);
      });
      filters.push((row) => any.some((test) => test(row)));
      return chain;
    },
    order: () => chain,
    limit: (count) => { cap = count; return chain; },
    then: (resolve) => resolve({ data: rows.filter((row) => filters.every((keep) => keep(row))).slice(0, cap), error: null }),
  };
  return chain;
};

vi.mock('../../backend/routes/flight.routes.js', () => ({
  patchBookingDetails: vi.fn(async (reference, patch) => {
    const row = rows.find((r) => r.booking_reference === reference);
    if (!row) return null;
    const changes = typeof patch === 'function' ? patch(row.booking_details) : patch;
    row.booking_details = { ...row.booking_details, ...changes };
    return row;
  }),
}));

const TICKET = '075-1234567890';
const at = '2026-09-20T10:05:00.000Z';
const scheduleChange = { reason: 'schedule_changed_by_airline', statuses: ['TK'], at: '2026-09-20T10:00:00.000Z' };
const numbersFlag = (over = {}) => ({ reason: TICKET_NUMBERS_MISSING, expected: 1, got: 0, at, ...over });
const flagged = (needsReview) => ({
  booking_reference: 'FLTSCN1',
  status: 'confirmed',
  payment_status: 'paid',
  total_amount: 76,
  created_at: '2026-09-20T10:00:00.000Z',
  passenger_details: [{ id: '1', firstName: 'John', lastName: 'Smith', email: 'flyer@example.com' }],
  booking_details: { pnr: 'ABC123', customer_email: 'flyer@example.com', gds: { ticketed: true }, tickets: [], needs_review: needsReview },
});
const provider = () => ({
  getFlightOrderDetails: vi.fn(async () => ({
    success: true,
    data: { tickets: [{ number: TICKET, travelerId: '2' }], travelers: [{ id: '2', name: { firstName: 'JOHN', lastName: 'SMITH' } }] },
  })),
});

describe('ticket sync on a booking with both flags', () => {
  let job;
  let alarm;
  beforeEach(async () => {
    vi.resetModules();
    rows = [];
    const supabase = (await import('../../backend/config/supabase.js')).default;
    supabase.from.mockImplementation(() => table());
    job = await import('../../backend/jobs/ticketSync.job.js');
    alarm = await import('../../backend/jobs/needsReviewAlert.job.js');
  });

  it('still reads the missing numbers', async () => {
    rows.push(flagged(numbersFlag({ previous: scheduleChange })));
    const amadeus = provider();
    await job.runOnce({ provider: amadeus, sendEmail: vi.fn(async () => ({ success: true })) });
    expect(amadeus.getFlightOrderDetails).toHaveBeenCalledWith('ABC123');
    expect(rows[0].booking_details.tickets.map((ticket) => ticket.number)).toEqual([TICKET]);
  });

  it('settles the numbers only: the schedule change stays on the desk and goes to Slack until a person resolves it', async () => {
    rows.push(flagged(numbersFlag({ previous: scheduleChange })));
    await job.runOnce({ provider: provider(), sendEmail: vi.fn(async () => ({ success: true })) });

    const after = rows[0];
    expect(after.booking_details.needs_review).toMatchObject({ ...scheduleChange, previous: { reason: TICKET_NUMBERS_MISSING, resolved_by: 'ticket sync' } });
    expect(after.booking_details.needs_review.resolved_at).toBeUndefined();
    expect(attentionOf(after)).toMatchObject({ kind: 'schedule_changed' });
    expect(alarm.selectUnannounced([after])).toHaveLength(1);
    expect(alarm.buildMessage([after])).toMatch(/whose schedule the airline changed/);
    // The ticket was issued: every reader of that fact still finds the flag.
    expect(ticketNumbersMissingOf(after)?.resolved_by).toBe('ticket sync');
    // Not asked about again.
    expect(await job.findUnticketed()).toEqual([]);

    // A person resolves the top, as the desk does: nothing is left open.
    const handled = { ...after, booking_details: { ...after.booking_details, needs_review: { ...after.booking_details.needs_review, resolved_at: at } } };
    expect(attentionOf(handled)).toBeNull();
    expect(alarm.selectUnannounced([handled])).toHaveLength(0);
  });

  it('keeps the announcement it was part of: announced with the numbers, not announced again', async () => {
    rows.push(flagged(numbersFlag({ previous: scheduleChange, alerted_at: at })));
    await job.runOnce({ provider: provider(), sendEmail: vi.fn(async () => ({ success: true })) });
    const after = rows[0];
    expect(after.booking_details.needs_review).toMatchObject({ reason: 'schedule_changed_by_airline', alerted_at: at });
    expect(alarm.selectUnannounced([after])).toHaveLength(0);
    expect(attentionOf(after)?.kind).toBe('schedule_changed');
  });

  // Fence: the numbers flag alone is resolved in place, as before.
  it('with no schedule change under it, resolves the numbers flag where it is', async () => {
    rows.push(flagged(numbersFlag()));
    await job.runOnce({ provider: provider(), sendEmail: vi.fn(async () => ({ success: true })) });
    const review = rows[0].booking_details.needs_review;
    expect(review).toMatchObject({ reason: TICKET_NUMBERS_MISSING, resolved_by: 'ticket sync' });
    expect(review.previous).toBeUndefined();
    expect(flagsInForce(rows[0])).toEqual([]);
    expect(attentionOf(rows[0])).toBeNull();
  });
});
