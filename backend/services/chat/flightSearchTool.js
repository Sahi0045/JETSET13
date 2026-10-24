import axios from 'axios';
import { Type } from '@google/genai';

const CABINS = ['ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST'];
const TIMES_OF_DAY = ['morning', 'afternoon', 'evening', 'night'];
const TRIP_TYPES = ['oneWay', 'roundTrip'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_CARDS = 5;

export const SEARCH_FLIGHTS_DECLARATION = {
  name: 'search_flights',
  description: 'Search real, bookable flights with live prices. Call it only when you know where from, where to, the departure date, one way or return (with the return date), and how many adults, children and infants are travelling.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      from: { type: Type.STRING, description: 'Departure city or airport, as the customer said it.' },
      to: { type: Type.STRING, description: 'Arrival city or airport, as the customer said it.' },
      departDate: { type: Type.STRING, description: 'Departure date, YYYY-MM-DD.' },
      tripType: { type: Type.STRING, enum: TRIP_TYPES, description: 'oneWay or roundTrip.' },
      returnDate: { type: Type.STRING, description: 'Return date, YYYY-MM-DD. Only for a round trip.' },
      adults: { type: Type.INTEGER, description: 'Travellers aged 12 or over.' },
      children: { type: Type.INTEGER, description: 'Travellers aged 2 to 11.' },
      infants: { type: Type.INTEGER, description: 'Travellers under 2, on an adult\'s lap.' },
      cabin: { type: Type.STRING, enum: CABINS, description: 'Cabin. Economy unless the customer asks for another.' },
      nonStop: { type: Type.BOOLEAN, description: 'Only nonstop flights.' },
      airlines: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Two-letter airline codes the customer wants.' },
      timeOfDay: { type: Type.STRING, enum: TIMES_OF_DAY, description: 'When the customer wants to leave.' },
      maxPrice: { type: Type.NUMBER, description: 'Highest total price in US dollars the customer named.' },
    },
    required: ['from', 'to', 'departDate', 'tripType', 'adults'],
  },
};

const place = (value) => String(value ?? '').trim().slice(0, 60);

const count = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
};

export function normalizeSearchArgs(args = {}, { today }) {
  const from = place(args.from);
  const to = place(args.to);
  const departDate = String(args.departDate ?? '').trim();
  const tripType = TRIP_TYPES.includes(args.tripType) ? args.tripType : null;
  const returnDate = String(args.returnDate ?? '').trim();
  const adults = count(args.adults, 0);

  const missing = [];
  if (!from) missing.push('from');
  if (!to) missing.push('to');
  if (!ISO_DATE.test(departDate)) missing.push('departDate');
  if (!tripType) missing.push('tripType');
  if (tripType === 'roundTrip' && !ISO_DATE.test(returnDate)) missing.push('returnDate');
  if (adults < 1) missing.push('adults');
  if (missing.length) return { ok: false, missing };

  const children = count(args.children);
  const infants = count(args.infants);
  if (departDate < today) return { ok: false, missing: [], reason: 'PAST_DATE' };
  if (tripType === 'roundTrip' && returnDate < departDate) return { ok: false, missing: [], reason: 'RETURN_BEFORE_DEPARTURE' };
  if (infants > adults) return { ok: false, missing: [], reason: 'INFANTS_EXCEED_ADULTS' };
  if (adults + children > 9) return { ok: false, missing: [], reason: 'TOO_MANY_TRAVELLERS' };

  const cabin = String(args.cabin ?? '').toUpperCase();
  const maxPrice = Number(args.maxPrice);
  return {
    ok: true,
    search: {
      from,
      to,
      departDate,
      ...(tripType === 'roundTrip' ? { returnDate } : {}),
      adults,
      children,
      infants,
      travelClass: CABINS.includes(cabin) ? cabin : 'ECONOMY',
    },
    refine: {
      nonStop: args.nonStop === true,
      airlines: (Array.isArray(args.airlines) ? args.airlines : [])
        .map((code) => String(code).trim().toUpperCase())
        .filter((code) => /^[A-Z0-9]{2}$/.test(code)),
      timeOfDay: TIMES_OF_DAY.includes(args.timeOfDay) ? args.timeOfDay : undefined,
      maxPrice: Number.isFinite(maxPrice) && maxPrice > 0 ? maxPrice : undefined,
    },
  };
}

export function searchBody(search) {
  return {
    from: search.from,
    to: search.to,
    departDate: search.departDate,
    adults: search.adults,
    children: search.children || 0,
    infants: search.infants || 0,
    travelClass: search.travelClass || 'ECONOMY',
    max: 50,
    ...(search.returnDate ? { returnDate: search.returnDate } : {}),
  };
}

export const flightsApiBase = (env = process.env) => {
  if (env.FLIGHTS_API_BASE) return String(env.FLIGHTS_API_BASE).replace(/\/$/, '');
  if (env.VERCEL) return 'https://api.jetsetterss.com';
  return `http://127.0.0.1:${env.PORT || 5004}`;
};

export async function runFlightSearch(search, { visitorIp } = {}) {
  let resp;
  try {
    // The visitor's address rides along so Lightsail's per-IP search limit
    // counts each visitor, not every chat as one Vercel address.
    resp = await axios.post(`${flightsApiBase()}/api/flights/search`, searchBody(search), {
      timeout: 20000,
      validateStatus: () => true,
      headers: { 'Content-Type': 'application/json', ...(visitorIp ? { 'x-forwarded-for': visitorIp } : {}) },
    });
  } catch (error) {
    return { ok: false, status: 504, code: 'NO_ANSWER', message: error?.message || 'The flight search did not answer' };
  }

  const body = resp?.data;
  if (resp?.status === 200 && body?.success) {
    const offers = Array.isArray(body.data) ? body.data : [];
    return { ok: true, offers, total: offers.length, resolved: body.meta?.searchParams || search };
  }
  return {
    ok: false,
    status: resp?.status || 500,
    ...(body?.code ? { code: body.code } : {}),
    message: body?.error || 'Flight search failed',
  };
}

const priceOf = (offer) => Number(offer?.price?.total ?? offer?.price?.amount);

const departureHour = (offer) => Number(String(offer?.departure?.time ?? '').split(':')[0]);

const HOURS = {
  morning: (hour) => hour >= 5 && hour <= 11,
  afternoon: (hour) => hour >= 12 && hour <= 16,
  evening: (hour) => hour >= 17 && hour <= 20,
  night: (hour) => hour >= 21 || hour <= 4,
};

const cheapest = (list) => list.reduce((best, offer) => (best && priceOf(best) <= priceOf(offer) ? best : offer), null);

export function pickCards(offers = [], refine = {}) {
  const wanted = offers.filter((offer) => (
    Number.isFinite(priceOf(offer))
    && (!refine.nonStop || offer.stops === 0)
    && (!refine.airlines?.length || refine.airlines.includes(offer.airlineCode))
    && (!refine.timeOfDay || HOURS[refine.timeOfDay](departureHour(offer)))
    && (!refine.maxPrice || priceOf(offer) <= refine.maxPrice)
  ));

  const fastest = wanted.reduce((best, offer) => (
    best && best.durationMinutes <= offer.durationMinutes ? best : offer
  ), null);
  const byPrice = [...wanted].sort((a, b) => priceOf(a) - priceOf(b));
  const picked = [cheapest(wanted), fastest, cheapest(wanted.filter((offer) => offer.stops === 0)), ...byPrice];

  const seen = new Set();
  return picked.filter((offer) => {
    if (!offer || seen.has(offer.id)) return false;
    seen.add(offer.id);
    return true;
  }).slice(0, MAX_CARDS);
}

const travellersOf = (offer, search) => offer?.originalOffer?.travelerPricings?.length
  || (search.adults || 0) + (search.children || 0) + (search.infants || 0);

const stopsLabel = (stops) => (stops === 0 ? 'nonstop' : `${stops} stop${stops === 1 ? '' : 's'}`);

export function cardSummary(cards, search) {
  return cards.map((offer, index) => {
    const travellers = travellersOf(offer, search);
    return `${index + 1}. ${offer.airline}, ${offer.departure?.time}–${offer.arrival?.time}, ${stopsLabel(offer.stops)}, ${offer.duration}, `
      + `USD ${offer.price?.total} for ${travellers} traveller${travellers === 1 ? '' : 's'} + service fee`;
  }).join('\n');
}
