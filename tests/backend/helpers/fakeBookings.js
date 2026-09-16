/**
 * tests/backend/helpers/fakeBookings.js
 *
 * A bookings table in memory, behind the slice of the Supabase query builder
 * the order and checkout routes use. Unlike a chain that answers every query
 * with one canned row, it applies `eq` / `is` / `neq` filters - JSON arrow
 * paths included - and an UPDATE changes only the rows its filters match. So a
 * compare-and-set claim really can be lost, and a test can read back what the
 * route wrote.
 *
 * `ilike` without wildcards is a case-insensitive equality, the way the routes
 * use it for email addresses (escaped `\%`, `\_` and `\\` are unescaped).
 *
 * Deliberately small: `or`, `order`, `limit`, `gte` and `lte` are accepted and
 * ignored, and `insert` / `upsert` write nothing (routes that
 * insert fall back to updating the row checkout created, which is what these
 * tests exercise).
 *
 * Options:
 *  - `tables`: other tables by name, e.g. `{ feature_flags: [...] }`; any
 *    name not listed reads the bookings table;
 *  - `fail({ table, filters, patch })`: return true to answer that query with
 *    a database error.
 */

const clone = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

/** `booking_details->confirmation_email->>claimed_at` -> the value at that path. */
const valueAt = (row, column) => column
  .split(/->>?/)
  .reduce((value, key) => (value === null || value === undefined ? undefined : value[key]), row);

const passes = (row, [op, column, expected]) => {
  // `or` and `not` carry clauses rather than a column, so they are answered
  // before any attempt to read one.
  if (op === 'or') return expected.some((clause) => passes(row, clause));
  if (op === 'not') return !passes(row, expected);
  if (op === 'unsupported') return false;
  const actual = valueAt(row, column);
  switch (op) {
    case 'eq': return actual !== undefined && actual !== null && String(actual) === String(expected);
    case 'neq': return String(actual) !== String(expected);
    case 'is': return expected === null ? actual === null || actual === undefined : actual === expected;
    case 'ilike': return actual !== undefined && actual !== null
      && String(actual).toLowerCase() === String(expected).replace(/\\([\\%_])/g, '$1').toLowerCase();
    default: return true;
  }
};

/**
 * PostgREST's `or` string, as the routes write it:
 *   `booking_reference.eq.FLT1,booking_details->>order_id.eq.FLT1`
 *
 * This was in the ignored list, which made it a no-op - and `.or()` is how
 * `loadOwnedBooking`, `refundOnFulfillmentFailure` and the DELETE fallback find
 * a booking at all. With it ignored those queries carried no filter and the
 * double returned the FIRST row in the table whatever reference was asked for,
 * so every "a different reference is refused" assertion across 17 test files
 * passed without testing anything.
 *
 * Splitting on commas is enough for the shapes this codebase writes; a value
 * containing a comma would need the real grammar, and none do.
 */
const parseOr = (expression) => String(expression || '')
  .split(',')
  .map((clause) => clause.trim())
  .filter(Boolean)
  .map((clause) => {
    // `column.not.is.null` - PostgREST puts the negation between the column and
    // the operator. Without this branch the lazy `(.+?)` swallowed `.not` into
    // the column name, `valueAt` then walked a path that does not exist and
    // returned undefined, and `is null` answered TRUE for every row - so
    // `needs_review.not.is.null`, which is how the needs-review alarm selects
    // the bookings it is about, matched bookings that had never been flagged.
    const match = /^(.+?)\.(not\.)?(eq|neq|is|ilike)\.(.*)$/.exec(clause);
    if (!match) {
      // Fail CLOSED, and say so. A clause this helper cannot parse used to be
      // dropped, which left the `or` with nothing to filter on and returned the
      // whole table - so a test asserting "the wrong reference is refused"
      // passed while the query matched everything. A clause that matches
      // nothing makes such a test go red instead, which is the honest direction
      // to be wrong in.
      console.warn(`fakeBookings: .or() clause "${clause}" is not understood; treating it as no match. `
        + 'Add it to parseOr if a test needs it.');
      return ['unsupported', null, clause];
    }
    const [, column, negated, op, value] = match;
    const parsed = [op, column, value === 'null' ? null : value];
    return negated ? ['not', null, parsed] : parsed;
  });

export function fakeBookingsTable(rows = [], { tables = {}, fail } = {}) {
  const table = rows.map(clone);
  const others = Object.fromEntries(Object.entries(tables).map(([name, list]) => [name, list.map(clone)]));
  const writes = [];

  const from = (name = 'bookings') => {
    const target = Object.prototype.hasOwnProperty.call(others, name) ? others[name] : table;
    const filters = [];
    let patch = null;

    const run = () => {
      if (fail?.({ table: name, filters: [...filters], patch })) {
        return { data: null, error: { message: 'connection reset' } };
      }
      const matched = target.filter((row) => filters.every((filter) => passes(row, filter)));
      if (patch) {
        for (const row of matched) Object.assign(row, clone(patch));
        writes.push({ table: name, patch: clone(patch), filters: [...filters], matched: matched.length });
      }
      return { data: matched.map(clone), error: null };
    };

    const chain = {};
    for (const op of ['eq', 'neq', 'is', 'ilike']) {
      chain[op] = (column, value) => { filters.push([op, column, value]); return chain; };
    }
    // `.filter(column, 'eq', value)` is the long form of `.eq`, which the cancel
    // handler uses to find a booking by its order id or PNR.
    chain.filter = (column, op, value) => { filters.push([op, column, value]); return chain; };
    // `.or()` really filters now - see parseOr. An UPDATE never carries one
    // (PostgREST rejects arrow paths inside `or` on an update, which is why
    // unchangedSince keeps them in `.eq`/`.is`), so this only narrows reads.
    chain.or = (expression) => {
      const clauses = parseOr(expression);
      if (clauses.length > 0) filters.push(['or', null, clauses]);
      return chain;
    };
    for (const ignored of ['select', 'not', 'order', 'limit', 'insert', 'upsert', 'delete', 'gte', 'lte']) {
      chain[ignored] = () => chain;
    }
    chain.update = (value) => { patch = value; return chain; };
    chain.single = async () => {
      const { data, error } = run();
      if (error) return { data: null, error };
      return data.length ? { data: data[0], error: null } : { data: null, error: { code: 'PGRST116', message: 'no rows' } };
    };
    chain.maybeSingle = async () => {
      const { data, error } = run();
      return error ? { data: null, error } : { data: data[0] ?? null, error: null };
    };
    chain.then = (resolve, reject) => {
      try {
        resolve(run());
      } catch (error) {
        reject(error);
      }
    };
    return chain;
  };

  return {
    from,
    table,
    writes,
    row: (bookingReference) => table.find((row) => row.booking_reference === bookingReference),
  };
}
