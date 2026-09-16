/**
 * "Is this the Amadeus test node?" — asked once, in one place.
 *
 * Several scripts in here talk to the real GDS, and two of them turn booking on
 * themselves regardless of how the environment is set, because that is the only
 * way to exercise the chain on PDT:
 *
 *   smoke-amadeus-ws.mjs     --booking  --ticket
 *   record-amadeus-fixture.mjs  booking    ticket
 *
 * That is safe while AMADEUS_WS_ENDPOINT is the test node and harmless if you
 * forget. It stops being harmless the day the endpoint moves to production: the
 * same command then creates a real reservation on the real office, and with the
 * ticket flag issues a real ticket against real stock. The e2e scripts already
 * refused to run off the test node; these two never got the same guard, and the
 * habit of running them is exactly what survives a cutover.
 *
 * The test must be positive - the endpoint has to SAY test - rather than "does
 * not say prod". A production host that simply omits the word would pass the
 * negative form.
 */

export const isTestNode = (endpoint = process.env.AMADEUS_WS_ENDPOINT || '') =>
  /\btest\b/i.test(endpoint) && !/\bprod(uction)?\b/i.test(endpoint);

/**
 * Stop the process unless the configured endpoint is the Amadeus test node.
 *
 * `what` names the thing being refused, so the message says why it matters
 * ("creating a PNR") rather than only that something was refused.
 */
export const refuseUnlessTestNode = (what) => {
  if (isTestNode()) return;
  console.error(
    `Refusing to run: ${what} is only allowed against the Amadeus test node.\n` +
    'AMADEUS_WS_ENDPOINT does not look like the test node, so this would act on the live GDS.',
  );
  process.exit(2);
};
