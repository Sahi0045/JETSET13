import express from 'express';
import { optionalProtect } from '../middleware/auth.middleware.js';

// Domain handler modules (split out from the original monolithic payment.routes.js)
import {
    handleInitiatePayment,
    handleHostedCheckout,
    handleGetPendingBooking,
    handleSessionCreate,
    handlePaymentCallback,
    handleGetPaymentDetails,
    handleReconcileBookingPayment,
} from './payment/checkout.handlers.js';
import {
    handleCancelBookingAction,
    handlePaymentRefund,
    handlePaymentVoid,
    handlePaymentRetrieve,
} from './payment/operations.handlers.js';
import {
    handleCreatePaymentLink,
    handleGetPaymentLink,
    handleProcessPaymentLink,
    handleCompletePaymentLink,
    handleListPaymentLinks,
} from './payment/links.handlers.js';
import {
    handleAgentLogin,
    handleCreateAgent,
    handleListAgents,
    handleUpdateAgent,
    handleDeleteAgent,
    handleGetAgentInvite,
    handleAcceptAgentInvite,
    handleResendAgentInvite,
    handleAgentStats,
    handleAdminAgentDetail,
    handleRecordPayout,
} from './payment/agents.handlers.js';
const router = express.Router();

// ============================================
// ACTION-BASED ROUTE HANDLER
// Handles requests with ?action= query parameter
// This bridges the Vercel serverless function pattern with Express
// ============================================

// gateway-status has no dedicated handler module — keep it as an inline function
// so it fits the same lookup-table shape as everything else.
const handleGatewayStatus = (_req, res) => res.json({
    success: true,
    gatewayStatus: { status: 'OPERATING' },
    status: 'OPERATING'
});

// action -> handler lookup. O(1) dispatch instead of a long switch, and a
// single source of truth for the supported-actions list (no more duplicated,
// drifting arrays in the error responses).
const actionHandlers = {
    'initiate-payment': handleInitiatePayment,
    'payment-callback': handlePaymentCallback,
    'get-payment-details': handleGetPaymentDetails,
    'payment-verify': handleGetPaymentDetails, // mobile CruiseApiService.verifyPayment — same orderId lookup
    'gateway-status': handleGatewayStatus,
    'hosted-checkout': handleHostedCheckout,
    'session-create': handleSessionCreate,
    'cancel-booking': handleCancelBookingAction,
    'get-pending-booking': handleGetPendingBooking,
    'reconcile-booking-payment': handleReconcileBookingPayment,
    'payment-refund': handlePaymentRefund,
    'payment-void': handlePaymentVoid,
    'payment-retrieve': handlePaymentRetrieve,
    'create-payment-link': handleCreatePaymentLink,
    'get-payment-link': handleGetPaymentLink,
    'process-payment-link': handleProcessPaymentLink,
    'list-payment-links': handleListPaymentLinks,
    'complete-payment-link': handleCompletePaymentLink,
    'agent-login': handleAgentLogin,
    'create-agent': handleCreateAgent,
    'list-agents': handleListAgents,
    'update-agent': handleUpdateAgent,
    'delete-agent': handleDeleteAgent,
    'agent-invite': handleGetAgentInvite,            // public: validate a set-password token
    'agent-accept-invite': handleAcceptAgentInvite,  // public: set password + activate
    'resend-agent-invite': handleResendAgentInvite,  // super admin: re-send invite
    'agent-stats': handleAgentStats,                 // agent: own scoped dashboard data
    'admin-agent-detail': handleAdminAgentDetail,    // super admin: any agent's full work/stats
    'record-payout': handleRecordPayout,             // super admin: record a commission payout
};

const SUPPORTED_ACTIONS = Object.keys(actionHandlers);

// Main action router - handles ?action= query parameters
// `optionalProtect` so the signed-in user reaches the handlers: hosted checkout
// creates the booking row, and a row created without a user is invisible in My
// Trips forever. It never rejects, so guest checkout is unaffected.
router.all('/', optionalProtect, async (req, res) => {
    const { action } = req.query;

    if (!action) {
        return res.status(400).json({
            success: false,
            error: 'Missing action parameter',
            supportedActions: SUPPORTED_ACTIONS
        });
    }

    const handler = actionHandlers[action];
    if (!handler) {
        return res.status(400).json({
            success: false,
            error: `Unknown action: ${action}`,
            supportedActions: SUPPORTED_ACTIONS
        });
    }

    console.log(`📥 Payment API Action: ${action}`, { method: req.method, query: req.query });

    try {
        return await handler(req, res);
    } catch (error) {
        console.error('❌ Action handler error:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error',
            details: error.message
        });
    }
});

// rest.routes.js used to be mounted here. Every endpoint in it answered success
// without asking the gateway: /payment/process approved any card number with a
// fabricated authorisation code, /payment/verify/:id was VERIFIED for every
// input, /payment/refund was PROCESSED with an invented refund id, and
// /order/create reported an order the gateway never created. All were
// unauthenticated and live. Nothing called them - the clients use the
// `?action=` dispatch above - so they existed only as a way to be wrong.

export default router;
