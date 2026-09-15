/**
 * Pin a whole-column write of `booking_details` to the row it was built from.
 *
 * PostgREST cannot change one key inside a jsonb column, so a writer reads
 * booking_details, changes its part, and writes the whole column back. Anything
 * written in between is lost. The needs-review alarm stamped `alerted_at` from
 * a copy read before it posted to Slack, and could undo a running chain's final
 * save or a cancellation record; the order route's final save could overwrite
 * a cancellation that landed after it read the row.
 *
 * A jsonb column cannot be compared whole in a filter - the value would not
 * fit in the request - so the write is conditioned on what the writers that
 * matter move: the booking and payment status, the chain's state and claim
 * stamp, the PNR, the ticketing verdict, the confirmation email, the
 * cancellation and the review flag. A write that matches no row lost a race,
 * and the caller reads again and decides again.
 *
 * The json paths go in `.eq` / `.is`, never inside `.or()`: PostgREST rejects
 * arrow paths inside `or` on an UPDATE.
 */
const PINNED = [
  ['booking_details->gds_chain->>state', (details) => details?.gds_chain?.state],
  ['booking_details->gds_chain->>startedAt', (details) => details?.gds_chain?.startedAt],
  ['booking_details->>pnr', (details) => details?.pnr],
  ['booking_details->gds->>ticketed', (details) => details?.gds?.ticketed],
  ['booking_details->confirmation_email->>state', (details) => details?.confirmation_email?.state],
  ['booking_details->cancellation->>cancelledAt', (details) => details?.cancellation?.cancelledAt],
  ['booking_details->needs_review->>at', (details) => details?.needs_review?.at],
];

const pin = (query, column, value) => (value === undefined || value === null ? query.is(column, null) : query.eq(column, value));

/**
 * @param query - a Supabase update builder, already narrowed to the booking
 * @param {{ status?: string|null, payment_status?: string|null, booking_details?: object|null }} row - the row as read
 */
export function unchangedSince(query, row) {
  let pinned = query;
  if ('status' in row) pinned = pin(pinned, 'status', row.status);
  if ('payment_status' in row) pinned = pin(pinned, 'payment_status', row.payment_status);
  for (const [column, pick] of PINNED) pinned = pin(pinned, column, pick(row.booking_details));
  return pinned;
}
