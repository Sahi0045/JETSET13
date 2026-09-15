/**
 * Which environment's queued bookings this process runs.
 *
 * Local development and production share one database, and the booking queue
 * lives on the booking rows: the order route labels every queued order with the
 * environment that queued it (flight.routes.js queueBookingForRetry), and the
 * worker runs only its own (jobs/bookingQueue.job.js). That label was NODE_ENV.
 * But NODE_ENV=production is also what `npm start` sets, so a laptop started
 * that way ran production's queue - replaying a paying customer's booking
 * through its own server, on whatever Amadeus credentials that machine had -
 * and labelled its own test bookings for production's worker to run.
 *
 * Production is now named explicitly, by BOOKING_QUEUE_ENV, which the Lightsail
 * stack sets (deploy/docker-compose.yml). Without it a process is
 * 'development', whatever NODE_ENV says.
 */
export function queueEnvironment(env = process.env) {
  return String(env.BOOKING_QUEUE_ENV || '').trim() || 'development';
}
