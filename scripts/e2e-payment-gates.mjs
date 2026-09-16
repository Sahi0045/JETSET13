/**
 * End-to-end test of the money gates, against live pricing and the ARC Pay
 * TEST merchant.
 *
 *   node scripts/e2e-payment-gates.mjs      (or: npm run e2e:payment)
 *
 * What it does NOT do: pay. Completing a card payment means entering card
 * details on ARC's hosted page, which this script will not do and which no
 * automation here should. The leg between "a checkout session exists" and
 * "ARC reports it captured" has to be walked by a person, or by ARC's own test
 * tooling. Everything on either side of that leg is checked here.
 *
 * What it checks is the set of decisions that let money move or refuse to:
 * whether the amount a client asks to be charged is the amount the airline
 * actually prices, whether a payment that does not exist can be treated as
 * real, and whether a reversal fails closed.
 *
 * Refuses to run against a live ARC merchant or a production Amadeus node.
 */
import 'dotenv/config';

const { ARC_PAY_CONFIG } = await import('../backend/routes/payment/arcpay.config.js');
if (!/test/i.test(String(ARC_PAY_CONFIG.MERCHANT_ID || ''))) {
  console.error('Refusing to run: ARC merchant is not a TEST merchant.');
  process.exit(2);
}
if (!/test/i.test(process.env.AMADEUS_WS_ENDPOINT || '')) {
  console.error('Refusing to run: AMADEUS_WS_ENDPOINT is not the Amadeus test node.');
  process.exit(2);
}

const started = Date.now();
const at = () => `${String(((Date.now() - started) / 1000).toFixed(1)).padStart(6)}s`;
const results = [];
const record = (name, ok, detail) => {
  results.push({ name, ok });
  console.log(`${at()}  ${ok ? 'PASS' : '✗ FAIL'}  ${name}`, detail ? JSON.stringify(detail) : '');
};

const supabase = (await import('../backend/config/supabase.js')).default;
const provider = (await import('../backend/services/flightProvider.js')).default;
const { verifyFlightCharge } = await import('../backend/services/flightCheckout.service.js');
const { reconcileBookingPayment } = await import('../backend/routes/payment/checkout.handlers.js');
const { reverseArcPaymentForOrder } = await import('../backend/routes/payment/operations.handlers.js');
const { arcSucceeded } = await import('../backend/routes/payment/payment.helpers.js');

const depart = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10);

const traveller = () => ({
  firstName: 'PAYMENT', lastName: 'GATES', gender: 'MALE',
  dateOfBirth: '1988-04-12', type: 'ADULT',
  passportNumber: 'X1234567', passportExpiry: '2032-01-01', nationality: 'US',
});

try {
  // ---- A live fare to test the gates against ------------------------------
  const search = await provider.searchFlights({
    originLocationCode: 'FRA', destinationLocationCode: 'JFK', departureDate: depart,
    adults: 1, travelClass: 'ECONOMY', currencyCode: 'USD', max: 20,
  });
  const offer = (search?.data ?? []).find((o) => o.validatingAirlineCodes?.[0] === 'LH') ?? search?.data?.[0];
  record('a live fare to test against', Boolean(offer), { fare: offer?.price?.total });
  if (!offer) throw new Error('no offer to test with');

  const bookingData = { originalOffer: offer, passengerData: [traveller()] };
  const verify = (over = {}) => verifyFlightCharge({
    client: supabase, amount: 1, bookingData, userId: null, email: 'gates@example.com', ...over,
  });

  // Ask once with a deliberately silly amount; the refusal tells us what the
  // charge should be, which is then the honest figure for the accept case.
  const probe = await verify({ amount: 1 });
  const expected = Number(probe?.charge?.total);
  record('refuses an amount the fare does not support', probe?.ok === false && Number.isFinite(expected), {
    asked: 1, expected: probe?.charge?.total, code: probe?.code,
  });

  // ---- The gate that matters: pay what the fare costs, not what you say ---
  const right = await verify({ amount: expected });
  record('accepts the amount the airline actually prices', right?.ok === true, {
    amount: expected, code: right?.code ?? null, message: right?.message ?? null,
  });

  const under = await verify({ amount: Math.round((expected - 500) * 100) / 100 });
  record('refuses paying less than the fare', under?.ok === false, { asked: expected - 500, code: under?.code });

  const over = await verify({ amount: Math.round((expected + 500) * 100) / 100 });
  record('refuses paying more than the fare', over?.ok === false, { asked: expected + 500, code: over?.code });

  const cents = await verify({ amount: Math.round((expected - 0.02) * 100) / 100 });
  record('refuses a two-cent shortfall', cents?.ok === false, { asked: expected - 0.02, code: cents?.code });

  // ---- Who is travelling must match the fare that was priced -------------
  const extra = await verifyFlightCharge({
    client: supabase, amount: expected, userId: null, email: 'gates@example.com',
    bookingData: { originalOffer: offer, passengerData: [traveller(), traveller()] },
  });
  record('refuses more travellers than the fare was priced for', extra?.ok === false, { code: extra?.code });

  const noOffer = await verifyFlightCharge({
    client: supabase, amount: expected, userId: null, email: 'gates@example.com',
    bookingData: { passengerData: [traveller()] },
  });
  record('refuses a checkout carrying no fare at all', noOffer?.ok === false, { code: noOffer?.code });

  // ---- The merchant settles in USD only ----------------------------------
  const eur = await verify({ amount: expected, settlementCurrency: 'EUR' });
  record('refuses to settle in a currency the merchant cannot take', eur?.ok === false, { code: eur?.code });

  // ---- A payment that does not exist is never treated as real ------------
  const unknown = `E2E-NO-SUCH-ORDER-${Date.now()}`;
  const recon = await reconcileBookingPayment(unknown);
  record('an unknown order is not reported as paid', recon?.paid !== true, {
    order: unknown, paid: recon?.paid, status: recon?.status ?? recon?.reason ?? null,
  });

  // ---- A reversal with nothing to reverse fails closed -------------------
  const reversal = await reverseArcPaymentForOrder(unknown, { amount: 100, reason: 'e2e gate check' });
  record('a reversal of nothing reports nothing reversed', reversal?.reversed === false, {
    action: reversal?.action, error: reversal?.error,
  });

  // ---- ARC answers a refused refund with HTTP 200 -----------------------
  record('a 200 carrying FAILURE is not a success',
    arcSucceeded({ status: 200, data: { result: 'SUCCESS' } }) === true
    && arcSucceeded({ status: 200, data: { result: 'FAILURE' } }) === false
    && arcSucceeded({ status: 200, data: {} }) === false,
    { note: 'the shape that made refused refunds read as done' });
} catch (error) {
  record('run', false, { error: error?.message || String(error) });
} finally {
  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${'='.repeat(62)}\nPayment gates: ${passed}/${results.length} passed  (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  console.log('NOT covered: the card payment itself, which needs a person on the hosted page.');
  process.exit(results.every((r) => r.ok) ? 0 : 1);
}
