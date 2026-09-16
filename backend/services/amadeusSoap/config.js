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

import {
  DEFAULT_NO_INTERLINE_PAIRS, DEFAULT_UNTICKETABLE_CARRIERS, parseCarrierList, parsePairList,
} from './ticketingCarriers.js';

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

// Interline - one airline's stock carrying another airline's flight. Only the
// pairs issuance has actually refused are kept out, because plating other
// airlines is normal and often necessary (Hahn Air and APG do nothing else).
// See ticketingCarriers.js interlineNotAllowed.
const interlinePolicy = (env) => Object.freeze({
  blockAll: isTrue(env.AMADEUS_WS_BLOCK_ALL_INTERLINE, false),
  // Unset means the pairs issuance has actually refused; set but empty means
  // none, the same convention as the unticketable carriers above.
  blocked: Object.freeze(parsePairList(
    env.AMADEUS_WS_INTERLINE_BLOCKED_PAIRS === undefined
      ? DEFAULT_NO_INTERLINE_PAIRS.join(',')
      : env.AMADEUS_WS_INTERLINE_BLOCKED_PAIRS,
  )),
});

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
    interline: interlinePolicy(env),
    // The office's market (country) code, required by Ticket_CancelDocument to
    // identify whose ticket stock is being voided. US because settlement is
    // through ARC; confirm against the production office at cutover, as with
    // the form-of-payment code.
    marketIataCode: (env.AMADEUS_WS_MARKET_IATA_CODE || 'US').trim().toUpperCase(),
    // The office's own calendar, which is what decides whether a ticket can
    // still be voided. Amadeus stamps the ticket with the office's local date
    // (FA ... /15SEP26/SCK1S2400), so comparing it against UTC made every
    // ticket issued between midnight UTC and midnight in the office look like
    // yesterday's: on PDT at 00:2x UTC on 16 Sep 2026 a ticket issued minutes
    // earlier was reported as needing an airline refund instead of being
    // voided. Set this to the production office's zone at cutover.
    officeTimeZone: (env.AMADEUS_WS_OFFICE_TIME_ZONE || 'America/New_York').trim(),
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
    // A void asked for seconds after issuance can answer 5795 INVALID OR MISSING
    // COUPON/BOOKLET NUMBER: the coupons are not in the e-ticket record yet. On
    // PDT (16 Sep 2026) La Compagnie's ticket refused the void immediately and
    // voided cleanly 15 s later, so one retry after this pause is enough.
    voidRetryDelayMs: asInt(env.AMADEUS_WS_VOID_RETRY_DELAY_MS, 15000),
    // Before issuing, how long to wait for every air segment to carry the
    // airline's own record locator, and how often to look. Airlines Amadeus
    // hosts (LH, QR, AF) have it at commit; others send it moments later - DL
    // after about 12 s on PDT - and refuse the ticket until then.
    // Royal Brunei's locator took about 56 s on PDT; the owner chose to wait
    // up to 90 s in the booking rather than ticket in the background.
    airlineLocatorWaitMs: asInt(env.AMADEUS_WS_AIRLINE_LOCATOR_WAIT_MS, 90000),
    // After that wait the ticket is asked for anyway, and the airline can still
    // answer 9125 NEED AIRLINE R/LOC. La Compagnie's locator took 45 s idle on
    // PDT and longer under load, where the booking failed although the airline
    // was only slow, so the looking carries on to this hard cap before the last
    // attempt decides it. Default: twice the wait.
    airlineLocatorMaxWaitMs: asInt(
      env.AMADEUS_WS_AIRLINE_LOCATOR_MAX_WAIT_MS,
      asInt(env.AMADEUS_WS_AIRLINE_LOCATOR_WAIT_MS, 90000) * 2,
    ),
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
  interline: interlinePolicy(env),
});

/**
 * Settings whose DEFAULT is only correct for the PDT test office, and which are
 * still on that default.
 *
 * Every one of these fails silently rather than loudly. Unset,
 * AMADEUS_WS_UNTICKETABLE_CARRIERS is not "block nothing" - it is the 19-carrier
 * PDT list, so Emirates, Singapore, Cathay, Qantas and fifteen others simply
 * stop appearing in search results with no error anywhere. The queue number
 * defaults to 50, which is a PDT queue. The office time zone decides the
 * same-day void window, the FOP code and market code decide whether a ticket can
 * be issued and voided at all - and each was verified against PDT, never
 * against a production office.
 *
 * Reported rather than enforced: a missing value is not always wrong, and
 * refusing to boot over one would be worse. `logCutoverRisks()` prints it at
 * startup so the cutover is a checklist someone reads, not a thing someone
 * remembers.
 *
 * Two kinds of wrong, and the first version only caught one of them:
 *
 *   MISSING - the setting is unset, so a PDT-shaped default applies.
 *   PDT      - the setting IS set, to a value that is only right for PDT.
 *
 * Checking only for "missing" is how the check defeats itself. Queue 90 is the
 * queue Amadeus created for PDT testing; it is written into the environment, so
 * a presence test reports it as fine. At cutover you edit the endpoint, the
 * office and the credentials and leave the rest - which is exactly the shape
 * that slips past a presence test and is caught by a value test.
 */
export const cutoverRisks = (env = process.env) => {
  const onDefault = [];

  // Present-but-empty counts as set: `AMADEUS_WS_UNTICKETABLE_CARRIERS=''` is
  // the deliberate way to say "block nothing", and flagging it would train
  // whoever reads this list to ignore it.
  const missing = (name) => env[name] === undefined || env[name] === null;
  const check = (name, why, pdtValues = []) => {
    if (missing(name)) {
      onDefault.push({ setting: name, kind: 'MISSING', risk: why });
      return;
    }
    const value = String(env[name]).trim();
    if (value && pdtValues.some((pdt) => pdt.toUpperCase() === value.toUpperCase())) {
      onDefault.push({ setting: name, kind: 'PDT', risk: `set to ${value}, which is a PDT value — ${why}` });
    }
  };

  check('AMADEUS_WS_UNTICKETABLE_CARRIERS',
    'unset means the 19-carrier PDT blocklist, not "none": those carriers vanish from search');
  // Learned from one 8102 on the PDT office. A production office may hold the
  // agreement, and the same "unset is not none" trap applies.
  check('AMADEUS_WS_INTERLINE_BLOCKED_PAIRS',
    `unset means the PDT-learned pair list (${DEFAULT_NO_INTERLINE_PAIRS.join(', ')}), not "none"`);
  check('AMADEUS_WS_QUEUE_NUMBER',
    'production needs a queue from the PRD bank', ['50', '90']);
  check('AMADEUS_WS_QUEUE_CATEGORY',
    'the C0 in "queue 90 C0" is PDT-shaped; a production queue may use another category');
  check('AMADEUS_WS_OFFICE_TIME_ZONE',
    'defaults to America/New_York; it decides the same-day void window');
  check('AMADEUS_WS_FOP_CODE',
    'defaults to CASH, correct on PDT and never confirmed against production');
  check('AMADEUS_WS_MARKET_IATA_CODE',
    'defaults to US; it identifies the ticket stock when voiding');
  // Sent in AMA_SecurityHostedUser on every authenticating call. A wrong duty
  // code on the production office reads as an outage, not as a config error.
  check('AMADEUS_WS_DUTY_CODE',
    'defaults to SU; a duty code the production office does not grant looks like an Amadeus outage');

  // The WSAP is not just a credential - it is the label stamped on every offer
  // and compared by the chain's cross-environment guard. Left pinned to the
  // test WSAP while the endpoint moves, that guard compares PDT to PDT, agrees,
  // and lets a cached PDT offer be sold on the production node.
  check('AMADEUS_WS_WSAP',
    'the offer stamp and the chain\'s cross-environment guard both read it', ['1ASIWJETJEC']);
  check('AMADEUS_WS_OFFICE_ID',
    'every sell, price and issuance runs under this office and its authorisations', ['SCK1S2400']);

  const endpoint = String(env.AMADEUS_WS_ENDPOINT || '');
  if (/\btest\b/i.test(endpoint)) {
    onDefault.push({ setting: 'AMADEUS_WS_ENDPOINT', kind: 'PDT', risk: 'still points at the Amadeus TEST node' });
  }

  return onDefault;
};

/**
 * Print the cutover checklist at startup.
 *
 * The reason this exists as a banner rather than a document: the settings it
 * names each fail SILENTLY. A production office running the PDT carrier list
 * looks exactly like an office with no Emirates inventory. There is no error to
 * search for afterwards, so the warning has to arrive before anyone looks.
 *
 * Never throws and never exits — a boot that dies over a warning is worse than
 * the warning.
 */
export const logCutoverRisks = (env = process.env, log = console) => {
  try {
    const risks = cutoverRisks(env);
    if (risks.length === 0) return risks;
    log.warn('⚠️  Amadeus cutover checklist — settings still on a PDT-shaped value:');
    for (const risk of risks) log.warn(`   [${risk.kind}] ${risk.setting} — ${risk.risk}`);
    log.warn('   Each of these fails silently. Confirm every one against the production office.');
    return risks;
  } catch (error) {
    log.warn('Could not evaluate the Amadeus cutover checklist:', error?.message);
    return [];
  }
};
