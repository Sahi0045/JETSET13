import axios from 'axios';
import { supabase, ARC_PAY_CONFIG, ARC_SETTLEMENT_CURRENCY } from './arcpay.config.js';
import { resolveBookingUserId } from '../../utils/bookingOwner.js';

const sanitizeRef = (v) => String(v ?? '').replace(/[^A-Za-z0-9_-]/g, '') || '__none__';


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
        const finalReturnUrl = return_url || `${frontendBaseUrl}/payment/callback?quote_id=${quote.id}&inquiry_id=${quote.inquiry_id}`;
        const finalCancelUrl = cancel_url || `${frontendBaseUrl}/inquiry/${quote.inquiry_id}?payment=cancelled`;

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
        console.error('❌ Payment initiation error:', error.response?.data || error.message);
        return res.status(500).json({
            success: false,
            error: 'Payment initiation failed',
            details: error.response?.data?.error?.explanation || error.message
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

        // Validate required fields
        if (!amount || !orderId) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: amount and orderId are required'
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

        console.log('💳 Creating ARC Pay hosted checkout session...');
        console.log('   Order ID:', orderId);
        console.log('   Amount:', amount, currency);
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

        const frontendBaseUrl = process.env.FRONTEND_URL || 'https://www.jetsetterss.com';
        const authHeader = 'Basic ' + Buffer.from(`merchant.${arcMerchantId}:${arcApiPassword}`).toString('base64');

        // Construct URLs
        const finalReturnUrl = returnUrl || `${frontendBaseUrl}/payment/callback?orderId=${orderId}&bookingType=${bookingType}`;
        const finalCancelUrl = cancelUrl || `${frontendBaseUrl}/${bookingType}-payment?cancelled=true`;

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
                amount: parseFloat(amount).toFixed(2),
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
                const itinerary = flight?.itineraries?.[0] || flight?.itinerary || {};
                const segments = Array.isArray(itinerary?.segments) ? itinerary.segments :
                    Array.isArray(flight?.segments) ? flight.segments : [];

                const origin = flight?.origin || flight?.departureAirport || segments?.[0]?.departure?.iataCode || 'XXX';
                const destination = flight?.destination || flight?.arrivalAirport || segments?.[segments.length - 1]?.arrival?.iataCode || 'XXX';

                const actualCarrierCode = (flight?.carrierCode || segments?.[0]?.carrierCode || segments?.[0]?.carrier || 'XX').substring(0, 2).toUpperCase();
                // Acquirer may reject if carrierName doesn't match a real airline when airline data is present
                const fallbackAirlineName = flight?.airline || flight?.airlineName || segments?.[0]?.carrierName || 'AIRLINE';
                const actualCarrierName = typeof fallbackAirlineName === 'string' ? fallbackAirlineName : 'AIRLINE';

                // ARC airline-interchange fields are alphanumeric-only — strip spaces/punctuation
                // (e.g. "JetSet Travel LLC" -> "JetSetTravelLLC") or ARC rejects the request with
                // "Invalid character ' '".
                const sanitizeAirlineField = (v, max) => String(v || '').replace(/[^A-Za-z0-9]/g, '').substring(0, max);
                const travelAgentCode = sanitizeAirlineField(process.env.ARC_TRAVEL_AGENT_CODE || arcMerchantId.replace('TESTARC', '').substring(0, 8) || '05511704', 25);
                const travelAgentName = sanitizeAirlineField(process.env.ARC_TRAVEL_AGENT_NAME || 'Jetsetters Corporation', 25);

                const passengers = bookingData?.passengerData || bookingData?.travelers || [];
                const passengerList = passengers.length > 0
                    ? passengers.map(p => ({
                        // Remove special characters, limit length, capitalize
                        firstName: (p.firstName || p.name?.firstName || '').toUpperCase().replace(/[^A-Z\s]/g, '').substring(0, 20) || 'TEST',
                        lastName: (p.lastName || p.name?.lastName || '').toUpperCase().replace(/[^A-Z\s]/g, '').substring(0, 20) || 'TRAVELER'
                    }))
                    : [{
                        firstName: (firstName || 'TEST').toUpperCase().replace(/[^A-Z\s]/g, '').substring(0, 20),
                        lastName: (lastName || 'TRAVELER').toUpperCase().replace(/[^A-Z\s]/g, '').substring(0, 20)
                    }];

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
                        const rawFNum = String(segment?.number || segment?.flightNumber || index + 1).replace(/[^0-9A-Z]/gi, '');
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
                    : [{
                        carrierCode: 'XD', // Fallback
                        departureAirport: origin.substring(0, 3).toUpperCase(),
                        departureDate: new Date().toISOString().split('T')[0],
                        departureTime: '00:00+05:30', // Match example timezone
                        destinationAirport: destination.substring(0, 3).toUpperCase(),
                        flightNumber: 'AI131',
                        travelClass: 'W' // Changed from Y to W
                    }];

                const bookingRef = (flight?.pnr || flight?.bookingReference || orderId || '').toString().substring(0, 6).toUpperCase() || '501337';

                // Match the ticket number format from the working example (e.g. BOM1234567LHR)
                const depCode = legArray[0]?.departureAirport || 'BOM';
                const arrCode = legArray[legArray.length - 1]?.destinationAirport || 'LHR';
                const ticketNumber = `${depCode}${Date.now().toString().slice(-7)}${arrCode}`.substring(0, 13);

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
                console.error('⚠️ Error constructing airline data:', airlineError);
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

        // Save pending booking data to DB so callback can retrieve it even if localStorage is cleared
        try {
            const passengerDetails = bookingData?.passengerData || bookingData?.travelers || [];
            // Own the row from the moment it exists. Without this the booking
            // is created here with no user, and My Trips - which lists the
            // signed-in user's bookings - can never show it, however the rest
            // of the flow goes. `resolveBookingUserId` reads the verified
            // session; a genuine guest still books, with null.
            const ownerId = resolveBookingUserId(req);

            await supabase.from('bookings').upsert({
                booking_reference: orderId,
                travel_type: bookingType || 'flight',
                status: 'pending',
                ...(ownerId ? { user_id: ownerId } : {}),
                total_amount: parseFloat(amount) || 0,
                payment_status: 'unpaid',
                booking_details: {
                    order_id: orderId,
                    session_id: sessionId,
                    success_indicator: successIndicator,
                    pending_booking_data: req.body,
                    customer_email: customerEmail || null,
                    arc_pay_checkout_url: paymentPageUrl,
                    checkout_created_at: new Date().toISOString()
                },
                passenger_details: Array.isArray(passengerDetails) ? passengerDetails : []
            }, { onConflict: 'booking_reference' });
            console.log('💾 Pending booking saved to DB:', orderId);
        } catch (dbError) {
            console.error('⚠️ Failed to save pending booking to DB:', dbError.message);
            console.error('   Error details:', typeof dbError === 'object' ? JSON.stringify(dbError) : dbError);
            // Non-blocking: localStorage still works as fallback
        }

        return res.status(200).json({
            success: true,
            sessionId,
            successIndicator,
            merchantId: arcMerchantId,
            orderId,
            paymentPageUrl,
            checkoutUrl: paymentPageUrl,
            redirectMethod: 'GET',
            message: 'Hosted checkout session created successfully'
        });

    } catch (error) {
        console.error('❌ Hosted checkout error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to create hosted checkout',
            details: error.response?.data?.error?.explanation || error.message
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
        return res.status(500).json({ success: false, error: error.message });
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
            error: 'Failed to create session',
            details: error.response?.data?.error?.explanation || error.message
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

        return res.json({ success: true, payment });
    } catch (error) {
        console.error('Get payment details error:', error);
        return res.status(500).json({ success: false, error: error.message });
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
 * but has no amount on record; one RETRIEVE_ORDER fills it in, and if the
 * gateway cannot be reached the session amount stands in for it - that row
 * was already verified against ARC once, so the session amount is what was
 * captured. Refusing a paid customer over a missing number would be the
 * mirror image of the bug this closes.
 *
 * Idempotent: a refunded or cancelled row answers `paid: false` without a
 * gateway call, because that money is no longer available for a booking.
 */
export async function reconcileBookingPayment(booking) {
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

    if (booking.status === 'cancelled' || ['refunded', 'partially_refunded'].includes(booking.payment_status)) {
        return fromRow(false, { alreadyReconciled: true });
    }
    // `arc_captured_amount` is written only by this function, after the gateway
    // showed a capture - so a row carrying it was verified. `payment_status:
    // 'paid'` alone proves nothing: other code paths write it, and one of them
    // (complete-payment-link) wrote it on an unauthenticated, unverified POST.
    const alreadyPaid = booking.payment_status === 'paid';
    if (alreadyPaid && hasKnownAmount) {
        return fromRow(true, { alreadyReconciled: true });
    }

    const arcOrderId = details.order_id || booking.booking_reference;
    const authHeader = 'Basic ' + Buffer.from(`merchant.${ARC_PAY_CONFIG.MERCHANT_ID}:${ARC_PAY_CONFIG.API_PASSWORD}`).toString('base64');

    // RETRIEVE_ORDER from ARC to find a captured transaction.
    let orderData = null;
    try {
        const orderResp = await axios.get(
            `${ARC_PAY_CONFIG.BASE_URL}/merchant/${ARC_PAY_CONFIG.MERCHANT_ID}/order/${arcOrderId}`,
            { headers: { 'Authorization': authHeader, 'Accept': 'application/json' }, validateStatus: () => true }
        );
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
            error: `Failed to record payment on booking: ${updateErr.message}`,
        };
    }

    console.log('✅ [reconcile] Booking marked paid from gateway:', booking.booking_reference);
    return { paid: true, capturedAmount, capturedCurrency, arcTransactionId, orderStatus: orderData.status || 'CAPTURED' };
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
            return res.status(500).json({ success: false, error: 'Failed to record payment on booking', details: result.error });
        }
        return res.json({
            success: true,
            paid: true,
            booking: { reference: booking.booking_reference, status: booking.status, payment_status: 'paid' },
            arcTransactionId: result.arcTransactionId
        });
    } catch (error) {
        console.error('❌ [reconcile] error:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}
