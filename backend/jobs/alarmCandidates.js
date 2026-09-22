/**
 * Read every row an alarm has to consider, a page at a time.
 *
 * Both alarms (needsReviewAlert.job.js, paymentFailureAlert.job.js) read the
 * rows not yet stamped `alerted_at`, oldest first, and stamp only the rows they
 * announce. A row they read and turn down - a cancellation whose refund
 * worked, a cancelled PNR never ticketed, a flag the desk resolved - is never
 * stamped, so it keeps its place at the front. Each read was one page of 200:
 * once 200 such rows existed, a new row that should page was never read, on
 * that run or any later one.
 *
 * So the whole candidate set is read, in `created_at` order, one `.range()`
 * page after another - bounded, so a table that grows without limit cannot
 * turn a 15-minute tick into an unbounded scan. The bound is logged when it is
 * hit: what lies past it is not read, and someone has to know.
 *
 * Offset paging over a set that changes between pages can skip or repeat a
 * row. Nothing in a run stamps before every page is read, so the set moves
 * only when another process writes; a row skipped that way is read on the next
 * tick, and a repeated one is dropped here.
 */
export const CANDIDATE_PAGE_SIZE = 200;
export const CANDIDATE_MAX_PAGES = 50;

/**
 * @param {() => object} buildQuery - a fresh, filtered and ordered bookings
 *   query each call; this adds the page's `.range()`
 * @param {(msg: string, extra?: object) => void} log
 * @returns {Promise<{ data: Array<object>|null, error: object|null }>}
 */
export async function readEveryCandidate(buildQuery, log = () => {}) {
  const rows = [];
  const seen = new Set();
  for (let page = 0; page < CANDIDATE_MAX_PAGES; page += 1) {
    const from = page * CANDIDATE_PAGE_SIZE;
    const { data, error } = await buildQuery().range(from, from + CANDIDATE_PAGE_SIZE - 1);
    if (error) return { data: null, error };
    for (const row of data || []) {
      if (seen.has(row.booking_reference)) continue;
      seen.add(row.booking_reference);
      rows.push(row);
    }
    if (!data || data.length < CANDIDATE_PAGE_SIZE) return { data: rows, error: null };
  }
  log(`more than ${CANDIDATE_PAGE_SIZE * CANDIDATE_MAX_PAGES} candidate rows: only the oldest were read, and newer rows past them are not being checked`);
  return { data: rows, error: null };
}
