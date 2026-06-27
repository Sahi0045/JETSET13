import axios from 'axios';
import fetch from 'node-fetch';
import AmadeusService from '../../services/amadeusService.js';
import { supabase, ARC_PAY_CONFIG, getArcPayAuthConfig } from './arcpay.config.js';


// ============================================
// CANCEL BOOKING - Orchestrated cancellation
// (Kept in sync with /api/payments.js per PAYMENT_SYSTEM_ARCHITECTURE.txt)
// ============================================
export async function handleCancelBookingAction(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        console.log('🚫 Handling CANCEL-BOOKING operation (Express)');

        const {
            bookingReference,
            email,
            reason = 'Customer request'
        } = req.body;

        if (!bookingReference) {
            return res.status(400).json({
                success: false,
                error: 'bookingReference is required'
            });
        }

        // 1. Look up booking in Supabase
        let booking = null;

        const { data: byRef } = await supabase
            .from('bookings')
            .select('*')
            .eq('booking_reference', bookingReference)
            .single();

        if (byRef) {
            booking = byRef;
        } else {
            const { data: byOrder } = await supabase
                .from('bookings')
                .select('*')
                .filter('booking_details->>order_id', 'eq', bookingReference)
                .single();
            if (byOrder) booking = byOrder;
        }

        if (!booking) {
            return res.status(404).json({
                success: false,
                error: 'Booking not found',
                details: `No booking found with reference: ${bookingReference}`
            });
        }

        if (booking.status === 'cancelled') {
            return res.status(400).json({
                success: false,
                error: 'Booking is already cancelled',
                booking: { id: booking.id, reference: booking.booking_reference, status: booking.status }
            });
        }

        if (email && booking.customer_email && email.toLowerCase() !== booking.customer_email.toLowerCase()) {
            return res.status(403).json({ success: false, error: 'Email does not match the booking' });
        }

        console.log('📋 Booking found:', booking.id, 'Status:', booking.status);

        const cancellationResult = {
            bookingId: booking.id,
            bookingReference: booking.booking_reference,
            amadeusCancelled: false,
            paymentProcessed: false,
            refundAmount: null,
            paymentAction: null,
            cancellationFee: 0
        };

        // 2. Cancel the flight reservation via Amadeus (only for flight bookings).
        // Use the REAL Amadeus order id first; the service is mock-aware so test PNRs
        // are handled gracefully and the recorded flag stays accurate.
        const orderId = booking.booking_details?.amadeus_order_id ||
            booking.booking_details?.order_id ||
            booking.booking_reference;

        // Cancel the underlying reservation at the supplier, routed by booking type.
        // Mock-aware: with no real order id the service no-ops cleanly. Failure here is
        // logged but does NOT block the ARC refund below (better to refund than to strand).
        if (orderId) {
            const type = booking.travel_type;
            try {
                let amaResult = null;
                if (type === 'flight' || type == null) {
                    amaResult = await AmadeusService.cancelFlightOrder(orderId);
                } else if (type === 'hotel') {
                    amaResult = await AmadeusService.cancelHotelBooking(orderId);
                }
                // (cruise/package have no Amadeus self-service cancel — ARC refund still runs)
                if (amaResult) {
                    cancellationResult.amadeusCancelled = !!amaResult.success;
                    console.log(`🧳 Supplier cancellation (${type || 'flight'}): ${cancellationResult.amadeusCancelled ? 'success' : 'no-op'} (${amaResult.mode || 'LIVE'})`);
                }
            } catch (supplierError) {
                console.warn(`⚠️ Supplier (${type || 'flight'}) cancellation error:`, supplierError.error || supplierError.message);
            }
        }

        // 3. Process cancellation fee and refund/void via ARC Pay
        let cancellationFee = 0;
        let netRefundAmount = 0;

        // Get cancellation fee from price settings
        try {
            const { data: priceSettings } = await supabase
                .from('price_settings')
                .select('settings')
                .single();

            cancellationFee = priceSettings?.settings?.cancellation_fee || 50.00;
        } catch (error) {
            console.warn('Could not fetch cancellation fee, using default:', error.message);
            cancellationFee = 50.00;
        }

        if (['paid', 'completed', 'authorized', 'pending', 'partial'].includes(booking.payment_status) || booking.payment_id) {
            try {
                const { data: payment } = await supabase
                    .from('payments')
                    .select('*')
                    .or(`quote_id.eq.${booking.id},id.eq.${booking.payment_id || 'none'}`)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle();

                if (payment) {
                    const authConfig = getArcPayAuthConfig();
                    const originalAmount = parseFloat(payment.amount || booking.total_amount || 0);
                    netRefundAmount = Math.max(0, originalAmount - cancellationFee);

                    // CRITICAL: Use the ARC Pay order ID (FLT...), NOT the Supabase UUID
                    const arcPayOrderId = booking.booking_details?.order_id ||
                        payment.arc_order_id ||
                        booking.booking_reference ||
                        payment.id; // Last resort fallback
                    console.log('🔑 ARC Pay Order ID for refund/void:', arcPayOrderId);

                    if (payment.payment_status === 'completed' || payment.payment_status === 'paid') {
                        // === COMPLETED PAYMENT: Issue partial REFUND (original - fee) ===
                        // Per ARC Pay docs: REFUND uses same orderId, new transactionId, amount to refund
                        // No separate PAY for fee — just refund less than the full amount
                        if (netRefundAmount > 0) {
                            const refundTxnId = `refund-${Date.now()}`;
                            const refundUrl = `${ARC_PAY_CONFIG.BASE_URL}/merchant/${ARC_PAY_CONFIG.MERCHANT_ID}/order/${arcPayOrderId}/transaction/${refundTxnId}`;

                            console.log('💸 Issuing partial REFUND:', netRefundAmount.toFixed(2), '(original:', originalAmount, '- fee:', cancellationFee, ')');
                            const refundResponse = await axios.put(refundUrl, {
                                apiOperation: 'REFUND',
                                transaction: {
                                    amount: netRefundAmount.toFixed(2),
                                    currency: payment.currency || 'USD',
                                    reference: `Cancel refund (fee: ${cancellationFee}): ${reason}`.substring(0, 40)
                                }
                            }, { headers: authConfig.headers, validateStatus: () => true });

                            if (refundResponse.status >= 200 && refundResponse.status < 300) {
                                const refundData = refundResponse.data;
                                console.log('✅ ARC Pay REFUND successful:', refundData.result);
                                cancellationResult.paymentProcessed = true;
                                cancellationResult.paymentAction = 'PARTIAL_REFUND';
                                cancellationResult.refundAmount = netRefundAmount;
                                cancellationResult.cancellationFee = cancellationFee;
                                // payments.payment_status CHECK allows only pending|processing|completed|failed|refunded.
                                // Record the partial nature in metadata; status maps to the valid 'refunded'.
                                const { error: refundDbErr } = await supabase.from('payments').update({
                                    payment_status: 'refunded',
                                    metadata: { ...payment.metadata, refund: { transactionId: refundTxnId, amount: netRefundAmount, fee: cancellationFee, partial: true, reason, at: new Date().toISOString() } }
                                }).eq('id', payment.id);
                                if (refundDbErr) console.error('⚠️ payments refund-status update failed:', refundDbErr.message);
                            } else {
                                console.error('❌ ARC Pay REFUND failed:', refundResponse.status, JSON.stringify(refundResponse.data));
                                cancellationResult.paymentAction = 'REFUND_FAILED';
                                cancellationResult.refundAmount = 0;
                                cancellationResult.cancellationFee = cancellationFee;
                                cancellationResult.errorDetails = refundResponse.data;
                            }
                        } else {
                            // Cancellation fee >= original amount → no refund due
                            console.log('💰 No refund due: cancellation fee (', cancellationFee, ') >= amount (', originalAmount, ')');
                            cancellationResult.paymentProcessed = true;
                            cancellationResult.paymentAction = 'NO_REFUND_FEE_COVERS';
                            cancellationResult.refundAmount = 0;
                            cancellationResult.cancellationFee = Math.min(cancellationFee, originalAmount);
                            // 'cancelled' is not a valid payments status. The money was kept as the fee,
                            // so leave payment_status as-is (completed) and record the cancellation in metadata.
                            const { error: feeDbErr } = await supabase.from('payments').update({
                                metadata: { ...payment.metadata, cancellation: { paymentAction: 'NO_REFUND_FEE_COVERS', fee: cancellationFee, reason, at: new Date().toISOString() } }
                            }).eq('id', payment.id);
                            if (feeDbErr) console.error('⚠️ payments cancellation-metadata update failed:', feeDbErr.message);
                        }
                    } else if (payment.payment_status === 'pending' || payment.payment_status === 'authorized') {
                        // === AUTHORIZED/PENDING: VOID the full transaction ===
                        // Per ARC Pay docs: VOID requires transaction.targetTransactionId (the original PAY txn ID)
                        // Partial void is NOT supported — must void the full amount
                        let targetTxnId = payment.arc_transaction_id;

                        // If we don't have the original transaction ID, try to retrieve the order to find it
                        if (!targetTxnId) {
                            try {
                                const orderUrl = `${ARC_PAY_CONFIG.BASE_URL}/merchant/${ARC_PAY_CONFIG.MERCHANT_ID}/order/${arcPayOrderId}`;
                                const orderResp = await axios.get(orderUrl, { headers: authConfig.headers, validateStatus: () => true });
                                if (orderResp.status === 200) {
                                    const orderData = orderResp.data;
                                    // Find the last successful PAY or AUTHORIZE transaction
                                    const txns = orderData.transaction || [];
                                    const payTxn = txns.find(t => t.transaction?.type === 'PAYMENT' || t.transaction?.type === 'AUTHORIZATION');
                                    targetTxnId = payTxn?.transaction?.id || txns[txns.length - 1]?.transaction?.id;
                                    console.log('🔍 Retrieved target transaction ID from order:', targetTxnId);
                                }
                            } catch (orderErr) {
                                console.warn('⚠️ Could not retrieve order to find transaction ID:', orderErr.message);
                            }
                        }

                        if (targetTxnId) {
                            const voidTxnId = `void-${Date.now()}`;
                            const voidUrl = `${ARC_PAY_CONFIG.BASE_URL}/merchant/${ARC_PAY_CONFIG.MERCHANT_ID}/order/${arcPayOrderId}/transaction/${voidTxnId}`;

                            console.log('🚫 Issuing VOID for transaction:', targetTxnId);
                            const voidResp = await axios.put(voidUrl, {
                                apiOperation: 'VOID',
                                transaction: {
                                    targetTransactionId: targetTxnId,
                                    reference: `Cancellation: ${reason}`.substring(0, 40)
                                }
                            }, { headers: authConfig.headers, validateStatus: () => true });

                            if (voidResp.status === 200 || voidResp.status === 201) {
                                const voidData = voidResp.data;
                                console.log('✅ ARC Pay VOID successful:', voidData.result);
                                cancellationResult.paymentProcessed = true;
                                cancellationResult.paymentAction = 'VOID';
                                cancellationResult.refundAmount = originalAmount; // Full amount returned
                                cancellationResult.cancellationFee = 0; // No fee on void (not settled yet)
                                // 'voided' is not a valid payments status; map to 'refunded' (funds fully
                                // returned) and record paymentAction:'VOID' in metadata to distinguish it.
                                const { error: voidDbErr } = await supabase.from('payments').update({
                                    payment_status: 'refunded',
                                    metadata: { ...payment.metadata, void: { transactionId: voidTxnId, targetTxnId, paymentAction: 'VOID', reason, at: new Date().toISOString() } }
                                }).eq('id', payment.id);
                                if (voidDbErr) console.error('⚠️ payments void-status update failed:', voidDbErr.message);
                            } else {
                                console.error('❌ ARC Pay VOID failed:', voidResp.status);
                                cancellationResult.paymentAction = 'VOID_FAILED';
                                cancellationResult.refundAmount = 0;
                                cancellationResult.cancellationFee = 0; // Void failed, fee is not strictly determined but typically no fee applies yet
                            }
                        } else {
                            console.error('❌ Cannot void: no target transaction ID found');
                            cancellationResult.paymentAction = 'VOID_MISSING_TXN_ID';
                        }
                    }
                } else {
                    // No payment record found — direct booking via hosted checkout
                    console.log('⚠️ No payment record found, using booking data for refund');
                    const originalAmount = parseFloat(booking.total_amount || 0);
                    const netRefundAmount = Math.max(0, originalAmount - cancellationFee);
                    const orderIdForArc = booking.booking_details?.order_id || booking.booking_reference;
                    console.log('🔑 ARC Pay Order ID (from booking):', orderIdForArc, 'Amount:', originalAmount, 'Net refund:', netRefundAmount);

                    if (netRefundAmount > 0) {
                        const authConfig = getArcPayAuthConfig();
                        const refundTxnId = `refund-cancel-${Date.now()}`;
                        const refundUrl = `${ARC_PAY_CONFIG.BASE_URL}/merchant/${ARC_PAY_CONFIG.MERCHANT_ID}/order/${orderIdForArc}/transaction/${refundTxnId}`;
                        console.log('💸 Issuing REFUND (no payment record):', netRefundAmount.toFixed(2));

                        const refundResp = await axios.put(refundUrl, {
                            apiOperation: 'REFUND',
                            transaction: {
                                amount: netRefundAmount.toFixed(2),
                                currency: 'USD',
                                reference: `Cancel refund (fee: ${cancellationFee}): ${reason}`.substring(0, 40)
                            }
                        }, { headers: authConfig.headers, validateStatus: () => true });

                        if (refundResp.status === 200 || refundResp.status === 201) {
                            console.log('✅ ARC Pay REFUND successful (no payment record)');
                            cancellationResult.paymentProcessed = true;
                            cancellationResult.paymentAction = 'PARTIAL_REFUND';
                            cancellationResult.refundAmount = netRefundAmount;
                            cancellationResult.cancellationFee = cancellationFee;
                            cancellationResult.refundTransactionId = refundTxnId;
                        } else {
                            console.error('❌ ARC Pay REFUND failed:', refundResp.status, JSON.stringify(refundResp.data));
                            cancellationResult.paymentAction = 'REFUND_FAILED';
                            cancellationResult.refundAmount = 0;
                            cancellationResult.cancellationFee = cancellationFee;
                            cancellationResult.errorDetails = refundResp.data;
                        }
                    } else {
                        cancellationResult.paymentProcessed = true;
                        cancellationResult.paymentAction = 'NO_REFUND_FEE_COVERS';
                        cancellationResult.refundAmount = 0;
                        cancellationResult.cancellationFee = Math.min(cancellationFee, originalAmount);
                    }
                }
            } catch (paymentError) {
                console.warn('⚠️ Payment refund/void error:', paymentError.message);
                // Fallback: mark as refund pending with cancellation fee noted
                cancellationResult.refundAmount = 0;
                cancellationResult.cancellationFee = cancellationFee;
                cancellationResult.paymentAction = 'MANUAL_PROCESS_REQUIRED';
            }
        }

        // 4. Update booking status
        // DB constraint: payment_status IN ('unpaid','partial','paid','refunded','partially_refunded')
        const { error: updateError } = await supabase
            .from('bookings')
            .update({
                status: 'cancelled',
                payment_status: cancellationResult.paymentProcessed ?
                    (cancellationResult.paymentAction === 'PARTIAL_REFUND' ? 'partially_refunded' : 'refunded') :
                    (booking.payment_status === 'paid' ? 'partially_refunded' : booking.payment_status),
                booking_details: {
                    ...booking.booking_details,
                    cancellation: {
                        cancelledAt: new Date().toISOString(),
                        reason,
                        amadeusCancelled: cancellationResult.amadeusCancelled,
                        paymentAction: cancellationResult.paymentAction,
                        refundAmount: cancellationResult.refundAmount,
                        cancellationFee: cancellationResult.cancellationFee || 0,
                        netRefund: (cancellationResult.refundAmount || 0)
                    }
                }
            })
            .eq('id', booking.id);

        if (updateError) {
            return res.status(500).json({ success: false, error: 'Failed to update booking status', details: updateError.message });
        }

        // --- Send Cancellation Email ---
        try {
            const { sendCancellationNotificationEmails } = await import('../../services/emailService.js');
            console.log('📧 Sending cancellation confirmation email...');

            // Extract email from passenger_details if available
            let passengerEmail = null;
            if (Array.isArray(booking.passenger_details) && booking.passenger_details.length > 0) {
                passengerEmail = booking.passenger_details[0]?.email || booking.passenger_details[0]?.contact?.emailAddress;
            }

            const cancelEmailData = {
                customerEmail: booking.customer_email || booking.booking_details?.customer_email || passengerEmail || email || 'test@jetsetterss.com',
                customerName: booking.customer_name || (Array.isArray(booking.passenger_details) && booking.passenger_details[0]?.firstName ? `${booking.passenger_details[0].firstName} ${booking.passenger_details[0].lastName || ''}`.trim() : 'Valued Customer'),
                bookingReference: booking.booking_reference,
                bookingType: booking.travel_type || 'flight',
                refundAmount: cancellationResult.refundAmount,
                cancellationFee: cancellationResult.cancellationFee,
                currency: 'USD'
            };

            const emailResult = await sendCancellationNotificationEmails(cancelEmailData);
            if (emailResult.success) {
                console.log('✅ Cancellation email sent successfully');
            } else {
                console.warn('⚠️ Cancellation email sent with issues:', emailResult.error);
            }
        } catch (emailError) {
            console.error('❌ Failed to send cancellation email:', emailError.message);
        }
        // -------------------------------

        console.log('✅ Booking cancelled successfully:', booking.id);

        return res.status(200).json({
            success: true,
            message: 'Booking cancelled successfully',
            cancellation: cancellationResult,
            booking: {
                id: booking.id,
                reference: booking.booking_reference,
                status: 'cancelled',
                previousStatus: booking.status,
                refundAmount: cancellationResult.refundAmount,
                cancellationFee: cancellationResult.cancellationFee,
                netRefund: (cancellationResult.refundAmount || 0),
                paymentAction: cancellationResult.paymentAction
            }
        });

    } catch (error) {
        console.error('❌ Cancel booking error:', error);
        return res.status(500).json({ success: false, error: 'Failed to cancel booking', details: error.message });
    }
}

// ============================================
// ADMIN PAYMENT MANAGEMENT HANDLERS
// These handle refund, void, and status retrieval
// from the admin panel (InquiryDetail.jsx)
// ============================================

export async function handlePaymentRefund(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        console.log('💰 Handling PAYMENT-REFUND operation');
        const { paymentId, amount, reason = 'Admin initiated refund' } = req.body;

        if (!paymentId) {
            return res.status(400).json({ success: false, error: 'paymentId is required' });
        }

        // Look up payment in Supabase
        const { data: payment, error: fetchError } = await supabase
            .from('payments')
            .select('*')
            .eq('id', paymentId)
            .single();

        if (fetchError || !payment) {
            return res.status(404).json({ success: false, error: 'Payment not found' });
        }

        if (payment.payment_status === 'refunded') {
            return res.status(400).json({ success: false, error: 'Payment has already been refunded' });
        }

        const refundAmount = parseFloat(amount || payment.amount || 0);
        if (isNaN(refundAmount) || refundAmount <= 0) {
            return res.status(400).json({ success: false, error: 'Invalid refund amount' });
        }

        // Process refund via ARC Pay
        // CRITICAL: Use the ARC Pay order ID (FLT...), NOT the Supabase UUID
        const arcOrderId = payment.arc_order_id || paymentId;
        console.log('🔑 ARC Pay Order ID for refund:', arcOrderId, '(Supabase ID:', paymentId, ')');
        const authConfig = getArcPayAuthConfig();
        const refundTxnId = `refund-admin-${Date.now()}`;
        const refundUrl = `${ARC_PAY_CONFIG.BASE_URL}/merchant/${ARC_PAY_CONFIG.MERCHANT_ID}/order/${arcOrderId}/transaction/${refundTxnId}`;

        try {
            const refundResponse = await fetch(refundUrl, {
                method: 'PUT',
                headers: authConfig.headers,
                body: JSON.stringify({
                    apiOperation: 'REFUND',
                    transaction: {
                        amount: refundAmount.toFixed(2),
                        currency: payment.currency || 'USD',
                        reference: `Admin refund: ${reason}`
                    }
                })
            });

            const refundData = await refundResponse.json().catch(() => null);

            if (refundResponse.ok) {
                // Update payment status in DB
                await supabase.from('payments').update({
                    payment_status: 'refunded',
                    refund_amount: refundAmount,
                    refund_reason: reason,
                    refunded_at: new Date().toISOString()
                }).eq('id', paymentId);

                // Also update the associated booking status if exists
                if (payment.quote_id) {
                    await supabase.from('bookings').update({
                        payment_status: 'refunded'
                    }).eq('id', payment.quote_id);
                }

                console.log('✅ Refund processed successfully:', paymentId);
                return res.json({
                    success: true,
                    message: 'Refund processed successfully',
                    refund: {
                        paymentId,
                        amount: refundAmount,
                        transactionId: refundTxnId,
                        status: 'refunded'
                    }
                });
            } else {
                console.warn('⚠️ ARC Pay refund failed:', refundData);
                // Still update locally so admin can track
                await supabase.from('payments').update({
                    payment_status: 'refund_pending',
                    refund_amount: refundAmount,
                    refund_reason: reason
                }).eq('id', paymentId);

                return res.json({
                    success: true,
                    message: 'Refund marked as pending. ARC Pay processing may take time.',
                    refund: {
                        paymentId,
                        amount: refundAmount,
                        status: 'refund_pending',
                        arcPayResponse: refundData
                    }
                });
            }
        } catch (arcError) {
            console.warn('⚠️ ARC Pay refund error, marking locally:', arcError.message);
            // Mark refund locally even if ARC Pay is unreachable
            await supabase.from('payments').update({
                payment_status: 'refund_pending',
                refund_amount: refundAmount,
                refund_reason: reason
            }).eq('id', paymentId);

            return res.json({
                success: true,
                message: 'Refund recorded locally. Will be processed when payment gateway is available.',
                refund: { paymentId, amount: refundAmount, status: 'refund_pending' }
            });
        }
    } catch (error) {
        console.error('❌ Payment refund error:', error);
        return res.status(500).json({ success: false, error: 'Failed to process refund', details: error.message });
    }
}

export async function handlePaymentVoid(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        console.log('🚫 Handling PAYMENT-VOID operation');
        // The admin UI sends `paymentId` = ARC order id (CRZ.../HTL.../FLT...) or booking reference.
        const { paymentId, bookingReference, orderId: orderIdInput, reason = 'Admin initiated void' } = req.body;
        const ref = bookingReference || orderIdInput || paymentId;

        if (!ref) {
            return res.status(400).json({ success: false, error: 'A booking reference or order id is required' });
        }

        // 1. Resolve the booking (source of truth) by reference OR by stored order_id
        const { data: booking } = await supabase
            .from('bookings')
            .select('*')
            .or(`booking_reference.eq.${ref},booking_details->>order_id.eq.${ref}`)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        // Legacy: a payments row may exist (keyed by id or arc_order_id)
        const { data: payment } = await supabase
            .from('payments')
            .select('*')
            .or(`id.eq.${ref},arc_order_id.eq.${ref}`)
            .limit(1)
            .maybeSingle();

        if (!booking && !payment) {
            return res.status(404).json({ success: false, error: 'No booking or payment found for the provided reference' });
        }

        if (booking && (booking.status === 'cancelled' || ['voided', 'refunded', 'partially_refunded'].includes(booking.payment_status))) {
            return res.status(400).json({
                success: false,
                error: 'This booking has already been voided/refunded/cancelled',
                booking: { reference: booking.booking_reference, status: booking.status, payment_status: booking.payment_status }
            });
        }

        const arcOrderId = booking?.booking_details?.order_id || payment?.arc_order_id || booking?.booking_reference || ref;
        const authConfig = getArcPayAuthConfig();

        // 2. RETRIEVE_ORDER to (a) verify the order is still voidable and (b) find the target transaction id
        let targetTxnId = payment?.arc_transaction_id || booking?.booking_details?.transaction_id || null;
        let orderStatus = null;
        try {
            const orderUrl = `${ARC_PAY_CONFIG.BASE_URL}/merchant/${ARC_PAY_CONFIG.MERCHANT_ID}/order/${arcOrderId}`;
            const orderResp = await axios.get(orderUrl, { headers: authConfig.headers, validateStatus: () => true });
            if (orderResp.status === 200 && orderResp.data) {
                orderStatus = orderResp.data.status; // e.g. CAPTURED, AUTHORIZED, REFUNDED, CANCELLED
                const txns = Array.isArray(orderResp.data.transaction) ? orderResp.data.transaction : [];

                // Already voided/cancelled on the gateway?
                const hasVoid = txns.some(t => t.transaction?.type === 'VOID' && (t.result === 'SUCCESS'));
                if (orderStatus === 'CANCELLED' || hasVoid) {
                    return res.status(400).json({ success: false, error: 'The payment is already voided on the gateway', orderStatus });
                }

                // Find the most recent successful PAYMENT/CAPTURE/AUTHORIZATION to void
                const candidates = txns.filter(t => {
                    const type = t.transaction?.type;
                    const ok = t.result === 'SUCCESS' || t.response?.gatewayCode === 'APPROVED';
                    return ok && ['PAYMENT', 'CAPTURE', 'AUTHORIZATION'].includes(type);
                });
                if (candidates.length) {
                    targetTxnId = candidates[candidates.length - 1].transaction.id;
                }
                console.log('🔍 RETRIEVE_ORDER status:', orderStatus, '| target txn:', targetTxnId);
            } else {
                console.warn('⚠️ RETRIEVE_ORDER non-200:', orderResp.status);
            }
        } catch (retrieveErr) {
            console.warn('⚠️ RETRIEVE_ORDER failed:', retrieveErr.message);
        }

        if (!targetTxnId) {
            return res.status(400).json({
                success: false,
                error: 'Could not determine the transaction to void. If the payment has settled, use Cancel & Refund instead.'
            });
        }

        // 3. Issue the VOID against the original transaction
        const voidTxnId = `void-admin-${Date.now()}`;
        const voidUrl = `${ARC_PAY_CONFIG.BASE_URL}/merchant/${ARC_PAY_CONFIG.MERCHANT_ID}/order/${arcOrderId}/transaction/${voidTxnId}`;
        console.log('🚫 Issuing VOID — order:', arcOrderId, 'target txn:', targetTxnId);

        const voidResponse = await axios.put(voidUrl, {
            apiOperation: 'VOID',
            transaction: {
                targetTransactionId: targetTxnId,
                reference: `Admin void: ${reason}`.substring(0, 40)
            }
        }, { headers: authConfig.headers, validateStatus: () => true });

        const voidOk = (voidResponse.status >= 200 && voidResponse.status < 300) &&
            (voidResponse.data?.result === 'SUCCESS' || !voidResponse.data?.result);

        if (!voidOk) {
            console.error('❌ ARC Pay VOID failed:', voidResponse.status, JSON.stringify(voidResponse.data));
            return res.status(400).json({
                success: false,
                error: 'Failed to void payment. It may have already settled — use Cancel & Refund instead.',
                orderStatus,
                details: voidResponse.data
            });
        }

        console.log('✅ ARC Pay VOID successful:', voidResponse.data?.result || voidResponse.status);
        const voidedAt = new Date().toISOString();

        // 4a. Update the booking (DB payment_status constraint allows 'refunded' — funds fully returned by void)
        if (booking) {
            const { error: bErr } = await supabase.from('bookings').update({
                status: 'cancelled',
                payment_status: 'refunded',
                booking_details: {
                    ...booking.booking_details,
                    void: {
                        voidTransactionId: voidTxnId,
                        targetTransactionId: targetTxnId,
                        reason,
                        voidedAt
                    },
                    cancellation: {
                        ...(booking.booking_details?.cancellation || {}),
                        cancelledAt: voidedAt,
                        reason,
                        paymentAction: 'VOID',
                        refundAmount: parseFloat(booking.total_amount) || 0,
                        cancellationFee: 0
                    }
                }
            }).eq('id', booking.id);
            if (bErr) console.error('⚠️ Booking void-update failed:', bErr.message);
        }

        // 4b. Update the legacy payments row if one exists (store void info in metadata JSON — no schema change).
        // NOTE: the payments.payment_status CHECK only allows pending|processing|completed|failed|refunded,
        // so a void is recorded as 'refunded' (funds fully returned); paymentAction:'VOID' in metadata
        // distinguishes it from an actual gateway refund.
        if (payment) {
            const { error: pErr } = await supabase.from('payments').update({
                payment_status: 'refunded',
                metadata: {
                    ...(payment.metadata || {}),
                    void: { transactionId: voidTxnId, targetTransactionId: targetTxnId, reason, voidedAt, paymentAction: 'VOID' }
                }
            }).eq('id', payment.id);
            if (pErr) console.error('⚠️ Payment void-update failed:', pErr.message);
        }

        return res.json({
            success: true,
            message: 'Payment voided successfully',
            void: {
                bookingReference: booking?.booking_reference || ref,
                orderId: arcOrderId,
                voidTransactionId: voidTxnId,
                targetTransactionId: targetTxnId,
                status: 'voided'
            }
        });
    } catch (error) {
        console.error('❌ Payment void error:', error);
        return res.status(500).json({ success: false, error: 'Failed to void payment', details: error.message });
    }
}

export async function handlePaymentRetrieve(req, res) {
    try {
        console.log('🔍 Handling PAYMENT-RETRIEVE operation');
        const { paymentId } = req.query;

        if (!paymentId) {
            return res.status(400).json({ success: false, error: 'paymentId is required' });
        }

        // Get local payment record
        const { data: payment, error: fetchError } = await supabase
            .from('payments')
            .select('*')
            .eq('id', paymentId)
            .single();

        if (fetchError || !payment) {
            return res.status(404).json({ success: false, error: 'Payment not found' });
        }

        // Try to retrieve order status from ARC Pay
        let arcPayData = null;
        try {
            const authConfig = getArcPayAuthConfig();
            const orderUrl = `${ARC_PAY_CONFIG.BASE_URL}/merchant/${ARC_PAY_CONFIG.MERCHANT_ID}/order/${paymentId}`;

            const orderResponse = await fetch(orderUrl, {
                method: 'GET',
                headers: authConfig.headers
            });

            if (orderResponse.ok) {
                arcPayData = await orderResponse.json();

                // Sync status from ARC Pay to local DB
                const arcStatus = arcPayData?.status;
                let localStatus = payment.payment_status;

                if (arcStatus === 'CAPTURED' && localStatus !== 'completed') {
                    localStatus = 'completed';
                } else if (arcStatus === 'REFUNDED' && localStatus !== 'refunded') {
                    localStatus = 'refunded';
                } else if (arcStatus === 'PARTIALLY_REFUNDED' && localStatus !== 'partially_refunded') {
                    localStatus = 'partially_refunded';
                } else if (arcStatus === 'VOID' && localStatus !== 'voided') {
                    localStatus = 'voided';
                }

                if (localStatus !== payment.payment_status) {
                    await supabase.from('payments').update({
                        payment_status: localStatus,
                        last_status_check: new Date().toISOString()
                    }).eq('id', paymentId);
                }
            }
        } catch (arcError) {
            console.warn('⚠️ Could not retrieve ARC Pay status:', arcError.message);
        }

        return res.json({
            success: true,
            payment: payment,
            orderData: arcPayData
        });
    } catch (error) {
        console.error('❌ Payment retrieve error:', error);
        return res.status(500).json({ success: false, error: 'Failed to retrieve payment', details: error.message });
    }
}

// Reverse a captured ARC payment for an order — used when fulfillment fails AFTER the
// customer was charged (e.g. ticket issuance fails). Issues a VOID if the transaction is
// not yet settled, otherwise a full REFUND. Safe to call even if there is nothing to
// reverse (reports reversed:false rather than throwing). Returns:
//   { reversed: boolean, action: 'VOID'|'REFUND'|'ALREADY_REVERSED'|'NONE'|'FAILED', ... }
export async function reverseArcPaymentForOrder(orderId, { amount, currency = 'USD', reason = 'Booking could not be completed' } = {}) {
    if (!orderId) return { reversed: false, action: 'NONE', error: 'no orderId' };
    const authConfig = getArcPayAuthConfig();
    try {
        // RETRIEVE_ORDER to inspect transactions and find what to reverse.
        const orderUrl = `${ARC_PAY_CONFIG.BASE_URL}/merchant/${ARC_PAY_CONFIG.MERCHANT_ID}/order/${orderId}`;
        const orderResp = await axios.get(orderUrl, { headers: authConfig.headers, validateStatus: () => true });
        if (orderResp.status !== 200 || !orderResp.data) {
            return { reversed: false, action: 'NONE', error: `retrieve order failed (${orderResp.status})` };
        }
        const order = orderResp.data;
        const txns = Array.isArray(order.transaction) ? order.transaction : [];

        // Already reversed on the gateway? Treat as success (idempotent).
        const alreadyReversed = order.status === 'CANCELLED' || order.status === 'REFUNDED' ||
            txns.some(t => ['VOID', 'REFUND'].includes(t.transaction?.type) && t.result === 'SUCCESS');
        if (alreadyReversed) {
            return { reversed: true, action: 'ALREADY_REVERSED', orderStatus: order.status };
        }

        // Find the most recent successful capture/authorization to reverse.
        const captured = [...txns].reverse().find(t => {
            const type = t.transaction?.type;
            const ok = t.result === 'SUCCESS' || t.response?.gatewayCode === 'APPROVED';
            return ok && ['PAYMENT', 'CAPTURE', 'AUTHORIZATION'].includes(type);
        });
        if (!captured) {
            return { reversed: false, action: 'NONE', error: 'no captured transaction to reverse' };
        }
        const targetTxnId = captured.transaction.id;

        // 1) Try VOID first (works pre-settlement; no money actually moved, no fee).
        const voidTxnId = `void-fail-${Date.now()}`;
        const voidUrl = `${ARC_PAY_CONFIG.BASE_URL}/merchant/${ARC_PAY_CONFIG.MERCHANT_ID}/order/${orderId}/transaction/${voidTxnId}`;
        const voidResp = await axios.put(voidUrl, {
            apiOperation: 'VOID',
            transaction: { targetTransactionId: targetTxnId, reference: String(reason).substring(0, 40) }
        }, { headers: authConfig.headers, validateStatus: () => true });
        if (voidResp.status >= 200 && voidResp.status < 300 && (voidResp.data?.result === 'SUCCESS' || !voidResp.data?.result)) {
            return { reversed: true, action: 'VOID', transactionId: voidTxnId, targetTransactionId: targetTxnId };
        }

        // 2) VOID rejected (likely already settled) → REFUND the full amount.
        const refundAmt = parseFloat(amount || captured.transaction?.amount || order.amount || 0);
        if (refundAmt > 0) {
            const refundTxnId = `refund-fail-${Date.now()}`;
            const refundUrl = `${ARC_PAY_CONFIG.BASE_URL}/merchant/${ARC_PAY_CONFIG.MERCHANT_ID}/order/${orderId}/transaction/${refundTxnId}`;
            const refundResp = await axios.put(refundUrl, {
                apiOperation: 'REFUND',
                transaction: { amount: refundAmt.toFixed(2), currency, reference: String(reason).substring(0, 40) }
            }, { headers: authConfig.headers, validateStatus: () => true });
            if (refundResp.status >= 200 && refundResp.status < 300) {
                return { reversed: true, action: 'REFUND', amount: refundAmt, transactionId: refundTxnId };
            }
            return { reversed: false, action: 'FAILED', error: 'VOID and REFUND both failed', details: refundResp.data };
        }
        return { reversed: false, action: 'FAILED', error: 'VOID failed and no amount available to refund', details: voidResp.data };
    } catch (err) {
        return { reversed: false, action: 'FAILED', error: err.message };
    }
}
