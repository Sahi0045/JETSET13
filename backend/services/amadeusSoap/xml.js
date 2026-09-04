/**
 * Minimal XML building helpers.
 *
 * The request bodies are built as strings rather than through a DOM because
 * Amadeus schemas are ordered sequences: the element order in the source is the
 * contract, and a template makes that order visible. Escaping is the one thing
 * that cannot be left to the caller - a surname containing & or ' silently
 * corrupts the envelope, and the resulting fault does not name the element.
 */

const ESCAPES = Object.freeze({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
});

export const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

/** `<name>value</name>`, or '' when the value is null/undefined/empty. */
export const el = (name, value) => (
  value === null || value === undefined || value === '' ? '' : `<${name}>${esc(value)}</${name}>`
);

/** `<name>…children…</name>`, or '' when every child rendered empty. */
export const wrap = (name, children) => {
  const inner = (Array.isArray(children) ? children : [children]).filter(Boolean).join('');
  return inner === '' ? '' : `<${name}>${inner}</${name}>`;
};

/** Repeat a builder over a list, dropping empties. */
export const each = (items, build) => (items || []).map(build).filter(Boolean).join('');

/**
 * Blank credentials and traveller data out of an envelope before it is logged.
 * Applied unconditionally wherever an envelope could reach a log sink, so no
 * future caller can leak a password or a passport by forgetting to redact.
 */
export const redactEnvelope = (xml) => String(xml ?? '')
  .replace(/(<(?:\w+:)?Password[^>]*>)[\s\S]*?(<\/(?:\w+:)?Password>)/gi, '$1[REDACTED]$2')
  .replace(/(<(?:\w+:)?Nonce[^>]*>)[\s\S]*?(<\/(?:\w+:)?Nonce>)/gi, '$1[REDACTED]$2')
  .replace(/(<(?:\w+:)?SecurityToken>)[\s\S]*?(<\/(?:\w+:)?SecurityToken>)/gi, '$1[REDACTED]$2')
  .replace(/<travellerInfo>[\s\S]*?<\/travellerInfo>/gi, '<travellerInfo>[REDACTED]</travellerInfo>')
  .replace(/<passengerData>[\s\S]*?<\/passengerData>/gi, '<passengerData>[REDACTED]</passengerData>')
  .replace(/<freetextData>[\s\S]*?<\/freetextData>/gi, '<freetextData>[REDACTED]</freetextData>');
