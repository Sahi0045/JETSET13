/**
 * An opaque booking/order reference.
 *
 * These were `${PREFIX}${Date.now().toString(36)}` — a plain timestamp, so a
 * reference decoded straight back to the millisecond it was created, and
 * neighbouring bookings enumerated by walking the counter. That predictability
 * fed an unauthenticated booking-lookup leak (since fixed with ownership +
 * payment-secret checks); this removes the weakness at the source.
 *
 * Nothing parses the reference — it is used only as an id — so it is now
 * random: prefix + 56 bits of crypto randomness, hex, uppercased. Stays within
 * [A-Z0-9] so it passes the backend's safeRef() validation.
 *
 * @param {string} prefix e.g. 'FLT', 'CRZ', 'HTL', 'PKG'
 */
export function makeOrderRef(prefix = 'BOK') {
  const c = (typeof globalThis !== 'undefined' && globalThis.crypto) || window.crypto;
  const raw = c?.randomUUID
    ? c.randomUUID().replace(/-/g, '')
    : Array.from(c.getRandomValues(new Uint8Array(16)))
        .map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${prefix}${raw.slice(0, 14).toUpperCase()}`;
}
