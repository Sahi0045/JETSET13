import express from 'express';

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
} from './payment/agents.handlers.js';
import restRoutes from './payment/rest.routes.js';

const router = express.Router();


// ============================================
// ACTION-BASED ROUTE HANDLER
// Handles requests with ?action= query parameter
// This bridges the Vercel serverless function pattern with Express
// ============================================

// Main action router - handles ?action= query parameters
router.all('/', async (req, res) => {
    const { action } = req.query;

    if (!action) {
        return res.status(400).json({
            success: false,
            error: 'Missing action parameter',
            supportedActions: ['initiate-payment', 'payment-callback', 'get-payment-details', 'gateway-status']
        });
    }

    console.log(`📥 Payment API Action: ${action}`, { method: req.method, query: req.query });

    try {
        switch (action) {
            case 'initiate-payment':
                return handleInitiatePayment(req, res);
            case 'payment-callback':
                return handlePaymentCallback(req, res);
            case 'get-payment-details':
                return handleGetPaymentDetails(req, res);
            case 'gateway-status':
                return res.json({
                    success: true,
                    gatewayStatus: { status: 'OPERATING' },
                    status: 'OPERATING'
                });
            case 'hosted-checkout':
                return handleHostedCheckout(req, res);
            case 'session-create':
                return handleSessionCreate(req, res);
            case 'cancel-booking':
                return handleCancelBookingAction(req, res);
            case 'get-pending-booking':
                return handleGetPendingBooking(req, res);
            case 'reconcile-booking-payment':
                return handleReconcileBookingPayment(req, res);
            case 'payment-refund':
                return handlePaymentRefund(req, res);
            case 'payment-void':
                return handlePaymentVoid(req, res);
            case 'payment-retrieve':
                return handlePaymentRetrieve(req, res);
            case 'create-payment-link':
                return handleCreatePaymentLink(req, res);
            case 'get-payment-link':
                return handleGetPaymentLink(req, res);
            case 'process-payment-link':
                return handleProcessPaymentLink(req, res);
            case 'list-payment-links':
                return handleListPaymentLinks(req, res);
            case 'agent-login':
                return handleAgentLogin(req, res);
            case 'create-agent':
                return handleCreateAgent(req, res);
            case 'list-agents':
                return handleListAgents(req, res);
            case 'update-agent':
                return handleUpdateAgent(req, res);
            case 'delete-agent':
                return handleDeleteAgent(req, res);
            case 'agent-invite':            // public: validate a set-password token
                return handleGetAgentInvite(req, res);
            case 'agent-accept-invite':     // public: set password + activate
                return handleAcceptAgentInvite(req, res);
            case 'resend-agent-invite':     // super admin: re-send invite
                return handleResendAgentInvite(req, res);
            case 'agent-stats':             // agent: own scoped dashboard data
                return handleAgentStats(req, res);
            case 'complete-payment-link':
                return handleCompletePaymentLink(req, res);
            default:
                return res.status(400).json({
                    success: false,
                    error: `Unknown action: ${action}`,
                    supportedActions: ['initiate-payment', 'payment-callback', 'get-payment-details', 'gateway-status', 'hosted-checkout', 'session-create', 'cancel-booking', 'payment-refund', 'payment-void', 'payment-retrieve']
                });
        }
    } catch (error) {
        console.error('❌ Action handler error:', error);
        return res.status(500).json({
            success: false,
            error: 'Internal server error',
            details: error.message
        });
    }
});

// Additional REST endpoints (gateway status, order/session/process/verify/refund/test)
router.use(restRoutes);

export default router;
