import { OPERATIONS } from '../codes.js';
import { arr, at, atTxt, num, txt } from '../parseXml.js';
import { each, el, wrap } from '../xml.js';

/**
 * The ticketing half of the booking chain: price the PNR, create the TST,
 * attach a form of payment, issue, queue, and void.
 *
 * Fare_PricePNRWithBookingClass is the authoritative price. Everything before
 * it - the search quote, the informative pricing - is an indication against
 * live availability; this one prices what is actually held in the PNR, and is
 * what the amount already captured by ARC Pay has to be reconciled against.
 */

/** Shared by the pricing messages: RP published fares, FCO currency, VC plating carrier. */
const pricingOptions = ({ currency, validatingCarrier }) => [
  wrap('pricingOptionGroup', wrap('pricingOptionKey', el('pricingOptionKey', 'RP'))),
  currency
    ? wrap('pricingOptionGroup', [
      wrap('pricingOptionKey', el('pricingOptionKey', 'FCO')),
      wrap('currency', wrap('firstCurrencyDetails', [
        el('currencyQualifier', 'FCO'),
        el('currencyIsoCode', currency),
      ])),
    ])
    : '',
  validatingCarrier
    ? wrap('pricingOptionGroup', [
      wrap('pricingOptionKey', el('pricingOptionKey', 'VC')),
      wrap('carrierInformation', wrap('companyIdentification', el('otherCompany', validatingCarrier))),
    ])
    : '',
].filter(Boolean).join('');

/**
 * Price the segments held in the PNR, in their booked classes.
 *
 * Root sequence (Fare_PricePNRWithBookingClass_24_3_1A.xsd):
 *   stakeholder[0..9] -> pricingOptionGroup[1..999]
 */
export const buildPricePnrBody = ({ currency = 'USD', validatingCarrier } = {}) => {
  const ns = OPERATIONS.Fare_PricePNRWithBookingClass.namespace;
  return `    <Fare_PricePNRWithBookingClass xmlns="${ns}">${pricingOptions({ currency, validatingCarrier })}</Fare_PricePNRWithBookingClass>`;
};

/**
 * Read the priced fares back.
 *
 * `uniqueReference` here is the PRICING reference, and it is what
 * Ticket_CreateTSTFromPricing consumes - not a TST number, which does not exist
 * until that call succeeds. Amounts are typed by qualifier exactly as in the
 * informative pricing reply: B base, 712 total, E the converted equivalent.
 */
export const readPricePnrReply = (reply) => {
  const fares = arr(reply?.fareList).map((fare) => {
    const amounts = {};
    for (const detail of arr(at(fare, 'fareDataInformation.fareDataSupInformation'))) {
      const qualifier = txt(detail.fareDataQualifier);
      if (qualifier) {
        amounts[qualifier] = { amount: num(detail.fareAmount), currency: txt(detail.fareCurrency) };
      }
    }

    return {
      reference: atTxt(fare, 'fareReference.uniqueReference'),
      paxRefs: arr(at(fare, 'paxSegReference.refDetails'))
        .filter((d) => txt(d.refQualifier) === 'PA')
        .map((d) => txt(d.refNumber)),
      lastTicketingDate: atTxt(fare, 'lastTktDate.dateTime.year')
        ? `${atTxt(fare, 'lastTktDate.dateTime.day')}/${atTxt(fare, 'lastTktDate.dateTime.month')}/${atTxt(fare, 'lastTktDate.dateTime.year')}`
        : '',
      amounts,
    };
  });

  // Only ever combine amounts that share a currency: an office filing fares in
  // one currency and converting to another returns both, and adding them gives
  // a total that is wrong by an exchange rate.
  const currency = fares[0]?.amounts?.['712']?.currency
    ?? fares[0]?.amounts?.B?.currency
    ?? null;
  const total = fares.reduce((sum, fare) => {
    const amount = fare.amounts['712'];
    return amount && amount.currency === currency ? sum + (amount.amount ?? 0) : sum;
  }, 0);

  return { fares, total: fares.length ? total : null, currency };
};

/**
 * Create the TST - the stored ticket record the issuance step reads.
 *
 * Root sequence (Ticket_CreateTSTFromPricing_04_1_1A.xsd):
 *   pnrLocatorData? -> psaList[1..1980]{itemReference, paxReference?}
 */
export const buildCreateTstBody = (pricingReferences) => {
  const refs = (pricingReferences ?? []).filter(Boolean);
  if (refs.length === 0) throw new Error('a pricing reference is required to create a TST');

  const body = each(refs, (reference) => wrap('psaList', wrap('itemReference', [
    el('referenceType', 'TST'),
    el('uniqueReference', String(reference)),
  ])));

  const ns = OPERATIONS.Ticket_CreateTSTFromPricing.namespace;
  return `    <Ticket_CreateTSTFromPricing xmlns="${ns}">${body}</Ticket_CreateTSTFromPricing>`;
};

/** TST references, persisted so a later void or reissue can address them. */
export const readCreateTstReply = (reply) => arr(reply?.tstList)
  .map((tst) => atTxt(tst, 'tstReference.uniqueReference'))
  .filter(Boolean);

/**
 * Attach the form of payment.
 *
 * The card was already captured by ARC Pay's hosted checkout, so nothing
 * card-shaped is sent here - `fopCode` simply records how it was paid. The
 * right code for an ARC-captured card is an operational question for Amadeus,
 * so it stays an env var.
 *
 * Root sequence (FOP_CreateFormOfPayment_19_2_1A.xsd):
 *   transactionContext? -> bestEffort[] -> reservationControlInformation?
 *     -> fopGroup[1..127]{fopReference, ..., mopDescription[]}
 */
export const buildFopBody = ({ fopCode = 'CA' } = {}) => {
  const body = wrap('fopGroup', [
    // fopReference is ElementManagementSegmentType: a single `reference` child
    // holding qualifier + number, not the referenceType/uniqueReference pair
    // used elsewhere in this WSAP. Mandatory - omitting it is "Missing
    // mandatory item", and any other shape is "Unknown item".
    wrap('fopReference', wrap('reference', [
      el('qualifier', 'FP'),
      el('number', '1'),
    ])),
    wrap('mopDescription', [
      wrap('fopSequenceNumber', wrap('sequenceDetails', el('number', '1'))),
      // fopDetails accepts only fopCode, fopMapTable, fopBillingCode and
      // fopStatus - there is no free-text field here, so the ARC transaction id
      // cannot ride along on the FOP. It is persisted as
      // booking_details.transaction_id instead.
      wrap('mopDetails', wrap('fopPNRDetails', wrap('fopDetails', el('fopCode', fopCode)))),
    ]),
  ]);

  const ns = OPERATIONS.FOP_CreateFormOfPayment.namespace;
  return `    <FOP_CreateFormOfPayment xmlns="${ns}">${body}</FOP_CreateFormOfPayment>`;
};

/**
 * Issue the ticket.
 *
 * ET is electronic ticketing. Omitting paxSelection issues for every passenger
 * on the PNR. The reply is a status only - the ticket numbers themselves have
 * to be read back with a PNR_Retrieve afterwards.
 */
export const buildIssueTicketBody = () => {
  const body = wrap('optionGroup', wrap('switches', wrap('statusDetails', el('indicator', 'ET'))));
  const ns = OPERATIONS.DocIssuance_IssueTicket.namespace;
  return `    <DocIssuance_IssueTicket xmlns="${ns}">${body}</DocIssuance_IssueTicket>`;
};

/** Issuance reports success in a processing status rather than an error node. */
export const readIssueTicketReply = (reply) => {
  const status = atTxt(reply, 'processingStatus.statusCode')
    || atTxt(reply, 'processingStatus.action')
    || '';
  return { issued: /^(O|OK|P)$/i.test(status) || status === '', status };
};

/**
 * Put the PNR on a queue for the ticketing desk to review.
 *
 * BLPC places the record on a numbered queue in a named office. This is
 * bookkeeping: a failure here leaves a perfectly good booking, so the chain
 * warns and carries on rather than compensating.
 */
export const buildQueuePlaceBody = ({ recordLocator, queueOffice, queueNumber = '50' }) => {
  if (!recordLocator) throw new Error('a record locator is required to queue a PNR');

  const body = [
    // `option` is AlphaNumericString_Length1To3. BLPC - the four-letter entry a
    // human types - is rejected for length; BLP is the placement code.
    wrap('placementOption', wrap('selectionDetails', el('option', 'BLP'))),
    wrap('targetDetails', [
      wrap('targetOffice', [
        // sourceType is mandatory and comes first: OT marks the target as a
        // named office rather than our own.
        wrap('sourceType', el('sourceQualifier1', 'OT')),
        wrap('originatorDetails', el('inHouseIdentification1', queueOffice)),
      ]),
      wrap('queueNumber', wrap('queueDetails', el('number', String(queueNumber)))),
      wrap('categoryDetails', wrap('subQueueInfoDetails', [
        el('identificationType', 'C'),
        el('itemNumber', '0'),
      ])),
    ]),
    wrap('recordLocator', wrap('reservation', el('controlNumber', recordLocator))),
  ].join('');

  const ns = OPERATIONS.Queue_PlacePNR.namespace;
  return `    <Queue_PlacePNR xmlns="${ns}">${body}</Queue_PlacePNR>`;
};

/**
 * Void an issued ticket.
 *
 * Only valid on the day of issue; after that the ticket has to be refunded
 * through the airline instead. `stockProviderDetails` is mandatory even though
 * it looks incidental - the request is rejected without the plating carrier.
 */
export const buildVoidTicketBody = ({ documentNumbers, validatingCarrier }) => {
  const numbers = (documentNumbers ?? []).filter(Boolean);
  if (numbers.length === 0) throw new Error('a document number is required to void a ticket');
  if (!validatingCarrier) throw new Error('the validating carrier is required to void a ticket');

  const body = [
    each(numbers, (number) => wrap('documentNumberDetails', wrap('documentDetails', el('number', String(number))))),
    wrap('stockProviderDetails', wrap('companyDetails', el('marketingCompany', validatingCarrier))),
  ].join('');

  const ns = OPERATIONS.Ticket_CancelDocument.namespace;
  return `    <Ticket_CancelDocument xmlns="${ns}">${body}</Ticket_CancelDocument>`;
};
