import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { bookingItineraries, clockTime, layoverBetween, legLabel } from '../../shared/bookingItineraries.js';
import {
  canDownloadDocument, isPaid, issueDate, isVoidedTicket, liveTickets, pnrOf, resolveTickets, ticketForTraveler, ticketState, voidedTicketDigits,
} from '../../shared/eTicket.js';
import { documentNoticeOf, documentTitleOf } from '../../shared/ticketDocument.js';
import { printedTicketNumber } from '../../shared/ticketNumber.js';
import { cityOfAirport } from './airportsIndex.js';

const require = createRequire(import.meta.url);
const { carriers: AIRLINE_NAMES = {} } = require('../data/airports/airlines.min.json');
const LOGO = `data:image/png;base64,${readFileSync(new URL('../assets/jetsetters-logo.png', import.meta.url)).toString('base64')}`;
const LOGO_RATIO = 153 / 420;

const SITE = 'https://www.jetsetterss.com';
const SUPPORT_PHONE = '+1 877 538 7380';
const SUPPORT_EMAIL = 'support@jetsetterss.com';

const PAGE = { width: 210, height: 297, margin: 14, footer: 16 };
const CONTENT_WIDTH = PAGE.width - PAGE.margin * 2;
const COLOR = {
  teal: [5, 91, 117],
  dark: [3, 68, 87],
  accent: [8, 144, 188],
  sky: [101, 179, 207],
  light: [241, 251, 253],
  ink: [17, 24, 39],
  muted: [100, 116, 139],
  line: [203, 225, 233],
  amber: [180, 83, 9],
};

const NOTICES = [
  'Check in online on the airline\'s website or app with your airline booking code. Most airlines open online check-in 24 to 48 hours before departure.',
  'Be at the airport at least 3 hours before an international flight and 2 hours before a domestic flight.',
  'Carry a valid passport or government photo ID in the same name as on this document, and any visa your trip needs.',
  'Baggage allowances and fees are set by the airline. Check them with the airline before you travel.',
  'Your air transportation is subject to the airline\'s conditions of carriage, which are incorporated by reference into your contract. You may inspect them at the airline\'s airport and city ticket offices and ask the airline for a free copy by mail.',
  'If your journey involves an ultimate destination or stop in a country other than the country of departure, the Montreal Convention or the Warsaw Convention may apply and may limit the liability of carriers for death or personal injury, and for loss of or damage to baggage.',
  'Federal law forbids the carriage of hazardous materials aboard aircraft in your luggage or on your person.',
];

export class TicketDocumentError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

const money = (amount) => `USD ${(Number(amount) || 0).toFixed(2)}`;

const cityName = (code) => String(cityOfAirport(code) || code || '').replace(/\s*\(.*$/, '');

const place = (code) => (code ? `${cityName(code)} (${code})` : '');

const airlineName = (code) => AIRLINE_NAMES[String(code || '').toUpperCase()] || code || '';

const flightLabel = (segment) => {
  const carrier = segment.carrierCode || String(segment.flightNumber || '').slice(0, 2);
  const number = String(segment.flightNumber || '').replace(new RegExp(`^${carrier}\\s*`), '');
  return `${carrier} ${number}`.trim();
};

const day = (isoDate) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(isoDate || ''));
  if (!match) return '';
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
    .toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

const duration = (iso) => {
  const match = /PT(?:(\d+)H)?(?:(\d+)M)?/.exec(String(iso || ''));
  if (!match || (!match[1] && !match[2])) return '';
  return [match[1] ? `${match[1]}h` : '', match[2] ? `${match[2]}m` : ''].filter(Boolean).join(' ');
};

const bagText = (bag) => {
  if (!bag) return 'See airline rules';
  if (Number(bag.weight) > 0) return `${bag.weight} ${String(bag.weightUnit || 'kg').toLowerCase()}`;
  if (Number(bag.quantity) > 0) return `${bag.quantity} piece${Number(bag.quantity) === 1 ? '' : 's'}`;
  if (Number(bag.quantity) === 0 || Number(bag.weight) === 0) return 'None';
  return 'See airline rules';
};

const travellerName = (traveler) => [traveler?.title, traveler?.firstName, traveler?.lastName]
  .filter(Boolean).join(' ').toUpperCase() || 'TRAVELLER';

const travellerType = (traveler) => ({ ADULT: 'Adult', CHILD: 'Child', HELD_INFANT: 'Infant', INFANT: 'Infant' })[String(traveler?.type || '').toUpperCase()] || 'Adult';

class TicketDocument {
  constructor({ compress }) {
    this.doc = new jsPDF({ unit: 'mm', format: 'a4', compress });
    this.y = PAGE.margin;
    this.decoratePage();
  }

  decoratePage() {
    const { doc } = this;
    doc.saveGraphicsState();
    doc.setGState(new doc.GState({ opacity: 0.06 }));
    const width = 150;
    doc.addImage(LOGO, 'PNG', (PAGE.width - width) / 2, (PAGE.height - width * LOGO_RATIO) / 2, width, width * LOGO_RATIO, 'logo');
    doc.restoreGraphicsState();
  }

  ensure(height) {
    if (this.y + height <= PAGE.height - PAGE.footer - 4) return;
    this.doc.addPage();
    this.decoratePage();
    this.y = PAGE.margin;
  }

  font(size, style = 'normal', color = COLOR.ink) {
    this.doc.setFont('helvetica', style);
    this.doc.setFontSize(size);
    this.doc.setTextColor(...color);
  }

  text(value, x, y, options) {
    this.doc.text(String(value ?? ''), x, y, options);
  }

  wrapped(value, x, width, size, style = 'normal', color = COLOR.ink, lineHeight = size * 0.45) {
    this.font(size, style, color);
    const lines = this.doc.splitTextToSize(String(value ?? ''), width);
    this.ensure(lines.length * lineHeight);
    lines.forEach((line) => {
      this.text(line, x, this.y);
      this.y += lineHeight;
    });
  }

  section(title) {
    this.ensure(26);
    this.y += 5;
    this.font(10, 'bold', COLOR.teal);
    this.text(title.toUpperCase(), PAGE.margin, this.y);
    this.doc.setDrawColor(...COLOR.sky);
    this.doc.setLineWidth(0.4);
    this.doc.line(PAGE.margin, this.y + 1.5, PAGE.margin + CONTENT_WIDTH, this.y + 1.5);
    this.y += 6;
  }

  footers() {
    const { doc } = this;
    const pages = doc.getNumberOfPages();
    for (let page = 1; page <= pages; page += 1) {
      doc.setPage(page);
      const y = PAGE.height - PAGE.footer + 6;
      doc.setDrawColor(...COLOR.line);
      doc.setLineWidth(0.3);
      doc.line(PAGE.margin, y - 4, PAGE.width - PAGE.margin, y - 4);
      this.font(8, 'normal', COLOR.muted);
      this.text(`Jetsetters Corporation  ·  ${SUPPORT_PHONE}  ·  ${SUPPORT_EMAIL}  ·  jetsetterss.com`, PAGE.margin, y);
      this.text(`Page ${page} of ${pages}`, PAGE.width - PAGE.margin, y, { align: 'right' });
    }
  }
}

function header(t, booking, { title, issued }) {
  const { doc } = t;
  const logoWidth = 46;
  doc.addImage(LOGO, 'PNG', PAGE.margin, t.y, logoWidth, logoWidth * LOGO_RATIO, 'logo');

  t.font(16, 'bold', COLOR.dark);
  t.text(title === 'E-Ticket' ? 'E-TICKET' : title.toUpperCase(), PAGE.width - PAGE.margin, t.y + 6, { align: 'right' });
  t.font(9, 'normal', COLOR.muted);
  t.text(title === 'E-Ticket' ? 'Itinerary receipt' : 'This is not a ticket', PAGE.width - PAGE.margin, t.y + 11, { align: 'right' });
  if (issued) t.text(`Issued ${day(issued)}`, PAGE.width - PAGE.margin, t.y + 15.5, { align: 'right' });
  t.y += logoWidth * LOGO_RATIO + 5;

  const boxHeight = 19;
  doc.setFillColor(...COLOR.teal);
  doc.roundedRect(PAGE.margin, t.y, CONTENT_WIDTH, boxHeight, 2, 2, 'F');
  const columns = [
    ['AIRLINE BOOKING CODE (PNR)', pnrOf(booking) || 'Not yet assigned', 15],
    ['JETSETTERS BOOKING', booking.bookingReference || booking.orderId || '', 10],
    ['STATUS', title === 'E-Ticket' ? 'Ticketed' : 'Confirmed, ticket pending', 10],
  ];
  const columnWidth = CONTENT_WIDTH / columns.length;
  columns.forEach(([label, value, size], index) => {
    const x = PAGE.margin + 5 + index * columnWidth;
    t.font(7, 'bold', COLOR.sky);
    t.text(label, x, t.y + 6);
    t.font(size, 'bold', [255, 255, 255]);
    t.text(value, x, t.y + 14);
  });
  t.y += boxHeight + 3;
}

function notice(t, booking) {
  const message = documentNoticeOf(booking, { paid: isPaid(booking) });
  if (!message) return;
  t.ensure(18);
  const top = t.y;
  t.y += 5;
  t.wrapped(message.title, PAGE.margin + 4, CONTENT_WIDTH - 8, 9.5, 'bold', COLOR.amber);
  t.wrapped(message.body, PAGE.margin + 4, CONTENT_WIDTH - 8, 8.5, 'normal', COLOR.ink);
  t.doc.setDrawColor(...COLOR.amber);
  t.doc.setLineWidth(0.5);
  t.doc.roundedRect(PAGE.margin, top, CONTENT_WIDTH, t.y - top, 2, 2, 'S');
  t.y += 2;
}

function passengers(t, booking) {
  t.section('Passengers');
  const tickets = resolveTickets(booking);
  const voided = voidedTicketDigits(booking);
  const state = ticketState(booking);
  const travellers = Array.isArray(booking.travelers) && booking.travelers.length > 0 ? booking.travelers : [{}];
  const columns = [PAGE.margin, PAGE.margin + 70, PAGE.margin + 92, PAGE.margin + 138];

  t.font(7.5, 'bold', COLOR.muted);
  ['PASSENGER', 'TYPE', 'TICKET NUMBER', 'BAGGAGE (CHECKED / CABIN)'].forEach((label, index) => t.text(label, columns[index], t.y));
  t.y += 5;

  travellers.forEach((traveler, index) => {
    t.ensure(8);
    const match = ticketForTraveler(tickets, traveler, index);
    const number = match?.number && !isVoidedTicket(match, voided)
      ? printedTicketNumber(match)
      : (state === 'issued' || state === 'pending' ? 'Issued, number pending' : 'Not yet issued');
    t.font(9.5, 'bold', COLOR.ink);
    t.text(travellerName(traveler), columns[0], t.y);
    t.font(9, 'normal', COLOR.ink);
    t.text(travellerType(traveler), columns[1], t.y);
    t.font(9.5, 'bold', match?.number ? COLOR.dark : COLOR.muted);
    t.text(number, columns[2], t.y);
    t.font(9, 'normal', COLOR.ink);
    t.text(`${bagText(booking.baggageDetails?.checked)} / ${bagText(booking.baggageDetails?.cabin)}`, columns[3], t.y);
    t.y += 3;
    t.doc.setDrawColor(...COLOR.line);
    t.doc.setLineWidth(0.2);
    t.doc.line(PAGE.margin, t.y, PAGE.margin + CONTENT_WIDTH, t.y);
    t.y += 4.5;
  });
}

function segmentRow(t, segment) {
  t.ensure(17);
  const top = t.y;
  t.font(9.5, 'bold', COLOR.ink);
  t.text(`${airlineName(segment.carrierCode)}  ${flightLabel(segment)}`, PAGE.margin + 3, top);
  t.font(7.5, 'normal', COLOR.muted);
  const details = [
    segment.operatingCarrier ? `Operated by ${airlineName(segment.operatingCarrier)}` : '',
    segment.cabin ? String(segment.cabin).replace(/_/g, ' ').toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) : '',
    segment.aircraft ? `Aircraft ${segment.aircraft}` : '',
  ].filter(Boolean);
  details.forEach((line, index) => t.text(line, PAGE.margin + 3, top + 4 + index * 3.5));

  const endpoint = (x, time, code, date, terminal, align) => {
    t.font(13, 'bold', COLOR.dark);
    t.text(clockTime(time) || time || '--:--', x, top + 1, { align });
    t.font(8.5, 'bold', COLOR.ink);
    t.text(place(code), x, top + 5.5, { align });
    t.font(7.5, 'normal', COLOR.muted);
    t.text([day(date), terminal ? `Terminal ${terminal}` : ''].filter(Boolean).join('  ·  '), x, top + 9.5, { align });
  };
  endpoint(PAGE.margin + 82, segment.departureTime, segment.origin, segment.departureDate, segment.departureTerminal, 'left');
  t.doc.setDrawColor(...COLOR.sky);
  t.doc.setLineWidth(0.4);
  t.doc.line(PAGE.margin + 122, top - 0.5, PAGE.margin + 134, top - 0.5);
  endpoint(PAGE.margin + CONTENT_WIDTH - 3, segment.arrivalTime, segment.destination, segment.arrivalDate, segment.arrivalTerminal, 'right');
  t.y = top + Math.max(13, 4 + details.length * 3.5) + 1;
}

function flights(t, booking) {
  t.section('Flights');
  const legs = bookingItineraries(booking);
  legs.forEach((leg, index) => {
    t.ensure(28);
    t.doc.setFillColor(...COLOR.light);
    t.doc.roundedRect(PAGE.margin, t.y - 4, CONTENT_WIDTH, 7, 1.5, 1.5, 'F');
    t.font(9.5, 'bold', COLOR.teal);
    t.text(`${legLabel(leg, index, legs.length)}:  ${place(leg.origin)}  to  ${place(leg.destination)}`, PAGE.margin + 3, t.y + 0.6);
    t.font(8, 'normal', COLOR.muted);
    t.text([day(leg.departureDate), leg.stops === 0 ? 'Nonstop' : `${leg.stops} stop${leg.stops === 1 ? '' : 's'}`, duration(leg.duration)]
      .filter(Boolean).join('  ·  '), PAGE.margin + CONTENT_WIDTH - 3, t.y + 0.6, { align: 'right' });
    t.y += 9;
    leg.segments.forEach((segment, segmentIndex) => {
      segmentRow(t, segment);
      const next = leg.segments[segmentIndex + 1];
      if (!next) return;
      t.ensure(7);
      t.font(8, 'italic', COLOR.amber);
      const wait = layoverBetween(segment, next);
      t.text(`Connection in ${place(segment.destination)}${wait ? `  ·  ${wait} between flights` : ''}`, PAGE.margin + 3, t.y);
      t.y += 6;
    });
    t.y += 2;
  });
}

function payment(t, booking) {
  t.section('Fare and payment');
  const charge = booking.chargeBreakdown;
  const rows = charge
    ? [
      ['Airline fare, including taxes and airline charges', money(charge.fare)],
      ['Jetsetters service fee', money(charge.serviceFee)],
      ...(Number(charge.discount) > 0 ? [['Discount', `- ${money(charge.discount)}`]] : []),
      ...(Number(charge.walletAmount) > 0 ? [['Paid with Jet Coins', `- ${money(charge.walletAmount)}`]] : []),
    ]
    : [];
  rows.forEach(([label, value]) => {
    t.ensure(6);
    t.font(9, 'normal', COLOR.ink);
    t.text(label, PAGE.margin, t.y);
    t.text(value, PAGE.margin + CONTENT_WIDTH, t.y, { align: 'right' });
    t.y += 5;
  });
  t.ensure(10);
  t.font(10.5, 'bold', COLOR.dark);
  t.text('Total paid', PAGE.margin, t.y);
  t.text(money(charge?.total ?? booking.totalAmount), PAGE.margin + CONTENT_WIDTH, t.y, { align: 'right' });
  t.y += 5.5;
  t.font(8, 'normal', COLOR.muted);
  t.text(`Paid by card through ARC Pay${booking.transactionId ? `  ·  Transaction ID ${booking.transactionId}` : ''}`, PAGE.margin, t.y);
  t.y += 4;
}

function fareRules(t, booking) {
  t.section('Fare rules');
  const refundable = booking.refundable === true ? 'Refundable' : booking.refundable === false ? 'Non-refundable' : 'As the airline\'s fare rules say';
  const fare = [booking.brandedFareLabel || booking.brandedFare, String(booking.cabinClass || '').replace(/_/g, ' ').toLowerCase()]
    .filter(Boolean).join(', ');
  t.wrapped(`${fare ? `${fare.replace(/^\w/, (c) => c.toUpperCase())}  ·  ` : ''}${refundable}`, PAGE.margin, CONTENT_WIDTH, 9, 'bold');
  t.wrapped('Changes and cancellations follow the airline\'s fare rules. To change or cancel, open Manage Booking or call us. The Jetsetters service fee is not refundable.', PAGE.margin, CONTENT_WIDTH, 8.5, 'normal', COLOR.ink);
}

async function importantInformation(t, booking) {
  t.section('Important information');
  NOTICES.forEach((line) => {
    t.font(8.2, 'normal', COLOR.ink);
    const lines = t.doc.splitTextToSize(line, CONTENT_WIDTH - 5);
    t.ensure(lines.length * 3.7 + 1);
    t.text('•', PAGE.margin, t.y);
    lines.forEach((part) => {
      t.text(part, PAGE.margin + 4, t.y);
      t.y += 3.7;
    });
    t.y += 1;
  });

  const link = `${SITE}/manage-booking/${encodeURIComponent(booking.bookingReference || '')}`;
  const qr = await QRCode.toDataURL(link, { margin: 0, width: 256, color: { dark: '#034457', light: '#ffffff' } });
  const size = 26;
  t.ensure(size + 6);
  t.y += 3;
  t.doc.addImage(qr, 'PNG', PAGE.margin, t.y, size, size, 'qr');
  t.font(10, 'bold', COLOR.dark);
  t.text('Check this booking\'s live status', PAGE.margin + size + 6, t.y + 8);
  t.font(8.5, 'normal', COLOR.ink);
  t.text('Scan the code or open the link. The airline\'s system decides whether a ticket is valid,', PAGE.margin + size + 6, t.y + 13);
  t.text('so the live status always wins over a printed copy.', PAGE.margin + size + 6, t.y + 17);
  t.font(8.5, 'bold', COLOR.accent);
  t.text(link.replace(/^https:\/\/www\./, ''), PAGE.margin + size + 6, t.y + 22);
  t.y += size + 4;
}

/**
 * The flight document a customer downloads: an e-ticket itinerary receipt once
 * tickets are issued, a booking confirmation while a seat is held. Drawn as
 * text, not a screenshot, so it prints sharp, can be searched, and runs on to
 * as many pages as the trip needs.
 *
 * @param {object} booking the booking as the bookings API sends it (toClientBooking)
 * @returns {Promise<Uint8Array>}
 */
export async function buildTicketPdf(booking, { compress = true } = {}) {
  if (!canDownloadDocument(booking)) {
    throw new TicketDocumentError('This booking has no travel document to download.', 'NO_DOCUMENT');
  }
  const title = documentTitleOf(booking);
  const t = new TicketDocument({ compress });
  header(t, booking, { title, issued: issueDate(liveTickets(booking)) || booking.bookingDate });
  notice(t, booking);
  passengers(t, booking);
  flights(t, booking);
  payment(t, booking);
  fareRules(t, booking);
  await importantInformation(t, booking);
  t.footers();
  t.doc.setProperties({ title: `Jetsetters ${title} ${booking.bookingReference || ''}`.trim(), author: 'Jetsetters Corporation' });
  return new Uint8Array(t.doc.output('arraybuffer'));
}
