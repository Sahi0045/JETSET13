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

/**
 * Which PNR element an error belongs to: "SSR FOID", "SSR DOCS", "RM", "NM".
 *
 * PNR_Reply reports a per-element refusal inside the `dataElementsIndiv` for
 * that element, so the element's own identity is one level up from the error.
 * Without it every rejection looks the same, and a refused optional SSR cannot
 * be told apart from a refused name.
 */
const elementLabelOf = (node) => {
  const segment = txt(at(node, 'elementManagementData.segmentName'));
  if (!segment) return null;
  const ssrType = txt(at(node, 'serviceRequest.ssr.type'));
  return ssrType ? `${segment} ${ssrType}` : segment;
};

/**
 * Elements a booking demonstrably survives without.
 *
 * Deliberately short, and every entry earned its place from a real reply:
 * Gulf Air refused our FOID with 1919 on 15 Sep 2026 and the PNR still
 * committed (BAW8IY) and reached issuance. RM and OS are our own remarks -
 * the airline refusing one cannot stop a ticket.
 *
 * Anything not named here is treated as an element the booking needs, so an
 * unrecognised refusal still fails early rather than after the charge.
 */
const SURVIVABLE_ELEMENT = /^(SSR FOID|RM|OS)$/i;

/** Collect every error-ish message Amadeus puts in a reply, across schemas. */
const collectMessages = (body) => {
  const found = [];
  const visit = (node, depth = 0, element = null) => {
    if (!node || typeof node !== 'object' || depth > 8) return;
    // An element's identity applies to the error nested inside it.
    const here = elementLabelOf(node) ?? element;
    for (const [key, value] of Object.entries(node)) {
      // Amadeus names the error container differently per schema, and two of
      // them were missing here. FOP_CreateFormOfPayment reports a refusal in
      // `transmissionError` and Queue_PlacePNR in `errorReturn`, so both were
      // invisible: a rejected form of payment (2228 CHECK DATA FIELDS) was
      // read as success and the chain committed a PNR that had none, and a
      // rejected queue placement (91D) was recorded as queued. Found by
      // recording a real booking chain against PDT.
      // `errorInfo` is where Fare_CheckRules reports a refusal, and it was
      // missing here: a rejected rules request read as `ok`, so the caller
      // logged nothing and simply found zero sections. The fare-rules panel
      // then looked identical whether the airline had filed no penalties or
      // Amadeus had refused the question - with no log, and no alert.
      // Four more, read off the WSAP schemas in the PDT bundle rather than
      // guessed - and one of the old entries was a guess:
      //
      //   errorAtItineraryLevel   appears in NO schema. A mis-transcription.
      //   errorItinerarylevel     the real one (Air_SellFromRecommendationReply)
      //   errorAtSegmentLevel     the real one, same reply, also missing
      //   elementErrorInformation PNR_Reply: a rejected FM / SSR DOCS / FOID / CTCE
      //   nameError               PNR_Reply: a rejected NM element
      //
      // With those unmatched, `collectMessages` found nothing and inspectReply
      // answered `{ok: true}`. Two consequences: a round trip whose second
      // itinerary comes back with errorItinerarylevel read as fully sold - the
      // customer pays a round-trip fare for a one-way PNR - and a rejected name
      // or SSR passed addElements and surfaced after the commit and the charge,
      // as 374 NEED COMMISSION or 27791 SSR DOCS MISSING, with nothing in the
      // log naming the cause.
      if (/^(errorMessage|errorGroup|generalErrorInfo|errorAtMessageLevel|errorItinerarylevel|errorAtSegmentLevel|elementErrorInformation|nameError|applicationError|transmissionError|errorReturn|errorInfo)$/i.test(key)) {
        for (const entry of arr(value)) {
          const text = JSON.stringify(entry);
          // Only an element-level container inherits the element's name. A
          // message-level refusal is about the whole request, whatever
          // element happens to enclose it in the tree.
          if (text && text !== '{}' && text !== '""') {
            found.push({ node: entry, element: /^elementErrorInformation$/i.test(key) ? here : null });
          }
        }
      } else if (typeof value === 'object') {
        visit(value, depth + 1, here);
      }
    }
  };
  visit(body);
  return found;
};

/** Pull the numeric/alpha Amadeus code and its free text out of an error node. */
const describe = (node) => {
  /**
   * Find the code wherever this schema happens to nest it.
   *
   * The named paths below cover the common shapes and are tried first because
   * they are unambiguous. They are not exhaustive: Air_SellFromRecommendation
   * reports a refusal as `errorAtMessageLevel > errorSegment > errorDetails >
   * errorCode`, one level deeper than any of them, and with no free text at
   * all. So the code was not found, the text was empty, and a real rejection
   * reached the customer as "Amadeus returned an unspecified error" with
   * nothing logged - the same silent-loss shape that once hid a failing form
   * of payment. Recursing means a code cannot be lost to nesting again.
   */
  const findCode = (n, depth = 0) => {
    if (!n || typeof n !== 'object' || depth > 6) return '';
    for (const [key, value] of Object.entries(n)) {
      if (/^(errorCode|error)$/i.test(key)) {
        const found = arr(value).map(txt).find(Boolean);
        if (found) return found;
      }
    }
    for (const value of Object.values(n)) {
      if (value && typeof value === 'object') {
        const found = findCode(value, depth + 1);
        if (found) return found;
      }
    }
    return '';
  };

  const code = txt(at(node, 'errorOrWarningCodeDetails.errorDetails.errorCode'))
    || txt(at(node, 'applicationError.applicationErrorDetail.error'))
    || txt(at(node, 'errorDefinition.errorDetails.errorCode'))
    || txt(at(node, 'errorDetails.errorCode'))
    || txt(at(node, 'errorCode'))
    || findCode(node)
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
 * @returns {{ ok: true, warnings?: Array<{element: string, code: string, text: string}> }
 *   | { ok: false, empty: true } | { ok: false, error: AmadeusSoapError }}
 */
export const inspectReply = (body, operation) => {
  const nodes = collectMessages(body);
  if (nodes.length === 0) return { ok: true };

  const described = nodes.map((n) => ({ ...describe(n.node), element: n.element }));

  // DocIssuance_IssueTicket reports SUCCESS inside an errorGroup whose
  // errorCode is the literal string "OK" — Amadeus's own "electronic ticketing
  // issuance" example shows `processingStatus O` alongside
  // `errorGroup/errorDetails/errorCode OK`. Since errorGroup is one of the
  // containers collected above, a successful issuance would otherwise be read
  // as a failure and thrown by callStep: with AMADEUS_WS_AUTO_TICKET on, every
  // ticket that issued correctly would have failed the booking, and the
  // compensation path would have been entered for a customer holding a valid
  // ticket. An error code of "OK" is not an error under any reading.
  if (described.length > 0 && described.every((d) => /^OK$/i.test(String(d.code || '').trim()))) {
    return { ok: true };
  }

  // One element the airline refused is not the same as the request being
  // refused. Treating them alike made a rejected FOID throw away a booking the
  // customer had already paid for, and that the GDS would have sold: our own
  // capture of 15 Sep 2026 has Gulf Air refusing the FOID with 1919 while DOCS,
  // CTCE and CTCM were accepted, and that PNR committed as BAW8IY. The refusal
  // still has to be visible - it being invisible is what #162 fixed - so it
  // comes back as a warning for the caller to log against the booking.
  const survivable = described.filter((d) => d.element && SURVIVABLE_ELEMENT.test(d.element));
  const fatal = described.filter((d) => !(d.element && SURVIVABLE_ELEMENT.test(d.element)));
  if (fatal.length === 0) {
    return {
      ok: true,
      warnings: survivable.map((d) => ({ element: d.element, code: d.code, text: d.text })),
    };
  }

  const blob = fatal.map((d) => `${d.code} ${d.text}`).join(' | ').trim();
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
