import { arr, at, atTxt, txt } from '../parseXml.js';

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
export const readRecordLocator = (reply) => {
  const value = atTxt(reply, 'pnrHeader.reservationInfo.reservation.controlNumber') || '';
  return /^[A-Z0-9]{6}$/i.test(value.trim()) ? value.trim() : '';
};

/** Creation date, when the reply carries one (DDMMYY). */
const readCreationDate = (reply) => atTxt(reply, 'pnrHeader.reservationInfo.reservation.date') || '';

/**
 * Passengers as the clients expect them: {id, name:{firstName, lastName}}.
 *
 * The title was appended to the first name when the PNR was built, so it comes
 * back as "JOHN MR". Stripping it here keeps the confirmation page showing the
 * name the customer typed rather than the GDS spelling of it.
 */
export const readTravelers = (reply) => arr(reply?.travellerInfo).map((info, index) => {
  const surname = atTxt(info, 'passengerData.travellerInformation.traveller.surname');
  const given = atTxt(info, 'passengerData.travellerInformation.passenger.firstName');
  const reference = atTxt(info, 'elementManagementPassenger.reference.number') || String(index + 1);

  return {
    id: reference,
    name: {
      firstName: given.replace(/\s+(MR|MRS|MS|MISS|MSTR|DR)$/i, '').trim() || given,
      lastName: surname,
    },
  };
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
    // The plating carrier is mandatory to void a ticket, and the issue date
    // decides whether voiding is even possible - after the day of issue the
    // ticket has to be refunded through the airline instead.
    const carrier = freetext.match(/\/ET([A-Z0-9]{2})\b/)?.[1] ?? null;
    const issuedOn = fromDDMMMYY(freetext.match(/\b(\d{2}[A-Z]{3}\d{2})\b/)?.[1]);

    tickets.push({
      number: `${match[1]}-${match[2]}`,
      travelerId: arr(at(element, 'referenceForDataElement.reference'))
        .filter((r) => txt(r.qualifier) === 'PT')
        .map((r) => txt(r.number))[0] ?? null,
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
    queuingOfficeId: atTxt(reply, 'pnrHeader.reservationInfo.reservation.companyId') || undefined,
    associatedRecords: pnr
      ? [{ reference: pnr, creationDate: readCreationDate(reply), originSystemCode: 'GDS' }]
      : [],
    flightOffers,
    travelers: readTravelers(reply),
    tickets,
    bookingReference,
  };
};
