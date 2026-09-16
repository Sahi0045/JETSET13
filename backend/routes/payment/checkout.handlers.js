import axios from 'axios';
import { supabase, ARC_PAY_CONFIG, ARC_SETTLEMENT_CURRENCY } from './arcpay.config.js';
import { resolveBookingUserId } from '../../utils/bookingOwner.js';
import { verifyFlightCharge } from '../../services/flightCheckout.service.js';
import { isGuestFlightBookingEnabled, isUsableEmail } from '../../services/guestBooking.service.js';
import { getCaller } from './agents.handlers.js';
import { safeReturnUrl } from '../../utils/returnUrl.js';
import { checkoutKey } from '../../utils/tripMatch.js';
import { toPnrName } from '../../../shared/passengerName.js';

const sanitizeRef = (v) => String(v ?? '').replace(/[^A-Za-z0-9_-]/g, '') || '__none__';

/**
 * How long an unpaid flight checkout is handed back, rather than a second one
 * opened for the same trip. A double click, the back button and a second tab
 * all happen within it. It stays well inside the payment page's own 15 minutes
 * (`interaction.timeout: 900` below), so a page handed back still has most of
 * its time left.
 */
export const CHECKOUT_REUSE_WINDOW_MS = 5 * 60 * 1000;

// Scheme and host. Not `URL.origin`, which is the string "null" for the mobile
// app's own schemes (jetsettermobile://), so every app URL would look alike.
const urlOrigin = (value) => {
    try {
        const url = new URL(value);
        return `${url.protocol}//${url.host}`;
    } catch {
        return null;
    }
};

/**
 * This customer's payment page for exactly this trip, opened within the reuse
 * window and not yet touched, or null.
 *
 * "This customer" is the signed-in account, or for a guest the email the
 * checkout was made with. "Exactly this trip" is checkoutKey: the same
 * flights, every traveller detail, the contact details, the coupon and the
 * verified total. Also the same site: local and production share the
 * database, and a page opened on one returns its payer to that one. Anything
 * that cannot be read answers null, and checkout opens a page as it always did.
 */
async function findReusableCheckout({ userId, customerEmail, key, returnOrigin, frontendBaseUrl, now = Date.now() }) {
    const email = String(customerEmail || '').trim().toLowerCase();
    if (!key || !returnOrigin || (!userId && !email)) return null;

    try {
        let query = supabase
            .from('bookings')
            .select('booking_reference, user_id, status, payment_status, created_at, booking_details')
            .eq('travel_type', 'flight')
            .eq('status', 'pending')
            .eq('payment_status', 'unpaid')
            .gte('created_at', new Date(now - CHECKOUT_REUSE_WINDOW_MS).toISOString());
        query = userId
            ? query.eq('user_id', userId)
            : query.is('user_id', null).ilike('booking_details->>customer_email', email);
        const { data, error } = await query.order('created_at', { ascending: false }).limit(10);
        if (error || !Array.isArray(data)) return null;

        for (const row of data) {
            const details = row.booking_details || {};
            // Checked here as well as in the query: the filters above are what
            // keeps anyone else's payment page out, so they are not trusted alone.
            const sameCustomer = userId
                ? row.user_id === userId
                : !row.user_id && String(details.customer_email || '').trim().toLowerCase() === email;
            if (!sameCustomer || row.status !== 'pending' || row.payment_status !== 'unpaid') continue;
            if (details.pnr || details.gds_chain || details.queued_order || details.arc_captured_amount || details.needs_review) continue;
            if (!details.session_id || !details.arc_pay_checkout_url) continue;

            const openedAt = Date.parse(details.checkout_created_at || row.created_at);
            if (!Number.isFinite(openedAt) || now - openedAt < 0 || now - openedAt >= CHECKOUT_REUSE_WINDOW_MS) continue;

            const storedReturn = details.pending_booking_data?.returnUrl;
            if (urlOrigin(safeReturnUrl(storedReturn, frontendBaseUrl)) !== returnOrigin) continue;

            const storedKey = checkoutKey({
                bookingData: details.pending_booking_data?.bookingData,
                customerEmail: details.customer_email,
                total: details.verified_charge?.total,
                couponCode: details.verified_charge?.coupon?.code,
            });
            if (storedKey !== key) continue;

            return { orderId: row.booking_reference, sessionId: details.session_id, checkoutUrl: details.arc_pay_checkout_url };
        }
        return null;
    } catch (lookupError) {
        console.warn('⚠️ Could not look for an open checkout to reuse:', lookupError.message);
        return null;
    }
}

/** `j***@example.com`: enough for a customer to recognise, useless to anyone else. */
const maskEmail = (email) => {
    const value = String(email ?? '').trim();
    const at = value.indexOf('@');
    if (at < 1) return null;
    return `${value[0]}***${value.slice(at)}`;
};

// The travel lines the receipt prints for a payment link. The PNR is left out
// on purpose: with the traveller's surname it opens the booking at the
// airline, and the receipt page is reachable by anyone holding its link.
const RECEIPT_TRAVEL_FIELDS = [
    'airline', 'flight_number', 'departure_city', 'origin', 'arrival_city', 'destination',
    'departure_date', 'return_date', 'passengers', 'class', 'hotel_name', 'cruise_name',
];

/**
 * A payment as the receipt page shows it, for a caller who is not staff and
 * does not own it.
 *
 * `get-payment-details` is public - the receipt at /payment/success opens it
 * with nothing but the id in its URL - and it used to return the whole row:
 * the ARC success indicator and session id, the gateway's order object with
 * the cardholder's name and billing address in `metadata.transaction`, and the
 * raw quote and inquiry. The lookup also accepts a payment link's order id,
 * `PL-<8 characters>-<6 digits>`, which is partly guessable. What remains here
 * is what PaymentSuccess.jsx renders, less the contact details it can do
 * without.
 */
export function toPublicPayment(payment) {
    const link = payment.payment_link;
    const travel = link?.travel_details || {};
    return {
        id: payment.id,
        amount: payment.amount,
        currency: payment.currency,
        payment_status: payment.payment_status,
        payment_method: payment.payment_method ?? null,
        arc_transaction_id: payment.arc_transaction_id ?? null,
        created_at: payment.created_at ?? null,
        completed_at: payment.completed_at ?? null,
        customer_name: payment.customer_name ?? null,
        customer_email: maskEmail(payment.customer_email),
        quote: payment.quote
            ? { quote_number: payment.quote.quote_number ?? null, title: payment.quote.title ?? null }
            : null,
        inquiry: payment.inquiry ? { inquiry_type: payment.inquiry.inquiry_type ?? null } : null,
        ...(link ? {
            payment_link: {
                amount: link.amount,
                currency: link.currency,
                description: link.description ?? null,
                booking_type: link.booking_type ?? null,
                customer_name: link.customer_name ?? null,
                customer_email: maskEmail(link.customer_email),
                travel_details: Object.fromEntries(
                    RECEIPT_TRAVEL_FIELDS.filter((key) => travel[key] != null).map((key) => [key, travel[key]])
                ),
            },
        } : {}),
    };
}

/**
 * Staff, or the signed-in account that raised the inquiry this payment was
 * taken for. The payments table has no owner column of its own; the inquiry's
 * `user_id` is the account link (inquiry.controller.js sets it from the
 * session). An email match is deliberately not enough: an account's email is
 * whatever it was registered with.
 */
async function canReadFullPayment(req, payment) {
    const caller = await getCaller(req);
    if ([caller?.role, req.user?.role].some((role) => ['admin', 'superadmin'].includes(role))) return true;

    const sessionIds = [req.user?.id, req.user?.authUserId].filter(Boolean).map(String);
    if (sessionIds.length === 0) return false;

    let ownerId = payment.inquiry?.user_id ?? null;
    if (!ownerId && payment.inquiry_id) {
        const { data } = await supabase
            .from('inquiries')
            .select('user_id')
            .eq('id', payment.inquiry_id)
            .maybeSingle();
        ownerId = data?.user_id ?? null;
    }
    return Boolean(ownerId) && sessionIds.includes(String(ownerId));
}


// Initiate Payment - Create ARC Pay Hosted Checkout session
export async function handleInitiatePayment(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { quote_id, return_url, cancel_url } = req.body;

        if (!quote_id) {
            return res.status(400).json({
                success: false,
                error: 'quote_id is required'
            });
        }

        console.log('💳 Initiating payment for quote:', quote_id);

        // Fetch quote from database
        const { data: quote, error: quoteError } = await supabase
            .from('quotes')
            .select('*')
            .eq('id', quote_id)
            .single();

        if (quoteError || !quote) {
            console.error('Quote fetch error:', quoteError);
            return res.status(404).json({
                success: false,
                error: 'Quote not found'
            });
        }

        // Fetch inquiry for customer details
        const { data: inquiry } = await supabase
            .from('inquiries')
            .select('customer_email, customer_name')
            .eq('id', quote.inquiry_id)
            .single();

        const customerEmail = inquiry?.customer_email || quote.customer_email;
        const customerName = inquiry?.customer_name || quote.customer_name || 'Customer';

        // Create payment record
        const { data: payment, error: paymentError } = await supabase
            .from('payments')
            .insert([{
                quote_id,
                inquiry_id: quote.inquiry_id,
                amount: quote.total_amount,
                currency: quote.currency || 'USD',
                payment_status: 'pending',
                customer_email: customerEmail,
                customer_name: customerName
            }])
            .select()
            .single();

        if (paymentError) {
            console.error('Payment creation error:', paymentError);
            return res.status(500).json({
                success: false,
                error: 'Failed to create payment record'
            });
        }

        // Create ARC Pay session
        const arcMerchantId = ARC_PAY_CONFIG.MERCHANT_ID;
        const arcApiPassword = ARC_PAY_CONFIG.API_PASSWORD;
        const arcBaseUrl = ARC_PAY_CONFIG.BASE_URL;
        const authHeader = 'Basic ' + Buffer.from(`merchant.${arcMerchantId}:${arcApiPassword}`).toString('base64');

        const frontendBaseUrl = process.env.FRONTEND_URL || 'https://www.jetsetterss.com';
        // The caller's URLs only when they are the site's own (utils/returnUrl.js).
        const finalReturnUrl = safeReturnUrl(return_url, `${frontendBaseUrl}/payment/callback?quote_id=${quote.id}&inquiry_id=${quote.inquiry_id}`);
        const finalCancelUrl = safeReturnUrl(cancel_url, `${frontendBaseUrl}/inquiry/${quote.inquiry_id}?payment=cancelled`);

        const requestBody = {
            apiOperation: 'INITIATE_CHECKOUT',
            interaction: {
                operation: 'PURCHASE',
                returnUrl: finalReturnUrl,
                cancelUrl: finalCancelUrl,
                merchant: { name: 'Jetsetter Travel' },
                displayControl: { billingAddress: 'MANDATORY', customerEmail: 'MANDATORY' },  // Required for 3DS2
                action: {
                    '3DSecure': 'MANDATORY'
                },
                timeout: 900
            },
            order: {
                id: payment.id,
                reference: payment.id,
                amount: parseFloat(quote.total_amount).toFixed(2),
                currency: quote.currency || 'USD',
                description: `Quote ${quote.quote_number || quote.id.slice(-8)} - ${quote.title || 'Travel Booking'}`
            },
            // Force 3DS challenge (OTP) - required for v77 to trigger authentication
            authentication: {
                challengePreference: 'CHALLENGE_MANDATED'
            }
        };

        if (customerEmail) {
            requestBody.customer = { email: customerEmail };
        }

        const sessionUrl = `${arcBaseUrl}/merchant/${arcMerchantId}/session`;
        console.log('🔄 Creating ARC Pay session:', sessionUrl);

        const arcResponse = await axios.post(sessionUrl, requestBody, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authHeader,
                'Accept': 'application/json'
            }
        });

        const session = arcResponse.data;
        const sessionId = session.session?.id || session.sessionId || session.id;
        const successIndicator = session.successIndicator;

        if (!sessionId) {
            console.error('Missing session ID in ARC Pay response:', session);
            return res.status(500).json({
                success: false,
                error: 'Failed to create payment session'
            });
        }

        // Update payment with session ID
        await supabase
            .from('payments')
            .update({
                arc_session_id: sessionId,
                success_indicator: successIndicator,
                arc_order_id: payment.id
            })
            .eq('id', payment.id);

        // HPP (Hosted Payment Page) Redirect URL - simple GET redirect with session ID
        // This matches the format in api/payments.js
        const paymentPageUrl = `https://api.arcpay.travel/checkout/pay/${sessionId}`;

        console.log('✅ Payment session created:', sessionId);

        return res.json({
            success: true,
            sessionId,
            successIndicator,
            merchantId: arcMerchantId,
            paymentId: payment.id,
            paymentPageUrl,
            checkoutUrl: paymentPageUrl,
            redirectMethod: 'GET'
        });

    } catch (error) {
        // Logged, never returned. The gateway's explanation and the raw error
        // name the merchant, the ARC endpoint and what it objected to, which is
        // nothing a customer can act on and a map for anyone probing it.
        console.error('❌ Payment initiation error:', error.response?.status ?? null,
            error.response?.data?.error?.explanation || error.message);
        return res.status(500).json({
            success: false,
            error: 'Payment initiation failed'
        });
    }
}

// Hosted Checkout - Create ARC Pay Hosted Checkout session for direct bookings
export async function handleHostedCheckout(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Never log the body: it carries the customer's name, email, phone and
        // the traveller details behind bookingData.
        console.log('🚀 handleHostedCheckout called for direct booking');

        const {
            amount,
            currency: requestedCurrency = ARC_SETTLEMENT_CURRENCY,
            orderId,
            bookingType = 'flight',
            customerEmail,
            customerName,
            customerPhone,
            description,
            returnUrl,
            cancelUrl,
            bookingData,
            flightData
        } = req.body;

        // Validate required fields. Said in words for the customer: the page
        // shows this text, and "Missing required fields: amount and orderId are
        // required" is what it showed when a coupon took the total to $0.
        if (!amount || !orderId) {
            return res.status(400).json({
                success: false,
                code: 'CHECKOUT_INCOMPLETE',
                error: 'We could not start the payment for this booking. Please go back to the flight and try again. Nothing has been charged.'
            });
        }

        // The charge currency is never the caller's. Clients send their display
        // currency here - the web flight payment falls back to
        // currencyService.getCurrency(), which is whatever the visitor is
        // browsing in - and this merchant answers anything but USD with a 501,
        // so the session is never created and the customer simply cannot pay.
        // Amounts are computed in USD throughout, so USD is also the correct
        // label for the number being sent.
        const currency = ARC_SETTLEMENT_CURRENCY;
        if (requestedCurrency && requestedCurrency !== currency) {
            console.warn(`⚠️ Charging in ${currency}; caller asked for ${requestedCurrency}, which this merchant cannot settle`);
        }

        // A flight is charged what the airline prices it at plus the configured
        // fee, less a coupon the server evaluated itself - never the body's
        // `amount`. See services/flightCheckout.service.js for what that fixes.
        // An order reference names one booking. Checkout used to upsert on it
        // whatever the row already held - a paid booking, a PNR, someone else's
        // checkout - resetting it to unpaid and minting a new payment secret for
        // whoever asked. Only a fresh reference, or the same customer starting
        // their own unpaid checkout again, may open a session.
        const { data: existingRow } = await supabase
            .from('bookings')
            .select('user_id, status, payment_status, booking_details')
            .eq('booking_reference', orderId)
            .maybeSingle();
        if (existingRow) {
            const details = existingRow.booking_details || {};
            const sessionUserId = resolveBookingUserId(req);
            const sameCustomer = existingRow.user_id
                ? existingRow.user_id === sessionUserId
                : !sessionUserId && Boolean(customerEmail)
                    && String(details.customer_email || '').trim().toLowerCase() === String(customerEmail).trim().toLowerCase();
            const untouched = existingRow.status === 'pending' && existingRow.payment_status === 'unpaid'
                && !details.pnr && !details.gds_chain && !details.queued_order && !details.arc_captured_amount;
            if (!sameCustomer || !untouched) {
                console.warn('⛔ Checkout refused: order reference already in use', { orderId });
                return res.status(409).json({
                    success: false,
                    code: 'ORDER_REFERENCE_IN_USE',
                    error: 'This checkout has already been used. Please start again from the flight. Nothing has been charged.',
                });
            }
        }

        const frontendBaseUrl = process.env.FRONTEND_URL || 'https://www.jetsetterss.com';
        // Where ARC sends the payer afterwards: the caller's URL only when it is
        // one of ours (utils/returnUrl.js), otherwise the site's default.
        const finalReturnUrl = safeReturnUrl(returnUrl, `${frontendBaseUrl}/payment/callback?orderId=${orderId}&bookingType=${bookingType}`);
        const finalCancelUrl = safeReturnUrl(cancelUrl, `${frontendBaseUrl}/${bookingType}-payment?cancelled=true`);

        // A payment page this customer already opened for exactly this trip,
        // handed back under its own reference. Never with its success
        // indicator: whoever opens a checkout is never given the secret that
        // proves who paid (see the response at the end).
        const handBack = (reusable) => {
            console.log('♻️ Handing back the payment page already open for this trip', { orderId: reusable.orderId, requested: orderId });
            return res.status(200).json({
                success: true,
                sessionId: reusable.sessionId,
                merchantId: ARC_PAY_CONFIG.MERCHANT_ID,
                orderId: reusable.orderId,
                paymentPageUrl: reusable.checkoutUrl,
                checkoutUrl: reusable.checkoutUrl,
                redirectMethod: 'GET',
                reused: true,
                message: 'This trip already has a payment page open, so that one is used.'
            });
        };

        let chargeAmount = amount;
        let verifiedCharge = null;
        if (bookingType === 'flight') {
            // Flights are booked from an account unless an admin has switched
            // guest booking on (admin panel > Feature Flags). A guest booking
            // has no owner, so it never appears in My Trips: the only way back
            // to it is the email it was made with, which the page used to mark
            // optional. Both are checked here, before the fare is priced or a
            // payment session exists. See services/guestBooking.service.js.
            const signedInUserId = resolveBookingUserId(req);
            if (!signedInUserId) {
                if (!(await isGuestFlightBookingEnabled(supabase))) {
                    return res.status(401).json({
                        success: false,
                        code: 'LOGIN_REQUIRED',
                        error: 'Please log in to book a flight. Nothing has been charged.',
                    });
                }
                if (!isUsableEmail(customerEmail)) {
                    return res.status(400).json({
                        success: false,
                        code: 'EMAIL_REQUIRED',
                        error: 'Please enter an email address. Your ticket is sent there, and it is how you find this booking without an account. Nothing has been charged.',
                    });
                }
            }
            // The page this customer opened moments ago for exactly this trip,
            // looked for before the fare is priced again. A retry priced the
            // fare again - up to 25 seconds - before it found the payment page
            // it had already opened, and the review page had given up after 10.
            // The open page was made for a total the airline's price verified;
            // it is handed back only when this request asks for that same total
            // with the same coupon, as well as the same flights, travellers and
            // contact details (utils/tripMatch.js). Anything else is priced.
            const openPage = await findReusableCheckout({
                userId: signedInUserId,
                customerEmail,
                key: checkoutKey({ bookingData, customerEmail, total: amount, couponCode: req.body.couponCode }),
                returnOrigin: urlOrigin(finalReturnUrl),
                frontendBaseUrl,
            });
            if (openPage) return handBack(openPage);

            const verdict = await verifyFlightCharge({
                client: supabase,
                amount,
                bookingData,
                couponCode: req.body.couponCode,
                userId: signedInUserId,
                // A guest's coupon limit is kept by email, as they have no account.
                email: customerEmail,
                settlementCurrency: currency,
            });
            if (!verdict.ok) {
                console.warn('⛔ Flight checkout refused:', { orderId, code: verdict.code });
                return res.status(verdict.status).json({
                    success: false,
                    error: verdict.message,
                    code: verdict.code,
                    ...(verdict.charge ? { expectedAmount: verdict.charge.total, charge: verdict.charge } : {}),
                    ...(verdict.pricedFare ? { pricedFare: verdict.pricedFare } : {}),
                });
            }
            // What was charged, for this fare, and when the airline last confirmed
            // it. The order route books this fare and nothing else, and holds the
            // airline's price and the payment to these figures.
            verifiedCharge = {
                ...verdict.charge,
                coupon: verdict.coupon,
                pricedFare: verdict.pricedFare,
                verifiedAt: new Date().toISOString(),
            };
            chargeAmount = verdict.charge.total;
        }

        console.log('💳 Creating ARC Pay hosted checkout session...');
        console.log('   Order ID:', orderId);
        console.log('   Amount:', chargeAmount, currency);
        console.log('   Booking Type:', bookingType);

        // ARC Pay credentials
        const arcMerchantId = ARC_PAY_CONFIG.MERCHANT_ID;
        const arcApiPassword = ARC_PAY_CONFIG.API_PASSWORD;
        let arcBaseUrl = ARC_PAY_CONFIG.BASE_URL;

        // Use configured API version (v77) — do NOT upgrade, merchant is configured for v77
        if (arcBaseUrl && arcBaseUrl.includes('/merchant/')) {
            arcBaseUrl = arcBaseUrl.split('/merchant/')[0];
        }
        arcBaseUrl = arcBaseUrl || 'https://api.arcpay.travel/api/rest/version/77';

        const authHeader = 'Basic ' + Buffer.from(`merchant.${arcMerchantId}:${arcApiPassword}`).toString('base64');

        // One trip, one open payment page. Every Pay click on the review page
        // opened a new session under a new reference, so a double click, the
        // back button after the payment page opened, or a second tab gave the
        // customer two live payment pages - and two paid checkouts were booked
        // as two PNRs and two charges. The page this customer opened moments ago
        // for exactly this trip is handed back instead, under its own reference.
        // Its success indicator is not: whoever opens a checkout is never given
        // the secret that proves who paid (see the response at the end).
        //
        // Looked for again at the verified total: the page may have asked for a
        // figure the open page was not made for, or another request may have
        // opened one while this one was pricing.
        if (bookingType === 'flight') {
            const reusable = await findReusableCheckout({
                userId: resolveBookingUserId(req),
                customerEmail,
                key: checkoutKey({ bookingData, customerEmail, total: chargeAmount, couponCode: verifiedCharge?.coupon?.code }),
                returnOrigin: urlOrigin(finalReturnUrl),
                frontendBaseUrl,
            });
            if (reusable) return handBack(reusable);
        }

        const cleanBaseUrl = arcBaseUrl.replace(/\/$/, '');
        const sessionUrl = `${cleanBaseUrl}/merchant/${arcMerchantId}/session`;

        // Parse customer name
        const nameParts = (customerName || 'Guest User').split(' ');
        const firstName = nameParts[0] || 'Guest';
        const lastName = nameParts.slice(1).join(' ') || 'User';

        // Build request
        const requestBody = {
            apiOperation: 'INITIATE_CHECKOUT',
            interaction: {
                operation: 'PURCHASE',
                returnUrl: finalReturnUrl,
                cancelUrl: finalCancelUrl,
                merchant: { name: 'Jetsetter Travel' },
                displayControl: {
                    billingAddress: 'MANDATORY',
                    customerEmail: 'MANDATORY'
                },
                timeout: 900
            },
            order: {
                id: orderId,
                reference: orderId,
                amount: Number(chargeAmount).toFixed(2),
                currency: currency,
                description: description || `${bookingType.charAt(0).toUpperCase() + bookingType.slice(1)} Booking - ${orderId}`
            }
            // NOTE: 3DS is handled automatically by ARC Pay's Hosted Checkout based on merchant profile settings
        };

        // ARC Pay Airline Data for Card Brand Interchange
        const enableAirlineData = process.env.ARC_ENABLE_AIRLINE_DATA !== 'false';

        if (bookingType === 'flight' && enableAirlineData) {
            try {
                console.log('🔍 Processing airline data for ARC Pay...');

                const flight = flightData || bookingData?.selectedFlight || bookingData?.flightData || {};
                // Every itinerary: a round trip's return is the second one.
                // Only the first was read, so the legs home were never sent and
                // the card network was told the trip was one way.
                const itineraries = Array.isArray(flight?.itineraries) ? flight.itineraries
                    : flight?.itinerary ? [flight.itinerary] : [];
                const itinerarySegments = itineraries.flatMap((itinerary) => (Array.isArray(itinerary?.segments) ? itinerary.segments : []));
                const segments = itinerarySegments.length > 0 ? itinerarySegments :
                    Array.isArray(flight?.segments) ? flight.segments : [];
                // Where the trip goes is the end of the outbound, not the last
                // leg, which on a round trip lands back where it started.
                const outbound = Array.isArray(itineraries[0]?.segments) && itineraries[0].segments.length > 0
                    ? itineraries[0].segments : segments;

                const origin = flight?.origin || flight?.departureAirport || segments?.[0]?.departure?.iataCode || 'XXX';
                const destination = flight?.destination || flight?.arrivalAirport || outbound?.[outbound.length - 1]?.arrival?.iataCode || 'XXX';

                const actualCarrierCode = (flight?.carrierCode || segments?.[0]?.carrierCode || segments?.[0]?.carrier || 'XX').substring(0, 2).toUpperCase();
                // Acquirer may reject if carrierName doesn't match a real airline when airline data is present
                const fallbackAirlineName = flight?.airline || flight?.airlineName || segments?.[0]?.carrierName || 'AIRLINE';
                const actualCarrierName = typeof fallbackAirlineName === 'string' ? fallbackAirlineName : 'AIRLINE';

                // ARC airline-interchange fields are alphanumeric-only — strip spaces/punctuation
                // (e.g. "JetSet Travel LLC" -> "JetSetTravelLLC") or ARC rejects the request with
                // "Invalid character ' '".
                const sanitizeAirlineField = (v, max) => String(v || '').replace(/[^A-Za-z0-9]/g, '').substring(0, max);
                // The agency's own ARC accreditation number, from configuration
                // only. When unset it used to be made up - the merchant id with a
                // test prefix stripped, else the test merchant's digits - so the
                // live merchant sent the first 8 characters of its merchant id to
                // the card network as an agency code. With no real code there is
                // no honest airline data to send, so none is; the charge goes
                // through without it, the same as for a missing itinerary below.
                const travelAgentCode = sanitizeAirlineField(process.env.ARC_TRAVEL_AGENT_CODE, 25);
                if (!travelAgentCode) {
                    throw new Error('ARC_TRAVEL_AGENT_CODE is not set');
                }
                const travelAgentName = sanitizeAirlineField(process.env.ARC_TRAVEL_AGENT_NAME || 'Jetsetters Corporation', 25);

                // Real names only. A traveller with no usable name is left out
                // rather than sent to the card network as "TEST TRAVELER".
                // Spelled as the PNR spells it (shared/passengerName.js), so
                // "Łukasz" reaches the card network as LUKASZ, not UKASZ.
                const cleanName = (v) => toPnrName(v).replace(/[^A-Z\s]/g, '').trim().substring(0, 20);
                const passengers = bookingData?.passengerData || bookingData?.travelers || [];
                const passengerList = passengers
                    .map(p => ({
                        firstName: cleanName(p.firstName || p.name?.firstName),
                        lastName: cleanName(p.lastName || p.name?.lastName)
                    }))
                    .filter(p => p.firstName && p.lastName);

                const safeDepartureDate = (segmentDeparture) => {
                    if (!segmentDeparture) return new Date().toISOString().split('T')[0];

                    // Direct 'at' ISO string
                    const atValue = segmentDeparture.at || segmentDeparture.rawDate;
                    if (atValue) {
                        const dateCandidate = atValue.includes('T') ? atValue.split('T')[0] : atValue;
                        if (/^\d{4}-\d{2}-\d{2}$/.test(dateCandidate)) return dateCandidate;
                    }

                    return new Date().toISOString().split('T')[0];
                };

                const extractDepartureTime = (segmentDeparture) => {
                    if (!segmentDeparture) return '00:00+00:00';

                    // 1. Try 'at' ISO string first: 2026-04-13T10:30:00+05:30
                    if (segmentDeparture.at && segmentDeparture.at.includes('T')) {
                        const timePart = segmentDeparture.at.split('T')[1];
                        if (timePart.includes('+') || timePart.includes('-')) {
                            const offsetIdx = timePart.includes('+') ? timePart.indexOf('+') : timePart.indexOf('-');
                            const rawTime = timePart.substring(0, offsetIdx);
                            const offset = timePart.substring(offsetIdx);
                            const timeParts = rawTime.split(':');
                            const hhmm = `${timeParts[0] || '00'}:${timeParts[1] || '00'}`;
                            return `${hhmm}${offset}`;
                        } else if (timePart.endsWith('Z')) {
                            const rawTime = timePart.replace('Z', '');
                            const timeParts = rawTime.split(':');
                            const hhmm = `${timeParts[0] || '00'}:${timeParts[1] || '00'}`;
                            return `${hhmm}Z`;
                        } else {
                            const timeParts = timePart.split(':');
                            const hhmm = `${timeParts[0] || '00'}:${timeParts[1] || '00'}`;
                            return `${hhmm}+00:00`;
                        }
                    }

                    // 2. Try flattened 'time' property OR 'at' without 'T': "10:30 AM" or "22:30"
                    const timeStrRaw = segmentDeparture.time || segmentDeparture.at || segmentDeparture.rawTime;
                    if (timeStrRaw && typeof timeStrRaw === 'string' && timeStrRaw.includes(':')) {
                        let timeStr = timeStrRaw;
                        let isPM = timeStr.toLowerCase().includes('pm');
                        let isAM = timeStr.toLowerCase().includes('am');
                        timeStr = timeStr.replace(/[^0-9:]/g, ''); // Extract just '10:30' from '10:30 AM'

                        let [hours = '00', minutes = '00'] = timeStr.split(':');
                        let h = parseInt(hours, 10);
                        if (isPM && h < 12) h += 12;
                        if (isAM && h === 12) h = 0;

                        const hhmm = `${String(h).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
                        return `${hhmm}+00:00`; // Assume UTC if no offset available
                    }

                    return '00:00+00:00';
                };

                const legArray = segments.length > 0
                    ? segments.map((segment, index) => {
                        const segCarrier = (segment?.carrierCode || segment?.carrier || actualCarrierCode).substring(0, 2).toUpperCase();
                        // MPGS Max length for flight number is 4-5 alphanumeric. Example format AI131.
                        // A leg with no flight number is not sent with an
                        // invented one: it used to fall back to the segment's
                        // position, and the offer id before that.
                        const rawNumber = segment?.number || segment?.flightNumber;
                        if (!rawNumber) return null;
                        const rawFNum = String(rawNumber).replace(/[^0-9A-Z]/gi, '');
                        // Check if it already has the carrier code prepended, if not prepend it
                        let fNum = rawFNum.startsWith(segCarrier) ? rawFNum : `${segCarrier}${rawFNum}`;

                        // Enforce minimum 4 characters (ARC Pay strictly requires length 4 to 5)
                        if (fNum.length < 4) {
                            const letters = fNum.replace(/[0-9]/g, '');
                            const numbers = fNum.replace(/[^0-9]/g, '');
                            fNum = `${letters}${numbers.padStart(4 - letters.length, '0')}`;
                        }

                        return {
                            carrierCode: segCarrier,
                            departureAirport: (segment?.departure?.iataCode || origin).substring(0, 3).toUpperCase(),
                            departureDate: safeDepartureDate(segment?.departure),
                            departureTime: extractDepartureTime(segment?.departure),
                            destinationAirport: (segment?.arrival?.iataCode || destination).substring(0, 3).toUpperCase(),
                            flightNumber: fNum.substring(0, 5), // Max length 5
                            travelClass: 'W' // Changed from Y to W as per user requirements
                        }
                    })
                    : [];

                // Without a real itinerary and real traveller names there is no
                // honest airline data to send. It used to invent a leg - carrier
                // XD, flight AI131 - and send that instead. The charge still goes
                // through, just without interchange data.
                if (legArray.length === 0 || legArray.some((leg) => !leg) || passengerList.length === 0) {
                    throw new Error('no complete itinerary or traveller names for airline data');
                }

                const bookingRef = String(flight?.pnr || flight?.bookingReference || orderId).substring(0, 6).toUpperCase();

                // The document is the agency's own charge order, so its number is
                // our order reference - not a ticket number assembled from the
                // route and the clock, which is what used to be sent.
                const ticketNumber = String(orderId).replace(/[^A-Za-z0-9]/g, '').slice(-13).toUpperCase();

                requestBody.airline = {
                    bookingReference: bookingRef,
                    documentType: 'AGENCY_MISCELLANEOUS_CHARGE_ORDER', // Reverted back to the working example documentType
                    itinerary: { leg: legArray, numberInParty: String(passengerList.length) },
                    passenger: passengerList,
                    ticket: {
                        issue: {
                            travelAgentCode: travelAgentCode,
                            travelAgentName: travelAgentName.substring(0, 25)
                        },
                        ticketNumber: ticketNumber, // example format: BOM1234567LHR
                        // totalFare, totalFees, and totalTaxes were omitted in the working example,
                        // so we don't include them if they cause strict validation errors.
                    }
                };

                // Only embed airline data for MPGS gateway
                // Card brand interchange has VERY strict rules.
                console.log('✈️ ARC Pay Airline Data mapped successfully:', JSON.stringify(requestBody.airline, null, 2));
            } catch (airlineError) {
                // Expected when the data is incomplete or unconfigured: the charge
                // is created without airline data. The reason is enough to log.
                console.warn('⚠️ No airline data sent with this charge:', airlineError.message);
            }
        }

        // Add customer info
        if (customerEmail) {
            requestBody.customer = { email: customerEmail, firstName, lastName };
            if (customerPhone) {
                const cleanPhone = customerPhone.replace(/\D/g, '');
                if (cleanPhone) requestBody.customer.mobilePhone = cleanPhone;
            }
        }

        console.log('📤 ARC Pay Request to:', sessionUrl);

        const response = await axios.post(sessionUrl, requestBody, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authHeader,
                'Accept': 'application/json'
            },
            timeout: 30000
        });

        const session = response.data;
        const sessionId = session.session?.id || session.sessionId || session.id;
        const successIndicator = session.successIndicator;

        if (!sessionId) {
            console.error('❌ Session ID not found in response');
            return res.status(500).json({
                success: false,
                error: 'Invalid response from payment gateway',
                details: 'Session ID not found'
            });
        }

        console.log('✅ ARC Pay session created:', sessionId);

        const paymentPageUrl = `https://api.arcpay.travel/checkout/pay/${sessionId}`;

        /**
         * The booking row is not optional, and a failure to write it must not
         * hand back a payment page.
         *
         * This used to `await supabase...upsert(...)` without reading the
         * result. supabase-js does not throw on a rejected write - it answers
         * `{ data, error }` - so a foreign key on `user_id`, an RLS refusal or
         * a CHECK violation logged "Pending booking saved to DB" and returned
         * 200 with a live ARC checkout URL. The `catch` below only ever caught
         * a transport error.
         *
         * The old comment said localStorage was a fallback. It is not: the
         * order route finds the booking by reading THIS row
         * (`findExistingBooking`) and answers 402 PAYMENT_NOT_FOUND without it
         * (flight.routes.js), and every job - abandoned checkout, the booking
         * queue, both alarms, ticket sync - starts from the `bookings` table.
         * A customer who paid with no row would have had no ticket, no refund,
         * no alert and no record anywhere. Permanently invisible.
         *
         * So the write is checked, and a checkout that cannot be recorded is
         * refused. The ARC session already exists at this point, but a session
         * nobody is sent to costs nothing: money moves only when a customer
         * pays on the page, and that page is what we withhold.
         */
        try {
            const passengerDetails = bookingData?.passengerData || bookingData?.travelers || [];
            // Own the row from the moment it exists. Without this the booking
            // is created here with no user, and My Trips - which lists the
            // signed-in user's bookings - can never show it, however the rest
            // of the flow goes. `resolveBookingUserId` reads the verified
            // session; a genuine guest still books, with null.
            const ownerId = resolveBookingUserId(req);

            const bookingRow = (userId) => ({
                booking_reference: orderId,
                travel_type: bookingType || 'flight',
                status: 'pending',
                ...(userId ? { user_id: userId } : {}),
                // What ARC was asked to charge: for a flight, the verified figure.
                total_amount: parseFloat(chargeAmount) || 0,
                payment_status: 'unpaid',
                booking_details: {
                    order_id: orderId,
                    session_id: sessionId,
                    success_indicator: successIndicator,
                    pending_booking_data: req.body,
                    // How the charge was arrived at: the airline's fare, the fee,
                    // any coupon. The support desk's answer to "why this amount".
                    ...(verifiedCharge ? { verified_charge: verifiedCharge } : {}),
                    customer_email: customerEmail || null,
                    arc_pay_checkout_url: paymentPageUrl,
                    checkout_created_at: new Date().toISOString()
                },
                passenger_details: Array.isArray(passengerDetails) ? passengerDetails : []
            });

            const write = (userId) => supabase.from('bookings')
                .upsert(bookingRow(userId), { onConflict: 'booking_reference' });

            let { error: saveError } = await write(ownerId);

            /**
             * An owner the bookings table cannot accept is not a reason to
             * refuse the sale.
             *
             * `bookings.user_id` REFERENCES auth.users(id), and
             * `resolveBookingUserId` can legitimately return an id that is not
             * in that table: a travel agent's token carries a `travel_agents`
             * id, a legacy login a `public.users` id, and
             * `autoProvisionSupabaseUser` used to mint ids unrelated to
             * auth.users (models/user.model.js documents this as the ORIGINAL
             * cause of the paid-with-no-row bug). The order route has always
             * recovered by saving without the owner
             * (flight.routes.js, "Retrying booking save without user_id"), and
             * checkout refusing instead would have stopped those customers
             * buying at all.
             *
             * So: drop the owner and try once more. The booking is then
             * unowned - it will not appear in My Trips until it is claimed -
             * which is the same trade the order route already makes, and far
             * better than no booking.
             */
            const ownerRejected = ownerId && (
                saveError?.code === '23503' || saveError?.code === '42501'
                || /violates foreign key|row-level security/i.test(saveError?.message || '')
            );
            if (ownerRejected) {
                console.warn('🔄 Checkout: the booking owner was rejected, saving without one', {
                    orderId, code: saveError.code,
                });
                ({ error: saveError } = await write(null));
            }

            if (saveError) throw saveError;
            console.log('💾 Pending booking saved to DB:', orderId);
        } catch (dbError) {
            console.error('❌ Refusing checkout: the booking could not be recorded', {
                orderId,
                bookingType,
                reason: dbError?.message || String(dbError),
                code: dbError?.code,
            });
            return res.status(503).json({
                success: false,
                error: 'We could not start your payment just now, so nothing has been charged. Please try again in a moment, or call (877) 538-7380 and we will book it for you.',
                code: 'CHECKOUT_NOT_RECORDED',
            });
        }

        // No success indicator. It is the secret that proves who paid - the order
        // route accepts it as the payer's proof - and ARC hands it to the payer's
        // own browser on the way back. Returning it here handed it to whoever
        // opened the session, before any payment.
        return res.status(200).json({
            success: true,
            sessionId,
            merchantId: arcMerchantId,
            orderId,
            paymentPageUrl,
            checkoutUrl: paymentPageUrl,
            redirectMethod: 'GET',
            message: 'Hosted checkout session created successfully'
        });

    } catch (error) {
        // Logged, never returned - see handleInitiatePayment. And not the error
        // object itself: an axios error carries the request it made, whose
        // Authorization header is the merchant's API password.
        console.error('❌ Hosted checkout error:', error.response?.status ?? null,
            error.response?.data?.error?.explanation || error.message);
        return res.status(500).json({
            success: false,
            error: 'Failed to create hosted checkout'
        });
    }
}

// Get Pending Booking - Retrieve saved booking data from DB
export async function handleGetPendingBooking(req, res) {
    try {
        const orderId = req.query.orderId || req.body?.orderId;
        const resultIndicator = req.query.resultIndicator || req.body?.resultIndicator;
        if (!orderId) {
            return res.status(400).json({ success: false, error: 'orderId is required' });
        }

        // Reached from the ARC Pay return page, which has no login session, so
        // this cannot use `protect`. Authorisation is the payment's
        // successIndicator instead — a secret ARC hands only to the browser that
        // actually completed the payment, stored on the booking as
        // `booking_details.success_indicator`. Without this check the endpoint
        // returned every booking's passenger PII (passport included) to anyone
        // who guessed the timestamp-derived orderId.
        const { data: booking, error } = await supabase
            .from('bookings')
            .select('total_amount, status, payment_status, booking_reference, booking_details')
            .eq('booking_reference', orderId)
            .single();

        if (error || !booking) {
            return res.status(404).json({ success: false, error: 'Pending booking not found' });
        }

        const expected = booking.booking_details?.success_indicator;
        if (!expected || !resultIndicator || resultIndicator !== expected) {
            return res.status(403).json({ success: false, error: 'Payment verification required' });
        }

        // Return ONLY what the callback consumes — the pending-booking blob, the
        // ARC session id and the amount. Never the passenger_details column.
        return res.json({
            success: true,
            booking: {
                booking_reference: booking.booking_reference,
                total_amount: booking.total_amount,
                status: booking.status,
                payment_status: booking.payment_status,
                booking_details: { session_id: booking.booking_details?.session_id || null }
            },
            pendingBookingData: booking.booking_details?.pending_booking_data || null
        });
    } catch (error) {
        console.error('Get pending booking error:', error);
        return res.status(500).json({ success: false, error: 'Could not load this booking. Please try again.' });
    }
}

// Session Create - Create ARC Pay session
export async function handleSessionCreate(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const arcMerchantId = ARC_PAY_CONFIG.MERCHANT_ID;
        const arcApiPassword = ARC_PAY_CONFIG.API_PASSWORD;
        let arcBaseUrl = ARC_PAY_CONFIG.BASE_URL || 'https://api.arcpay.travel/api/rest/version/100';

        if (arcBaseUrl.includes('/merchant/')) {
            arcBaseUrl = arcBaseUrl.split('/merchant/')[0];
        }

        const sessionUrl = `${arcBaseUrl}/merchant/${arcMerchantId}/session`;
        const authHeader = 'Basic ' + Buffer.from(`merchant.${arcMerchantId}:${arcApiPassword}`).toString('base64');

        const response = await axios.post(sessionUrl, {}, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authHeader
            },
            timeout: 30000
        });

        return res.json({
            success: true,
            sessionData: response.data,
            message: 'Session created successfully'
        });

    } catch (error) {
        console.error('❌ Session create error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to create session'
        });
    }
}

// Payment Callback - Handle ARC Pay redirect
export async function handlePaymentCallback(req, res) {
    try {
        console.log('📥 Payment callback received:', { query: req.query, body: req.body });

        const resultIndicator = req.body?.resultIndicator || req.query?.resultIndicator;
        const sessionId = req.body?.sessionId || req.query?.sessionId || req.body?.['session.id'] || req.query?.['session.id'];
        const quoteId = req.body?.quote_id || req.query?.quote_id;
        const inquiryId = req.body?.inquiry_id || req.query?.inquiry_id;

        // Find payment record
        let payment;
        if (sessionId) {
            const { data } = await supabase
                .from('payments')
                .select('*, quote:quotes(*)')
                .eq('arc_session_id', sessionId)
                .single();
            payment = data;
        } else if (quoteId) {
            const { data } = await supabase
                .from('payments')
                .select('*, quote:quotes(*)')
                .eq('quote_id', quoteId)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();
            payment = data;
        }

        if (!payment) {
            console.error('Payment not found for callback');
            const redirectInquiryId = inquiryId || payment?.inquiry_id;
            if (redirectInquiryId) {
                return res.redirect(`/inquiry/${redirectInquiryId}?payment=failed&error=invalid_session`);
            }
            return res.redirect('/payment/failed?error=invalid_session');
        }

        // Verify success indicator if provided
        if (resultIndicator && payment.success_indicator && resultIndicator !== payment.success_indicator) {
            console.error('Result indicator mismatch');
            return res.redirect(`/inquiry/${payment.inquiry_id}?payment=failed&error=invalid_indicator`);
        }

        // Get transaction status from ARC Pay
        const authHeader = 'Basic ' + Buffer.from(`merchant.${ARC_PAY_CONFIG.MERCHANT_ID}:${ARC_PAY_CONFIG.API_PASSWORD}`).toString('base64');

        let transaction;
        try {
            const orderResponse = await axios.get(
                `${ARC_PAY_CONFIG.BASE_URL}/merchant/${ARC_PAY_CONFIG.MERCHANT_ID}/order/${payment.id}`,
                { headers: { 'Authorization': authHeader, 'Accept': 'application/json' } }
            );
            transaction = orderResponse.data;
            // The order object carries the cardholder's name and billing
            // address alongside the masked card, so only the decision-relevant
            // fields are logged.
            console.log('📋 Order retrieved:', {
                orderId: transaction?.id,
                status: transaction?.status,
                result: transaction?.result,
                transactions: transaction?.transaction?.length ?? 0,
            });
        } catch (orderError) {
            console.error('Failed to get order status:', orderError.message);
        }

        // Determine payment status
        const transactionArray = transaction?.transaction || [];
        const latestTxn = transactionArray[transactionArray.length - 1];
        const result = latestTxn?.result || transaction?.result;
        const gatewayCode = latestTxn?.response?.gatewayCode || transaction?.response?.gatewayCode;
        const orderStatus = transaction?.status;

        console.log('📊 Transaction analysis:', { result, gatewayCode, orderStatus });

        // Check if payment is successful
        const isSuccess = result === 'SUCCESS' && (gatewayCode === 'APPROVED' || !gatewayCode);

        if (isSuccess) {
            console.log('✅ Payment successful');

            await supabase
                .from('payments')
                .update({
                    payment_status: 'completed',
                    completed_at: new Date().toISOString(),
                    arc_transaction_id: latestTxn?.transaction?.id || transaction?.id,
                    metadata: { transaction }
                })
                .eq('id', payment.id);

            await supabase
                .from('quotes')
                .update({ payment_status: 'paid', paid_at: new Date().toISOString(), status: 'paid' })
                .eq('id', payment.quote_id);

            await supabase
                .from('inquiries')
                .update({ status: 'paid' })
                .eq('id', payment.inquiry_id);

            // Update payment link status if this came from a payment link
            const paymentLinkToken = req.query?.paymentLinkToken || req.body?.paymentLinkToken;
            if (paymentLinkToken) {
                console.log('🔗 Updating payment link status to paid:', paymentLinkToken);
                await supabase
                    .from('payment_links')
                    .update({ status: 'paid', paid_at: new Date().toISOString(), payment_id: payment.id })
                    .eq('link_token', paymentLinkToken);
            } else if (payment.metadata?.payment_link_token) {
                console.log('🔗 Updating payment link status to paid from metadata:', payment.metadata.payment_link_token);
                await supabase
                    .from('payment_links')
                    .update({ status: 'paid', paid_at: new Date().toISOString(), payment_id: payment.id })
                    .eq('link_token', payment.metadata.payment_link_token);
            }

            // 🎉 Send booking confirmation email
            try {
                const { sendBookingNotificationEmails } = await import('../../services/emailService.js');
                console.log('📧 Sending booking confirmation email...');

                // Fetch inquiry data for email
                let inquiry = null;
                if (payment.inquiry_id) {
                    const { data: inqData } = await supabase.from('inquiries').select('*').eq('id', payment.inquiry_id).single();
                    inquiry = inqData;
                }

                const bookingEmailData = {
                    customerEmail: payment.customer_email || inquiry?.customer_email,
                    customerName: payment.customer_name || inquiry?.customer_name || 'Valued Customer',
                    bookingReference: payment.quote?.quote_number || payment.id.slice(-8).toUpperCase(),
                    bookingType: inquiry?.inquiry_type || 'travel',
                    paymentAmount: payment.amount,
                    currency: payment.currency || 'USD',
                    travelDate: inquiry?.flight_departure_date || inquiry?.hotel_checkin_date || inquiry?.cruise_departure_date || inquiry?.package_start_date,
                    passengers: inquiry?.flight_passengers || inquiry?.hotel_guests || inquiry?.cruise_passengers || inquiry?.package_travelers || 1,
                    bookingDetails: {
                        origin: inquiry?.flight_origin,
                        destination: inquiry?.flight_destination,
                        hotelName: inquiry?.hotel_destination,
                        cruiseLine: inquiry?.cruise_destination
                    }
                };

                const emailResult = await sendBookingNotificationEmails(bookingEmailData);
                if (emailResult.success) {
                    console.log('✅ Booking confirmation email sent successfully');
                } else {
                    console.warn('⚠️ Booking email sent with issues:', emailResult.error);
                }
            } catch (emailError) {
                console.error('❌ Failed to send booking confirmation email:', emailError.message);
            }

            return res.redirect(`/payment/success?paymentId=${payment.id}`);
        } else if (result === 'PENDING' || orderStatus === 'AUTHENTICATED') {
            console.log('⏳ Payment pending or needs PAY call');

            // Try to call PAY if authenticated but not paid
            if (orderStatus === 'AUTHENTICATED') {
                const authTxnId = transaction?.authentication?.transactionId ||
                    transaction?.authentication?.['3ds']?.transactionId ||
                    latestTxn?.authentication?.transactionId;

                if (authTxnId) {
                    try {
                        const payResponse = await axios.put(
                            `${ARC_PAY_CONFIG.BASE_URL}/merchant/${ARC_PAY_CONFIG.MERCHANT_ID}/order/${payment.id}/transaction/pay-${Date.now()}`,
                            {
                                apiOperation: 'PAY',
                                authentication: { transactionId: authTxnId },
                                session: { id: payment.arc_session_id },
                                transaction: { reference: `PAY-${payment.id}` }
                            },
                            { headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' } }
                        );

                        if (payResponse.data.result === 'SUCCESS') {
                            await supabase
                                .from('payments')
                                .update({ payment_status: 'completed', completed_at: new Date().toISOString() })
                                .eq('id', payment.id);

                            await supabase.from('quotes').update({ payment_status: 'paid', status: 'paid' }).eq('id', payment.quote_id);
                            await supabase.from('inquiries').update({ status: 'paid' }).eq('id', payment.inquiry_id);

                            // 🎉 Send booking confirmation email (after PAY)
                            try {
                                const { sendBookingNotificationEmails } = await import('../../services/emailService.js');
                                console.log('📧 Sending booking confirmation email (after PAY)...');

                                let inquiry2 = null;
                                if (payment.inquiry_id) {
                                    const { data: inqData2 } = await supabase.from('inquiries').select('*').eq('id', payment.inquiry_id).single();
                                    inquiry2 = inqData2;
                                }

                                const bookingEmailData2 = {
                                    customerEmail: payment.customer_email || inquiry2?.customer_email,
                                    customerName: payment.customer_name || inquiry2?.customer_name || 'Valued Customer',
                                    bookingReference: payment.quote?.quote_number || payment.id.slice(-8).toUpperCase(),
                                    bookingType: inquiry2?.inquiry_type || 'travel',
                                    paymentAmount: payment.amount,
                                    currency: payment.currency || 'USD',
                                    travelDate: inquiry2?.flight_departure_date || inquiry2?.hotel_checkin_date || inquiry2?.cruise_departure_date || inquiry2?.package_start_date,
                                    passengers: inquiry2?.flight_passengers || inquiry2?.hotel_guests || inquiry2?.cruise_passengers || inquiry2?.package_travelers || 1,
                                    bookingDetails: {
                                        origin: inquiry2?.flight_origin,
                                        destination: inquiry2?.flight_destination,
                                        hotelName: inquiry2?.hotel_destination,
                                        cruiseLine: inquiry2?.cruise_destination
                                    }
                                };

                                const emailResult2 = await sendBookingNotificationEmails(bookingEmailData2);
                                if (emailResult2.success) {
                                    console.log('✅ Booking confirmation email sent successfully (after PAY)');
                                } else {
                                    console.warn('⚠️ Booking email sent with issues (after PAY):', emailResult2.error);
                                }
                            } catch (emailError2) {
                                console.error('❌ Failed to send booking confirmation email (after PAY):', emailError2.message);
                            }

                            return res.redirect(`/payment/success?paymentId=${payment.id}`);
                        }
                    } catch (payError) {
                        console.error('PAY call failed:', payError.response?.data || payError.message);
                    }
                }
            }

            await supabase
                .from('payments')
                .update({ payment_status: 'pending', metadata: { transaction } })
                .eq('id', payment.id);

            return res.redirect(`/inquiry/${payment.inquiry_id}?payment=pending`);
        } else {
            console.log('❌ Payment failed:', { result, gatewayCode });

            await supabase
                .from('payments')
                .update({ payment_status: 'failed', metadata: { transaction, failureReason: gatewayCode || result } })
                .eq('id', payment.id);

            return res.redirect(`/payment/failed?reason=${encodeURIComponent(gatewayCode || result || 'payment_declined')}&paymentId=${payment.id}`);
        }

    } catch (error) {
        console.error('❌ Payment callback error:', error);
        return res.redirect('/payment/failed?error=processing_error');
    }
}

// Get Payment Details
export async function handleGetPaymentDetails(req, res) {
    try {
        const { paymentId, quoteId } = req.query;

        if (!paymentId && !quoteId) {
            return res.status(400).json({ success: false, error: 'paymentId or quoteId required' });
        }

        let payment;
        if (paymentId) {
            // Strategy 1: Try looking up by UUID id
            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(paymentId);
            if (isUUID) {
                const { data } = await supabase
                    .from('payments')
                    .select('*, quote:quotes(*), inquiry:inquiries(*)')
                    .eq('id', paymentId)
                    .single();
                payment = data;
            }

            // Strategy 2: Try arc_order_id (for payment link orders like PL-xxx)
            if (!payment) {
                const { data } = await supabase
                    .from('payments')
                    .select('*')
                    .eq('arc_order_id', paymentId)
                    .limit(1)
                    .single();
                payment = data;
            }

            // Strategy 3: Try metadata containing the order_id
            if (!payment) {
                const { data } = await supabase
                    .from('payments')
                    .select('*')
                    .contains('metadata', { order_id: paymentId })
                    .limit(1)
                    .single();
                payment = data;
            }
        } else {
            const { data } = await supabase
                .from('payments')
                .select('*, quote:quotes(*), inquiry:inquiries(*)')
                .eq('quote_id', quoteId)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();
            payment = data;
        }

        if (!payment) {
            return res.status(404).json({ success: false, error: 'Payment not found' });
        }

        // If this payment came from a payment link, fetch the link details
        const paymentLinkToken = payment.metadata?.payment_link_token;
        if (paymentLinkToken) {
            const { data: paymentLink } = await supabase
                .from('payment_links')
                .select('*')
                .eq('link_token', paymentLinkToken)
                .single();
            if (paymentLink) {
                payment.payment_link = paymentLink;
            }
        }

        // The admin panel reads the full row to refund and void; the payment's
        // owner may see it too. Anyone else holding the id gets the receipt.
        if (await canReadFullPayment(req, payment)) {
            return res.json({ success: true, payment });
        }
        return res.json({ success: true, payment: toPublicPayment(payment) });
    } catch (error) {
        console.error('Get payment details error:', error.message);
        return res.status(500).json({ success: false, error: 'Could not load this payment' });
    }
}

// Reconcile a direct-booking payment from the ARC gateway.
//
// For direct flight/hotel/etc. bookings the post-payment confirmation runs in the
// browser (PaymentCallback -> create order). If that step never completes (tab closed,
// order-create error), ARC has captured the money but the `bookings` row stays
// 'pending'/'unpaid' with no server-side record. This handler is called server-side on
// return from ARC: it reads the order from the gateway and, if a successful
// PAYMENT/CAPTURE exists, durably marks the booking 'paid' so the payment is never lost
// and the booking is recoverable/fulfillable even if the browser flow stops here.
//
// Idempotent: a no-op once the booking is already paid or cancelled.
/**
 * The truth about a booking's payment, from the gateway, recorded on the row.
 *
 * Extracted from the HTTP handler so the order route can ask the same question
 * before it sells a seat. Returns what a caller needs to decide and to price:
 *
 *   { paid, capturedAmount, capturedCurrency, arcTransactionId, orderStatus,
 *     alreadyReconciled?, error? }
 *
 * `capturedAmount` is what ARC took, read from the captured transaction - never
 * the row's `total_amount`, which is what the client asked to be charged before
 * anyone paid. It is persisted as `arc_captured_amount` so later callers need
 * no gateway round trip. A row reconciled before that field existed is paid
 * but has no amount on record; one RETRIEVE_ORDER fills it in. If the gateway
 * cannot be reached, that row answers `paid: false` with `gatewayUnavailable`,
 * like any other: a row's own word is not a capture, and the caller can retry.
 * (This used to promise that the session amount would stand in for the
 * missing figure. Nothing ever implemented that, and not trusting the row is
 * the safe direction.)
 *
 * Idempotent: a refunded or cancelled row answers `paid: false` without a
 * gateway call, because that money is no longer available for a booking.
 *
 * `fresh` asks the gateway whatever the row says. A cancellation needs what is
 * held NOW: an admin refund or an earlier reversal since the row was reconciled
 * leaves `arc_captured_amount` describing money that has already gone back.
 * Every answer the gateway gave carries `heldAmount` - captured, less refunded,
 * nothing once voided - `refundedTotal` and `everCaptured`; an order it would not return
 * carries the HTTP status it answered with, as `gatewayStatus`.
 */
export async function reconcileBookingPayment(booking, { fresh = false } = {}) {
    const details = booking.booking_details || {};
    const known = Number(details.arc_captured_amount);
    const hasKnownAmount = Number.isFinite(known) && known > 0;

    const fromRow = (paid, extra = {}) => ({
        paid,
        capturedAmount: hasKnownAmount ? known : null,
        capturedCurrency: details.arc_captured_currency || null,
        arcTransactionId: details.arc_transaction_id || null,
        orderStatus: details.arc_order_status || null,
        ...extra,
    });

    if (!fresh && (booking.status === 'cancelled' || ['refunded', 'partially_refunded'].includes(booking.payment_status))) {
        return fromRow(false, { alreadyReconciled: true });
    }
    // `arc_captured_amount` is written only by this function, after the gateway
    // showed a capture - so a row carrying it was verified. `payment_status:
    // 'paid'` alone proves nothing: other code paths write it, and one of them
    // (complete-payment-link) wrote it on an unauthenticated, unverified POST.
    const alreadyPaid = booking.payment_status === 'paid';
    if (!fresh && alreadyPaid && hasKnownAmount) {
        return fromRow(true, { alreadyReconciled: true });
    }

    const arcOrderId = details.order_id || booking.booking_reference;
    const authHeader = 'Basic ' + Buffer.from(`merchant.${ARC_PAY_CONFIG.MERCHANT_ID}:${ARC_PAY_CONFIG.API_PASSWORD}`).toString('base64');

    // RETRIEVE_ORDER from ARC to find a captured transaction.
    let orderData = null;
    let gatewayStatus = null;
    try {
        const orderResp = await axios.get(
            `${ARC_PAY_CONFIG.BASE_URL}/merchant/${ARC_PAY_CONFIG.MERCHANT_ID}/order/${arcOrderId}`,
            { headers: { 'Authorization': authHeader, 'Accept': 'application/json' }, validateStatus: () => true }
        );
        gatewayStatus = orderResp.status;
        if (orderResp.status === 200) orderData = orderResp.data;
        else console.warn('⚠️ [reconcile] RETRIEVE_ORDER non-200:', orderResp.status);
    } catch (retrieveErr) {
        console.warn('⚠️ [reconcile] RETRIEVE_ORDER failed:', retrieveErr.message);
    }

    if (!orderData) {
        // No answer is not a yes. A row marked paid without a recorded capture
        // used to be trusted here on its word, and a paid row can be written by
        // paths that never asked the gateway. The caller may retry.
        return fromRow(false, {
            error: 'Could not retrieve order from gateway',
            gatewayUnavailable: true,
            ...(gatewayStatus ? { gatewayStatus } : {}),
            ...(alreadyPaid ? { disagreement: 'row marked paid, gateway not reachable to confirm' } : {}),
        });
    }

    const txns = Array.isArray(orderData.transaction) ? orderData.transaction : [];
    const succeeded = (t) => t.result === 'SUCCESS' || t.response?.gatewayCode === 'APPROVED';
    const captures = txns.filter(t => succeeded(t) && ['PAYMENT', 'CAPTURE'].includes(t.transaction?.type));
    const captured = captures[0] || null;

    // What is actually still held: captures, less anything already returned. A
    // successful VOID returns the lot. Reading the first SUCCESS capture alone
    // counted money as available for a booking after it had been refunded.
    const sumOf = (list) => list.reduce((s, t) => s + (Number(t.transaction?.amount) || 0), 0);
    const voided = txns.some(t => t.transaction?.type === 'VOID' && t.result === 'SUCCESS');
    const capturedTotal = captures.length ? sumOf(captures) : (orderData.status === 'CAPTURED' ? Number(orderData.amount) || 0 : 0);
    const refundedTotal = sumOf(txns.filter(t => t.transaction?.type === 'REFUND' && t.result === 'SUCCESS'));
    const netCaptured = voided ? 0 : Math.round((capturedTotal - refundedTotal) * 100) / 100;

    if (netCaptured <= 0) {
        if (alreadyPaid) {
            // The row says paid and the gateway says nothing is held. The gateway
            // is the one holding the money, so it wins; the disagreement is logged
            // because something wrote that row without asking.
            console.error('⚠️ [reconcile] row is paid but gateway holds no captured funds', {
                bookingReference: booking.booking_reference, orderStatus: orderData.status || null
            });
        }
        return fromRow(false, {
            orderStatus: orderData.status || null,
            heldAmount: 0,
            everCaptured: capturedTotal > 0,
            refundedTotal: Math.round(refundedTotal * 100) / 100,
            // A successful VOID returns the whole capture and leaves no REFUND
            // behind, so a caller adding up refunds needs to know it happened
            // and what it returned (settleManualFlightRefund).
            voided,
            capturedTotal: Math.round(capturedTotal * 100) / 100,
            ...(alreadyPaid ? { error: 'gateway shows no captured transaction for a row marked paid' } : {}),
        });
    }

    // The checkout session asked ARC for `total_amount`. Holding less than that
    // means part of it went back, and a partly refunded payment does not pay
    // for the booking it was taken for.
    const sessionAmount = Number(booking.total_amount);
    if (Number.isFinite(sessionAmount) && sessionAmount > 0 && netCaptured + 0.01 < sessionAmount) {
        console.error('⚠️ [reconcile] captured funds below the checkout amount', {
            bookingReference: booking.booking_reference, netCaptured, sessionAmount
        });
        return fromRow(false, {
            orderStatus: orderData.status || null,
            capturedAmount: netCaptured,
            heldAmount: netCaptured,
            everCaptured: true,
            refundedTotal: Math.round(refundedTotal * 100) / 100,
            error: `gateway holds ${netCaptured.toFixed(2)}, less than the ${sessionAmount.toFixed(2)} charged at checkout`,
        });
    }

    const arcTransactionId = captured?.transaction?.id || null;
    const capturedAmount = netCaptured;
    const capturedCurrency = captured?.transaction?.currency || orderData.currency || null;

    const { error: updateErr } = await supabase
        .from('bookings')
        .update({
            payment_status: 'paid',
            // No `status` write. This used to move a pending row to 'paid', a
            // value outside the booking vocabulary that My Trips and Manage
            // Booking render as a raw string. Payment is `payment_status`'s job;
            // the booking's own status is set by whatever books it.
            booking_details: {
                ...details,
                arc_transaction_id: arcTransactionId,
                arc_order_status: orderData.status || 'CAPTURED',
                arc_captured_amount: capturedAmount,
                arc_captured_currency: capturedCurrency,
                payment_reconciled_at: new Date().toISOString()
            }
        })
        .eq('id', booking.id);

    if (updateErr) {
        console.error('❌ [reconcile] booking paid-update failed:', updateErr.message);
        return {
            paid: true,
            capturedAmount,
            capturedCurrency,
            arcTransactionId,
            orderStatus: orderData.status || 'CAPTURED',
            heldAmount: netCaptured,
            everCaptured: true,
            refundedTotal: Math.round(refundedTotal * 100) / 100,
            error: `Failed to record payment on booking: ${updateErr.message}`,
        };
    }

    console.log('✅ [reconcile] Booking marked paid from gateway:', booking.booking_reference);
    return {
        paid: true, capturedAmount, capturedCurrency, arcTransactionId, orderStatus: orderData.status || 'CAPTURED',
        heldAmount: netCaptured, everCaptured: true, refundedTotal: Math.round(refundedTotal * 100) / 100,
    };
}

export async function handleReconcileBookingPayment(req, res) {
    try {
        const orderId = req.body?.orderId || req.body?.bookingReference || req.query?.orderId;
        if (!orderId) {
            return res.status(400).json({ success: false, error: 'orderId (or bookingReference) is required' });
        }

        // Locate the booking by its reference or the ARC order id stored in booking_details.
        const { data: booking } = await supabase
            .from('bookings')
            .select('*')
            .or((r => `booking_reference.eq.${r},booking_details->>order_id.eq.${r}`)(sanitizeRef(orderId)))
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (!booking) {
            return res.status(404).json({ success: false, error: 'Booking not found for the provided order id' });
        }

        const result = await reconcileBookingPayment(booking);

        if (result.alreadyReconciled) {
            return res.json({
                success: true,
                alreadyReconciled: true,
                paid: result.paid,
                booking: { reference: booking.booking_reference, status: booking.status, payment_status: booking.payment_status }
            });
        }
        if (!result.paid) {
            return result.error
                ? res.json({ success: false, paid: false, error: result.error })
                : res.json({ success: true, paid: false, orderStatus: result.orderStatus });
        }
        if (result.error) {
            console.error('❌ [reconcile] could not record the payment:', result.error);
            return res.status(500).json({ success: false, error: 'Failed to record payment on booking' });
        }
        return res.json({
            success: true,
            paid: true,
            booking: { reference: booking.booking_reference, status: booking.status, payment_status: 'paid' },
            arcTransactionId: result.arcTransactionId
        });
    } catch (error) {
        console.error('❌ [reconcile] error:', error);
        return res.status(500).json({ success: false, error: 'Could not confirm this payment. Please try again.' });
    }
}
