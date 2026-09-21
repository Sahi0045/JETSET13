import axios from 'axios';
import { randomBytes } from 'node:crypto';
import { supabase, ARC_PAY_CONFIG, getArcPayAuthConfig, ARC_SETTLEMENT_CURRENCY } from './arcpay.config.js';
import { getCallerInfo, generateLinkToken } from './payment.helpers.js';
import { generatePaymentLinkTemplate } from '../../services/email/templates.js';
import { reconcileBookingPayment, CHECKOUT_REUSE_WINDOW_MS, ARC_PAGE_TIMEOUT_SECONDS } from './checkout.handlers.js';
import { inspectArcOrder } from './operations.handlers.js';
import { errorSummary } from '../../utils/errorSummary.js';

/**
 * The currency a link is charged in, upper-cased, or null when this merchant
 * cannot take it. The merchant settles only USD (ARC_SETTLEMENT_CURRENCY) and a
 * link's amount is in the currency the agent picked, so a link in anything
 * else can never be paid: ARC refuses the session. Relabelling the amount USD
 * would charge a different sum.
 */
const settlementCurrencyOf = (currency) => {
    const code = String(currency || ARC_SETTLEMENT_CURRENCY).trim().toUpperCase();
    return code === ARC_SETTLEMENT_CURRENCY ? code : null;
};

/**
 * Create a new payment link (Admin only)
 */
export async function handleCreatePaymentLink(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const {
            customerName,
            customerEmail,
            customerPhone,
            bookingType = 'flight',
            amount,
            actualFee,
            agentFee,
            currency = 'USD',
            description,
            travelDetails = {},
            expiryDays = 30
        } = req.body;

        // Get caller info (admin or agent) — only staff may create payment links.
        const caller = getCallerInfo(req);
        if (!['admin', 'superadmin', 'agent'].includes(caller.role)) {
            return res.status(403).json({ success: false, error: 'Not authorized to create payment links.' });
        }

        // Validate
        if (!customerName || !amount) {
            return res.status(400).json({
                success: false,
                error: 'Customer name and amount are required'
            });
        }

        if (parseFloat(amount) <= 0) {
            return res.status(400).json({
                success: false,
                error: 'Amount must be greater than zero'
            });
        }

        // Refused here, where the agent can fix it, rather than when the
        // customer clicks Pay on a link that was emailed to them.
        if (!settlementCurrencyOf(currency)) {
            return res.status(400).json({
                success: false,
                code: 'CURRENCY_NOT_SUPPORTED',
                error: `Payment links can only be in US dollars: ARC Pay accepts USD only. Enter the amount in USD instead of ${String(currency).toUpperCase()}.`
            });
        }

        // Generate unique token
        let linkToken = generateLinkToken();
        let attempts = 0;
        while (attempts < 5) {
            const { data: existing } = await supabase
                .from('payment_links')
                .select('id')
                .eq('link_token', linkToken)
                .single();
            if (!existing) break;
            linkToken = generateLinkToken();
            attempts++;
        }

        // Calculate expiry
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + parseInt(expiryDays));

        const frontendBaseUrl = process.env.FRONTEND_URL || 'https://www.jetsetterss.com';

        // Insert into DB
        const { data: paymentLink, error: insertError } = await supabase
            .from('payment_links')
            .insert({
                link_token: linkToken,
                customer_name: customerName,
                customer_email: customerEmail || null,
                customer_phone: customerPhone || null,
                booking_type: bookingType,
                amount: parseFloat(amount),
                currency: settlementCurrencyOf(currency),
                description: description || `${bookingType.charAt(0).toUpperCase() + bookingType.slice(1)} Booking Payment`,
                travel_details: travelDetails,
                status: 'pending',
                expires_at: expiresAt.toISOString(),
                agent_id: caller.agentId || null,
                created_at: new Date().toISOString()
            })
            .select()
            .single();

        if (insertError) {
            console.error('❌ Failed to create payment link:', insertError);
            return res.status(500).json({ success: false, error: 'Failed to create payment link', details: insertError.message });
        }

        const paymentUrl = `${frontendBaseUrl}/pay/${linkToken}`;

        console.log('✅ Payment link created:', paymentUrl);

        // Send email to customer if email provided
        if (customerEmail) {
            try {
                const { sendEmail } = await import('../../services/emailService.js');
                await sendEmail({
                    to: customerEmail,
                    subject: `Your payment link${description ? ` - ${description}` : ''} | Jetsetters`,
                    html: generatePaymentLinkTemplate({
                        customerName,
                        description: description || bookingType,
                        amount: parseFloat(amount).toFixed(2),
                        currency,
                        paymentUrl,
                    }),
                });
                console.log('📧 Payment link email sent to:', customerEmail);
            } catch (emailErr) {
                console.warn('⚠️ Could not send payment link email:', emailErr.message);
            }
        }

        return res.json({
            success: true,
            paymentLink: {
                ...paymentLink,
                paymentUrl
            }
        });
    } catch (error) {
        console.error('❌ Create payment link error:', errorSummary(error));
        return res.status(500).json({ success: false, error: 'Failed to create payment link', details: error.message });
    }
}

/**
 * Get payment link details by token (Public)
 */
export async function handleGetPaymentLink(req, res) {
    try {
        const token = req.query.token;
        if (!token) {
            return res.status(400).json({ success: false, error: 'Token is required' });
        }

        const { data: paymentLink, error } = await supabase
            .from('payment_links')
            .select('*')
            .eq('link_token', token)
            .single();

        if (error || !paymentLink) {
            return res.status(404).json({ success: false, error: 'Payment link not found' });
        }

        // Check if expired
        if (paymentLink.expires_at && new Date(paymentLink.expires_at) < new Date()) {
            if (paymentLink.status === 'pending') {
                await supabase.from('payment_links').update({ status: 'expired' }).eq('id', paymentLink.id);
                paymentLink.status = 'expired';
            }
        }

        return res.json({ success: true, paymentLink });
    } catch (error) {
        console.error('❌ Get payment link error:', errorSummary(error));
        return res.status(500).json({ success: false, error: 'Failed to get payment link' });
    }
}

/**
 * Process payment for a payment link — creates ARC Pay Hosted Checkout session
 */
export async function handleProcessPaymentLink(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { token } = req.body;
        if (!token) {
            return res.status(400).json({ success: false, error: 'Token is required' });
        }

        const { data: paymentLink, error } = await supabase
            .from('payment_links')
            .select('*')
            .eq('link_token', token)
            .single();

        if (error || !paymentLink) {
            return res.status(404).json({ success: false, error: 'Payment link not found' });
        }

        if (paymentLink.status !== 'pending') {
            return res.status(400).json({ success: false, error: `Payment link is ${paymentLink.status}` });
        }

        if (paymentLink.expires_at && new Date(paymentLink.expires_at) < new Date()) {
            await supabase.from('payment_links').update({ status: 'expired' }).eq('id', paymentLink.id);
            return res.status(400).json({ success: false, error: 'Payment link has expired' });
        }

        // A link made in another currency before links were held to USD.
        const chargeCurrency = settlementCurrencyOf(paymentLink.currency);
        if (!chargeCurrency) {
            console.warn('⛔ Payment link refused: not in USD', { linkId: paymentLink.id, currency: paymentLink.currency });
            return res.status(400).json({
                success: false,
                code: 'CURRENCY_NOT_SUPPORTED',
                error: `This payment link is in ${String(paymentLink.currency).toUpperCase()}, and card payments can only be taken in US dollars. `
                    + 'Please ask the agent who sent it for a new link in USD. Nothing has been charged.'
            });
        }

        // One link, one payment page that can be paid. Every Pay click opened
        // a new ARC order, and the link is marked paid only when the payer's
        // browser comes back to complete it - so a second click, or a payer who
        // paid and closed the tab before that, got a second live page and could
        // be charged twice. A page opened for this link within its life on ARC
        // (the same window hosted checkout uses) is handed back instead. An
        // older one is asked about at ARC first: a payment already taken there
        // stops a new page opening, and so does not being able to ask.
        const refuseAsPaid = (orderId) => {
            console.error('⛔ Payment link refused: ARC already holds a payment for it', { linkId: paymentLink.id, orderId });
            return res.status(409).json({
                success: false,
                code: 'PAYMENT_LINK_ALREADY_PAID',
                error: 'A payment has already been taken for this link. Please do not pay again - call (877) 538-7380 and we will confirm it for you.'
            });
        };
        const cannotCheck = () => res.status(503).json({
            success: false,
            code: 'PAYMENT_LINK_UNAVAILABLE',
            error: 'We could not start your payment just now. Please try again in a moment. Nothing has been charged.'
        });

        const { data: earlierPages, error: earlierError } = await supabase
            .from('payments')
            .select('id, arc_order_id, arc_session_id, payment_status, created_at')
            .eq('metadata->>payment_link_token', token)
            .order('created_at', { ascending: false })
            .limit(5);
        if (earlierError) {
            console.error('❌ Payment link: could not look for an earlier payment page', { linkId: paymentLink.id, reason: earlierError.message });
            return cannotCheck();
        }
        const pages = Array.isArray(earlierPages) ? earlierPages : [];
        const latest = pages[0];
        const latestAge = Date.now() - Date.parse(latest?.created_at);
        if (latest?.payment_status === 'pending' && latest.arc_session_id && latest.arc_order_id
            && latestAge >= 0 && latestAge < CHECKOUT_REUSE_WINDOW_MS) {
            const openUrl = `https://api.arcpay.travel/checkout/pay/${latest.arc_session_id}`;
            console.log('♻️ Handing back the payment page already open for this link', { orderId: latest.arc_order_id });
            return res.json({
                success: true,
                reused: true,
                sessionId: latest.arc_session_id,
                orderId: latest.arc_order_id,
                checkoutUrl: openUrl,
                paymentPageUrl: openUrl
            });
        }
        for (const page of pages) {
            if (page.payment_status === 'completed') return refuseAsPaid(page.arc_order_id);
            if (page.payment_status !== 'pending' || !page.arc_order_id) continue;
            const arcOrder = await inspectArcOrder(page.arc_order_id);
            if (arcOrder.reachable && arcOrder.holdsPayment) return refuseAsPaid(page.arc_order_id);
            // ARC answers 400/404 for an order nobody ever paid on: the page
            // was opened and left.
            if (!arcOrder.reachable && ![400, 404].includes(arcOrder.httpStatus)) {
                console.error('❌ Payment link: ARC could not say whether an earlier page was paid', { orderId: page.arc_order_id, httpStatus: arcOrder.httpStatus ?? null });
                return cannotCheck();
            }
        }

        // Create ARC Pay Hosted Checkout
        const arcMerchantId = ARC_PAY_CONFIG.MERCHANT_ID;
        const arcApiPassword = ARC_PAY_CONFIG.API_PASSWORD;
        let arcBaseUrl = ARC_PAY_CONFIG.BASE_URL;
        if (arcBaseUrl && arcBaseUrl.includes('/merchant/')) {
            arcBaseUrl = arcBaseUrl.split('/merchant/')[0];
        }
        arcBaseUrl = arcBaseUrl || 'https://api.arcpay.travel/api/rest/version/77';

        const frontendBaseUrl = process.env.FRONTEND_URL || 'https://www.jetsetterss.com';
        const authHeader = 'Basic ' + Buffer.from(`merchant.${arcMerchantId}:${arcApiPassword}`).toString('base64');

        // Random, not the clock. `Date.now()`'s last six digits came round
        // again every 1,000 seconds, and ARC keys a payment by its order id.
        const orderId = `PL-${paymentLink.id.slice(0, 8)}-${randomBytes(5).toString('hex').toUpperCase()}`;
        const returnUrl = `${frontendBaseUrl}/payment/callback?orderId=${orderId}&bookingType=${paymentLink.booking_type}&paymentLinkToken=${token}`;
        const cancelUrl = `${frontendBaseUrl}/pay/${token}?cancelled=true`;

        const sessionUrl = `${arcBaseUrl.replace(/\/$/, '')}/merchant/${arcMerchantId}/session`;

        const requestBody = {
            apiOperation: 'INITIATE_CHECKOUT',
            interaction: {
                operation: 'PURCHASE',
                returnUrl,
                cancelUrl,
                merchant: { name: 'Jetsetter Travel' },
                displayControl: {
                    billingAddress: 'MANDATORY',
                    customerEmail: 'MANDATORY'
                },
                timeout: ARC_PAGE_TIMEOUT_SECONDS
            },
            order: {
                id: orderId,
                reference: orderId.substring(0, 40),
                amount: parseFloat(paymentLink.amount).toFixed(2),
                currency: chargeCurrency,
                description: paymentLink.description || `${paymentLink.booking_type} Payment`
            }
        };

        console.log('🔗 Creating ARC Pay session for payment link:', orderId);

        const sessionResponse = await axios.post(sessionUrl, requestBody, {
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json'
            }
        });

        const sessionData = sessionResponse.data;
        const sessionId = sessionData.session?.id;
        const successIndicator = sessionData.successIndicator;

        if (!sessionId) {
            console.error('No sessionId in ARC Pay response:', sessionData);
            return res.status(500).json({ success: false, error: 'Failed to create payment session' });
        }

        // Update payment link with session info
        await supabase.from('payment_links').update({
            arc_session_id: sessionId,
            updated_at: new Date().toISOString()
        }).eq('id', paymentLink.id);

        // Store pending booking data for callback
        const nameParts = (paymentLink.customer_name || '').trim().split(/\s+/);
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        /**
         * Both rows or no payment page.
         *
         * complete-payment-link finds the payment by this booking row and the
         * payments row below, and answers "Booking not found" / "could not be
         * verified" without them. Neither insert's error was read: a refused
         * row still sent the customer to a live ARC page, and a payment made
         * there was recorded nowhere any job reads. The ARC session already
         * exists, but a session nobody is sent to costs nothing.
         */
        const { error: bookingInsertError } = await supabase.from('bookings').insert({
            booking_reference: orderId,
            travel_type: paymentLink.booking_type,
            total_amount: parseFloat(paymentLink.amount),
            status: 'pending',
            // The agent who made the sale, so the booking shows under them in the
            // admin panel. It was left off, so no agent view could ever find the
            // booking an agent's sale produced.
            agent_id: paymentLink.agent_id || null,
            passenger_details: [{ firstName, lastName, email: paymentLink.customer_email || '' }],
            booking_details: {
                source: 'payment_link',
                payment_link_id: paymentLink.id,
                payment_link_token: token,
                travel_details: paymentLink.travel_details,
                description: paymentLink.description,
                order_id: orderId,
                amount: parseFloat(paymentLink.amount),
                currency: paymentLink.currency,
                price_grand_total: parseFloat(paymentLink.amount).toFixed(2),
                customer_name: paymentLink.customer_name
            },
            created_at: new Date().toISOString()
        });
        if (bookingInsertError) {
            console.error('❌ Refusing payment link checkout: the booking could not be recorded', { orderId, code: bookingInsertError.code, reason: bookingInsertError.message });
            return cannotCheck();
        }

        // Store payment record
        const { error: paymentInsertError } = await supabase.from('payments').insert({
            amount: parseFloat(paymentLink.amount),
            currency: paymentLink.currency,
            payment_status: 'pending',
            arc_session_id: sessionId,
            arc_order_id: orderId,
            success_indicator: successIndicator,
            customer_email: paymentLink.customer_email,
            customer_name: paymentLink.customer_name,
            metadata: {
                payment_link_id: paymentLink.id,
                payment_link_token: token,
                order_id: orderId
            },
            created_at: new Date().toISOString()
        });
        if (paymentInsertError) {
            console.error('❌ Refusing payment link checkout: the payment could not be recorded', { orderId, code: paymentInsertError.code, reason: paymentInsertError.message });
            // The booking row this request just made, under a reference nobody
            // else has seen: without its payment it is a checkout that can never
            // be paid.
            const { error: cleanupError } = await supabase.from('bookings').delete().eq('booking_reference', orderId);
            if (cleanupError) console.error('⚠️ Could not remove the unpaid payment-link booking', { orderId, reason: cleanupError.message });
            return cannotCheck();
        }

        // Build the checkout redirect URL (must use api.arcpay.travel, NOT ap-gateway.mastercard.com)
        const checkoutUrl = `https://api.arcpay.travel/checkout/pay/${sessionId}`;
        const paymentPageUrl = checkoutUrl;

        console.log('✅ Payment session created for link:', { orderId, sessionId });

        return res.json({
            success: true,
            sessionId,
            successIndicator,
            orderId,
            checkoutUrl,
            paymentPageUrl,
            sessionData
        });
    } catch (error) {
        console.error('❌ Process payment link error:', errorSummary(error));
        return res.status(500).json({
            success: false,
            error: 'Failed to process payment'
        });
    }
}


/**
 * Complete a payment link payment — update payment link, booking, and payment status
 */
export async function handleCompletePaymentLink(req, res) {
    try {
        const { paymentLinkToken, orderId, resultIndicator } = req.body || {};

        // This used to mark the link paid, the booking confirmed and paid, and
        // the payment completed for ANY post carrying a token and an order id:
        // no session, no comparison of `resultIndicator`, no call to the
        // gateway - `resultIndicator` was simply stored as if it were the
        // transaction id. And because the order route trusted a row already
        // marked paid, that one unauthenticated request was enough to sell a
        // seat for a payment that never happened.
        if (!paymentLinkToken || !orderId || !resultIndicator) {
            return res.status(400).json({ success: false, error: 'paymentLinkToken, orderId and resultIndicator are required' });
        }

        const { data: paymentLink } = await supabase
            .from('payment_links')
            .select('*')
            .eq('link_token', paymentLinkToken)
            .maybeSingle();
        if (!paymentLink) {
            return res.status(404).json({ success: false, error: 'Payment link not found' });
        }

        // The payments row opened with this link's checkout session holds the
        // indicator ARC issued for that session. Only the paying browser
        // receives it, on the redirect back.
        const { data: paymentRecord } = await supabase
            .from('payments')
            .select('*')
            .eq('arc_order_id', orderId)
            .limit(1)
            .maybeSingle();
        const belongsToLink = paymentRecord?.metadata?.payment_link_token === paymentLinkToken;
        if (!paymentRecord || !belongsToLink || !paymentRecord.success_indicator
            || String(resultIndicator) !== String(paymentRecord.success_indicator)) {
            console.warn('⛔ complete-payment-link refused: indicator does not match this link\'s session', { orderId });
            return res.status(403).json({ success: false, error: 'This payment could not be verified' });
        }

        // The indicator proves who is asking. Only the gateway can say the
        // money was captured.
        const { data: booking } = await supabase
            .from('bookings')
            .select('*')
            .eq('booking_reference', orderId)
            .maybeSingle();
        if (!booking) {
            return res.status(404).json({ success: false, error: 'Booking not found for this payment' });
        }

        const payment = await reconcileBookingPayment(booking);
        if (!payment.paid) {
            return res.status(402).json({
                success: false,
                error: payment.gatewayUnavailable
                    ? 'We could not reach the payment gateway to confirm this payment. Please try again shortly.'
                    : 'This payment has not been captured',
                ...(payment.gatewayUnavailable ? { retryable: true } : {})
            });
        }

        const now = new Date().toISOString();
        await supabase
            .from('payment_links')
            .update({ status: 'paid', paid_at: now })
            .eq('link_token', paymentLinkToken);

        // reconcileBookingPayment has recorded payment_status and the captured
        // amount. A payment link is an agent-arranged booking with no GDS step
        // here, so a verified capture is what confirms it.
        await supabase
            .from('bookings')
            .update({ status: 'confirmed' })
            .eq('id', booking.id);

        await supabase
            .from('payments')
            .update({
                payment_status: 'completed',
                completed_at: now,
                arc_transaction_id: payment.arcTransactionId || null,
                metadata: { ...(paymentRecord.metadata || {}), arc_receipt: payment.arcReceipt || null }
            })
            .eq('id', paymentRecord.id);

        console.log('✅ Payment link completed after gateway verification:', orderId);

        return res.json({
            success: true,
            paymentId: paymentRecord.id,
            paymentLink,
            message: 'Payment link completed successfully'
        });
    } catch (error) {
        console.error('❌ Complete payment link error:', error.message);
        return res.status(500).json({ success: false, error: 'Failed to complete payment link' });
    }
}

/**
 * List all payment links (Admin)
 */
export async function handleListPaymentLinks(req, res) {
    try {
        const caller = getCallerInfo(req);
        // Auth required — these contain customer payment data. Staff only.
        if (!['admin', 'superadmin', 'agent'].includes(caller.role)) {
            return res.status(403).json({ success: false, error: 'Not authorized' });
        }

        // Agent sees only their own links; admin sees all. An agent can never widen scope
        // to another agent via ?agentId — they are always pinned to their own.
        let query = supabase.from('payment_links').select('*').order('created_at', { ascending: false });
        const agentIdParam = req.query.agentId;
        if (caller.role === 'agent') {
            query = query.eq('agent_id', caller.agentId);
        } else if (agentIdParam) {
            query = query.eq('agent_id', agentIdParam);
        }

        const { data: links, error } = await query;

        if (error) {
            return res.status(500).json({ success: false, error: 'Failed to fetch payment links', details: error.message });
        }

        // Auto-expire old links
        const now = new Date();
        for (const link of links) {
            if (link.status === 'pending' && link.expires_at && new Date(link.expires_at) < now) {
                link.status = 'expired';
                await supabase.from('payment_links').update({ status: 'expired' }).eq('id', link.id);
            }
        }

        // Enrich with agent names for admin view
        let agentsMap = {};
        if (caller.role !== 'agent') {
            const agentIds = [...new Set(links.filter(l => l.agent_id).map(l => l.agent_id))];
            if (agentIds.length > 0) {
                const { data: agents } = await supabase.from('agents').select('id, name').in('id', agentIds);
                agentsMap = (agents || []).reduce((m, a) => { m[a.id] = a.name; return m; }, {});
            }
        }

        const frontendBaseUrl = process.env.FRONTEND_URL || 'https://www.jetsetterss.com';
        const enrichedLinks = links.map(link => ({
            ...link,
            paymentUrl: `${frontendBaseUrl}/pay/${link.link_token}`,
            agent_name: agentsMap[link.agent_id] || null
        }));

        return res.json({ success: true, data: enrichedLinks, total: enrichedLinks.length });
    } catch (error) {
        console.error('❌ List payment links error:', errorSummary(error));
        return res.status(500).json({ success: false, error: 'Failed to list payment links', details: error.message });
    }
}
