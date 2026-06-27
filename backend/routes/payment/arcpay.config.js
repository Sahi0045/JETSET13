import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

// ---- Resolve config strictly from the environment (no hardcoded keys/ids/urls/secrets) ----
const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const MERCHANT_ID = process.env.ARC_PAY_MERCHANT_ID;
const API_PASSWORD = process.env.ARC_PAY_API_PASSWORD;
const BASE_URL = process.env.ARC_PAY_BASE_URL;

// Fail fast on misconfiguration instead of silently falling back to baked-in test
// credentials (e.g. a shared JWT secret or a test merchant id), which is a security risk.
const REQUIRED_ENV = {
    'SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)': SUPABASE_URL,
    'SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_ANON_KEY)': SUPABASE_KEY,
    ARC_PAY_MERCHANT_ID: MERCHANT_ID,
    ARC_PAY_API_PASSWORD: API_PASSWORD,
    ARC_PAY_BASE_URL: BASE_URL,
};
const missingEnv = Object.entries(REQUIRED_ENV)
    .filter(([, value]) => !value || !String(value).trim())
    .map(([name]) => name);
if (missingEnv.length) {
    throw new Error(
        `[arcpay.config] Missing required environment variable(s): ${missingEnv.join(', ')}. ` +
        `Set them in your deployment environment or .env file.`
    );
}

// Initialize Supabase client
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
});

// ARC Pay configuration — all values come from the environment.
// API_URL and CHECK_GATEWAY_URL are derived from BASE_URL/MERCHANT_ID so there are no
// hardcoded hosts or merchant ids; an explicit env override still takes precedence.
export const ARC_PAY_CONFIG = {
    MERCHANT_ID,
    API_USERNAME: process.env.ARC_PAY_API_USERNAME || MERCHANT_ID,
    API_PASSWORD,
    BASE_URL,
    API_URL: process.env.ARC_PAY_API_URL || `${BASE_URL}/merchant/${MERCHANT_ID}`,
    CHECK_GATEWAY_URL: process.env.ARC_PAY_CHECK_GATEWAY_URL || `${BASE_URL}/information`,
    PORTAL_URL: process.env.ARC_PAY_PORTAL_URL,
    REAL_TIME_MODE: process.env.ARC_PAY_REAL_TIME === 'true',
    PRODUCTION_READY_MODE: process.env.ARC_PAY_PRODUCTION_READY_MODE === 'true',
    INTEGRATION_PASSWORD_1: process.env.ARC_PAY_INTEGRATION_PASSWORD_1,
    INTEGRATION_PASSWORD_2: process.env.ARC_PAY_INTEGRATION_PASSWORD_2,
    REPORTING_PASSWORD_1: process.env.ARC_PAY_REPORTING_PASSWORD_1,
    REPORTING_PASSWORD_2: process.env.ARC_PAY_REPORTING_PASSWORD_2
};

// Helper function to get auth config for ARC Pay API
// ARC Pay uses merchant.MERCHANT_ID:password format for Basic Auth
export const getArcPayAuthConfig = () => {
    const authString = `merchant.${ARC_PAY_CONFIG.MERCHANT_ID}:${ARC_PAY_CONFIG.API_PASSWORD}`;
    const authHeader = 'Basic ' + Buffer.from(authString).toString('base64');

    return {
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': authHeader
        },
        timeout: 30000
    };
};

// Agent JWT secret/expiry live in the centralized backend/config/jwt.js (single source
// of truth, with a secure random fallback). Consumers import them from there directly.
