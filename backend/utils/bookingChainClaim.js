/**
 * Who has a booking right now: the booking chain, the queue, or a cancellation.
 *
 * `booking_details.gds_chain.startedAt` is the stamp every claim on a booking
 * compares-and-sets. The order route's chain claim takes it (flight.routes.js),
 * and so does the cancellation (payment/operations.handlers.js). Because both
 * write the same stamp, the database lets exactly one of them have the booking
 * at a time: a cancel cannot refund while the chain is committing a PNR, and a
 * chain cannot start selling seats against a payment that is being returned.
 *
 * A cancel used to be allowed at any point. One arriving mid-chain refunded the
 * customer while the chain went on to commit a real reservation; two arriving
 * together both passed the "already cancelled" check and both refunded.
 */

/**
 * How long a running chain, or a running cancellation, may hold its claim.
 *
 * Long enough to cover a slow chain - ten sequential GDS calls, ~8s observed on
 * PDT, with room for a bad day - and short enough that a process killed
 * mid-chain does not lock the reference out forever.
 */
export const CHAIN_CLAIM_TTL_MS = 120_000;

/**
 * How long a queued booking counts as still on its way.
 *
 * The queue worker replays it through the order route once a slot is free, and
 * the chain refuses a fare older than AMADEUS_WS_OFFER_MAX_AGE_MIN (30 minutes),
 * refunding it instead. A booking still sitting in the queue after that has
 * been abandoned by its worker - a laptop that queued it and went to sleep - and
 * must not be impossible to cancel.
 */
export const QUEUED_CHAIN_TTL_MS = 30 * 60 * 1000;

/**
 * How many times a paid booking may go back to the durable queue before it is
 * treated as a failure: for want of an Amadeus slot (flight.routes.js
 * queueBookingForRetry), or after an answer that said "not now"
 * (jobs/bookingQueue.job.js). Each retry waits for a free slot or a retry
 * delay, so reaching this means minutes of trouble, not seconds - and the
 * 30-minute offer staleness limit refunds it before then anyway.
 */
export const MAX_QUEUE_ATTEMPTS = 10;

/**
 * What currently holds the booking, or null when nothing does.
 *
 * A claim without a readable stamp cannot be aged, and is treated as released,
 * the same way claimBookingChain treats one: a lock nobody can expire is a
 * booking nobody can ever cancel or complete.
 *
 * @returns {'in_progress'|'queued'|'cancelling'|'committed'|null}
 */
export function liveChainState(chain, now = Date.now()) {
  if (!chain?.state) return null;

  // A committed chain has not finished: after the PNR exists it still queues
  // the booking, issues the ticket and saves the outcome. This used to count as
  // free, so a cancel could release the seats while a ticket was being issued
  // on them, and the chain's final save could then overwrite the cancellation.
  // It holds the booking for a claim's lifetime from the commit. The commit
  // renews no claim, so a booking that finished long ago is free again.
  if (chain.state === 'committed') {
    const committed = Date.parse(chain.committedAt ?? '');
    return Number.isFinite(committed) && now - committed < CHAIN_CLAIM_TTL_MS ? 'committed' : null;
  }

  const since = Date.parse(chain.startedAt ?? '');
  if (!Number.isFinite(since)) return null;
  const age = now - since;

  if ((chain.state === 'in_progress' || chain.state === 'cancelling') && age < CHAIN_CLAIM_TTL_MS) return chain.state;
  if (chain.state === 'queued' && age < QUEUED_CHAIN_TTL_MS) return 'queued';
  return null;
}
