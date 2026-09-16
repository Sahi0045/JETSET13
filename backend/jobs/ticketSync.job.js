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
export async function findUnticketed({ limit = MAX_PER_TICK } = {}) {
  const { data, error } = await supabase
    .from('bookings')
    .select('booking_reference, status, payment_status, booking_details, created_at')
    .in('payment_status', PAID)
    .not('booking_details->>pnr', 'is', null)
    .order('created_at', { ascending: true })
    .limit(limit * 5);

  if (error) throw new Error(`could not read bookings: ${error.message}`);

  return (data || [])
    .filter((row) => !CLOSED.includes(String(row.status || '').toLowerCase()))
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
 * Ask Amadeus whether this PNR has a ticket yet, and record it if it does.
 *
 * Returns what happened, so a tick can be reported and a test can assert on it
 * without reading the database.
 */
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
  const sent = await sendEmail({
    customerEmail: details.contactInfo?.email || details.customerEmail || details.email,
    customerName: details.customerName || details.contactInfo?.name,
    bookingReference: reference,
    tickets,
    bookingDetails: { ...details, tickets },
  }).catch((error) => ({ success: false, error: error?.message }));

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
  if (rows.length === 0) return { checked: 0, ticketed: 0 };

  const results = [];
  for (const row of rows) {
    results.push(await syncOne(row, { provider, sendEmail }));
  }

  const ticketed = results.filter((r) => r.outcome === 'recorded').length;
  if (ticketed > 0) log(`recorded ${ticketed} newly issued ticket(s)`);
  return { checked: rows.length, ticketed, results };
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
