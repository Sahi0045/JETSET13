import { arr, at, atTxt, txt } from '../parseXml.js';
import { sanitizeName } from '../operations/pnr.js';

/**
 * PNR_Reply -> the REST `flight-order` shape.
 *
 * Both clients read the order response nested AND at the top level
 * (FlightCreateOrders.jsx:195-206, mobile FlightBookingScreen:55-72), and
 * ManageBooking renders from the persisted copy, so this shape is a contract
 * rather than an internal detail.
 */

/** The record locator. Its presence is what distinguishes a real booking from a failed one. */
/**
 * The PNR, or nothing.
 *
 * There used to be a fallback to `companyId` here, which is not a record
 * locator at all - it is the owning system's code, and on this WSAP it is
 * always the literal string `1A`. When a commit came back without a control
 * number, this returned "1A", and "1A" is truthy: the booking chain's
 * `if (!pnr) throw` guard let it through, marked the booking committed, and
 * reported success with a fabricated PNR. The customer had already paid by
 * then, and every later retrieve or cancel against "1A" fails with
 * INVALID RECORD LOCATOR.
 *
 * A record locator is six alphanumeric characters. Anything else is not a
 * booking, and saying so lets the chain take its compensation path instead of
 * inventing a reference.
 */
/**
 * Amadeus's own reservation in the PNR header.
 *
 * pnrHeader repeats when the airline sends its record locator back with the
 * commit: Asiana answered [{1A BA67KD}, {OZ 0243-3166}] (PDT, 15 Sep 2026). Read
 * as a single object, the pair gave no locator at all, and a PNR that existed was
 * treated as a failed commit. Amadeus's record (1A) is the one we hold.
 */
const amadeusReservation = (reply) => {
  const reservations = arr(at(reply, 'pnrHeader')).flatMap((header) => arr(at(header, 'reservationInfo.reservation')));
  return reservations.find((reservation) => atTxt(reservation, 'companyId') === '1A') ?? reservations[0] ?? null;
};

export const readRecordLocator = (reply) => {
  const value = atTxt(amadeusReservation(reply), 'controlNumber') || '';
  return /^[A-Z0-9]{6}$/i.test(value.trim()) ? value.trim() : '';
};

/** Creation date, when the reply carries one (DDMMYY). */
const readCreationDate = (reply) => atTxt(amadeusReservation(reply), 'date') || '';

/**
 * Passengers as the clients expect them: {id, name:{firstName, lastName}}.
 *
 * The title was appended to the first name when the PNR was built, so it comes
 * back as "JOHN MR". Stripping it here keeps the confirmation page showing the
 * name the customer typed rather than the GDS spelling of it.
 */
export const readTravelers = (reply) => arr(reply?.travellerInfo).flatMap((info, index) => {
  const reference = atTxt(info, 'elementManagementPassenger.reference.number') || String(index + 1);
  // An infant is not a passenger of its own on a PNR: it rides on its adult's
  // name element (operations/pnr.js), and the reply lists it there as a second
  // `passenger` of type INF, under the adult's surname. Reading one passenger
  // per element dropped the infant and, with two present, blanked the adult's
  // first name (seen on the live WSAP, 2026-09-15).
  const people = arr(at(info, 'passengerData')).flatMap((data) => {
    const surname = atTxt(data, 'travellerInformation.traveller.surname');
    return arr(at(data, 'travellerInformation.passenger')).map((passenger) => ({ surname, passenger }));
  });
  const elementSurname = people.find((p) => p.surname)?.surname || '';

  return people.map(({ surname, passenger }) => {
    const given = txt(passenger.firstName);
    const onLap = txt(passenger.type) === 'INF';
    return {
      id: onLap ? `${reference}-INF` : reference,
      ...(onLap ? { travelerType: 'HELD_INFANT', associatedAdultId: reference } : {}),
      name: {
        firstName: given.replace(/\s+(MR|MRS|MS|MISS|MSTR|DR)$/i, '').trim() || given,
        lastName: surname || elementSurname,
      },
    };
  });
}).filter((t) => t.name.lastName);

/**
 * Ticket numbers.
 *
 * They live in FA elements as free text, in the shape
 * `FA PAX 057-2412345678/ETAI/USD221.70/...`. Amadeus has no structured field
 * for them in this reply, so the number is matched by its own format: a
 * three-digit airline accounting code and a ten-digit serial.
 *
 * A ticket number is the evidence that the customer actually has a ticket, so
 * a booking that has one must never be cancelled to "clean up" a failed chain.
 */
const MONTHS = Object.freeze({
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5,
  JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
});

/** '04SEP26' -> '2026-09-04'. Amadeus has no dates before 2000. */
const fromDDMMMYY = (value) => {
  const m = /^(\d{2})([A-Z]{3})(\d{2})$/.exec(String(value ?? '').toUpperCase());
  if (!m || MONTHS[m[2]] === undefined) return null;
  return `20${m[3]}-${String(MONTHS[m[2]] + 1).padStart(2, '0')}-${m[1]}`;
};

export const readTickets = (reply) => {
  const tickets = [];

  for (const element of arr(at(reply, 'dataElementsMaster.dataElementsIndiv'))) {
    if (atTxt(element, 'elementManagementData.segmentName') !== 'FA') continue;

    const freetext = arr(at(element, 'otherDataFreetext'))
      .map((entry) => txt(entry.longFreetext))
      .join(' ');
    const match = freetext.match(/(\d{3})-?(\d{10})/);
    if (!match) continue;

    // FA PAX 057-2412345678/ETAI/USD221.70/04SEP26/SCK1S2400/...
    //                        ^^ ^^         ^^^^^^^
    //                        |  carrier    issue date
    //                        electronic ticket marker
    //
    // The issue date decides whether voiding is possible at all: after the day
    // of issue the ticket has to be refunded through the airline instead.
    //
    // The plating carrier is read for the record, not because the void needs
    // it — Ticket_CancelDocument identifies the stock by the office's market
    // code, not by a carrier.
    const carrier = freetext.match(/\/ET([A-Z0-9]{2})\b/)?.[1] ?? null;
    const issuedOn = fromDDMMMYY(freetext.match(/\b(\d{2}[A-Z]{3}\d{2})\b/)?.[1]);

    // An infant on a lap is not a passenger of its own on a PNR, so its FA
    // points at its adult's passenger reference and says INF where an adult's
    // says PAX:
    //
    //   FA INF 057-2412345679/ETAI/USD22.00/04SEP26/SCK1S2400/...
    //
    // Read as the adult's, the two tickets could not be told apart: a page gave
    // the adult either number, and the infant somebody else's.
    const passengerRef = arr(at(element, 'referenceForDataElement.reference'))
      .filter((r) => txt(r.qualifier) === 'PT')
      .map((r) => txt(r.number))[0] ?? null;
    const onLap = /(?:^|\s)INF\s+\d{3}-?\d{10}/.test(freetext);

    tickets.push({
      number: `${match[1]}-${match[2]}`,
      // The id readTravelers gives the same infant: `<adult reference>-INF`.
      travelerId: passengerRef && onLap ? `${passengerRef}-INF` : passengerRef,
      ...(onLap ? { travelerType: 'HELD_INFANT', associatedAdultId: passengerRef } : {}),
      validatingCarrier: carrier,
      // The date Amadeus says it was issued, not the time we happened to read
      // it: `new Date()` here made every ticket look issued today, which is
      // exactly the question the void decision turns on.
      issuedOn,
    });
  }

  return tickets;
};

/** True once at least one ticket exists - the point past which cancelling is wrong. */
export const isTicketed = (reply) => readTickets(reply).length > 0;

const isOnLap = (traveler) => ['HELD_INFANT', 'INF'].includes(String(traveler?.ptc ?? traveler?.travelerType ?? '').toUpperCase());

/**
 * Each ticket against the traveller it belongs to, by that traveller's own id.
 *
 * A ticket names its passenger by PNR reference, and that reference is a
 * TATTOO: Amadeus numbers every element of the PNR in one sequence, and lists
 * passengers in its own order. The live family booking recorded in
 * tests/fixtures/amadeus/pnr-add-elements-infant-family.xml came back with
 * passengers 5, 2 and 4 for the three we sent as 1, 2 and 3, the infant riding
 * on 2. An infant's ticket names its adult (readTickets marks it `<adult>-INF`).
 *
 * The booking, the e-ticket and Manage Booking know travellers by the ids the
 * review page gave them. So the only honest bridge is the PNR's own passenger
 * list: the tattoo names a passenger there, and that passenger's name - as it
 * was written onto the PNR - and whether they ride on a lap name the traveller.
 * A tattoo the PNR does not list, or a name two travellers share, names nobody:
 * that ticket gets no traveller rather than a guess, and a page shows its number
 * as pending. The PNR's own reference is kept as `pnrTravelerId`.
 *
 * @param {object[]} tickets     - readTickets output
 * @param {object[]} pnrTravelers - readTravelers output from the same PNR
 * @param {object[]} travelers    - the booking's travellers: { id, firstName, lastName, ptc }
 */
export const attributeTickets = (tickets, pnrTravelers, travelers) => {
  if (!Array.isArray(tickets)) return [];

  const keyOf = (firstName, lastName, onLap) => `${sanitizeName(firstName)}|${sanitizeName(lastName)}|${onLap ? 'INF' : ''}`;

  // null marks a name two travellers share: either could be the ticket's.
  const byName = new Map();
  for (const person of Array.isArray(travelers) ? travelers : []) {
    const key = keyOf(person?.firstName ?? person?.name?.firstName, person?.lastName ?? person?.name?.lastName, isOnLap(person));
    byName.set(key, byName.has(key) ? null : person);
  }

  const onPnr = new Map((Array.isArray(pnrTravelers) ? pnrTravelers : []).map((t) => [String(t.id), t]));

  return tickets.map((ticket) => {
    const passenger = ticket?.travelerId != null ? onPnr.get(String(ticket.travelerId)) : undefined;
    const holder = passenger
      ? byName.get(keyOf(passenger.name?.firstName, passenger.name?.lastName, isOnLap(passenger)))
      : undefined;
    return {
      ...ticket,
      travelerId: holder?.id != null ? String(holder.id) : null,
      pnrTravelerId: ticket?.travelerId ?? null,
    };
  });
};

/**
 * Assemble the order response.
 *
 * `flightOffers` is passed through from what was actually priced rather than
 * rebuilt from the PNR: the offer already carries the itinerary in the shape
 * the clients render, and reconstructing it from the reply would be a second,
 * subtly different representation of the same journey.
 */
export const buildFlightOrder = (reply, { flightOffers = [], bookingReference } = {}) => {
  const pnr = readRecordLocator(reply);
  const tickets = readTickets(reply);

  return {
    type: 'flight-order',
    id: pnr,
    queuingOfficeId: atTxt(amadeusReservation(reply), 'companyId') || undefined,
    associatedRecords: pnr
      ? [{ reference: pnr, creationDate: readCreationDate(reply), originSystemCode: 'GDS' }]
      : [],
    flightOffers,
    travelers: readTravelers(reply),
    tickets,
    bookingReference,
  };
};
