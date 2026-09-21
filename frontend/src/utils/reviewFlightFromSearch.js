import { airportClockLabel, legDateLabel } from '../Pages/Common/flights/searchResults';
import { parseCheckedBagLabel } from './baggage';

/**
 * A search result in the shape the review page reads.
 *
 * The review page is handed its flight by the results page, which transforms
 * the API's search result first: `airline` becomes `{code, name, logo}`, dates
 * get their display labels, and the segments are rebuilt from the offer's own
 * itineraries. Everything the review page draws - the boarding-pass header,
 * the leg times, the terminals - reads that shape.
 *
 * When the review page fetches its own flights, as it does when the airline
 * withdraws a fare, it gets the API's shape instead. Handing that straight to
 * the page put a string where an object belonged, and the flight the customer
 * had just chosen was drawn as "Jetsetters Airlines".
 *
 * So the conversion lives here, named, rather than inline in a page.
 *
 * @param {object}   flight    one entry of /api/flights/search's `data`
 * @param {Function} cityName  IATA code -> city or airport name
 */
export const reviewFlightFromSearch = (flight, cityName = (code) => code) => {
  if (!flight?.originalOffer) return null;

  const airline = {
    code: flight.airlineCode,
    name: flight.airline,
    logo: `https://pics.avs.io/200/200/${String(flight.airlineCode ?? '').toUpperCase()}.png`,
    flightNumber: flight.flightNumber,
  };

  const endpoint = (end) => ({
    time: end?.time,
    date: legDateLabel(end?.date),
    rawDate: end?.date,
    airport: end?.airport,
    terminal: end?.terminal || '',
    cityName: cityName(end?.airport) || end?.airport,
  });

  // The offer's own segments, so a flight with a stop draws both legs. A
  // single segment is used too: one flight with a technical stop still counts
  // a stop, and the whole-journey fallback draws nothing for it.
  const offerSegments = flight.originalOffer?.itineraries?.[0]?.segments ?? [];
  const segments = (offerSegments.length > 1 || (flight.stops || 0) > 0)
    ? offerSegments.map((segment) => ({
      departure: {
        time: airportClockLabel(segment.departure?.at),
        airport: segment.departure?.iataCode,
        terminal: segment.departure?.terminal || '',
        cityName: cityName(segment.departure?.iataCode) || segment.departure?.iataCode,
        at: segment.departure?.at,
      },
      arrival: {
        time: airportClockLabel(segment.arrival?.at),
        airport: segment.arrival?.iataCode,
        terminal: segment.arrival?.terminal || '',
        cityName: cityName(segment.arrival?.iataCode) || segment.arrival?.iataCode,
        at: segment.arrival?.at,
      },
      airline: {
        code: segment.carrierCode,
        name: segment.carrierCode === flight.airlineCode ? flight.airline : segment.carrierCode,
        logo: `https://pics.avs.io/200/200/${String(segment.carrierCode ?? '').toUpperCase()}.png`,
      },
      operatingCarrier: segment.operating?.carrierCode || null,
      operatingAirlineName: segment.operating?.carrierCode === flight.operatingCarrier
        ? flight.operatingAirlineName
        : (segment.operating?.carrierCode || null),
      duration: segment.duration,
      flightNumber: `${segment.carrierCode} ${segment.number}`,
      aircraft: segment.aircraft?.code || 'Unknown Aircraft',
      stops: 0,
    }))
    : [];

  return {
    id: flight.id,
    airline,
    flightNumber: flight.flightNumber,
    departure: endpoint(flight.departure),
    arrival: endpoint(flight.arrival),
    duration: flight.duration,
    durationMinutes: flight.durationMinutes ?? null,
    stops: flight.stops || 0,
    stopDetails: flight.stopDetails || [],
    segments,
    price: {
      amount: flight.price?.amount,
      total: flight.price?.total,
      currency: flight.price?.currency || 'USD',
      base: flight.price?.base || '0',
      grandTotal: flight.price?.grandTotal || flight.price?.total,
      fees: flight.price?.fees || [],
    },
    baggage: {
      checked: flight.baggageDetails?.checked || parseCheckedBagLabel(flight.baggage),
      cabin: flight.baggageDetails?.cabin || null,
    },
    cabin: flight.cabin || null,
    class: flight.cabin || null,
    brandedFare: flight.brandedFare || null,
    brandedFareLabel: flight.brandedFareLabel || null,
    operatingCarrier: flight.operatingCarrier || null,
    operatingAirlineName: flight.operatingAirlineName || null,
    lastTicketingDate: flight.lastTicketingDate || null,
    numberOfBookableSeats: flight.numberOfBookableSeats ?? null,
    refundable: flight.refundable ?? null,
    amenities: flight.amenities || [],
    fareBasis: flight.fareBasis || null,
    bookingClass: flight.bookingClass || null,
    validatingAirlineCodes: flight.validatingAirlineCodes || [],
    seats: flight.numberOfBookableSeats ?? null,
    aircraft: flight.aircraft || 'Unknown',
    // What actually gets priced and booked.
    originalOffer: flight.originalOffer,
  };
};
