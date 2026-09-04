import { OPERATIONS } from '../codes.js';
import { each, el, wrap } from '../xml.js';

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
 */
export const sanitizeName = (value) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toUpperCase()
  .replace(/[^A-Z \-]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

/** MR/MS/MSTR/MISS ride in the first-name field, which is how Amadeus stores them. */
const titleFor = (traveler, ptc) => {
  const explicit = sanitizeName(traveler.title);
  if (explicit) return explicit;
  const isChild = ptc === 'CHD' || ptc === 'INF' || ptc === 'INS';
  const isFemale = String(traveler.gender ?? '').toUpperCase() === 'FEMALE';
  if (isChild) return isFemale ? 'MISS' : 'MSTR';
  return isFemale ? 'MS' : 'MR';
};

/**
 * One travellerInfo per passenger.
 *
 * `quantity` is 1 because each passenger is its own element; grouping by
 * surname is an optimisation that makes the traveller references harder to line
 * up against the fare groups later, and the references are what the pricing
 * step needs.
 */
const buildTravellers = (travelers) => each(travelers, (traveler, index) => {
  const ptc = PTC_TO_CODE[traveler.ptc] ?? traveler.ptc ?? 'ADT';
  const surname = sanitizeName(traveler.lastName);
  const firstName = sanitizeName(traveler.firstName);
  if (!surname || !firstName) throw new Error(`traveler ${index + 1} is missing a usable name`);

  return wrap('travellerInfo', [
    wrap('elementManagementPassenger', [
      wrap('reference', [el('qualifier', 'PR'), el('number', String(index + 1))]),
      el('segmentName', 'NM'),
    ]),
    wrap('passengerData', [
      wrap('travellerInformation', [
        wrap('traveller', [el('surname', surname), el('quantity', '1')]),
        wrap('passenger', [
          el('firstName', `${firstName} ${titleFor(traveler, ptc)}`),
          // Without an explicit type every passenger prices as an adult, and a
          // child on an adult fare is a fare the airline can reject at check-in.
          ptc === 'ADT' ? '' : el('type', ptc),
        ]),
      ]),
    ]),
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
  const { travelers, contact = {}, ticketing, bookingReference, officeId } = p;
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
 * entryType ITI cancels the air segments; optionCode 11 ends and retrieves so
 * the reply confirms what the PNR looks like afterwards rather than leaving it
 * uncommitted.
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
