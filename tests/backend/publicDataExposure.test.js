import { describe, expect, it } from 'vitest';
import { readCode } from '../helpers/source.js';

/**
 * Three unauthenticated requests that returned other customers' records.
 *
 * All three were verified live against production on 16 Sep 2026 with no
 * credentials of any kind, and all three read through config/supabase.js, which
 * holds the SERVICE ROLE key and is therefore not subject to RLS. Migration
 * 20260911000000_fix_bookings_anon_read_rls.sql had already closed this data to
 * the anon role after 27 rows were found readable in production - these routes
 * were the same leak through the front door, where RLS could not reach them.
 */

const read = readCode;

/**
 * `GET /api/hotels/bookings` and `GET /api/cruises/bookings` answered
 * `select('*')` on every row of their travel type - `passenger_details`,
 * `customer_email`, `total_amount`, and `booking_details`, which carries the
 * ARC `success_indicator`: the single secret that authorises
 * `?action=get-pending-booking` for that reference.
 *
 * No page has ever called them. The frontend only POSTs to these paths.
 */
describe('the booking list endpoints', () => {
  for (const [name, file] of [
    ['hotel', 'backend/routes/hotel.routes.js'],
    ['cruise', 'backend/routes/cruise.routes.js'],
  ]) {
    it(`requires a signed-in admin before listing ${name} bookings`, () => {
      expect(read(file)).toMatch(/router\.get\('\/bookings', protect, admin, async/);
    });

    it(`imports the guards it uses (${name})`, () => {
      expect(read(file)).toMatch(/import \{ protect, admin \} from '\.\.\/middleware\/auth\.middleware\.js'/);
    });
  }
});

/**
 * `GET /api/visa/applications/track` is public by design - a customer tracks
 * their application by reference or email. Two bugs made it a dump of every
 * applicant on the system.
 */
describe('the public visa tracker', () => {
  const model = read('backend/models/visa.model.js');
  const controller = read('backend/controllers/visa.controller.js');

  /**
   * `%` and `_` are LIKE wildcards, and `ilike` was given the address with only
   * `.trim()`. `?email=%` matched every row.
   */
  it('escapes the wildcards in an email before matching it', () => {
    expect(model).toMatch(/\.ilike\("personal_info->>email", email\.trim\(\)\.replace\(/);
  });

  /**
   * The email branch returned the raw rows - every column, `personal_info`
   * (passport number, date of birth, nationality) and `documents` included -
   * bypassing the public-safe projection the rest of the handler exists to
   * apply.
   */
  it('no longer answers with raw rows', () => {
    expect(controller).not.toMatch(/multiple: true/);
    expect(controller).not.toMatch(/data: application,\s*\}\);\s*\}\s*\}/);
  });

  it('projects an email match the same way as a reference match', () => {
    expect(controller).toMatch(/const results = await VisaApplication\.findByEmail\(email\);\s*\n\s*application = results\[0\] \|\| null;/);
  });

  // The projection itself: what a public tracker may say, and what it may not.
  it('still answers a genuine lookup with the public fields', () => {
    expect(controller).toMatch(/applicationRef: application\.application_ref/);
    expect(controller).toMatch(/applicantName: `\$\{application\.personal_info\?\.firstName/);
  });

  it('never hands back the whole row from the public tracker', () => {
    // Scoped to trackApplication: the ADMIN detail endpoint further down does
    // return the full row, and should.
    const start = controller.indexOf('export const trackApplication');
    const tracker = controller.slice(start, controller.indexOf('export const', start + 10));

    expect(tracker).not.toMatch(/data: application,/);
    expect(tracker).not.toMatch(/personal_info: /);
  });
});

/**
 * The same escaping, on the reference path. `_` and `%` are wildcards there
 * too, so `?ref=VISA-2026-0000_1` probed which references exist and returned
 * that applicant's record.
 */
describe('the application detail endpoint', () => {
  const controller = read('backend/controllers/visa.controller.js');

  /**
   * The only guard was agent-specific, and the route is `optionalProtect` -
   * which never rejects - so a caller with no session received the whole row:
   * passport number, date of birth, documents. Its own docstring has always
   * said "admin or authenticated owner".
   */
  it('lets in staff or the applicant, and nobody else', () => {
    expect(controller).toMatch(/const isStaff = role === 'admin' \|\| role === 'superadmin' \|\| role === 'agent'/);
    expect(controller).toMatch(/const isOwner = Boolean\(callerId\) && String\(application\.user_id \|\| ''\) === String\(callerId\)/);
    expect(controller).toMatch(/if \(!isStaff && !isOwner\) \{/);
  });

  it('still keeps an agent to their own assignments', () => {
    expect(controller).toMatch(/role === 'agent' && String\(application\.assigned_agent \|\| ''\) !== String\(req\.user\.id\)/);
  });
});

describe('the reference lookup', () => {
  it('escapes wildcards in a reference', () => {
    expect(read('backend/models/visa.model.js')).toMatch(/\.ilike\("application_ref", ref\.trim\(\)\.replace\(/);
  });
});
