import { describe, expect, it } from 'vitest';
import { inspectReply } from '../../../backend/services/amadeusSoap/errors.js';

/**
 * One element the airline refuses must not throw away a paid booking.
 *
 * PR #162 added `elementErrorInformation` to the containers collectMessages
 * reads, for a good reason: a rejected element used to be invisible here and
 * surfaced after the commit and the charge, as 374 NEED COMMISSION or
 * 27791 SSR DOCS MISSING, with nothing in the log naming the cause.
 *
 * But it made EVERY element-level rejection a message-level failure, and they
 * are not the same thing. Our own capture from 15 Sep 2026 (flow log 03,
 * Gulf Air GF7 BAH-LHR) is the proof: PNR_AddMultiElements came back with DOCS,
 * CTCE and CTCM all accepted (status HK) and only the FOID element marked
 * `status ERR` with elementErrorInformation 1919 INVALID REQUEST FOR ELEMENT.
 * On that day the chain carried on, committed, and got record locator BAW8IY.
 *
 * With #162's code that same reply fails at addElements with committed:false,
 * and flight.routes.js reverses the customer's card - refunding them a flight
 * the GDS would have sold. The customer sees "Flight service temporarily
 * unavailable" and no log says which element was refused. Certification did
 * not catch it because Lufthansa and TAP accept our FOID; Gulf Air does not.
 *
 * So: an element we can name AND know the booking survives without becomes a
 * warning that is carried and logged. Everything else stays fatal, because
 * catching a real refusal early is still better than after the charge.
 */

/** The shape of our 15 Sep Gulf Air reply, trimmed to what inspectReply reads. */
const replyWithRejectedElement = ({ segmentName = 'SSR', ssrType = 'FOID', errorCode = '1919' } = {}) => ({
  PNR_Reply: {
    dataElementsMaster: {
      dataElementsIndiv: [
        {
          elementManagementData: { reference: { qualifier: 'OT', number: '6' }, segmentName: 'SSR', lineNumber: '6' },
          serviceRequest: { ssr: { type: 'DOCS', status: 'HK', companyId: 'GF' } },
        },
        {
          elementManagementData: { status: 'ERR', reference: { qualifier: 'OT', number: '10' }, segmentName, lineNumber: '3' },
          serviceRequest: { ssr: { type: ssrType, status: 'HK', companyId: 'YY', freeText: 'PPX5599030' } },
          elementErrorInformation: {
            errorOrWarningCodeDetails: { errorDetails: { errorCode, errorCategory: 'EC', errorCodeOwner: '1A' } },
            errorWarningDescription: { freeTextDetails: { textSubjectQualifier: '3' }, freeText: 'INVALID REQUEST FOR ELEMENT' },
          },
        },
      ],
    },
  },
});

describe('an element the airline rejected', () => {
  // The exact reply that is being refunded today.
  it('lets the booking go on when only the FOID was refused', () => {
    const result = inspectReply(replyWithRejectedElement(), 'PNR_AddMultiElements');

    expect(result.ok).toBe(true);
  });

  // Carried, not swallowed: #162's whole point was that nothing named the cause.
  it('says which element was refused and why', () => {
    const result = inspectReply(replyWithRejectedElement(), 'PNR_AddMultiElements');

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].element).toBe('SSR FOID');
    expect(result.warnings[0].code).toBe('1919');
    expect(result.warnings[0].text).toMatch(/INVALID REQUEST FOR ELEMENT/);
  });

  // Our own remark is ours; the airline refusing it cannot stop a ticket.
  it('lets the booking go on when a remark was refused', () => {
    const result = inspectReply(replyWithRejectedElement({ segmentName: 'RM', ssrType: '' }), 'PNR_AddMultiElements');

    expect(result.ok).toBe(true);
  });

  // DOCS is Secure Flight / APIS. Without it the ticket will not issue, so
  // finding out here - before the charge is committed to - is the better place.
  it('still fails the booking when the DOCS element was refused', () => {
    const result = inspectReply(replyWithRejectedElement({ ssrType: 'DOCS', errorCode: '27791' }), 'PNR_AddMultiElements');

    expect(result.ok).not.toBe(true);
  });

  // An element we cannot identify is treated as one we cannot do without.
  it('still fails on an element error with no element to name', () => {
    const reply = { elementErrorInformation: { errorOrWarningCodeDetails: { errorDetails: { errorCode: '374' } } } };

    expect(inspectReply(reply, 'PNR_AddMultiElements').ok).not.toBe(true);
  });

  // A name is not an optional extra, and it is reported in its own container.
  it('still fails on a rejected name', () => {
    const reply = { nameError: { errorOrWarningCodeDetails: { errorDetails: { errorCode: '1170' } } } };

    expect(inspectReply(reply, 'PNR_AddMultiElements').ok).not.toBe(true);
  });

  // A survivable element does not excuse a refusal reported for the whole message.
  it('still fails when the message itself was refused as well', () => {
    const reply = replyWithRejectedElement();
    reply.PNR_Reply.errorAtMessageLevel = {
      errorOrWarningCodeDetails: { errorDetails: { errorCode: '1931' } },
      errorWarningDescription: { freeText: 'PNR NOT COMMITTED' },
    };

    expect(inspectReply(reply, 'PNR_AddMultiElements').ok).not.toBe(true);
  });

  // A reply with nothing wrong in it must not grow a warnings array.
  it('leaves a clean reply clean', () => {
    const reply = { itineraryDetails: [{ segmentInformation: [{ actionDetails: { statusCode: 'OK' } }] }] };

    expect(inspectReply(reply, 'Air_SellFromRecommendation').ok).toBe(true);
  });
});
