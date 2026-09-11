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
    // The office's market (country) code, required by Ticket_CancelDocument to
    // identify whose ticket stock is being voided. US because settlement is
    // through ARC; confirm against the production office at cutover, as with
    // the form-of-payment code.
    marketIataCode: (env.AMADEUS_WS_MARKET_IATA_CODE || 'US').trim().toUpperCase(),
    queueNumber: (env.AMADEUS_WS_QUEUE_NUMBER || '50').trim(),
    queueOffice: (env.AMADEUS_WS_QUEUE_OFFICE || env.AMADEUS_WS_OFFICE_ID).trim(),
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

    maxConcurrency: asInt(env.AMADEUS_WS_MAX_CONCURRENCY, 4),
    queueTimeoutMs: asInt(env.AMADEUS_WS_QUEUE_TIMEOUT_MS, 8000),
    timeoutMs: asInt(env.AMADEUS_WS_TIMEOUT_MS, 25000),
    offerMaxAgeMin: asInt(env.AMADEUS_WS_OFFER_MAX_AGE_MIN, 30),
    priceTolerance: asFloat(env.AMADEUS_WS_PRICE_TOLERANCE, 0),
    // Payment-coverage guard: the fraction of the GDS-priced fare the customer
    // must have actually PAID (captured by ARC) for the booking to proceed to
    // ticketing. 0 disables it. The charge is client-supplied at hosted
    // checkout and never re-validated against the fare, so without this a
    // tampered "$1" amount would buy a full-price ticket. It is a ratio, not an
    // exact match, because the charged amount also carries the admin service
    // fee (up) and any coupon (down) that Amadeus knows nothing about — set it
    // below 1 by the largest legitimate discount you allow (e.g. 0.5 tolerates
    // coupons up to 50% off). MUST be set > 0 before AMADEUS_WS_AUTO_TICKET
    // goes true in production; see the cutover runbook.
    minPaymentRatio: asFloat(env.AMADEUS_WS_MIN_PAYMENT_RATIO, 0),
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
});
