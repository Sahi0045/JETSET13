/**
 * Closes the loop between a ticket being issued and the customer knowing it.
 *
 * A reservation is not a ticket. The chain commits a PNR - a held seat, a
 * six-letter code - and issuance is a separate step that produces the thing you
 * actually fly on, a 13-digit number like 220-7491174929. With
 * AMADEUS_WS_AUTO_TICKET off, which is every booking so far, that second step is
 * done by a person in the Amadeus terminal.
 *
 * Nothing told us when they did it. `booking_details.tickets` was written in
 * exactly three places, all of them during the original order request, and
 * never again; no route accepted a ticket number and no job asked for one. So
 * the field stayed empty for ever, and every surface reads that one field:
 *
 *   My Trips            "Ticket pending"
 *   the ticket cell     "Not yet issued"
 *   Manage Booking      offers a booking confirmation, not an e-ticket
 *   the PDF             "not a ticket... do not travel on this document alone"
 *   the email           promised an e-ticket that no code path could send
 *
 * A customer holding a valid ticket was told by every surface we own that they
 * had none, and warned not to travel on what we gave them.
 *
 * So: ask. For each paid booking that has a PNR and no ticket number, retrieve
 * the PNR and look. `PNR_Retrieve` is stateless and cheap, and it is the same
 * read the chain already does after issuance (readTicketNumbers in
 * bookingChain.js). When a number has appeared, record it and send the e-ticket
 * email that was promised.
 *
 * This stays useful after certification. With auto-ticketing on, the happy path
 * records its own ticket during the booking - but a ticket that failed to issue
 * and was finished by hand takes exactly this route, and that is the case the
 * paid-but-not-ticketed alarm already exists to catch.
 */
import supabase from '../config/supabase.js';
import FlightProvider, { providerStatus } from '../services/flightProvider.js';
import { sendTicketIssuedEmail } from '../services/emailService.js';
import { patchBookingDetails } from '../routes/flight.routes.js';
import { queueEnvironment } from '../utils/queueEnvironment.js';

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;

/**
 * How many PNRs are retrieved per tick.
 *
 * Each one is a live Amadeus call taking a semaphore permit, and search shares
 * that pool with paying customers. Ten every five minutes clears a day's
 * backlog long before anyone travels, and never competes with the site.
 */
const MAX_PER_TICK = 10;

const log = (message, extra) => console.log(`[TicketSync] ${message}`, extra ?? '');

/** A booking whose money is settled. Anything else has no ticket to find. */
const PAID = ['paid', 'completed', 'confirmed'];

/** Cancelled or refunded bookings are finished; their tickets are voided. */
const CLOSED = ['cancelled', 'canceled', 'refunded', 'failed'];

/**
 * Paid bookings that have a reservation and no ticket number.
 *
 * The same shape the paid-but-not-ticketed alarm looks for
 * (needsReviewAlert.job.js), because it is the same population: that job tells
 * staff about them, and this one notices when staff have finished with them.
 */
/**
 * Where a booking keeps the address to write to.
 *
 * Checked against live rows rather than assumed, because assuming is how this
 * was wrong: the first version read `contactInfo.email`, `customerEmail` and
 * `email`, and NOT ONE of those keys is ever written for a flight. Every
 * booking would have failed with "No email address" - the e-ticket email could
 * not have reached a single customer.
 *
 * What is actually there, on real rows: `booking_details.customer_email`
 * (written by checkout), and the lead traveller's own address on
 * `passenger_details`. Same precedence the order route's own resolver uses
 * (flight.routes.js, buildConfirmationEmail).
 */
export const addressFor = (row) => {
  const details = row?.booking_details || {};
  const travellers = Array.isArray(row?.passenger_details) ? row.passenger_details
    : (Array.isArray(details.travelers) ? details.travelers : []);
  return String(details.customer_email || details.contactInfo?.email || travellers[0]?.email || '').trim() || null;
};

/** The customer's name, from the same places. */
export const nameFor = (row) => {
  const details = row?.booking_details || {};
  const travellers = Array.isArray(row?.passenger_details) ? row.passenger_details
    : (Array.isArray(details.travelers) ? details.travelers : []);
  const lead = travellers[0] || {};
  const full = `${lead.firstName || lead.name?.firstName || ''} ${lead.lastName || lead.name?.lastName || ''}`.trim();
  return details.customer_name || full || null;
};

const SELECT = 'booking_reference, status, payment_status, booking_details, passenger_details, created_at';

const open = (row) => !CLOSED.includes(String(row.status || '').toLowerCase());

export async function findUnticketed({ limit = MAX_PER_TICK } = {}) {
  const { data, error } = await supabase
    .from('bookings')
    .select(SELECT)
    .in('payment_status', PAID)
    .not('booking_details->>pnr', 'is', null)
    // The narrowing has to be IN THE QUERY, not only in the filter below.
    //
    // Without it every ticketed booking matches, and the oldest-first window
    // fills with rows that are already done: past about fifty paid bookings
    // with a PNR, a newly ticketed one is never inside the window and its
    // ticket is never recorded. No error, no log - the job reports `checked: 0`
    // for ever. The paid-but-not-ticketed alarm gets this right
    // (needsReviewAlert.job.js) and this was written from it; the clause was
    // dropped on the way across.
    //
    // Null-safe, and that is not pedantry: of 21 live rows with a PNR, SIX
    // carry no readable `ticketed` state - one has no `gds` object at all and
    // five have `gds` without the key. `->>` yields NULL for those, and
    // `eq 'false'` on NULL is NULL, so a plain `.eq` would silently skip
    // exactly the rows this job exists to find.
    .or('booking_details->gds->>ticketed.is.null,booking_details->gds->>ticketed.eq.false')
    // Closed bookings in the query too, for the same reason. A cancellation
    // whose refund failed stays `paid`, keeps its PNR and was never ticketed,
    // so it matches everything above for ever; filtered only below, sixty of
    // them filled the window and an open booking behind them was never read.
    .not('status', 'in', `(${CLOSED.join(',')})`)
    // Least recently asked about first, never-asked first of all.
    //
    // Oldest-first alone starved the window the same way from the other end:
    // a booking that can never be ticketed - Air India refused with 2161, a KU
    // refused ETKT NOT AUTHORISED, a PDT PNR since purged - never leaves this
    // population, so once ten of them existed they were the ten asked about
    // on every tick, and a booking a person ticketed by hand this morning was
    // never retrieved. `ticket_checked_at` (runOnce) sends each one to the back
    // once it has been asked, so every booking takes its turn.
    .order('booking_details->>ticket_checked_at', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true })
    .limit(limit * 5);

  if (error) throw new Error(`could not read bookings: ${error.message}`);

  return (data || [])
    .filter(open)
    .filter((row) => {
      const details = row.booking_details || {};
      // Already has its number: nothing to ask about.
      if (Array.isArray(details.tickets) && details.tickets.length > 0) return false;
      if (details.gds?.ticketed === true) return false;
      return Boolean(details.pnr);
    })
    .slice(0, limit);
}

/**
 * Outcomes that leave a booking where it was: asked about, nothing found.
 *
 * Only these are stamped. A ticket that was found but could not be recorded
 * ('not-recorded') is not: it should be asked about again at once, not after
 * every other booking has had its turn.
 */
const ASKED_NOTHING_FOUND = new Set(['still-unticketed', 'unreadable', 'partially-ticketed']);

/**
 * Tickets this job recorded whose owner has not been told yet.
 *
 * Without this the retry below is unreachable and the promise is quietly
 * dropped: the moment the numbers are written, `findUnticketed` stops selecting
 * the row, so "let it be sent again next tick" had no next tick. A refused send
 * - a full mailbox, a moment's Resend outage, or the missing address above -
 * meant the customer was never told, ever.
 *
 * Only rows carrying `ticket_synced_at`, which only this job writes. A booking
 * ticketed inline at order time already had its ticket number in the
 * confirmation email; announcing those would mean emailing every past customer
 * about a ticket they have had for weeks.
 */
export async function findUnannounced({ limit = MAX_PER_TICK } = {}) {
  const { data, error } = await supabase
    .from('bookings')
    .select(SELECT)
    .in('payment_status', PAID)
    .not('booking_details->>ticket_synced_at', 'is', null)
    // Same reason as findUnticketed, and null-safe for the same reason: a row
    // that has never been announced has no `ticket_issued_emailed` key at all,
    // and `neq` against NULL is NULL - it would exclude every row this is for.
    .or('booking_details->>ticket_issued_emailed.is.null,booking_details->>ticket_issued_emailed.eq.false')
    .order('created_at', { ascending: true })
    .limit(limit * 5);

  if (error) throw new Error(`could not read bookings: ${error.message}`);

  return (data || [])
    .filter(open)
    .filter((row) => {
      const details = row.booking_details || {};
      if (details.ticket_issued_emailed === true) return false;
      return Array.isArray(details.tickets) && details.tickets.some((t) => t?.number);
    })
    .slice(0, limit);
}

/**
 * The tickets on a retrieved PNR, each with the name of whoever holds it.
 *
 * A ticket as Amadeus files it carries no name: `readTickets` returns
 * `{ number, travelerId, validatingCarrier, issuedOn }`, where `travelerId` is
 * the passenger's reference on that PNR. The names are on the PNR's own
 * traveller list, which `retrieveBooking` returns alongside.
 *
 * Joining them here is what makes "RAO/DEV — 220-7491174930" possible. Without
 * it a family of three gets three numbers and no way to tell whose is whose,
 * which is exactly the question a check-in desk asks. An unmatched ticket keeps
 * its number and simply goes unnamed rather than being dropped.
 */
export const withTravellerNames = (order) => {
  const tickets = Array.isArray(order?.tickets) ? order.tickets.filter((t) => t?.number) : [];
  const byId = new Map((Array.isArray(order?.travelers) ? order.travelers : [])
    .map((traveller) => [String(traveller?.id), traveller]));

  return tickets.map((ticket) => {
    const holder = ticket.travelerId != null ? byId.get(String(ticket.travelerId)) : undefined;
    const full = [holder?.name?.lastName, holder?.name?.firstName].filter(Boolean).join('/');
    return full ? { ...ticket, travelerName: full } : { ...ticket };
  });
};

/**
 * The travellers on a retrieved PNR who hold no ticket yet.
 *
 * Any ticket at all used to count as the whole booking done. When a person
 * tickets by hand - every booking, while AUTO_TICKET is off - and issues two
 * of a family's three, the booking was recorded ticketed with two numbers,
 * the customer got one e-ticket email, and the row left this job, the
 * paid-not-ticketed alarm and the admin "Needs attention" list for good.
 *
 * Both halves come from the same retrieve: a ticket names its passenger by the
 * PNR reference, and an infant's names its adult with `-INF`, which is the id
 * readTravelers gives that infant (mappers/flightOrder.js; the certification
 * PNR BMPUST reads travellers 2, 2-INF, 5, 4 and tickets for exactly those).
 * A ticket that names nobody cannot be matched, so then the tickets are
 * counted. A PNR whose travellers could not be read says nothing either way,
 * and is left to the tickets it has, as before.
 */
export const travellersWithoutTicket = (order, tickets) => {
  const travellers = Array.isArray(order?.travelers) ? order.travelers : [];
  if (travellers.length === 0) return [];
  if (tickets.some((t) => t.travelerId == null)) {
    return tickets.length >= travellers.length ? [] : travellers.slice(tickets.length);
  }
  const holders = new Set(tickets.map((t) => String(t.travelerId)));
  return travellers.filter((traveller) => !holders.has(String(traveller?.id)));
};

/**
 * Ask Amadeus whether this PNR has a ticket yet, and record it if it does.
 *
 * Returns what happened, so a tick can be reported and a test can assert on it
 * without reading the database.
 */
/** Tell the customer, from whichever of the two populations found them. */
const announce = (row, tickets, sendEmail) => sendEmail({
  customerEmail: addressFor(row),
  customerName: nameFor(row),
  bookingReference: row.booking_reference,
  tickets,
  bookingDetails: { ...(row.booking_details || {}), tickets },
}).catch((error) => ({ success: false, error: error?.message }));

/**
 * Send the e-ticket for a booking whose numbers are already recorded.
 *
 * The send is claimed with a compare-and-set before the mail goes out, so two
 * workers cannot both announce it; a refused send releases the claim and the
 * row is picked up again next tick.
 */
export async function announceOne(row, { sendEmail = sendTicketIssuedEmail } = {}) {
  const reference = row.booking_reference;
  const tickets = (row.booking_details?.tickets || []).filter((t) => t?.number);
  if (tickets.length === 0) return { reference, outcome: 'nothing-to-announce' };

  let claimed = false;
  const written = await patchBookingDetails(reference, (current) => {
    claimed = current.ticket_issued_emailed !== true;
    return claimed ? { ticket_issued_emailed: true } : {};
  });
  if (!written || !claimed) return { reference, outcome: 'already-announced' };

  const sent = await announce(row, tickets, sendEmail);
  if (!sent?.success) {
    log('e-ticket email not sent', { booking: reference, reason: sent?.error });
    await patchBookingDetails(reference, { ticket_issued_emailed: false });
    return { reference, outcome: 'announce-failed', emailed: false };
  }
  return { reference, outcome: 'announced', emailed: true };
}

export async function syncOne(row, { provider = FlightProvider, sendEmail = sendTicketIssuedEmail } = {}) {
  const reference = row.booking_reference;
  const details = row.booking_details || {};
  const pnr = details.pnr;

  let order;
  try {
    const result = await provider.getFlightOrderDetails(pnr);
    order = result?.data;
  } catch (error) {
    // A PNR that cannot be read is not a PNR with no ticket. Purged, cancelled
    // at the airline, or Amadeus unreachable - all of them say "ask again
    // later", and none of them is a reason to write anything.
    log('could not retrieve', { booking: reference, pnr, reason: error?.technicalError || error?.message });
    return { reference, pnr, outcome: 'unreadable' };
  }

  const tickets = withTravellerNames(order);
  if (tickets.length === 0) return { reference, pnr, outcome: 'still-unticketed' };

  // Recorded only once every traveller holds a ticket. Until then nothing is
  // written: the booking stays unticketed, so it stays in front of the alarm,
  // the admin list and this job, and the e-ticket email goes out once, whole.
  const waiting = travellersWithoutTicket(order, tickets);
  if (waiting.length > 0) {
    log('only part of the booking is ticketed; waiting for the rest', {
      booking: reference, pnr, ticketed: tickets.length, travellers: order.travelers.length,
    });
    return { reference, pnr, outcome: 'partially-ticketed', tickets };
  }

  /**
   * Written through the booking's own compare-and-set patch, so a ticket
   * recorded here cannot overwrite something the chain, a cancellation or a
   * queue replay wrote in the meantime - and `emailed` is set in the SAME write
   * that records the tickets. That is what makes the email once-only: two
   * workers, or a restart mid-tick, both read `emailed: false`, both try to
   * write, and only one write lands.
   */
  let claimed = false;
  const written = await patchBookingDetails(reference, (current) => {
    const already = Array.isArray(current.tickets) && current.tickets.length > 0;
    claimed = !already && current.ticket_issued_emailed !== true;
    return {
      tickets,
      gds: { ...(current.gds || {}), ticketed: true },
      ticket_synced_at: new Date().toISOString(),
      ...(claimed ? { ticket_issued_emailed: true } : {}),
    };
  });

  if (!written) {
    log('found a ticket but could not record it', { booking: reference, pnr });
    return { reference, pnr, outcome: 'not-recorded', tickets };
  }

  log('ticket issued', { booking: reference, pnr, tickets: tickets.map((t) => t.number) });

  if (!claimed) return { reference, pnr, outcome: 'recorded', tickets };

  // The email is what the customer was promised, but it is not what makes the
  // booking correct: the numbers are already recorded, so a refused send leaves
  // My Trips, Manage Booking and the PDF all telling the truth.
  const sent = await announce(row, tickets, sendEmail);

  if (!sent?.success) {
    log('e-ticket email not sent', { booking: reference, reason: sent?.error });
    // Let it be sent again next tick rather than leaving a promise unkept.
    await patchBookingDetails(reference, { ticket_issued_emailed: false });
    return { reference, pnr, outcome: 'recorded', tickets, emailed: false };
  }

  return { reference, pnr, outcome: 'recorded', tickets, emailed: true };
}

export async function runOnce({ limit = MAX_PER_TICK, provider = FlightProvider, sendEmail = sendTicketIssuedEmail } = {}) {
  const rows = await findUnticketed({ limit });
  const results = [];
  for (const row of rows) {
    const result = await syncOne(row, { provider, sendEmail });
    results.push(result);
    // When it was asked, and nothing more: not a verdict on the ticket, which
    // is why syncOne itself still writes nothing for these outcomes. It is
    // what puts this booking behind the ones not yet asked (findUnticketed).
    // A stamp that does not land costs one extra turn at the front, no more.
    if (ASKED_NOTHING_FOUND.has(result.outcome)) {
      await patchBookingDetails(row.booking_reference, { ticket_checked_at: new Date().toISOString() });
    }
  }

  // Tickets recorded on an earlier tick whose owner still has not been told -
  // a refused send, or a restart between the write and the mail.
  const owed = await findUnannounced({ limit });
  const announced = [];
  for (const row of owed) {
    announced.push(await announceOne(row, { sendEmail }));
  }

  const ticketed = results.filter((r) => r.outcome === 'recorded').length;
  const told = announced.filter((r) => r.outcome === 'announced').length;
  if (ticketed > 0) log(`recorded ${ticketed} newly issued ticket(s)`);
  if (told > 0) log(`sent ${told} e-ticket email(s)`);
  return { checked: rows.length, ticketed, announced: told, results, owed: announced };
}

export function startTicketSyncJob({ intervalMs = DEFAULT_INTERVAL_MS, env = process.env } = {}) {
  if (!supabase) return { stop: () => {} };

  /**
   * Production only, unless asked for by name.
   *
   * This one SENDS EMAIL TO REAL CUSTOMERS about real bookings. A laptop
   * pointed at the shared database would tell someone their ticket had been
   * issued, or - worse - claim the email for a booking production had not yet
   * announced. "Production" is the stack that names itself so, not NODE_ENV:
   * `npm start` sets NODE_ENV=production, and a laptop started that way has
   * already once acted on the public site's paid checkouts.
   */
  const production = queueEnvironment(env) === 'production';
  if (!production && env.TICKET_SYNC_JOB !== 'true') {
    log('asleep: set TICKET_SYNC_JOB=true to run it outside production');
    return { stop: () => {} };
  }

  // Reading a PNR does not need booking to be enabled - and must not, because
  // booking being off is exactly when every ticket is issued by hand.
  if (providerStatus().enabled === false) {
    log('asleep: the Amadeus provider is turned off');
    return { stop: () => {} };
  }

  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runOnce();
    } catch (error) {
      log('tick failed', { error: error.message });
    } finally {
      running = false;
    }
  };

  const timer = setInterval(tick, intervalMs);
  if (typeof timer.unref === 'function') timer.unref();
  tick();

  log(`started - every ${Math.round(intervalMs / 60000)} min`);
  return { stop: () => clearInterval(timer) };
}
