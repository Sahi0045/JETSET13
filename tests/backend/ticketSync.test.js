import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A ticket issued by hand, and the customer finally told.
 *
 * A reservation is not a ticket. The chain commits a PNR - a held seat and a
 * six-letter code - and issuance is a separate step producing the 13-digit
 * number you actually fly on. With AMADEUS_WS_AUTO_TICKET off, which is every
 * booking so far, a person does that step in the Amadeus terminal.
 *
 * Nothing came back to say so. `booking_details.tickets` was written in three
 * places, all during the original order request, and never again: no route
 * accepted a ticket number and no job asked for one. Every customer-facing
 * surface reads that one field, so a customer holding a valid ticket was told
 * by My Trips, by Manage Booking and by the PDF that they had none - "not a
 * ticket... do not travel on this document alone" - and the e-ticket email
 * three surfaces promised had no sender in the codebase at all.
 */

/**
 * A ticket in the shape Amadeus actually files it.
 *
 * NOT `{ number, travelerName }` - that shape does not exist. `readTickets`
 * returns the number, the PNR passenger reference it belongs to, the validating
 * carrier and the issue date, and no name at all. The first version of these
 * tests invented `travelerName`, so they passed while the email would have
 * addressed every ticket to "Traveller". The names live on the PNR's own
 * traveller list, and the job joins the two.
 */
const ticket = (number, travelerId) => ({
  number,
  travelerId,
  validatingCarrier: '057',
  issuedOn: '2026-09-16',
});

/** A retrieved PNR as `retrieveBooking` builds it: tickets here, names there. */
const retrieved = (tickets, travelers = []) => ({ tickets, travelers });

const traveller = (id, firstName, lastName) => ({ id, name: { firstName, lastName } });

const bookingRow = (details = {}) => ({
  booking_reference: 'FLT-1',
  status: 'confirmed',
  payment_status: 'paid',
  created_at: '2026-09-01T00:00:00Z',
  booking_details: {
    pnr: 'BEEDS3',
    contactInfo: { email: 'flyer@example.com' },
    customerName: 'Asha Rao',
    gds: { ticketed: false },
    ...details,
  },
});

/**
 * A stand-in for patchBookingDetails that behaves like the real one: it reads
 * the booking's CURRENT details, hands them to a function-form patch, and
 * merges the result over them.
 *
 * The first version of this seeded from a hardcoded object instead of the row
 * under test, so the job looked like it was dropping the rest of `gds` when it
 * was the double dropping it. A copy of a thing is not the thing.
 */
let patched;
let patchFails;
let stored;

vi.mock('../../backend/routes/flight.routes.js', () => ({
  patchBookingDetails: vi.fn(async (reference, patch) => {
    if (patchFails) return null;
    const changes = typeof patch === 'function' ? patch(stored) : patch;
    stored = { ...stored, ...changes };
    patched.push({ reference, changes, after: stored });
    return [{ booking_reference: reference }];
  }),
}));

const providerWith = (tickets, { throws = null, travelers = [] } = {}) => ({
  getFlightOrderDetails: vi.fn(async () => {
    if (throws) throw throws;
    return { success: true, data: retrieved(tickets, travelers), pnr: 'BEEDS3' };
  }),
});

const sentOk = () => vi.fn(async () => ({ success: true }));

let job;
let findUnticketed;

/** Sync a row against a database that holds exactly that row's details. */
const syncOne = (row, opts) => {
  if (stored === null) stored = { ...row.booking_details };
  return job.syncOne(row, opts);
};

beforeEach(async () => {
  patched = [];
  patchFails = false;
  stored = null;
  job = await import('../../backend/jobs/ticketSync.job.js');
  ({ findUnticketed } = job);
});

describe('a PNR that has since been ticketed', () => {
  it('records the ticket number on the booking', async () => {
    const result = await syncOne(bookingRow(), {
      provider: providerWith([ticket('220-7491174929', '1')], { travelers: [traveller('1', 'ASHA', 'RAO')] }),
      sendEmail: sentOk(),
    });

    expect(result.outcome).toBe('recorded');
    expect(patched[0].changes.tickets).toEqual([{ ...ticket('220-7491174929', '1'), travelerName: 'RAO/ASHA' }]);
  });

  /**
   * `gds.ticketed` is what My Trips, the ticket cell and the PDF's "this is not
   * a ticket" warning all read. Recording the number without flipping it would
   * leave every surface still saying the customer has nothing.
   */
  it('marks the booking ticketed, which is what every surface reads', async () => {
    await syncOne(bookingRow(), { provider: providerWith([ticket('220-1')]), sendEmail: sentOk() });

    expect(patched[0].changes.gds.ticketed).toBe(true);
  });

  it('keeps the rest of the gds record rather than replacing it', async () => {
    await syncOne(bookingRow({ gds: { ticketed: false, queued: true, wsap: '1ASIWJETJEC' } }), {
      provider: providerWith([ticket('220-1')]),
      sendEmail: sentOk(),
    });

    expect(patched[0].changes.gds).toMatchObject({ ticketed: true, queued: true, wsap: '1ASIWJETJEC' });
  });

  it('sends the e-ticket email that three surfaces promised', async () => {
    const sendEmail = sentOk();
    await syncOne(bookingRow(), { provider: providerWith([ticket('220-1', '1')]), sendEmail });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0]).toMatchObject({
      customerEmail: 'flyer@example.com',
      bookingReference: 'FLT-1',
    });
    expect(sendEmail.mock.calls[0][0].tickets).toHaveLength(1);
  });

  /**
   * The claim is decided inside the same compare-and-set write that records the
   * tickets. Two workers, or a restart mid-tick, both read the booking with no
   * tickets - only one write lands, and only that one sends.
   */
  it('emails once, however many times it runs', async () => {
    const provider = providerWith([ticket('220-1')]);
    const sendEmail = sentOk();
    const row = bookingRow();

    await syncOne(row, { provider, sendEmail });
    await syncOne(row, { provider, sendEmail });

    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  /**
   * The numbers are recorded before the email is attempted, so a refused send
   * still leaves My Trips, Manage Booking and the PDF telling the truth - and
   * the promise is retried rather than quietly dropped.
   */
  it('keeps the ticket recorded when the email is refused, and lets it retry', async () => {
    const result = await syncOne(bookingRow(), {
      provider: providerWith([ticket('220-1')]),
      sendEmail: vi.fn(async () => ({ success: false, error: 'mailbox full' })),
    });

    expect(result.outcome).toBe('recorded');
    expect(patched[0].changes.tickets).toHaveLength(1);
    expect(patched.at(-1).changes.ticket_issued_emailed).toBe(false);
  });

  it('does not claim the email was sent when the write did not land', async () => {
    patchFails = true;
    const sendEmail = sentOk();

    const result = await syncOne(bookingRow(), { provider: providerWith([ticket('220-1')]), sendEmail });

    expect(result.outcome).toBe('not-recorded');
    expect(sendEmail).not.toHaveBeenCalled();
  });
});

describe('a PNR with no ticket yet', () => {
  it('writes nothing and sends nothing', async () => {
    const sendEmail = sentOk();
    const result = await syncOne(bookingRow(), { provider: providerWith([]), sendEmail });

    expect(result.outcome).toBe('still-unticketed');
    expect(patched).toEqual([]);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  /**
   * A PNR that cannot be read is not a PNR with no ticket. Purged, cancelled at
   * the airline, or Amadeus unreachable - each says "ask again later", and none
   * of them is a reason to write anything.
   */
  it('treats a failed retrieve as unknown, not as unticketed', async () => {
    const result = await syncOne(bookingRow(), {
      provider: providerWith(null, { throws: Object.assign(new Error('Booking not found'), { code: 404 }) }),
      sendEmail: sentOk(),
    });

    expect(result.outcome).toBe('unreadable');
    expect(patched).toEqual([]);
  });

  it('ignores a ticket entry carrying no number', async () => {
    const result = await syncOne(bookingRow(), {
      provider: providerWith([{ travelerId: '1' }]),
      sendEmail: sentOk(),
    });

    expect(result.outcome).toBe('still-unticketed');
  });
});

describe('which bookings are asked about', () => {
  const rowsFrom = (list) => {
    const chain = {
      select: () => chain,
      in: () => chain,
      not: () => chain,
      or: () => chain,
      eq: () => chain,
      neq: () => chain,
      order: () => chain,
      limit: async () => ({ data: list, error: null }),
      then: (resolve) => resolve({ data: list, error: null }),
    };
    return chain;
  };

  const ask = async (list) => {
    const supabase = (await import('../../backend/config/supabase.js')).default;
    supabase.from.mockImplementation(() => rowsFrom(list));
    return findUnticketed({ limit: 10 });
  };

  it('asks about a paid booking with a PNR and no ticket', async () => {
    expect(await ask([bookingRow()])).toHaveLength(1);
  });

  it('leaves alone a booking that already has its ticket number', async () => {
    expect(await ask([bookingRow({ tickets: [ticket('220-1')] })])).toEqual([]);
  });

  it('leaves alone a booking already marked ticketed', async () => {
    expect(await ask([bookingRow({ gds: { ticketed: true } })])).toEqual([]);
  });

  // Its tickets are voided; there is nothing to find and nothing to announce.
  it('leaves a cancelled booking alone', async () => {
    const cancelled = { ...bookingRow(), status: 'cancelled' };
    expect(await ask([cancelled])).toEqual([]);
  });

  it('leaves alone a row with no PNR at all', async () => {
    expect(await ask([bookingRow({ pnr: null })])).toEqual([]);
  });

  /**
   * Each retrieve is a live Amadeus call taking a semaphore permit, and search
   * shares that pool with paying customers.
   */
  it('takes no more than it was asked for', async () => {
    const many = Array.from({ length: 40 }, () => bookingRow());
    const supabase = (await import('../../backend/config/supabase.js')).default;
    supabase.from.mockImplementation(() => rowsFrom(many));

    expect(await findUnticketed({ limit: 10 })).toHaveLength(10);
  });
});

/**
 * The join, against a real PNR rather than objects I made up.
 *
 * This is the fixture recorded from the live WSAP on 2026-09-15: two adults, a
 * child and an infant on a lap, with the references Amadeus actually assigned -
 * the child 5, the man 2, the infant on him also 2, the woman 4. A ticket
 * carries only that reference; the names are on the PNR's traveller list.
 *
 * The first version of the email read `ticket.travelerName`, a field that is
 * never filed, so a family of three would have received three numbers all
 * labelled "Traveller" - useless at the one moment the label matters.
 */
describe('naming a ticket from a real PNR', () => {
  const load = async () => {
    const { readFileSync } = await import('node:fs');
    const { parseSoap, unwrapEnvelope } = await import('../../backend/services/amadeusSoap/parseXml.js');
    const { buildFlightOrder } = await import('../../backend/services/amadeusSoap/mappers/flightOrder.js');
    const xml = readFileSync(new URL('../fixtures/amadeus/pnr-add-elements-infant-family.xml', import.meta.url), 'utf8')
      .replace('PROBE MS', 'EVE MS');
    const { body } = unwrapEnvelope(parseSoap(xml));
    const reply = body[Object.keys(body).find((k) => k !== 'Fault')];
    const fa = (freetext, passengerRef) => ({
      elementManagementData: { segmentName: 'FA' },
      referenceForDataElement: { reference: [{ qualifier: 'PT', number: passengerRef }, { qualifier: 'ST', number: '1' }] },
      otherDataFreetext: { longFreetext: freetext },
    });
    return buildFlightOrder({
      ...reply,
      dataElementsMaster: {
        dataElementsIndiv: [
          fa('PAX 057-1000000001/ETAI/USD120.00/15SEP26/SCK1S2400/12345678', '2'),
          fa('PAX 057-2000000002/ETAI/USD120.00/15SEP26/SCK1S2400/12345678', '4'),
          fa('PAX 057-5000000005/ETAI/USD90.00/15SEP26/SCK1S2400/12345678', '5'),
        ],
      },
    }, { flightOffers: [] });
  };

  it('gives every ticket the name of whoever holds it', async () => {
    const named = job.withTravellerNames(await load());

    expect(named).toHaveLength(3);
    for (const ticketed of named) expect(ticketed.travelerName, ticketed.number).toBeTruthy();
    expect(new Set(named.map((t) => t.travelerName)).size).toBe(3);
  });

  it('matches by the PNR reference, not by the order the tickets arrive in', async () => {
    const named = job.withTravellerNames(await load());
    const byNumber = Object.fromEntries(named.map((t) => [t.number, t.travelerName]));

    // Reference 5 is the child, 4 the woman, 2 the man - deliberately not 1,2,3.
    expect(byNumber['057-5000000005']).not.toBe(byNumber['057-1000000001']);
    expect(byNumber['057-2000000002']).not.toBe(byNumber['057-1000000001']);
  });

  it('keeps a ticket whose holder cannot be matched, rather than dropping it', () => {
    const orphan = job.withTravellerNames({ tickets: [{ number: '057-9', travelerId: '99' }], travelers: [] });

    expect(orphan).toEqual([{ number: '057-9', travelerId: '99' }]);
  });
});

/**
 * Where the address actually lives.
 *
 * The first version of this job read `contactInfo.email`, `customerEmail` and
 * `email`. Checked against live rows on 16 Sep, NOT ONE of those keys is ever
 * written for a flight booking: checkout stores `booking_details.customer_email`
 * and the lead traveller's own address sits on `passenger_details`. So the
 * e-ticket email would have failed with "No email address" on every single
 * booking - the promise it exists to keep could not have been kept once.
 *
 * The tests passed anyway, because they fed the shape the code expected. Which
 * is the same way the invented `travelerName` got through, in this same file.
 */
describe('finding the customer to write to', () => {
  const rowWith = (details, passengers) => ({
    booking_reference: 'FLT-1', booking_details: details, passenger_details: passengers,
  });

  it('reads customer_email, which is what checkout writes', () => {
    expect(job.addressFor(rowWith({ customer_email: 'flyer@example.com' }))).toBe('flyer@example.com');
  });

  it('falls back to the lead traveller on passenger_details', () => {
    expect(job.addressFor(rowWith({}, [{ email: 'lead@example.com' }, { email: 'second@example.com' }])))
      .toBe('lead@example.com');
  });

  it('finds nobody rather than inventing an address', () => {
    expect(job.addressFor(rowWith({}, []))).toBeNull();
    expect(job.addressFor(rowWith({ customer_email: '   ' }, []))).toBeNull();
  });

  it('names the traveller from the details that exist', () => {
    expect(job.nameFor(rowWith({}, [{ firstName: 'Asha', lastName: 'Rao' }]))).toBe('Asha Rao');
  });

  /**
   * The shape of a real row, copied from production on 16 Sep rather than
   * imagined: customer_email set, passenger_details carrying the same person,
   * and none of the three keys the first version looked for.
   */
  it('handles a booking row shaped the way production actually shapes one', () => {
    const real = rowWith(
      { pnr: 'BEEDS3', customer_email: 'flyer@example.com', gds: { ticketed: false } },
      [{ firstName: 'Asha', lastName: 'Rao', email: 'flyer@example.com' }],
    );

    expect(job.addressFor(real)).toBe('flyer@example.com');
    expect(job.nameFor(real)).toBe('Asha Rao');
  });
});

/**
 * The retry that could never run.
 *
 * `syncOne` writes the ticket numbers and then, on a refused send, set
 * `ticket_issued_emailed: false` "so it can be sent again next tick". But
 * `findUnticketed` drops any row that HAS tickets - so the moment the numbers
 * were written the row was never selected again. There was no next tick, and a
 * customer whose email bounced once was never told at all.
 */
describe('a ticket recorded but not yet announced', () => {
  const recorded = () => ({
    booking_reference: 'FLT-1',
    status: 'confirmed',
    payment_status: 'paid',
    booking_details: {
      pnr: 'BEEDS3', customer_email: 'flyer@example.com',
      tickets: [ticket('220-1', '1')], ticket_synced_at: '2026-09-16T10:00:00Z',
      gds: { ticketed: true },
    },
    passenger_details: [{ firstName: 'Asha', lastName: 'Rao' }],
  });

  it('is sent, and the send is claimed first', async () => {
    stored = { ...recorded().booking_details };
    const sendEmail = sentOk();

    const result = await job.announceOne(recorded(), { sendEmail });

    expect(result.outcome).toBe('announced');
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail.mock.calls[0][0].customerEmail).toBe('flyer@example.com');
  });

  it('is announced once, however many workers find it', async () => {
    stored = { ...recorded().booking_details };
    const sendEmail = sentOk();

    await job.announceOne(recorded(), { sendEmail });
    await job.announceOne(recorded(), { sendEmail });

    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it('releases the claim when the send is refused, so it runs again', async () => {
    stored = { ...recorded().booking_details };

    const result = await job.announceOne(recorded(), {
      sendEmail: vi.fn(async () => ({ success: false, error: 'mailbox full' })),
    });

    expect(result.outcome).toBe('announce-failed');
    expect(patched.at(-1).changes.ticket_issued_emailed).toBe(false);
  });
});

/**
 * The window has to be able to reach a new booking.
 *
 * `findUnticketed` narrowed only in JavaScript: the query asked for every paid
 * booking with a PNR, oldest first, capped - so once about fifty already-done
 * rows existed, the window was permanently full of them, the JS filter emptied
 * it, and a newly ticketed booking was never seen. No error, no log, `checked:
 * 0` for ever. The paid-but-not-ticketed alarm gets this right and this job was
 * written from it; the clause was dropped on the way across.
 */
describe('the query window', () => {
  const asked = [];
  const chainFor = (rows) => {
    const c = {
      select: () => c,
      in: (...a) => { asked.push(['in', ...a]); return c; },
      not: (...a) => { asked.push(['not', ...a]); return c; },
      or: (...a) => { asked.push(['or', ...a]); return c; },
      eq: (...a) => { asked.push(['eq', ...a]); return c; },
      neq: (...a) => { asked.push(['neq', ...a]); return c; },
      order: () => c,
      limit: async () => ({ data: rows, error: null }),
      then: (resolve) => resolve({ data: rows, error: null }),
    };
    return c;
  };
  const ask = async (fn, rows = []) => {
    asked.length = 0;
    const supabase = (await import('../../backend/config/supabase.js')).default;
    supabase.from.mockImplementation(() => chainFor(rows));
    await fn({ limit: 10 });
    return asked;
  };

  it('asks the database for unticketed rows, not for all of them', async () => {
    const filters = await ask(job.findUnticketed);
    const clause = filters.find(([op]) => op === 'or')?.[1] || '';

    expect(clause).toMatch(/gds->>ticketed/);
  });

  /**
   * Of 21 live rows with a PNR, SIX carry no readable `ticketed` state - one
   * with no `gds` object, five with `gds` and no key. `->>` yields NULL there,
   * and `eq 'false'` on NULL is NULL, so a plain equality would skip exactly
   * the rows this job is for.
   */
  it('counts a missing ticketed flag as unticketed', async () => {
    const filters = await ask(job.findUnticketed);
    const clause = filters.find(([op]) => op === 'or')?.[1] || '';

    expect(clause).toMatch(/gds->>ticketed\.is\.null/);
    expect(clause).toMatch(/gds->>ticketed\.eq\.false/);
  });

  it('asks only for tickets nobody has been told about', async () => {
    const filters = await ask(job.findUnannounced);
    const clause = filters.find(([op]) => op === 'or')?.[1] || '';

    expect(clause).toMatch(/ticket_issued_emailed\.is\.null/);
    expect(clause).toMatch(/ticket_issued_emailed\.eq\.false/);
  });

  it('still asks only about its own stamped rows', async () => {
    const filters = await ask(job.findUnannounced);

    expect(filters).toContainEqual(['not', 'booking_details->>ticket_synced_at', 'is', null]);
  });
});
