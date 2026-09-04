import { XMLParser } from 'fast-xml-parser';

/**
 * One configured parser for every Amadeus reply.
 *
 * `parseTagValue: false` is deliberate and load-bearing. Amadeus sends
 * significant leading zeros - flight number 0614, reference numbers, DDMMYY
 * dates like 010926 - and numeric coercion destroys all of them. Amounts are
 * converted explicitly at the point of use instead, where the intent is visible.
 *
 * `removeNSPrefix` lets the mappers address elements by their local name, which
 * is how the XSDs describe them.
 */
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  removeNSPrefix: true,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
});

export const parseSoap = (xml) => parser.parse(xml);

/**
 * fast-xml-parser collapses a repeated element to a bare object when the reply
 * happens to contain exactly one. Every repeated element must therefore be read
 * through this, or a one-result search silently iterates the object's keys.
 */
export const arr = (value) => {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
};

/** Text content of a node, whether it parsed to a string or to `{'#text': …}`. */
export const txt = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return value['#text'] !== undefined ? String(value['#text']) : '';
  return String(value);
};

/** Safe dotted lookup: at(reply, 'a.b.c'). Returns undefined, never throws. */
export const at = (root, path) => path
  .split('.')
  .reduce((node, key) => (node === null || node === undefined ? undefined : node[key]), root);

/** at() as text - the common case when reading a leaf. */
export const atTxt = (root, path) => txt(at(root, path));

/** Amadeus amounts are strings; convert only where a number is meant. */
export const num = (value) => {
  const parsed = Number.parseFloat(txt(value));
  return Number.isFinite(parsed) ? parsed : null;
};

/** Strip the SOAP envelope, returning { header, body } of the parsed document. */
export const unwrapEnvelope = (parsed) => {
  const env = parsed?.Envelope ?? parsed?.envelope ?? {};
  return { header: env.Header ?? {}, body: env.Body ?? {} };
};
