-- What the booking feed (backend/jobs/bookingFeed.job.js) has posted to Slack:
-- one row per booking event, so each one is announced once. Written only by the
-- backend's service role. Safe to run twice.

begin;

create table if not exists public.booking_alert_log (
  event_key text primary key,
  booking_reference text not null,
  kind text not null,
  claimed_at timestamptz not null default now(),
  posted_at timestamptz
);

alter table public.booking_alert_log enable row level security;
revoke all on public.booking_alert_log from anon, authenticated;

notify pgrst, 'reload schema';

commit;
