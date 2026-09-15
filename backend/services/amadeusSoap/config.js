/**
 * Amadeus Web Services configuration.
 *
 * Every endpoint, WSAP, office and credential is read from the environment.
 * The production WSAP and its credentials are issued by Amadeus only after
 * certification, so switching environments must stay an edit to the env file -
 * never a code change. Nothing in this client hardcodes any of them.
 *
 * Fails fast listing every missing name at once, the same way
 * backend/routes/payment/arcpay.config.js does, so a misconfigured deploy says
 * what is wrong instead of failing later inside a SOAP call.
 */

import { DEFAULT_UNTICKETABLE_CARRIERS, parseCarrierList } from './ticketingCarriers.js';

const REQUIRED = Object.freeze({
  AMADEUS_WS_ENDPOINT: 'endpoint',
  AMADEUS_WS_USERNAME: 'username',
  AMADEUS_WS_PASSWORD: 'password',
  AMADEUS_WS_OFFICE_ID: 'officeId',
});

const asInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const asFloat = (value, fallback) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const isTrue = (value, fallback = false) => (
  value === undefined || value === '' ? fallback : String(value).toLowerCase() === 'true'
);

// Unset means the carriers issuance refused on PDT; set but empty means none.
const unticketableCarriers = (env) => Object.freeze(parseCarrierList(
  env.AMADEUS_WS_UNTICKETABLE_CARRIERS === undefined
    ? DEFAULT_UNTICKETABLE_CARRIERS.join(',')
    : env.AMADEUS_WS_UNTICKETABLE_CARRIERS,
));

let cached = null;

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Readonly<object>} frozen config
 * @throws {Error} listing every missing required variable
 */
const readWsConfig = (env = process.env) => {
  const missing = Object.keys(REQUIRED).filter((name) => !env[name] || String(env[name]).trim() === '');
  if (missing.length > 0) {
    throw new Error(
      `Amadeus Web Services is not configured. Missing: ${missing.join(', ')}. `
      + 'Set these in the environment, or set AMADEUS_WS_ENABLED=false to disable flights cleanly.',
    );
  }

  const maxConcurrency = asInt(env.AMADEUS_WS_MAX_CONCURRENCY, 4);

  return Object.freeze({
    endpoint: env.AMADEUS_WS_ENDPOINT.trim(),
    wsap: (env.AMADEUS_WS_WSAP || '').trim() || env.AMADEUS_WS_ENDPOINT.trim().split('/').pop(),
    username: env.AMADEUS_WS_USERNAME.trim(),
    password: env.AMADEUS_WS_PASSWORD,
    officeId: env.AMADEUS_WS_OFFICE_ID.trim(),
    dutyCode: (env.AMADEUS_WS_DUTY_CODE || 'SU').trim(),
    requestorType: (env.AMADEUS_WS_REQUESTOR_TYPE || 'U').trim(),
    currency: (env.AMADEUS_WS_CURRENCY || 'USD').trim().toUpperCase(),

    bookingEnabled: isTrue(env.AMADEUS_WS_BOOKING_ENABLED, false),
    autoTicket: isTrue(env.AMADEUS_WS_AUTO_TICKET, false),
    // Checkout confirms the seats with the airline before the card is charged
    // (confirmSeats in bookingChain.js). On by default; false turns it off
    // without a deploy if Amadeus asks us not to sell-and-release at checkout.
    seatCheckBeforePayment: isTrue(env.AMADEUS_WS_SEAT_CHECK_BEFORE_PAYMENT, true),
    // In the seat check's session, the sold segments are also priced as the
    // booking chain will price them, and a fare the airline will not give - or
    // an adult fare higher than quoted - is refused before the charge
    // (confirmFare in bookingChain.js). Runs only with the seat check. On by
    // default; false turns it off without a deploy.
    priceCheckBeforePayment: isTrue(env.AMADEUS_WS_PRICE_CHECK_BEFORE_PAYMENT, true),
    // Carriers this office cannot ticket: their fares are left out of search
    // and refused at pricing and booking (ticketingCarriers.js).
    unticketableCarriers: unticketableCarriers(env),
    // The office's market (country) code, required by Ticket_CancelDocument to
    // identify whose ticket stock is being voided. US because settlement is
    // through ARC; confirm against the production office at cutover, as with
    // the form-of-payment code.
    marketIataCode: (env.AMADEUS_WS_MARKET_IATA_CODE || 'US').trim().toUpperCase(),
    queueNumber: (env.AMADEUS_WS_QUEUE_NUMBER || '50').trim(),
    queueOffice: (env.AMADEUS_WS_QUEUE_OFFICE || env.AMADEUS_WS_OFFICE_ID).trim(),
    // The category within that queue - the "C0" in queue 90 C0, which Amadeus
    // created for PDT testing. A production queue can use another category, so
    // it is set here with the number rather than fixed in the request builder.
    queueCategory: String(asInt(env.AMADEUS_WS_QUEUE_CATEGORY, 0)),
    // No FOP free-text setting: fopDetails accepts only fopCode, fopMapTable,
    // fopBillingCode and fopStatus, so there is nowhere to put the ARC
    // transaction id. It lives in booking_details.transaction_id instead.
    // CASH, not CA. We are the merchant of record - the card is charged at
    // ARC Pay before the GDS is involved - so the airline sees an agency
    // collection settling through ARC.
    //
    // The literal code is OFFICE-DEPENDENT, which is why this is an env var
    // and why every code we guessed was refused. Per the FOP technical
    // reference, `fopCode` is a "format key that identifies the FOP within a
    // FOP table", and that table belongs to the office: the same concept
    // resolves to `FP CA` in an Air France office, `FP CASH` in an Iberia one,
    // and `FP S` in a United one. Office SCK1S2400 uses CASH.
    //
    // So this must be re-confirmed against the PRODUCTION office at cutover.
    // A value that is correct on PDT is not evidence it is correct on PROD.
    fopCode: (env.AMADEUS_WS_FOP_CODE || 'CASH').trim(),

    maxConcurrency,
    queueTimeoutMs: asInt(env.AMADEUS_WS_QUEUE_TIMEOUT_MS, 8000),
    // Permits only a booking may take, so a burst of searches can never leave a
    // paid booking without a slot. Default a fifth of the ceiling (15 -> 3).
    // At least one, always. `Math.floor(maxConcurrency / 5)` is 0 when the
    // ceiling falls back to its own default of 4 - which silently removes the
    // protection entirely, in exactly the misconfigured deploy that needs it.
    bookingReservedSlots: asInt(
      env.AMADEUS_WS_BOOKING_RESERVED_SLOTS,
      Math.max(1, Math.floor(maxConcurrency / 5)),
    ),
    // How long a booking waits for a slot before it is handed to the durable
    // queue instead. Kept well inside the ~30s the Vercel proxy allows for the
    // whole request, which also has to fit the chain itself (~8s).
    bookingQueueTimeoutMs: asInt(env.AMADEUS_WS_BOOKING_QUEUE_TIMEOUT_MS, 10000),
    timeoutMs: asInt(env.AMADEUS_WS_TIMEOUT_MS, 25000),
    offerMaxAgeMin: asInt(env.AMADEUS_WS_OFFER_MAX_AGE_MIN, 30),
    priceTolerance: asFloat(env.AMADEUS_WS_PRICE_TOLERANCE, 0),
    // Payment-coverage guard: the fraction of the GDS-priced fare the customer
    // must have actually PAID (captured by ARC) for the booking to proceed to
    // ticketing. The charge is client-supplied at hosted checkout and never
    // re-validated against the fare, so without this a tampered "$1" amount
    // would buy a full-price ticket. It is a ratio, not an exact match, because
    // the charged amount also carries the admin service fee (up) and any coupon
    // (down) that Amadeus knows nothing about.
    //
    // On by default. It used to default to 0 (off) with a note to switch it on
    // at cutover - a security control that depends on someone remembering is
    // off in practice. 0.8 clears the largest flight coupon (20% off): a 20%
    // coupon on fare + 2.5% service fee lands at ~0.82 of the fare. If you
    // create a flight coupon worth more than 20%, lower this below
    // (1 - discount) or real bookings will be refused and refunded. 0 disables.
    minPaymentRatio: asFloat(env.AMADEUS_WS_MIN_PAYMENT_RATIO, 0.8),
    // Max seat-holding passengers in a single PNR. A standard airline/GDS PNR
    // caps at 9 (infants on a lap don't count); 10+ is a group booking, a
    // different flow the airline rejects on the normal path.
    maxPassengersPerPnr: asInt(env.AMADEUS_WS_MAX_PASSENGERS_PER_PNR, 9),
    // After DocIssuance_IssueTicket, the ticket number takes a moment to land in
    // the PNR, so we wait, PNR_Retrieve, and if it is not there yet wait again
    // and retry a few times before leaving the PNR for manual follow-up (matches
    // Amadeus's reference ticketing flow). All non-fatal.
    ticketRetrieveInitialMs: asInt(env.AMADEUS_WS_TICKET_RETRIEVE_INITIAL_MS, 3000),
    // Extra retrieves after the first — default 2, so 3 total tries, matching the
    // reference flow's "already retried 3 times?" gate.
    ticketRetrieveRetries: asInt(env.AMADEUS_WS_TICKET_RETRIEVE_RETRIES, 2),
    ticketRetrieveDelayMs: asInt(env.AMADEUS_WS_TICKET_RETRIEVE_DELAY_MS, 1000),
    // PNR_Cancel answering 8111 SIMULTANEOUS CHANGES TO PNR is retried after
    // redisplaying the PNR; this is the pause before each retry.
    cancelRetryDelayMs: asInt(env.AMADEUS_WS_CANCEL_RETRY_DELAY_MS, 1500),
    // Before issuing, how long to wait for every air segment to carry the
    // airline's own record locator, and how often to look. Airlines Amadeus
    // hosts (LH, QR, AF) have it at commit; others send it moments later - DL
    // after about 12 s on PDT - and refuse the ticket until then.
    // Royal Brunei's locator took about 56 s on PDT; the owner chose to wait
    // up to 90 s in the booking rather than ticket in the background.
    airlineLocatorWaitMs: asInt(env.AMADEUS_WS_AIRLINE_LOCATOR_WAIT_MS, 90000),
    // Each look is a new Amadeus session (issueInFreshSessions: the session that
    // committed never saw BI's locator), so looks are 5 s apart rather than 2.
    airlineLocatorPollMs: asInt(env.AMADEUS_WS_AIRLINE_LOCATOR_POLL_MS, 5000),
    // Issuance refused because the airline's side is not ready yet is retried.
    issueRetries: asInt(env.AMADEUS_WS_ISSUE_RETRIES, 2),
    issueRetryDelayMs: asInt(env.AMADEUS_WS_ISSUE_RETRY_DELAY_MS, 4000),
    logEnvelopes: isTrue(env.AMADEUS_WS_LOG_ENVELOPES, false) && env.NODE_ENV !== 'production',
  });
};

/** Memoised for the process. Tests get a fresh read via vi.resetModules(). */
export const getWsConfig = (env = process.env) => {
  if (!cached) cached = readWsConfig(env);
  return cached;
};

/** True when flights should use the SOAP provider at all. */
export const isWsEnabled = (env = process.env) => isTrue(env.AMADEUS_WS_ENABLED, true);

/** Cheap presence check for the health endpoint - never reports values. */
export const describeWsConfig = (env = process.env) => ({
  enabled: isWsEnabled(env),
  configured: Object.keys(REQUIRED).every((name) => Boolean(env[name])),
  endpoint: env.AMADEUS_WS_ENDPOINT || null,
  wsap: env.AMADEUS_WS_WSAP || null,
  officeId: env.AMADEUS_WS_OFFICE_ID || null,
  bookingEnabled: isTrue(env.AMADEUS_WS_BOOKING_ENABLED, false),
  autoTicket: isTrue(env.AMADEUS_WS_AUTO_TICKET, false),
  seatCheckBeforePayment: isTrue(env.AMADEUS_WS_SEAT_CHECK_BEFORE_PAYMENT, true),
  priceCheckBeforePayment: isTrue(env.AMADEUS_WS_PRICE_CHECK_BEFORE_PAYMENT, true),
  unticketableCarriers: unticketableCarriers(env),
});
