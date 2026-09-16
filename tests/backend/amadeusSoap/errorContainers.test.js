import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { inspectReply } from '../../../backend/services/amadeusSoap/errors.js';
import { parseSoap, unwrapEnvelope } from '../../../backend/services/amadeusSoap/parseXml.js';

/**
 * Error containers Amadeus uses that we were not reading.
 *
 * `collectMessages` matched six container names. Two operations use a seventh
 * and an eighth, and both were found by recording a real booking chain against
 * PDT rather than by reading a schema:
 *
 *   FOP_CreateFormOfPayment  <transmissionError>  2228  CHECK DATA FIELDS
 *   Queue_PlacePNR           <errorReturn>        91D   CHECK FORMAT
 *
 * The FOP one was the serious half. `callStep` throws whenever `inspectReply`
 * reports a problem, and the form-of-payment step is deliberately not wrapped
 * in a try/catch — a booking with no form of payment cannot be ticketed. But
 * because the refusal was invisible, the chain read it as success and went on
 * to commit the PNR. In production, with a customer already charged, that is
 * the charged-but-unticketable case arriving silently.
 *
 * The queue one is milder: that step is deliberately non-fatal, so the effect
 * was `booking_details.gds.queued` recording true for a placement the WSAP had
 * refused.
 *
 * The replies below are the real ones, recorded from the WSAP.
 */

const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), '../../fixtures/amadeus');

const bodyOf = (file) => {
  const xml = fs.readFileSync(path.join(FIXTURES, file), 'utf8');
  return unwrapEnvelope(parseSoap(xml)).body;
};

describe('FOP_CreateFormOfPayment refusal', () => {
  const reply = bodyOf('fop-rejected-2228.xml');

  it('is recognised as a failure rather than read as success', () => {
    const inspected = inspectReply(reply, 'FOP_CreateFormOfPayment');
    expect(inspected.ok).toBe(false);
  });

  it('surfaces the Amadeus code so the cause is diagnosable', () => {
    const { error } = inspectReply(reply, 'FOP_CreateFormOfPayment');
    expect(error.amadeusCode).toBe('2228');
    expect(error.technicalError).toContain('CHECK DATA FIELDS');
  });

  it('is not treated as an empty result', () => {
    // `empty` is the "no fare found" disposition, which callers turn into a
    // successful search with no rows. A refused payment is not that.
    const inspected = inspectReply(reply, 'FOP_CreateFormOfPayment');
    expect(inspected.empty).toBeFalsy();
  });
});

describe('Queue_PlacePNR refusal', () => {
  const reply = bodyOf('queue-rejected-91d.xml');

  it('is recognised as a failure', () => {
    const inspected = inspectReply(reply, 'Queue_PlacePNR');
    expect(inspected.ok).toBe(false);
  });

  it('reads the code out of the nested errorDefinition', () => {
    // Queue nests it one level deeper than the other schemas:
    // errorReturn > errorDefinition > errorDetails > errorCode.
    const { error } = inspectReply(reply, 'Queue_PlacePNR');
    expect(error.amadeusCode).toBe('91D');
    expect(error.technicalError).toContain('CHECK FORMAT');
  });
});

describe('containers that already worked', () => {
  it('still reads applicationError', () => {
    const xml = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>
      <Fare_MasterPricerCalendarReply><errorMessage><applicationError><applicationErrorDetail>
      <error>1006</error></applicationErrorDetail></applicationError>
      <errorMessageText><description>OPTION NOT PERMITTED</description></errorMessageText>
      </errorMessage></Fare_MasterPricerCalendarReply></soap:Body></soap:Envelope>`;
    const { ok, error } = inspectReply(unwrapEnvelope(parseSoap(xml)).body, 'Fare_MasterPricerCalendar');

    expect(ok).toBe(false);
    expect(error.amadeusCode).toBe('1006');
  });

  it('reports a clean reply as ok', () => {
    const xml = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>
      <FOP_CreateFormOfPaymentReply><fopDescription><fopReference><reference>
      <qualifier>FP</qualifier><number>1</number></reference></fopReference></fopDescription>
      </FOP_CreateFormOfPaymentReply></soap:Body></soap:Envelope>`;

    expect(inspectReply(unwrapEnvelope(parseSoap(xml)).body, 'FOP_CreateFormOfPayment').ok).toBe(true);
  });
});

/**
 * An error code nested deeper than the named paths.
 *
 * Air_SellFromRecommendation refuses a segment with
 * `errorAtMessageLevel > errorSegment > errorDetails > errorCode`, one level
 * below every path `describe` knew, and carries NO free text at all. So the
 * code was not found, the text was empty, and a real rejection reached the
 * customer as "Amadeus returned an unspecified error" with nothing logged to
 * chase — the same silent loss that once hid a failing form of payment.
 *
 * Seen against 1ASIWJETJEC PDT selling a DEL-BLR fare plated on HR: code 288
 * with `actionDetails/statusCode UNS`.
 */
describe('an error code nested below the named paths', () => {
  const reply = {
    errorAtMessageLevel: { errorSegment: { errorDetails: { errorCode: '288', errorCategory: 'EC' } } },
    itineraryDetails: { segmentInformation: { actionDetails: { statusCode: 'UNS' } } },
  };

  it('reports the code instead of discarding it', () => {
    const result = inspectReply(reply, 'Air_SellFromRecommendation');

    expect(result.ok).toBe(false);
    expect(result.error.technicalError).toContain('288');
    expect(result.error.technicalError).not.toMatch(/unspecified/i);
  });

  it('still finds a code sitting at one of the named paths', () => {
    // The named paths are tried first and must keep working unchanged.
    // A code with no catalogue rule, so it falls through to the default and
    // the raw code is what reaches technicalError.
    const named = inspectReply({ errorMessage: { errorDetails: { errorCode: '4321' } } }, 'X');

    expect(named.error.technicalError).toContain('4321');
  });

  it('does not invent a code where there is none', () => {
    const bare = inspectReply({ errorMessage: { somethingElse: { note: 'hello' } } }, 'X');

    expect(bare.ok).toBe(false);
    expect(bare.error.technicalError).not.toMatch(/\b288\b/);
  });

  it('leaves a clean reply alone', () => {
    expect(inspectReply({ itineraryDetails: { segmentInformation: {} } }, 'X').ok).toBe(true);
  });
});

/**
 * Four containers read off the WSAP schemas in the PDT bundle, not guessed.
 *
 * The list carried `errorAtItineraryLevel`, which appears in NO schema — a
 * mis-transcription of `errorItinerarylevel`. Three more real ones were absent
 * entirely. With none of them matched, `collectMessages` found nothing and
 * `inspectReply` answered `{ ok: true }` for a reply that carried a refusal.
 */
describe('containers verified against the WSAP schemas', () => {
  /**
   * Air_SellFromRecommendationReply. A round trip whose second itinerary comes
   * back with this and no segmentInformation left `readAirSellReply` with the
   * first leg's statuses only — `sold: true` — so the customer paid a
   * round-trip fare for a one-way PNR, and the pre-payment seat check passed
   * too, because it reads the same reply.
   */
  it('sees a refusal at itinerary level', () => {
    const reply = { errorItinerarylevel: { errorDetails: { errorCode: '288', errorCategory: 'EC' } } };

    expect(inspectReply(reply, 'Air_SellFromRecommendation').ok).not.toBe(true);
  });

  it('sees a refusal at segment level', () => {
    const reply = { errorAtSegmentLevel: { errorDetails: { errorCode: '288' } } };

    expect(inspectReply(reply, 'Air_SellFromRecommendation').ok).not.toBe(true);
  });

  /**
   * PNR_Reply. A rejected FM, SSR DOCS, FOID or CTCE passed addElements and the
   * chain ran on to FOP, pricing, the TST and the commit — surfacing after the
   * card was charged as 374 NEED COMMISSION or 27791 SSR DOCS MISSING.
   */
  it('sees a rejected PNR element', () => {
    const reply = { elementErrorInformation: { errorOrWarningCodeDetails: { errorDetails: { errorCode: '374' } } } };

    expect(inspectReply(reply, 'PNR_AddMultiElements').ok).not.toBe(true);
  });

  it('sees a rejected name element', () => {
    const reply = { nameError: { errorOrWarningCodeDetails: { errorDetails: { errorCode: '1170' } } } };

    expect(inspectReply(reply, 'PNR_AddMultiElements').ok).not.toBe(true);
  });

  // The entry that was there instead, and which no schema declares.
  it('no longer carries an element name that does not exist', () => {
    const source = fs.readFileSync(new URL('../../../backend/services/amadeusSoap/errors.js', import.meta.url), 'utf8');

    expect(source).not.toMatch(/errorAtItineraryLevel\|/);
  });

  // And a clean reply is still clean.
  it('still reads a good sell reply as fine', () => {
    const reply = { itineraryDetails: [{ segmentInformation: [{ actionDetails: { statusCode: 'OK' } }] }] };

    expect(inspectReply(reply, 'Air_SellFromRecommendation').ok).toBe(true);
  });
});
