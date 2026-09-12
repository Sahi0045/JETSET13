import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../../config/jwt.js';


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

export function getCallerInfo(req) {
    try {
        // Prefer the httpOnly session cookie (web); fall back to Bearer (mobile).
        const authHeader = req.headers.authorization;
        const bearer = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
        const token = req.cookies?.jt_access || bearer;
        if (!token) return { role: 'unknown', agentId: null };
        const decoded = jwt.verify(token, JWT_SECRET);
        return {
            role: decoded.role || 'user',
            agentId: decoded.agentId || null,
            userId: decoded.id || decoded.sub,
            email: decoded.email
        };
    } catch (e) {
        return { role: 'unknown', agentId: null };
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
