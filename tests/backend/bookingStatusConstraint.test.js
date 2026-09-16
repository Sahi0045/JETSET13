import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildBookingRow } from '../../backend/routes/flight.routes.js';

/**
 * Every status the code writes must be one the database allows.
 *
 * `buildBookingRow` writes `pending_ticketing` for a committed PNR with no
 * ticket, and the bookings CHECK constraint did not list it. Confirmed against
 * the production table on 2026-09-16 - `pg_get_constraintdef(...) like
 * '%pending_ticketing%'` returned false - so every held or queued booking was
 * rejected with 23514, `saveBookingToDatabase` returned null, and the order
 * route still answered success:true with savedToDatabase:false.
 *
 * Nothing caught it. `bookingSave.test.js` asserts the status is
 * `pending_ticketing`, which is true and useless on its own: it pins what the
 * code writes without ever asking whether the schema accepts it. The two were
 * only ever compared by hand.
 *
 * This reads the allowed set out of the migrations - the same DDL that is
 * applied to the database - and checks the real function's output against it.
 * It is not a replica of either side: change the code's status without the
 * migration, or the migration without the code, and it fails.
 */

const MIGRATIONS = new URL('../../backend/migrations/', import.meta.url);

const valuesIn = (list) => new Set([...list.matchAll(/'([^']+)'/g)].map((m) => m[1]));

/**
 * The status values the schema allows, as the migrations define them.
 *
 * An `ALTER TABLE ... ADD CONSTRAINT bookings_status_check` replaces whatever
 * `CREATE TABLE` first declared, so an ALTER always wins over the create -
 * filename order cannot decide it, because `create_bookings_table.sql` sorts
 * after every `add_*.sql` that amends it. Among ALTERs the last by filename
 * wins, which is the order they are applied by hand (see CLAUDE.md: migrations
 * are not auto-applied).
 */
const allowedStatuses = () => {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
  let fromCreate = null;
  let fromAlter = null;
  for (const file of files) {
    const sql = readFileSync(new URL(file, MIGRATIONS), 'utf8');
    const altered = /ADD\s+CONSTRAINT\s+bookings_status_check\s*CHECK\s*\(\s*status\s+IN\s*\(([^)]*)\)/i.exec(sql);
    if (altered) fromAlter = valuesIn(altered[1]);
    const created = /CREATE TABLE[^;]*?\bbookings\b[\s\S]*?\bstatus\b[^,]*?CHECK\s*\(\s*status\s+IN\s*\(([^)]*)\)/i.exec(sql);
    if (created && !fromCreate) fromCreate = valuesIn(created[1]);
  }
  return fromAlter ?? fromCreate;
};

const bookingData = (over = {}) => ({
  bookingReference: 'BK-CONSTRAINT-1',
  pnr: 'ABC123',
  orderId: 'ORD-1',
  totalAmount: '350.50',
  currency: 'USD',
  origin: 'JFK',
  destination: 'LAX',
  departureDate: '2026-03-15',
  airline: 'AA',
  flightNumber: 'AA100',
  passengerDetails: [{ firstName: 'John', lastName: 'Doe' }],
  ...over,
});

describe('bookings status constraint', () => {
  it('is defined by a migration the repo actually carries', () => {
    expect(allowedStatuses(), 'no bookings status CHECK found in backend/migrations').toBeTruthy();
  });

  // The bug, exactly: the code wrote a status the schema forbade.
  it('allows the status a committed but unticketed booking is saved with', () => {
    const row = buildBookingRow(bookingData(), null);

    expect(row.status).toBe('pending_ticketing');
    expect(allowedStatuses()).toContain(row.status);
  });

  it('allows the status a ticketed booking is saved with', () => {
    const row = buildBookingRow(bookingData({ ticketed: true, tickets: ['220-123'] }), null);

    expect(allowedStatuses()).toContain(row.status);
  });

  // flagForReview writes the same pair against a booking under review.
  it('allows both statuses the review path writes', () => {
    const allowed = allowedStatuses();
    for (const status of ['confirmed', 'pending_ticketing']) {
      expect(allowed, status).toContain(status);
    }
  });

  // Checkout creates the row before payment; cancellation closes it.
  it('allows the statuses checkout and cancellation write', () => {
    const allowed = allowedStatuses();
    for (const status of ['pending', 'cancelled']) {
      expect(allowed, status).toContain(status);
    }
  });
});
