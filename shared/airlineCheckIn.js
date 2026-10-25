import { bookingItineraries } from './bookingItineraries.js';
import { airlineLocatorsOf, pnrOf, ticketState } from './eTicket.js';

// Each airline's own online check-in page and when check-in opens, in hours
// before departure, then on flights to or from the US where that differs.
// Read from the airlines' sites on 25 Oct 2026. Virgin Australia is left out:
// its international flights check in at the airport only.
const CHECK_IN = {
  AI: ['Air India', 'https://www.airindia.com/in/en/manage/web-checkin.html', 48],
  IX: ['Air India Express', 'https://www.airindiaexpress.com/checkin-home', 48],
  '6E': ['IndiGo', 'https://www.goindigo.in/web-check-in.html', 24],
  QP: ['Akasa Air', 'https://www.akasaair.com/check-in/web-check-in', 48],
  SG: ['SpiceJet', 'https://www.spicejet.com/checkin', 48],
  EK: ['Emirates', 'https://www.emirates.com/us/english/manage-booking/online-check-in/', 48],
  QR: ['Qatar Airways', 'https://www.qatarairways.com/en-us/services-checking-in.html', 48, 24],
  EY: ['Etihad', 'https://www.etihad.com/en-us/manage/check-in', 30],
  FZ: ['flydubai', 'https://www.flydubai.com/en/flying-with-us/check-in/online-check-in/', 48],
  G9: ['Air Arabia', 'https://www.airarabia.com/en/check-in', 48],
  GF: ['Gulf Air', 'https://www.gulfair.com/flying-with-us/before-you-travel/check-in', null],
  WY: ['Oman Air', 'https://dxcheckin.omanair.com/dx/WYCI/', 48],
  SV: ['Saudia', 'https://www.saudia.com/travel-with-saudia/manage/web-check-in', 48, 24],
  XY: ['flynas', 'https://www.flynas.com/en/manage-booking', 48],
  KU: ['Kuwait Airways', 'https://www.kuwaitairways.com/en/online-checkin', 24],
  OV: ['SalamAir', 'https://www.salamair.com/en/book/online-check-in', 24],
  LH: ['Lufthansa', 'https://www.lufthansa.com/us/en/online-check-in', 30],
  LX: ['SWISS', 'https://www.swiss.com/us/en/fly/check-in/online-check-in', 23, 24],
  OS: ['Austrian', 'https://www.austrian.com/us/en/online-check-in', 47, 24],
  SN: ['Brussels Airlines', 'https://checkin.brusselsairlines.com/', 24],
  KL: ['KLM', 'https://www.klm.com/check-in', 30, 24],
  AF: ['Air France', 'https://wwws.airfrance.us/check-in', 30, 24],
  BA: ['British Airways', 'https://www.britishairways.com/travel/olcilandingpageauthreq/public/en_us', 24],
  VS: ['Virgin Atlantic', 'https://www.virginatlantic.com/PCCOciWeb/findBy', 24],
  IB: ['Iberia', 'https://www.iberia.com/us/checkin-information/', 24],
  AZ: ['ITA Airways', 'https://www.ita-airways.com/us/en/manage-my-bookings/manage/check-in', 48, 24],
  TK: ['Turkish Airlines', 'https://www.turkishairlines.com/en-us/flights/manage-booking/', 24],
  LO: ['LOT', 'https://www.lot.com/us/en/check-in', 36],
  AY: ['Finnair', 'https://www.finnair.com/us-en/check-in', 36, 24],
  SK: ['SAS', 'https://www.flysas.com/en/checkin', 30],
  EI: ['Aer Lingus', 'https://www.aerlingus.com/prepare/check-in-options/online/', 24],
  TP: ['TAP Air Portugal', 'https://www.flytap.com/en-us/check-in', 36, 24],
  UA: ['United', 'https://www.united.com/en/us/checkin', 24],
  AA: ['American Airlines', 'https://www.aa.com/reservation/flightCheckInViewReservationsAccess.do', 24],
  DL: ['Delta', 'https://www.delta.com/PCCOciWeb/findBy.action', 24],
  AS: ['Alaska Airlines', 'https://www.alaskaair.com/checkin', 24],
  B6: ['JetBlue', 'https://mobilecheckin.jetblue.com/', 24],
  WN: ['Southwest', 'https://www.southwest.com/air/check-in/', 24],
  HA: ['Hawaiian Airlines', 'https://www.hawaiianairlines.com/checkin', 24],
  AC: ['Air Canada', 'https://www.aircanada.com/home/us/en/aco/checkin', 24],
  WS: ['WestJet', 'https://www.westjet.com/en-us/manage/check-in', 24],
  AM: ['Aeromexico', 'https://www.aeromexico.com/en-us/check-in', 24],
  SQ: ['Singapore Airlines', 'https://www.singaporeair.com/en_UK/us/travel-info/check-in/online-mobile-checkin/', 48, 24],
  TR: ['Scoot', 'https://makeabooking.flyscoot.com/checkin', 48],
  CX: ['Cathay Pacific', 'https://www.cathaypacific.com/cx/en_US/manage-booking/check-in.html', 24],
  NH: ['ANA', 'https://www.ana.co.jp/en/us/travel-information/online-check-in/', 24],
  JL: ['Japan Airlines', 'https://www.jal.co.jp/en-us/travel-info/boarding/online-checkin.html', 24],
  KE: ['Korean Air', 'https://www.koreanair.com/contents/plan-your-travel/check-in/self-check-in/online-check-in?hl=en', 48, 24],
  OZ: ['Asiana Airlines', 'https://flyasiana.com/I/US/EN/CheckIn.do', 48, 24],
  BR: ['EVA Air', 'https://booking.evaair.com/flyeva/eva/b2c/manage-your-trip/online-checked-in-login.aspx?lang=en-global', 48],
  CI: ['China Airlines', 'https://calec.china-airlines.com/eCheckin/eCheckin_home.aspx?country=us&locale=en', 48, 24],
  CA: ['Air China', 'https://www.airchina.us/US/GB/info/online-check-in/', 36],
  MU: ['China Eastern', 'https://us.ceair.com/en/check-in.html', 48],
  CZ: ['China Southern', 'https://www.csair.com/us/en/', null],
  TG: ['Thai Airways', 'https://www.thaiairways.com/en-us/content/check-in/', 24],
  MH: ['Malaysia Airlines', 'https://www.malaysiaairlines.com/us/en/travel-info/check-in.html', 48],
  AK: ['AirAsia', 'https://www.airasia.com/check-in/en/gb', 336],
  GA: ['Garuda Indonesia', 'https://digital.garuda-indonesia.com/ssci/identification', 48],
  VN: ['Vietnam Airlines', 'https://www.vietnamairlines.com/us/en/travel-information/check-in/online-check-in', 24],
  PR: ['Philippine Airlines', 'https://www.philippineairlines.com/us/en/check-in-online.html', 24],
  UL: ['SriLankan Airlines', 'https://www.srilankan.com/online-checkin', 48],
  BG: ['Biman Bangladesh', 'https://checkin.biman-airlines.com/dx/BGCI/', 24],
  RA: ['Nepal Airlines', 'https://www.nepalairlines.com.np/', null],
  KB: ['Drukair', 'https://drukair.com.bt/experience/before-you-fly/web-check-in/', 72],
  ET: ['Ethiopian Airlines', 'https://www.ethiopianairlines.com/us/book/check-in/web-check-in', 48],
  KQ: ['Kenya Airways', 'https://www.kenya-airways.com/en/book-manage/post-booking/check-in/', 48, 24],
  MS: ['EgyptAir', 'https://www.egyptair.com/en/fly/check-in/pages/web-check-in.aspx', 48],
  RJ: ['Royal Jordanian', 'https://www.rj.com/en/info-and-tips/check-in-options/online-check-in', 24],
  HY: ['Uzbekistan Airways', 'https://www.uzairways.com/en/online-registration', 24],
  KC: ['Air Astana', 'https://airastana.com/global-en/booking-manage/check-in', 36],
  QF: ['Qantas', 'https://www.qantas.com/us/en/travel-info/check-in.html', 24],
  NZ: ['Air New Zealand', 'https://flightbookings.airnewzealand.com/vmanage/actions/retrieve?_eventName=webcheck', 24],
  MK: ['Air Mauritius', 'https://www.airmauritius.com/en/book-and-manage/check-in-online', 30],
  HM: ['Air Seychelles', 'https://www.airseychelles.com/en/before-you-fly/web-checkin', 24],
  SA: ['South African Airways', 'https://www.flysaa.com/manage-fly/manage/check-in/on-line-check-in', 24],
  LA: ['LATAM', 'https://www.latamairlines.com/us/en/check-in', 48],
  CM: ['Copa Airlines', 'https://checkin.copaair.com/', 24],
};

export function checkInFor(carrierCode) {
  const code = String(carrierCode ?? '').trim().toUpperCase();
  const entry = CHECK_IN[code];
  if (!entry) return null;
  const [airline, url, opensHoursBefore, usFlightsHoursBefore] = entry;
  return { carrierCode: code, airline, url, opensHoursBefore, ...(usFlightsHoursBefore ? { usFlightsHoursBefore } : {}) };
}

export function checkInsOf(booking, { today = new Date().toISOString().slice(0, 10) } = {}) {
  if (ticketState(booking) !== 'issued') return [];
  const segments = bookingItineraries(booking).flatMap((leg) => (Array.isArray(leg.segments) ? leg.segments : []));
  const lastDeparture = segments.map((segment) => segment.departureDate).filter(Boolean).sort().pop() || booking?.departureDate;
  if (!lastDeparture || lastDeparture < today) return [];

  const locators = airlineLocatorsOf(booking);
  const pnr = pnrOf(booking);
  const carriers = [...new Set(segments.map((segment) => String(segment.carrierCode ?? '').trim().toUpperCase()).filter(Boolean))];
  return carriers
    .map((carrierCode) => {
      const checkIn = checkInFor(carrierCode);
      if (!checkIn) return null;
      const own = locators.find((entry) => entry.carrierCode === carrierCode)?.locator;
      return { ...checkIn, code: own || pnr, codeIsAirlines: Boolean(own) };
    })
    .filter(Boolean);
}

export function checkInOpensText({ opensHoursBefore, usFlightsHoursBefore }) {
  if (!opensHoursBefore) return '';
  const span = (hours) => (hours >= 72 ? `${Math.round(hours / 24)} days` : `${hours} hours`);
  const usNote = usFlightsHoursBefore && usFlightsHoursBefore !== opensHoursBefore
    ? ` (${span(usFlightsHoursBefore)} on flights to or from the US)`
    : '';
  return `Opens ${span(opensHoursBefore)} before departure${usNote}`;
}
