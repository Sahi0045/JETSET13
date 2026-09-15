import { toPnrName } from '../../../../shared/passengerName.js';
import { OPERATIONS } from '../codes.js';
import { each, el, wrap } from '../xml.js';
import { buildDocsFreetext, toDDMMMYY } from './travelDocs.js';

/**
 * PNR_AddMultiElements, PNR_Retrieve and PNR_Cancel.
 *
 * AddMultiElements is called twice in one booking: once to attach names and
 * contact elements without committing (optionCode 0), and once to commit
 * (optionCode 11, "end and retrieve"). Only the second call creates a record
 * locator, which is why the chain treats it as the point of no return.
 *
 * Root sequence (PNR_AddMultiElements_22_1_1A.xsd):
 *   reservationInfo? -> pnrActions -> travellerInfo[0..100]
 *     -> originDestinationDetails[0..50] -> dataElementsMaster{marker1, dataElementsIndiv[]}
 */

const OPTION_NO_COMMIT = '0';
/** ER - end and retrieve. ET (10) commits but returns no body, so the PNR would be lost. */
const OPTION_END_AND_RETRIEVE = '11';

const PTC_TO_CODE = Object.freeze({ ADULT: 'ADT', CHILD: 'CHD', HELD_INFANT: 'INF', SEATED_INFANT: 'INS' });

/**
 * Amadeus names are upper-case A-Z, space and hyphen.
 *
 * Anything else - an accent, an apostrophe in O'BRIEN, a comma - is rejected or
 * silently mangled into a name that will not match the passenger's passport at
 * check-in. Decomposing first keeps É as E rather than dropping the letter.
 *
 * The rule is shared with the review page and checkout (shared/passengerName.js),
 * which refuse before payment a name this would still lose letters from. Letters
 * that do not decompose are spelled in Latin first: "Łukasz" was written here as
 * "UKASZ" and "Øyvind" as "YVIND".
 */
export const sanitizeName = toPnrName;

/** MR/MS/MSTR/MISS ride in the first-name field, which is how Amadeus stores them. */
const titleFor = (traveler, ptc) => {
  const explicit = sanitizeName(traveler.title);
  if (explicit) return explicit;
  const isChild = ptc === 'CHD' || ptc === 'INF' || ptc === 'INS';
  const isFemale = String(traveler.gender ?? '').toUpperCase() === 'FEMALE';
  if (isChild) return isFemale ? 'MISS' : 'MSTR';
  return isFemale ? 'MS' : 'MR';
};

const isInfant = (traveler) => (PTC_TO_CODE[traveler.ptc] ?? traveler.ptc) === 'INF';

/**
 * Who is which passenger on the PNR.
 *
 * Every passenger with a seat is one travellerInfo, numbered PR 1..n in order.
 * An infant is not a passenger of its own on a PNR: it goes on an adult's name
 * element - infant 1 on the first adult, infant 2 on the second, the pairing
 * the search and pricing requests use. So an infant has no PR number, and what
 * belongs to it (its travel document) is addressed to its adult's.
 *
 * @returns {Array<{traveler, paxNumber:number, infant:?object}>}
 */
export const assignPassengers = (travelers) => {
  const seated = travelers.filter((t) => !isInfant(t));
  const infants = travelers.filter(isInfant);
  const adults = seated.filter((t) => (PTC_TO_CODE[t.ptc] ?? t.ptc ?? 'ADT') === 'ADT');
  if (infants.length > adults.length) {
    throw new Error(`${infants.length} infants need as many adults to travel on; the booking has ${adults.length}`);
  }
  return seated.map((traveler, index) => ({
    traveler,
    paxNumber: index + 1,
    infant: adults.includes(traveler) ? infants[adults.indexOf(traveler)] ?? null : null,
  }));
};

/**
 * An infant, as the second passengerData on its adult's name element.
 *
 * Verified against the live WSAP on 2026-09-15: the adult's traveller carries
 * quantity 2 and infantIndicator 3 - an infant with its own surname, given name
 * and date of birth - and the infant follows with type INF. Sold, priced (an
 * INF fare) and turned into a TST that way. Without the infant's surname
 * Amadeus refuses the message: "traveller: Missing mandatory item".
 */
const infantPassengerData = (infant) => {
  const surname = sanitizeName(infant.lastName);
  const firstName = sanitizeName(infant.firstName);
  if (!surname || !firstName) throw new Error('an infant is missing a usable name');
  const born = toDDMMMYY(infant.dateOfBirth);
  if (!born) throw new Error('an infant needs a date of birth');

  return wrap('passengerData', [
    wrap('travellerInformation', [
      wrap('traveller', el('surname', surname)),
      wrap('passenger', [el('firstName', `${firstName} ${titleFor(infant, 'INF')}`), el('type', 'INF')]),
    ]),
    wrap('dateOfBirth', wrap('dateAndTimeDetails', el('date', born))),
  ]);
};

/**
 * One travellerInfo per passenger with a seat, carrying any infant on its lap.
 *
 * `quantity` counts the people on the name element: 1, or 2 with an infant.
 * Grouping adults by surname is an optimisation that makes the traveller
 * references harder to line up against the fare groups later, and the
 * references are what the pricing step needs.
 */
const buildTravellers = (travelers) => each(assignPassengers(travelers), ({ traveler, paxNumber, infant }) => {
  const ptc = PTC_TO_CODE[traveler.ptc] ?? traveler.ptc ?? 'ADT';
  const surname = sanitizeName(traveler.lastName);
  const firstName = sanitizeName(traveler.firstName);
  if (!surname || !firstName) throw new Error(`traveler ${paxNumber} is missing a usable name`);

  return wrap('travellerInfo', [
    wrap('elementManagementPassenger', [
      wrap('reference', [el('qualifier', 'PR'), el('number', String(paxNumber))]),
      el('segmentName', 'NM'),
    ]),
    wrap('passengerData', [
      wrap('travellerInformation', [
        wrap('traveller', [el('surname', surname), el('quantity', infant ? '2' : '1')]),
        wrap('passenger', [
          el('firstName', `${firstName} ${titleFor(traveler, ptc)}`),
          // Without an explicit type every passenger prices as an adult, and a
          // child on an adult fare is a fare the airline can reject at check-in.
          ptc === 'ADT' ? '' : el('type', ptc),
          infant ? el('infantIndicator', '3') : '',
        ]),
      ]),
    ]),
    infant ? infantPassengerData(infant) : '',
  ]);
});

/** A free-text element (AP phone, APE email, RF, RM). */
const freetextElement = ({ number, segmentName, subjectQualifier, type, text }) => wrap('dataElementsIndiv', [
  wrap('elementManagementData', [
    wrap('reference', [el('qualifier', 'OT'), el('number', String(number))]),
    el('segmentName', segmentName),
  ]),
  wrap('freetextData', [
    wrap('freetextDetail', [
      el('subjectQualifier', subjectQualifier),
      el('type', type),
    ]),
    el('longFreetext', text),
  ]),
]);

/**
 * A miscellaneous remark (RM).
 *
 * Remarks do NOT go through freetextData, which is what every free-text element
 * above uses: `dataElementsIndiv` has a dedicated `miscellaneousRemark` child -
 * singular, and positioned before freetextData in the sequence. Sending a
 * remark as free text is accepted by the XML schema and then rejected by the
 * host as "3973 INVALID EDIFACT FORMAT", which names nothing.
 */
const remarkElement = ({ number, text }) => wrap('dataElementsIndiv', [
  wrap('elementManagementData', [
    wrap('reference', [el('qualifier', 'OT'), el('number', String(number))]),
    el('segmentName', 'RM'),
  ]),
  wrap('miscellaneousRemark', wrap('remarks', [
    // RC confidential, RI invoice, RM miscellaneous, RQ quality control.
    el('type', 'RM'),
    el('freetext', text),
  ])),
]);

/**
 * SSR DOCS - the passenger's travel document.
 *
 * Per the XSD, `serviceRequest/ssr` is a sequence of
 * `type, status, quantity, companyId, indicator, boardpoint, offpoint,
 * freetext` — freetext repeating at most twice at 70 characters each, which is
 * why a long DOCS string is split rather than truncated.
 *
 * `YY` addresses every airline on the record, which the XSD spells out as
 * "Airline code or YY". Sending a single carrier would leave the other
 * marketing carriers on an interline itinerary without the document.
 *
 * The element is associated to one passenger with a PT reference. Without that
 * association Amadeus cannot tell whose document it is, and the error names a
 * passenger number: "SSR DOCS MISSING FOR P1".
 */
const docsElement = ({ number, paxNumber, freetext }) => wrap('dataElementsIndiv', [
  wrap('elementManagementData', [
    wrap('reference', [el('qualifier', 'OT'), el('number', String(number))]),
    el('segmentName', 'SSR'),
  ]),
  wrap('serviceRequest', wrap('ssr', [
    el('type', 'DOCS'),
    el('status', 'HK'),
    el('quantity', '1'),
    el('companyId', 'YY'),
    ...(freetext.length > 70
      ? [el('freetext', freetext.slice(0, 70)), el('freetext', freetext.slice(70, 140))]
      : [el('freetext', freetext)]),
  ])),
  // `PR`, not `PT`. The XSD says a reference number "refers to an existing PNR
  // segment/element that has been previously transmitted in a previous Server
  // response message" — and a tattoo has not been assigned yet, because the
  // passenger is created by this very message as `elementManagementPassenger`
  // reference `PR/1`. Amadeus's own FP element, written after the PNR existed,
  // carries `PT/2` for the single passenger: the tattoo is not the ordinal, so
  // `PT/1` associated the document with a passenger that does not exist. The
  // element was accepted, appeared on the working PNR, and was purged at commit.
  wrap('referenceForDataElement', wrap('reference', [
    el('qualifier', 'PR'),
    el('number', String(paxNumber)),
  ])),
]);

/**
 * FM - the commission element.
 *
 * `DocIssuance_IssueTicket` answers `374 CMC RJT : NEED COMMISSION` without
 * one: this office will not issue against a TST that does not state what the
 * agency is taking. Zero is the correct figure here — the customer pays us
 * through ARC Pay and we settle the fare, so there is no airline commission to
 * claim. It still has to be said explicitly.
 *
 * Per the XSD the indicator codeset is `M, C, P, CR, PR`; `P` marks the value
 * as a percentage, which is what `commissionInfo/percentage` carries.
 */
const commissionElement = ({ number, percentage }) => wrap('dataElementsIndiv', [
  wrap('elementManagementData', [
    wrap('reference', [el('qualifier', 'OT'), el('number', String(number))]),
    el('segmentName', 'FM'),
  ]),
  wrap('commission', [
    el('passengerType', 'PAX'),
    el('indicator', 'P'),
    wrap('commissionInfo', el('percentage', String(percentage))),
  ]),
]);

/**
 * Ticketing time limit.
 *
 * TL means "cancel the booking if it is not ticketed by then". It is the safety
 * net for the case where the chain creates a PNR and then fails before issuing:
 * the seats are released automatically instead of being held indefinitely.
 */
const ticketingElement = ({ number, date, time, queueOffice }) => wrap('dataElementsIndiv', [
  wrap('elementManagementData', [
    wrap('reference', [el('qualifier', 'OT'), el('number', String(number))]),
    el('segmentName', 'TK'),
  ]),
  wrap('ticketElement', wrap('ticket', [
    el('indicator', 'TL'),
    el('date', date),
    el('time', time),
    el('officeId', queueOffice),
  ])),
]);

/**
 * Attach names and contact elements. Does not commit - no PNR exists yet.
 *
 * @param {object} p
 * @param {Array} p.travelers  {firstName, lastName, ptc, gender, title}
 * @param {object} p.contact   {email, phone}
 * @param {object} [p.ticketing] {date:'DDMMYY', time:'HHMM'}
 * @param {string} [p.bookingReference] filed on the PNR as an RM remark
 */
export const buildAddElementsBody = (p) => {
  const { travelers, contact = {}, ticketing, bookingReference, officeId, commissionPercent = 0 } = p;
  if (!travelers?.length) throw new Error('travelers are required to create a PNR');

  let number = 0;
  const elements = [
    // AP - contact phone. subjectQualifier 3 is "phone".
    contact.phone ? freetextElement({
      number: ++number, segmentName: 'AP', subjectQualifier: '3', text: contact.phone,
    }) : '',
    // APE - email. Same element, type P02 marks it as an address rather than a number.
    contact.email ? freetextElement({
      number: ++number, segmentName: 'AP', subjectQualifier: '3', type: 'P02', text: contact.email,
    }) : '',
    ticketing ? ticketingElement({
      number: ++number, date: ticketing.date, time: ticketing.time, queueOffice: officeId,
    }) : '',
    // RF - received from. Mandatory in most offices before a PNR will commit.
    freetextElement({ number: ++number, segmentName: 'RF', subjectQualifier: '3', text: 'JETSETTERS' }),
    // RM - a remark carrying our booking reference, so a PNR found on a queue
    // can be traced back to its payment without a database lookup.
    bookingReference ? remarkElement({ number: ++number, text: `ARC ${bookingReference}` }) : '',
    // FM - commission. Ticketing is refused without it (374 NEED COMMISSION).
    commissionElement({ number: ++number, percentage: commissionPercent }),
    // SSR DOCS per traveller who supplied a usable document. An international
    // ticket cannot be issued without it; a domestic one generally can, so a
    // traveller with no passport is skipped rather than failed.
    // An infant has no passenger number of its own, so its document goes on its
    // adult's; the I in its DOCS gender (MI/FI) is what marks it as the infant's.
    ...assignPassengers(travelers).flatMap(({ traveler, paxNumber, infant }) => [traveler, infant]
      .filter(Boolean)
      .map((person) => {
        const freetext = buildDocsFreetext(person);
        return freetext ? docsElement({ number: ++number, paxNumber, freetext }) : '';
      })),
  ].filter(Boolean).join('');

  const body = [
    wrap('pnrActions', el('optionCode', OPTION_NO_COMMIT)),
    buildTravellers(travelers),
    wrap('dataElementsMaster', ['<marker1/>', elements]),
  ].join('');

  const ns = OPERATIONS.PNR_AddMultiElements.namespace;
  return `    <PNR_AddMultiElements xmlns="${ns}">${body}</PNR_AddMultiElements>`;
};

/**
 * Commit the PNR and read it back.
 *
 * This is the call that creates the record locator. Everything before it can be
 * abandoned by signing out; after it, a booking exists in the airline's system
 * whether or not the rest of the chain succeeds.
 */
export const buildCommitBody = () => {
  const ns = OPERATIONS.PNR_AddMultiElements.namespace;
  const body = wrap('pnrActions', el('optionCode', OPTION_END_AND_RETRIEVE));
  return `    <PNR_AddMultiElements xmlns="${ns}">${body}</PNR_AddMultiElements>`;
};

/** Retrieve a PNR by record locator. type 2 = "by record locator". */
export const buildRetrieveBody = (recordLocator) => {
  if (!recordLocator) throw new Error('a record locator is required to retrieve a PNR');
  const ns = OPERATIONS.PNR_Retrieve.namespace;
  const body = wrap('retrievalFacts', [
    wrap('retrieve', el('type', '2')),
    wrap('reservationOrProfileIdentifier', wrap('reservation', el('controlNumber', recordLocator))),
  ]);
  return `    <PNR_Retrieve xmlns="${ns}">${body}</PNR_Retrieve>`;
};

/**
 * Cancel the itinerary and commit.
 *
 * entryType `I` cancels the itinerary — every travel segment. The comment here
 * used to say ITI, which is the entry a human types at a terminal and which
 * this schema rejects on length; the code below has been right for a while and
 * the comment had not caught up.
 *
 * optionCode 11 ends and retrieves, so the reply confirms what the PNR looks
 * like afterwards rather than leaving it uncommitted. Amadeus's own example
 * uses 10, which ends the transaction without reading the record back — ours
 * is the stricter choice, and it is what lets a caller verify the cancellation
 * actually happened.
 */
export const buildCancelBody = (recordLocator) => {
  const ns = OPERATIONS.PNR_Cancel.namespace;
  const body = [
    recordLocator ? wrap('reservationInfo', wrap('reservation', el('controlNumber', recordLocator))) : '',
    wrap('pnrActions', el('optionCode', OPTION_END_AND_RETRIEVE)),
    // entryType is AMA_EDICodesetType_Length1 - exactly ONE character. 'ITI',
    // the entry a human types at a terminal, is rejected for length alone.
    wrap('cancelElements', el('entryType', 'I')),
  ].filter(Boolean).join('');
  return `    <PNR_Cancel xmlns="${ns}">${body}</PNR_Cancel>`;
};
