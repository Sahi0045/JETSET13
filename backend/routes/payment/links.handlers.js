import axios from 'axios';
import { supabase, ARC_PAY_CONFIG, getArcPayAuthConfig } from './arcpay.config.js';
import { getCallerInfo, generateLinkToken } from './payment.helpers.js';


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
                currency: currency,
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
                    subject: `Payment Link - ${description || bookingType} | Jetsetters`,
                    html: `
                        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                            <div style="background: #055B75; color: white; padding: 20px; text-align: center;">
                                <h2>💳 Payment Request</h2>
                            </div>
                            <div style="padding: 20px; background: #f9f9f9;">
                                <p>Dear ${customerName},</p>
                                <p>You have a pending payment for your travel booking:</p>
                                <div style="background: white; padding: 15px; border-radius: 8px; margin: 15px 0;">
                                    <p><strong>Amount:</strong> ${currency} ${parseFloat(amount).toFixed(2)}</p>
                                    <p><strong>Type:</strong> ${bookingType.charAt(0).toUpperCase() + bookingType.slice(1)}</p>
                                    ${description ? `<p><strong>Description:</strong> ${description}</p>` : ''}
                                </div>
                                <div style="text-align: center; margin: 20px 0;">
                                    <a href="${paymentUrl}" style="background: #055B75; color: white; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: bold;">
                                        Pay Now →
                                    </a>
                                </div>
                                <p style="font-size: 12px; color: #888;">This link expires on ${expiresAt.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}.</p>
                            </div>
                        </div>
                    `
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
        console.error('❌ Create payment link error:', error);
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
        console.error('❌ Get payment link error:', error);
        return res.status(500).json({ success: false, error: 'Failed to get payment link', details: error.message });
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

        const orderId = `PL-${paymentLink.id.slice(0, 8)}-${Date.now().toString().slice(-6)}`;
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
                timeout: 900
            },
            order: {
                id: orderId,
                reference: orderId.substring(0, 40),
                amount: parseFloat(paymentLink.amount).toFixed(2),
                currency: paymentLink.currency,
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

        const { data: bookingRecord } = await supabase.from('bookings').insert({
            booking_reference: orderId,
            travel_type: paymentLink.booking_type,
            total_amount: parseFloat(paymentLink.amount),
            status: 'pending',
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
        }).select().single();

        // Store payment record
        await supabase.from('payments').insert({
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
        console.error('❌ Process payment link error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to process payment',
            details: error.response?.data || error.message
        });
    }
}


/**
 * Complete a payment link payment — update payment link, booking, and payment status
 */
export async function handleCompletePaymentLink(req, res) {
    try {
        const { paymentLinkToken, orderId, resultIndicator } = req.body;

        if (!paymentLinkToken || !orderId) {
            return res.status(400).json({ success: false, error: 'paymentLinkToken and orderId required' });
        }

        console.log('🔗 Completing payment link:', paymentLinkToken, 'orderId:', orderId);

        // Get the payment link details
        const { data: paymentLink } = await supabase
            .from('payment_links')
            .select('*')
            .eq('link_token', paymentLinkToken)
            .single();

        // Update payment link status
        await supabase
            .from('payment_links')
            .update({ status: 'paid', paid_at: new Date().toISOString() })
            .eq('link_token', paymentLinkToken);

        // Update booking status
        await supabase
            .from('bookings')
            .update({ status: 'confirmed', payment_status: 'paid' })
            .eq('booking_reference', orderId);

        // Find payment record — try arc_order_id first, then metadata
        let paymentRecord = null;
        
        const { data: byOrderId } = await supabase
            .from('payments')
            .select('*')
            .eq('arc_order_id', orderId)
            .limit(1);
        
        if (byOrderId && byOrderId.length > 0) {
            paymentRecord = byOrderId[0];
        } else {
            // Fallback: search by metadata containing the payment_link_token
            const { data: byMetadata } = await supabase
                .from('payments')
                .select('*')
                .contains('metadata', { payment_link_token: paymentLinkToken })
                .limit(1);
            if (byMetadata && byMetadata.length > 0) {
                paymentRecord = byMetadata[0];
            }
        }

        let paymentId;
        if (paymentRecord) {
            paymentId = paymentRecord.id;
            await supabase
                .from('payments')
                .update({
                    payment_status: 'completed',
                    completed_at: new Date().toISOString(),
                    arc_transaction_id: resultIndicator || null,
                    arc_order_id: orderId
                })
                .eq('id', paymentId);
        } else {
            // No payment record found — create one from the payment link data
            const { data: newPayment } = await supabase.from('payments').insert({
                amount: paymentLink?.amount || 0,
                currency: paymentLink?.currency || 'USD',
                payment_status: 'completed',
                completed_at: new Date().toISOString(),
                arc_order_id: orderId,
                arc_transaction_id: resultIndicator || null,
                customer_email: paymentLink?.customer_email,
                customer_name: paymentLink?.customer_name,
                metadata: {
                    payment_link_id: paymentLink?.id,
                    payment_link_token: paymentLinkToken,
                    order_id: orderId
                },
                created_at: new Date().toISOString()
            }).select().single();
            paymentId = newPayment?.id || orderId;
        }

        console.log('✅ Payment link completed successfully:', paymentLinkToken, 'paymentId:', paymentId);

        return res.json({
            success: true,
            paymentId,
            paymentLink,
            message: 'Payment link completed successfully'
        });
    } catch (error) {
        console.error('❌ Complete payment link error:', error);
        return res.status(500).json({ success: false, error: error.message });
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
        console.error('❌ List payment links error:', error);
        return res.status(500).json({ success: false, error: 'Failed to list payment links', details: error.message });
    }
}
