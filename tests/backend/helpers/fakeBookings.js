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
  // `and(a,b)` inside an `or`. Without this the group was split on its inner
  // comma and its halves parsed as separate clauses - the last of which ended
  // `null)`, which is not the string `null`, so `is` never matched, `not`
  // inverted it, and the whole `or` answered TRUE for every row. That is the
  // live paid-but-not-ticketed alarm's filter, so its test could not fail.
  if (op === 'and') return expected.every((clause) => passes(row, clause));
  if (op === 'not') return !passes(row, expected);
  if (op === 'unsupported') return false;
  const actual = valueAt(row, column);
  switch (op) {
    case 'eq': return actual !== undefined && actual !== null && String(actual) === String(expected);
    case 'neq': return String(actual) !== String(expected);
    case 'is': return expected === null ? actual === null || actual === undefined : actual === expected;
    case 'ilike': return actual !== undefined && actual !== null
      && String(actual).toLowerCase() === String(expected).replace(/\\([\\%_])/g, '$1').toLowerCase();
    case 'gte': return actual !== undefined && actual !== null && actual >= expected;
    case 'lte': return actual !== undefined && actual !== null && actual <= expected;
    case 'gt': return actual !== undefined && actual !== null && actual > expected;
    case 'lt': return actual !== undefined && actual !== null && actual < expected;
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
/** Split on commas that are not inside a bracketed group. */
const splitTop = (expression) => {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of String(expression || '')) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) { parts.push(current); current = ''; continue; }
    current += ch;
  }
  parts.push(current);
  return parts;
};

const parseClause = (raw) => {
  const clause = String(raw).trim();
  const group = /^(and|or)\((.*)\)$/.exec(clause);
  if (group) return [group[1], null, splitTop(group[2]).map(parseClause).filter(Boolean)];
  return parseLeaf(clause);
};

const parseOr = (expression) => splitTop(expression)
  .map((clause) => clause.trim())
  .filter(Boolean)
  .map(parseClause);

const parseLeaf = (clause) => {
  {
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
  }
};

export function fakeBookingsTable(rows = [], { tables = {}, fail } = {}) {
  const table = rows.map(clone);
  const others = Object.fromEntries(Object.entries(tables).map(([name, list]) => [name, list.map(clone)]));
  const writes = [];

  const from = (name = 'bookings') => {
    const target = Object.prototype.hasOwnProperty.call(others, name) ? others[name] : table;
    const filters = [];
    let patch = null;
    let pending = null;
    let sort = null;
    let cap = null;
    let skip = 0;

    const run = () => {
      if (fail?.({ table: name, filters: [...filters], patch, write: pending })) {
        return { data: null, error: { message: 'connection reset' } };
      }

      if (pending?.kind === 'insert' || pending?.kind === 'upsert') {
        const incoming = (Array.isArray(pending.value) ? pending.value : [pending.value]).map(clone);
        const written = [];
        for (const row of incoming) {
          const at = target.findIndex((existing) => existing.booking_reference === row.booking_reference
            && row.booking_reference !== undefined);
          if (at !== -1 && pending.kind === 'upsert') Object.assign(target[at], row);
          else if (at !== -1) {
            return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } };
          } else target.push(row);
          written.push(row);
        }
        writes.push({ table: name, [pending.kind]: incoming.map(clone), matched: written.length });
        return { data: written.map(clone), error: null };
      }

      const matched = target.filter((row) => filters.every((filter) => passes(row, filter)));

      if (pending?.kind === 'delete') {
        for (const row of matched) target.splice(target.indexOf(row), 1);
        writes.push({ table: name, delete: true, filters: [...filters], matched: matched.length });
        return { data: matched.map(clone), error: null };
      }

      if (patch) {
        for (const row of matched) Object.assign(row, clone(patch));
        writes.push({ table: name, patch: clone(patch), filters: [...filters], matched: matched.length });
      }

      let out = matched;
      if (sort) {
        const at = (row) => valueAt(row, sort.column);
        out = [...out].sort((a, b) => {
          const left = at(a);
          const right = at(b);
          if (left === right) return 0;
          const order = left > right ? 1 : -1;
          return sort.ascending ? order : -order;
        });
      }
      if (skip) out = out.slice(skip);
      if (cap !== null) out = out.slice(0, cap);
      return { data: out.map(clone), error: null };
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
    // `.not(column, op, value)` - the method form, as the alarms and the queue
    // worker use it. Ignored, it let a query that selects "rows WITHOUT a
    // cancellation" return every row, so the filter each alarm depends on could
    // be deleted with no test going red.
    chain.not = (column, op, value) => {
      filters.push(['not', null, [op, column, value === null ? null : value]]);
      return chain;
    };
    for (const op of ['gte', 'lte', 'gt', 'lt']) {
      chain[op] = (column, value) => { filters.push([op, column, value]); return chain; };
    }
    // Ordering and paging decide WHICH row a query answers with, and every one
    // of these is load-bearing: "the newest booking for this reference"
    // (loadOwnedBooking), "the oldest queued booking first" (the queue worker,
    // so a paid customer is not starved), "the 200 oldest stuck bookings" (both
    // alarms). Ignored, any of those could be reversed and stay green - and 19
    // of the 21 files using this helper seed a single row, where ordered and
    // unordered are indistinguishable by construction.
    chain.order = (column, { ascending = true } = {}) => { sort = { column, ascending }; return chain; };
    chain.limit = (count) => { cap = count; return chain; };
    chain.range = (start, end) => { cap = end - start + 1; skip = start; return chain; };
    chain.select = () => chain;
    /**
     * Writes that write.
     *
     * `insert`, `upsert` and `delete` were no-ops returning the chain, so a
     * route could stop writing entirely and every test stayed green - the
     * checkout's booking row upsert is the one that matters, and its test
     * asserts nothing about the row. A no-op double cannot fail the way the
     * real thing fails.
     */
    chain.insert = (value) => { pending = { kind: 'insert', value }; return chain; };
    chain.upsert = (value) => { pending = { kind: 'upsert', value }; return chain; };
    chain.delete = () => { pending = { kind: 'delete' }; return chain; };
    chain.update = (value) => { patch = value; return chain; };
    chain.single = async () => {
      const { data, error } = run();
      if (error) return { data: null, error };
      // PostgREST's `.single()` errors on MORE than one row as well as none.
      // Answering with the first of many is how an unfiltered `.single()` -
      // admin.routes.js reads price_settings that way - looked correct here
      // while it errors in production.
      if (data.length > 1) {
        return { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned' } };
      }
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
