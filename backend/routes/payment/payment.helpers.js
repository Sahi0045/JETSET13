import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../../config/jwt.js';
import { getCaller } from './agents.handlers.js';


// Helper function to parse various date formats and return YYYY-MM-DD
export function parseToISODate(dateValue) {
    if (!dateValue) return new Date().toISOString().split('T')[0];

    // Already in YYYY-MM-DD format (10 chars)
    if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
        return dateValue;
    }

    // ISO datetime format "2026-02-03T18:10:00"
    if (typeof dateValue === 'string' && dateValue.includes('T')) {
        return dateValue.split('T')[0];
    }

    // Try to parse human-readable formats like "Fri, Feb 6" or "Friday, February 6, 2026"
    try {
        const parsed = new Date(dateValue);
        if (!isNaN(parsed.getTime())) {
            // If the year is missing or very old, use current year
            if (parsed.getFullYear() < 2000) {
                parsed.setFullYear(new Date().getFullYear());
            }
            return parsed.toISOString().split('T')[0];
        }
    } catch (e) {
        // Parsing failed
    }

    // Fallback to today's date
    return new Date().toISOString().split('T')[0];
}

// Helper function to determine card type
export function getCardType(cardNumber) {
    const firstDigit = cardNumber.charAt(0);
    const firstTwo = cardNumber.substring(0, 2);

    if (firstDigit === '4') return 'visa';
    if (['51', '52', '53', '54', '55'].includes(firstTwo)) return 'mastercard';
    if (['34', '37'].includes(firstTwo)) return 'amex';
    if (['60', '62', '64', '65'].includes(firstTwo)) return 'discover';
    return 'unknown';
}


// =====================================================
// PAYMENT LINK HANDLERS
// =====================================================

/**
 * Extract caller info (admin vs agent) from Authorization header
 */
/**
 * Did the gateway actually do what we asked?
 *
 * ARC (MPGS) answers a refused refund or void with HTTP 200 and
 * `result: "FAILURE"` - a declined reversal is a well-formed reply, not a
 * transport error. Every reversal site used to check only the status code, so a
 * refund the gateway refused was logged as "✅ REFUND successful: FAILURE" and
 * the booking written `refunded`. The customer was told their money was on its
 * way; nothing had moved.
 *
 * This is deliberately strict: a 2xx with no `result` at all counts as not
 * succeeded. Failing that way leaves the money recorded as still held, which a
 * human can fix; the other way tells a customer they were paid back when they
 * were not.
 */
export function arcSucceeded(response) {
    const status = Number(response?.status);
    return status >= 200 && status < 300 && response?.data?.result === 'SUCCESS';
}

/**
 * What an ARC reply that refused something says, without what it carried.
 *
 * A gateway transaction reply can carry the order, the card holder's name and
 * the billing address alongside the verdict. Refusals were logged with
 * JSON.stringify and handed back whole as `errorDetails` in the cancel
 * response, which a guest reaches with a booking reference and an email -
 * the thing checkout.handlers.js is careful not to do with the same object.
 * The verdict is what a person acts on: the result, the gateway code, and
 * ARC's own error cause and explanation.
 */
export function arcFailureSummary(data) {
    if (!data || typeof data !== 'object') return null;
    return {
        result: data.result ?? null,
        ...(data.response?.gatewayCode ? { response: { gatewayCode: data.response.gatewayCode } } : {}),
        ...(data.error ? {
            error: {
                cause: data.error.cause ?? null,
                explanation: data.error.explanation ?? null,
                field: data.error.field ?? null,
            },
        } : {}),
    };
}

/**
 * Who is asking for the payment links: { role, agentId, userId, email }.
 *
 * The role is getCaller's, read from `users` on every call. This used to return
 * the role the token was signed with, and an app token lives 30 days: an admin
 * demoted to 'user' (DELETE /api/auth/admins/:id) still read every customer's
 * payment link - name, email, phone, amount, the PNR in travel_details, the
 * link token - and could create links that email customers as Jetsetters.
 * getCaller stopped trusting the token's role for the same reason; this is its
 * answer, not a second copy of the rule.
 *
 * getCaller keeps 'agent' from the token without reading `users`, because an
 * agent-portal token has no `users` row. Here 'agent' also needs the token's
 * own agentId, the one handleAgentLogin signs and a link is filed under. A visa
 * agent's token says 'agent' too, with no agentId: it created links filed under
 * nobody, and went on doing so after the visa agent was disabled.
 */
export async function getCallerInfo(req) {
    try {
        const caller = await getCaller(req);
        if (!caller?.role) return { role: 'unknown', agentId: null };
        let agentId = null;
        if (caller.role === 'agent') {
            agentId = agentIdClaimOf(req);
            if (!agentId) return { role: 'unknown', agentId: null };
        }
        return { role: caller.role, agentId, userId: caller.id, email: caller.email };
    } catch (e) {
        return { role: 'unknown', agentId: null };
    }
}

/** The agentId an agent-portal app token was signed with, or null. */
function agentIdClaimOf(req) {
    // Prefer the httpOnly session cookie (web); fall back to Bearer (mobile).
    const authHeader = req.headers?.authorization;
    const bearer = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    const token = req.cookies?.jt_access || bearer;
    try {
        return jwt.verify(token, JWT_SECRET).agentId || null;
    } catch {
        return null;
    }
}

/**
 * Generate a random alphanumeric token
 */
export function generateLinkToken(length = 16) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let token = '';
    for (let i = 0; i < length; i++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
}
