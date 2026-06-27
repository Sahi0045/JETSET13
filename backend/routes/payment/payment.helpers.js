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
export function getCallerInfo(req) {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) return { role: 'unknown', agentId: null };
        const token = authHeader.split(' ')[1];
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
