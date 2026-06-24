/**
 * validateEnv.js — fail-fast startup environment validation.
 * ─────────────────────────────────────────────────────────────
 * CLAUDE.md notes that most services "fail silently if misconfigured". This
 * surfaces that at boot instead: REQUIRED vars missing → clear error + exit;
 * OPTIONAL vars missing → a warning, app still boots with that feature
 * degraded. Prints a one-screen ✓/· summary so misconfig is obvious.
 *
 * Call once, right after dotenv.config(), in every entry point.
 */

// The app genuinely cannot function without these.
const REQUIRED = [
  { keys: ['SUPABASE_URL', 'VITE_SUPABASE_URL'], label: 'Supabase URL' },
  {
    keys: ['SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY'],
    label: 'Supabase key',
  },
];

// Missing these only disables a feature — warn, don't crash.
const OPTIONAL = [
  { keys: ['AMADEUS_API_KEY', 'REACT_APP_AMADEUS_API_KEY'], label: 'Amadeus (flights/hotels)' },
  { keys: ['ARC_PAY_MERCHANT_ID'], label: 'ARC Pay (payments)' },
  { keys: ['RESEND_API_KEY'], label: 'Resend (email)' },
  { keys: ['REDIS_URL'], label: 'Redis (caching)' },
  { keys: ['TWILIO_ACCOUNT_SID'], label: 'Twilio (SMS)' },
  { keys: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'], label: 'Gemini (chatbot)' },
  { keys: ['SENTRY_DSN'], label: 'Sentry (monitoring)' },
];

const isSet = (keys) =>
  keys.some((k) => typeof process.env[k] === 'string' && process.env[k].trim() !== '');

/**
 * @param {{ exitOnError?: boolean }} [opts]
 * @returns {{ ok: boolean, missingRequired: string[] }}
 */
export function validateEnv({ exitOnError = process.env.NODE_ENV !== 'test' } = {}) {
  const missingRequired = REQUIRED.filter((g) => !isSet(g.keys));

  const lines = ['──────── Environment check ────────'];
  for (const g of REQUIRED) lines.push(`  ${isSet(g.keys) ? '✓' : '✗'} ${g.label} (required)`);
  for (const g of OPTIONAL) lines.push(`  ${isSet(g.keys) ? '✓' : '·'} ${g.label}`);
  lines.push('───────────────────────────────────');
  console.log(lines.join('\n'));

  if (missingRequired.length > 0) {
    const names = missingRequired.map((g) => `${g.label} (${g.keys.join(' or ')})`).join(', ');
    const msg = `Missing required environment configuration: ${names}`;
    console.error(`❌ ${msg}`);
    if (exitOnError) process.exit(1);
    return { ok: false, missingRequired: missingRequired.map((g) => g.label) };
  }

  return { ok: true, missingRequired: [] };
}

export default validateEnv;
