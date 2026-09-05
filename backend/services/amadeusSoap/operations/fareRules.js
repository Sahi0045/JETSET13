import { OPERATIONS } from '../codes.js';
import { arr, at, atTxt, txt } from '../parseXml.js';
import { el, wrap } from '../xml.js';

/**
 * Fare_CheckRules — the airline's actual fare conditions.
 *
 * Informative pricing already returns some rule text, and that is what
 * `/fare-rules` shipped with. It is thin: a few lines, often without the
 * penalty amounts. CheckRules returns the filed rule sections, which is where
 * the cancellation and change fees actually live.
 *
 * It requires a TST inside an active PNR session. The schema suggests
 * otherwise - every field except `msgType` is optional, and there is an
 * apparent standalone path describing the fare with `transportInformation`,
 * `tripDescription` and rule sections instead of an `itemNumber` - but the
 * WSAP refuses it. Probed against 1ASIWJETJEC PDT, DEL-BOM on AI 9486:
 *
 *   transportInformation + tripDescription + fareRule   -> CHECK FORMAT
 *   the same plus pricingInfo numberOfUnits PX 1        -> CHECK FORMAT
 *   messageFunction omitted                             -> BAD MSG CODE
 *   itemNumber TST 1, sent statelessly                  -> BAD SYNTAX
 *
 * "BAD MSG CODE" for the third confirms 712 is a recognised function, so the
 * rejection is about missing PNR context rather than the message itself.
 *
 * So `/fare-rules`, which a customer opens on the review page before any
 * booking exists, cannot use this. It stays on the informative-pricing text.
 * These builders are kept because they are correct and cheap: the moment this
 * is called from inside the booking chain - after Ticket_CreateTSTFromPricing,
 * where a TST does exist - it will work, and that is where the filed
 * cancellation penalties for a BOOKED fare can be captured and stored.
 *
 * Two corrections to the plan, taken from Fare_CheckRules_07_1_1A.xsd:
 * the rule-section element is `ruleSectionId`, not `ruleSectionLocalId`, and
 * the message function is `messageFunction` (an..3), not
 * `messageFunctionCode`.
 */

/**
 * Rule sections worth asking for.
 *
 * PE penalties, CD child/discounts, AP advance purchase. The reply grows a
 * section per code, and the route's scraper reads the penalty text out of it -
 * asking for everything would return pages of filed tariff nobody reads.
 */
export const DEFAULT_RULE_SECTIONS = ['PE', 'CD', 'AP'];

/** '712' = "rules requested for a fare", per the message-function catalogue. */
const MESSAGE_FUNCTION = '712';

/**
 * @param {object} p
 * @param {string} p.carrier          marketing carrier, e.g. 'AI'
 * @param {string} [p.flightNumber]   e.g. '9486'
 * @param {string} [p.bookingClass]   RBD, e.g. 'X'
 * @param {string} p.origin           IATA
 * @param {string} p.destination      IATA
 * @param {string} [p.departDate]     DDMMYY
 * @param {string[]} [p.ruleSections] defaults to PE/CD/AP
 */
export const buildCheckRulesBody = (p) => {
  const {
    carrier, flightNumber, bookingClass, origin, destination, departDate,
    ruleSections = DEFAULT_RULE_SECTIONS,
  } = p;

  if (!carrier) throw new Error('carrier is required to check fare rules');
  if (!origin || !destination) throw new Error('origin and destination are required to check fare rules');

  // Root order follows the XSD sequence: msgType, ... transportInformation,
  // tripDescription, pricingInfo, fareRule. Schema validation rejects a
  // reordered body without naming the element, so this is not cosmetic.
  const body = [
    wrap('msgType', wrap('messageFunctionDetails', el('messageFunction', MESSAGE_FUNCTION))),

    wrap('transportInformation', [
      wrap('transportService', [
        wrap('companyIdentification', el('marketingCompany', carrier)),
        flightNumber
          ? wrap('productIdentificationDetails', el('flightNumber', String(flightNumber)))
          : '',
      ]),
      bookingClass
        ? wrap('availCabinConf', wrap('bookingClassDetails', el('designator', bookingClass)))
        : '',
    ]),

    wrap('tripDescription', [
      wrap('origDest', [el('origin', origin), el('destination', destination)]),
      departDate
        ? wrap('dateFlightMovement', wrap('dateAndTimeDetails', [
          el('qualifier', 'D'),
          el('date', departDate),
        ]))
        : '',
    ]),

    wrap('fareRule', wrap('tarifFareRule', [
      wrap('companyDetails', el('marketingCompany', carrier)),
      ...ruleSections.map((section) => el('ruleSectionId', section)),
    ])),
  ].join('');

  // The builder emits its own root element: the transport sends bodyXml
  // verbatim, so without this the WSAP answers "Root tag not found".
  const ns = OPERATIONS.Fare_CheckRules.namespace;
  return `    <Fare_CheckRules xmlns="${ns}">${body}</Fare_CheckRules>`;
};

/** Sections Amadeus returns that carry no rule text worth showing. */
const isNoise = (text) => !text || /^\s*$/.test(text) || /^NO\s+(RULE|DATA)/i.test(text);

/**
 * Read the rule text back.
 *
 * `tariffInfo[]` holds a section per requested code; `infoText[]` carries
 * anything the airline filed outside a section. Both are free text - Amadeus
 * files these as prose, so there is nothing structured to extract here and the
 * route's existing scraper is what turns it into penalties.
 *
 * @returns {{sections: Array<{code: string|null, text: string}>, error: string|null}}
 */
export const readCheckRulesReply = (reply) => {
  const rejectCode = atTxt(reply, 'errorInfo.rejectErrorCode.errorDetails.errorCode')
    || atTxt(reply, 'errorInfo.rejectErrorCode');
  if (rejectCode) {
    const detail = arr(at(reply, 'errorInfo.errorFreeText.freeText')).map(txt).filter(Boolean).join(' ');
    return { sections: [], error: detail || `Fare_CheckRules rejected: ${rejectCode}` };
  }

  const sections = [];

  for (const info of arr(reply?.tariffInfo)) {
    const code = atTxt(info, 'fareRuleInfo.ruleSectionId')
      || atTxt(info, 'fareRuleInfo.fareRuleType')
      || null;
    const text = arr(info.fareRuleText).map(txt).filter(Boolean).join('\n');
    if (!isNoise(text)) sections.push({ code, text });
  }

  for (const info of arr(reply?.infoText)) {
    const text = arr(info.freeText).map(txt).filter(Boolean).join('\n');
    if (!isNoise(text)) sections.push({ code: atTxt(info, 'freeTextQualification.textSubjectQualifier') || null, text });
  }

  return { sections, error: null };
};
