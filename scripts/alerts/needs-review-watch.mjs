#!/usr/bin/env node
/**
 * Alert on bookings that took money but never produced a ticket.
 *
 * The booking chain deliberately does NOT refund a booking once the PNR is
 * committed: if ticketing fails after that point it keeps the booking, sets
 * `booking_details.needs_review` and expects a human to finish the ticket by
 * hand (see backend/routes/flight.routes.js, the `committed` branch).
 *
 * Nobody was watching that queue. An audit on 2026-09-12 found two bookings -
 * FLTMTPR74L5 (6 Sep) and FLTDE65B4DDB7A44E (11 Sep) - sitting `confirmed` and
 * `paid` with a PNR and no ticket, unnoticed for days. While booking is
 * disabled in production that costs nothing; once it is live, it is a customer
 * holding a worthless confirmation.
 *
 * So: find them, say so in Slack, and record that we did - `alerted_at` is
 * written back onto the row so the same booking is never announced twice.
 *
 *   node scripts/alerts/needs-review-watch.mjs --channel C123 [--dry-run]
 *
 * Sends through the Composio CLI (`composio execute SLACK_SEND_MESSAGE`), so
 * the Slack credentials live in Composio rather than in this repo or its env.
 *
 * Deliberately prints no passenger data: reference, PNR, amount and reason are
 * enough to act on, and alerts get forwarded around.
 */
import 'dotenv/config';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createClient } from '@supabase/supabase-js';

const run = promisify(execFile);

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const valueOf = (flag, fallback = null) => {
  const i = args.indexOf(flag);
  return i === -1 ? fallback : args[i + 1];
};

const CHANNEL = valueOf('--channel', process.env.ALERT_SLACK_CHANNEL);
const DRY_RUN = has('--dry-run');
const COMPOSIO = process.env.COMPOSIO_BIN || `${process.env.HOME}/.local/bin/composio`;

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const hoursSince = (iso) => Math.round((Date.now() - Date.parse(iso)) / 36e5);

/** Bookings flagged for review that nobody has been told about yet. */
async function findUnannounced() {
  const { data, error } = await supabase
    .from('bookings')
    .select('booking_reference, status, payment_status, total_amount, created_at, booking_details')
    .not('booking_details->needs_review', 'is', null)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Could not read bookings: ${error.message}`);

  return (data || []).filter((b) => {
    if (b.booking_details?.needs_review?.alerted_at) return false;   // already announced
    if (b.booking_details?.gds?.ticketed === true) return false;     // ticket came through later
    if (b.booking_details?.tickets?.length > 0) return false;        // ditto, via a retrieve

    // Already dealt with: a cancelled or refunded booking has been resolved by
    // hand, and nobody needs paging about it. The first dry run flagged
    // FLTMTPRZA5T - cancelled and refunded days earlier - which is exactly the
    // false alarm that gets a channel muted.
    const settled = ['cancelled', 'refunded'].includes(String(b.status).toLowerCase())
      || ['refunded', 'partially_refunded', 'reversed'].includes(String(b.payment_status).toLowerCase());
    return !settled;
  });
}

function describe(booking) {
  const review = booking.booking_details?.needs_review || {};
  return [
    `*${booking.booking_reference}* — ${booking.status}/${booking.payment_status}, ${booking.total_amount} USD`,
    `PNR ${booking.booking_details?.pnr || 'none'} · ticketed: ${review.ticketed === true ? 'yes' : 'NO'}`,
    `reason: ${review.reason || 'unknown'}`,
    `flagged ${hoursSince(review.at || booking.created_at)}h ago`,
  ].join('\n');
}

async function sendToSlack(text) {
  // `markdown_text`, not `text`: SLACK_SEND_MESSAGE allows only blocks /
  // markdown_text / fallback_text as the content field and rejects anything
  // else. And `fallback_text` is only valid alongside `blocks`, so with plain
  // markdown it must be omitted - Slack answers 400 otherwise.
  const payload = JSON.stringify({ channel: CHANNEL, markdown_text: text });
  const { stdout } = await run(COMPOSIO, ['execute', 'SLACK_SEND_MESSAGE', '-d', payload], {
    maxBuffer: 1024 * 1024,
  });
  // The CLI exits 0 even when Slack itself refuses (bad channel, not a member),
  // so the body decides whether this actually went anywhere.
  const ok = /"ok"\s*:\s*true|"successful"\s*:\s*true/.test(stdout);
  if (!ok) throw new Error(`Slack refused the message: ${stdout.slice(0, 300)}`);
}

/** Record that this booking was announced, so the next run stays quiet. */
async function markAlerted(booking) {
  const details = booking.booking_details || {};
  const updated = {
    ...details,
    needs_review: { ...(details.needs_review || {}), alerted_at: new Date().toISOString() },
  };
  const { error } = await supabase
    .from('bookings')
    .update({ booking_details: updated })
    .eq('booking_reference', booking.booking_reference);
  if (error) throw new Error(`Alerted but could not mark ${booking.booking_reference}: ${error.message}`);
}

const main = async () => {
  const stuck = await findUnannounced();

  if (stuck.length === 0) {
    console.log('needs-review queue is clear — nothing to announce.');
    return;
  }

  const body = [
    `:rotating_light: *${stuck.length} booking${stuck.length > 1 ? 's' : ''} paid but not ticketed*`,
    'The customer has paid and holds a PNR, but no ticket was issued. These need manual ticketing.',
    '',
    ...stuck.map(describe),
  ].join('\n\n');

  if (DRY_RUN) {
    console.log('--- would post to Slack channel', CHANNEL || '(none set)', '---');
    console.log(body);
    console.log('--- dry run: nothing sent, nothing marked ---');
    return;
  }

  if (!CHANNEL) throw new Error('No Slack channel: pass --channel C123 or set ALERT_SLACK_CHANNEL');

  await sendToSlack(body);
  for (const booking of stuck) await markAlerted(booking);
  console.log(`announced ${stuck.length} booking(s) to Slack and marked them alerted.`);
};

main().catch((error) => {
  console.error('needs-review watch failed:', error.message);
  process.exit(1);
});
