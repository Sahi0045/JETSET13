/**
 * Can this process reach Amadeus?
 *
 * Amadeus allow-lists one egress address, the Lightsail instance's
 * (deploy/README.md). Vercel's functions have no fixed address, so a supplier
 * call made from there is refused before it reaches the GDS. vercel.json sends
 * /api/flights/* to Lightsail for exactly that reason - but a handler mounted
 * under another path, like the payments router's `cancel-booking`, still runs
 * on Vercel. Its airline cancel failed every time, and every failure read as
 * the airline refusing: a 502, a booking flagged for review, and a Slack page
 * about a problem that was only ever where the code ran.
 *
 * Vercel sets `VERCEL` in every function's environment; Lightsail and a
 * developer's machine do not. The same test decides where checkout prices an
 * offer (services/flightCheckout.service.js).
 */
export function canReachAmadeus(env = process.env) {
  return !env.VERCEL;
}
