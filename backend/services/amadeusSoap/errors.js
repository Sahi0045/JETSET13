import { DEFAULT_ERROR, ERROR_CATALOGUE } from './codes.js';
import { arr, at, txt } from './parseXml.js';

/**
 * A failure from Amadeus, carrying enough detail to log without leaking it.
 *
 * `error` is customer-facing. `technicalError` holds the raw Amadeus text and
 * is only ever logged or passed to the existing refund path, which already
 * records it (flight.routes.js:88).
 */
export class AmadeusSoapError extends Error {
  constructor({ error, code, technicalError, operation, amadeusCode, httpStatus, retryable = false, retryAfter, alert = false }) {
    super(error);
    this.name = 'AmadeusSoapError';
    this.error = error;
    this.code = code;
    this.technicalError = technicalError;
    this.operation = operation;
    this.amadeusCode = amadeusCode;
    this.httpStatus = httpStatus;
    this.retryable = retryable;
    this.retryAfter = retryAfter;
    this.alert = alert;
  }

  /** The `{success:false, error, code}` shape the routes already return. */
  toRouteError() {
    return { success: false, error: this.error, code: this.code };
  }
}

/** Collect every error-ish message Amadeus puts in a reply, across schemas. */
const collectMessages = (body) => {
  const found = [];
  const visit = (node, depth = 0) => {
    if (!node || typeof node !== 'object' || depth > 8) return;
    for (const [key, value] of Object.entries(node)) {
      // Amadeus names the error container differently per schema, and two of
      // them were missing here. FOP_CreateFormOfPayment reports a refusal in
      // `transmissionError` and Queue_PlacePNR in `errorReturn`, so both were
      // invisible: a rejected form of payment (2228 CHECK DATA FIELDS) was
      // read as success and the chain committed a PNR that had none, and a
      // rejected queue placement (91D) was recorded as queued. Found by
      // recording a real booking chain against PDT.
      if (/^(errorMessage|errorGroup|generalErrorInfo|errorAtMessageLevel|errorAtItineraryLevel|applicationError|transmissionError|errorReturn)$/i.test(key)) {
        for (const entry of arr(value)) {
          const text = JSON.stringify(entry);
          if (text && text !== '{}' && text !== '""') found.push(entry);
        }
      } else if (typeof value === 'object') {
        visit(value, depth + 1);
      }
    }
  };
  visit(body);
  return found;
};

/** Pull the numeric/alpha Amadeus code and its free text out of an error node. */
const describe = (node) => {
  const code = txt(at(node, 'errorOrWarningCodeDetails.errorDetails.errorCode'))
    || txt(at(node, 'applicationError.applicationErrorDetail.error'))
    || txt(at(node, 'errorDefinition.errorDetails.errorCode'))
    || txt(at(node, 'errorDetails.errorCode'))
    || txt(at(node, 'errorCode'))
    || '';

  const collectText = (n, depth = 0) => {
    if (!n || typeof n !== 'object' || depth > 6) return [];
    const out = [];
    for (const [key, value] of Object.entries(n)) {
      // Amadeus spells the human-readable part differently per schema:
      // errorMessageText/description here, freeText elsewhere.
      if (/freeText|errorFreeText|interactiveFreeText|description|errorText/i.test(key)) {
        // A matching key does not always hold the text itself. Queue_PlacePNR
        // nests it as `errorText > freeText`, and FOP wraps qualifiers in
        // `freeTextDetails`. Taking the branch and stopping pushed an empty
        // string and dropped the message, which is why a refused form of
        // payment reported its code with no reason attached.
        const values = arr(value);
        const strings = values.map(txt).filter(Boolean);
        if (strings.length) out.push(...strings);
        else for (const nested of values) out.push(...collectText(nested, depth + 1));
      } else if (typeof value === 'object') {
        out.push(...collectText(value, depth + 1));
      }
    }
    return out;
  };

  return { code, text: collectText(node).filter(Boolean).join('; ') };
};

/**
 * Inspect a parsed reply body.
 * @returns {{ ok: true } | { ok: false, empty: true } | { ok: false, error: AmadeusSoapError }}
 */
export const inspectReply = (body, operation) => {
  const nodes = collectMessages(body);
  if (nodes.length === 0) return { ok: true };

  const described = nodes.map(describe);
  const blob = described.map((d) => `${d.code} ${d.text}`).join(' | ').trim();
  const rule = ERROR_CATALOGUE.find((r) => r.match.test(blob));

  // "No fare found" is a successful search with no results, not a failure -
  // both clients depend on that staying a 200 with success:true.
  if (rule?.empty) return { ok: false, empty: true };

  const mapped = rule ?? DEFAULT_ERROR;
  return {
    ok: false,
    error: new AmadeusSoapError({
      error: mapped.error,
      code: mapped.code,
      technicalError: blob || 'Amadeus returned an unspecified error',
      operation,
      amadeusCode: described[0]?.code || null,
      retryAfter: rule?.retryAfter,
      alert: Boolean(rule?.alert),
      retryable: mapped.code === 503,
    }),
  };
};

/** A `<soap:Fault>` - transport or security level, never business logic. */
export const faultToError = (faultstring, operation, httpStatus) => {
  const rule = ERROR_CATALOGUE.find((r) => r.match.test(faultstring || '')) ?? DEFAULT_ERROR;
  return new AmadeusSoapError({
    error: rule.error ?? DEFAULT_ERROR.error,
    code: rule.code ?? DEFAULT_ERROR.code,
    technicalError: faultstring,
    operation,
    httpStatus,
    retryAfter: rule.retryAfter,
    alert: Boolean(rule.alert),
    retryable: (rule.code ?? 502) === 503,
  });
};

export const transportError = (cause, operation) => new AmadeusSoapError({
  error: 'Flight service is not responding',
  code: 504,
  technicalError: cause?.message || String(cause),
  operation,
  retryable: true,
});
