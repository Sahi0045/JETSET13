#!/usr/bin/env node
/**
 * Ask, right now, whether any booking took money without producing a ticket.
 *
 *   node scripts/alerts/needs-review-watch.mjs --dry-run   # show, send nothing
 *   node scripts/alerts/needs-review-watch.mjs             # announce to Slack
 *
 * The booking chain deliberately does NOT refund a booking once the PNR is
 * committed: if ticketing fails after that point it keeps the booking, sets
 * `booking_details.needs_review` and expects a human to finish the ticket by
 * hand (see backend/routes/flight.routes.js, the `committed` branch).
 *
 * The scheduled job in the API process already watches that queue every 15
 * minutes. This script exists for the times you want an answer immediately
 * rather than within the quarter hour, and it is deliberately a thin wrapper
 * around that job's own `runOnce`: same query, same choice of which bookings
 * deserve an alert, same message, same delivery, same `alerted_at` stamp. Two
 * implementations would drift, and the drift would surface as either a muted
 * channel or a missed unticketed booking.
 *
 * Delivery is the Slack incoming webhook in `ALERT_SLACK_WEBHOOK_URL`, the same
 * one production uses. A dry run needs no webhook at all, so checking the queue
 * from a laptop with no production secrets still works.
 */
import 'dotenv/config';
import { runOnce } from '../../backend/jobs/needsReviewAlert.job.js';

const dryRun = process.argv.slice(2).includes('--dry-run');

const main = async () => {
  const result = await runOnce({ dryRun });

  if (result.skipped) {
    console.error(
      'No Slack webhook: set ALERT_SLACK_WEBHOOK_URL, or pass --dry-run to see what would be sent.',
    );
    process.exit(1);
  }

  if (result.dryRun) {
    if (result.wouldAnnounce?.length) {
      console.log(`--- would announce ${result.wouldAnnounce.length} booking(s) ---`);
      console.log(result.message);
      console.log('--- dry run: nothing sent, nothing marked ---');
    } else {
      console.log('needs-review queue is clear — nothing to announce.');
    }
    return;
  }

  console.log(
    result.announced === 0
      ? 'needs-review queue is clear — nothing to announce.'
      : `announced ${result.announced} booking(s) to Slack and marked them alerted.`,
  );
};

main().catch((error) => {
  console.error('needs-review watch failed:', error.message);
  process.exit(1);
});
