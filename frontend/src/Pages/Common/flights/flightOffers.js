import { airportClockLabel, legDateLabel, minutesBetweenAirportTimes } from './searchResults';
import { parseCheckedBagLabel } from '../../../utils/baggage';
import { tripTypeOf } from '../../../../../shared/bookingItineraries';

export const toDisplayFlights = (data, { cityMap = {}, airlineNames: dynamicAirlineMap = {}, aircraftNames: dynamicAircraftMap = {} } = {}) => {
  const legFromItinerary = (itin) => {
    const segs = itin?.segments;
    if (!segs || segs.length === 0) return null;
    const first = segs[0];
    const last = segs[segs.length - 1];
    const layover = (from, to) => {
      const minutes = minutesBetweenAirportTimes(from, to);
      return Number.isFinite(minutes) ? `${Math.floor(minutes / 60)}h ${minutes % 60}m` : '';
    };
    // Technical stops inside a flight count too: the plane lands on the way.
    const stopDetails = segs.flatMap((seg, idx) => {
      const technical = (seg.stops || []).map((stop) => ({
        airport: stop.iataCode, duration: layover(stop.arrivalAt, stop.departureAt), technical: true,
      }));
      const next = segs[idx + 1];
      return next ? [...technical, { airport: seg.arrival.iataCode, duration: layover(seg.arrival.at, next.departure.at) }] : technical;
    });
    return {
      departure: {
        time: airportClockLabel(first.departure.at),
        rawDate: first.departure.at?.split('T')[0],
        airport: first.departure.iataCode,
        terminal: first.departure.terminal || '',
        cityName: cityMap[first.departure.iataCode] || first.departure.iataCode,
      },
      arrival: {
        time: airportClockLabel(last.arrival.at),
        rawDate: last.arrival.at?.split('T')[0],
        airport: last.arrival.iataCode,
        terminal: last.arrival.terminal || '',
        cityName: cityMap[last.arrival.iataCode] || last.arrival.iataCode,
      },
      duration: itin.duration,
      stops: stopDetails.length,
      stopDetails,
      airline: {
        code: first.carrierCode,
        name: dynamicAirlineMap[first.carrierCode] || first.carrierCode,
        logo: `https://pics.avs.io/200/200/${first.carrierCode.toUpperCase()}.png`,
      },
      segments: segs.map(segment => ({
        departure: {
          time: airportClockLabel(segment.departure.at),
          airport: segment.departure.iataCode,
          terminal: segment.departure.terminal || '',
          cityName: cityMap[segment.departure.iataCode] || segment.departure.iataCode,
          at: segment.departure.at,
        },
        arrival: {
          time: airportClockLabel(segment.arrival.at),
          airport: segment.arrival.iataCode,
          terminal: segment.arrival.terminal || '',
          cityName: cityMap[segment.arrival.iataCode] || segment.arrival.iataCode,
          at: segment.arrival.at,
        },
        airline: {
          code: segment.carrierCode,
          name: dynamicAirlineMap[segment.carrierCode] || segment.carrierCode,
          logo: `https://pics.avs.io/200/200/${segment.carrierCode.toUpperCase()}.png`,
        },
        // Who flies it. A return sold as Delta and flown by Air France was
        // shown as Delta: a different check-in desk, and a codeshare a US
        // ticket agent has to disclose (14 CFR 257).
        operatingCarrier: segment.operating?.carrierCode || null,
        operatingAirlineName: segment.operating?.carrierCode ? (dynamicAirlineMap[segment.operating.carrierCode] || segment.operating.carrierCode) : null,
        duration: segment.duration,
        flightNumber: `${segment.carrierCode} ${segment.number}`,
        aircraft: dynamicAircraftMap[segment.aircraft?.code] || segment.aircraft?.code || 'Unknown Aircraft',
        stops: 0,
      })),
    };
  };

  const tripLegsOf = (itineraries = []) => {
    const type = tripTypeOf(itineraries.map((itin) => ({
      origin: itin?.segments?.[0]?.departure?.iataCode,
      destination: itin?.segments?.at(-1)?.arrival?.iataCode,
    })));
    return {
      isRoundTrip: type === 'roundTrip',
      returnLeg: type === 'roundTrip' ? legFromItinerary(itineraries[1]) : null,
      laterLegs: type === 'multiCity' ? itineraries.slice(1).map(legFromItinerary).filter(Boolean) : [],
    };
  };

  if (!data || !Array.isArray(data)) return [];

  return data.map(flight => {
    // Check if this is our API format (simple) or Amadeus format (complex)
    if (flight.itineraries) {
      // Handle raw Amadeus API format (rarely used - backend normally transforms)
      const itinerary = flight.itineraries[0];
      const segments = itinerary.segments;
      const firstSegment = segments[0];
      const lastSegment = segments[segments.length - 1];
      const price = flight.price;
      const travelerPricing = flight.travelerPricings?.[0];
      const fareDetails = travelerPricing?.fareDetailsBySegment?.[0];

      // Build dynamic maps from this flight's data
      const carrierCode = firstSegment.carrierCode;
      const airlineName = dynamicAirlineMap[carrierCode] || carrierCode;

      return {
        id: flight.id,
        airline: {
          code: carrierCode,
          name: airlineName,
          logo: `https://pics.avs.io/200/200/${carrierCode.toUpperCase()}.png`
        },
        departure: {
          time: airportClockLabel(firstSegment.departure.at),
          date: legDateLabel(firstSegment.departure.at),
          rawDate: firstSegment.departure.at?.split('T')[0] || firstSegment.departure.at,
          airport: firstSegment.departure.iataCode,
          terminal: firstSegment.departure.terminal || '',
          cityName: cityMap[firstSegment.departure.iataCode] || firstSegment.departure.iataCode
        },
        arrival: {
          time: airportClockLabel(lastSegment.arrival.at),
          date: legDateLabel(lastSegment.arrival.at),
          rawDate: lastSegment.arrival.at?.split('T')[0] || lastSegment.arrival.at,
          airport: lastSegment.arrival.iataCode,
          terminal: lastSegment.arrival.terminal || '',
          cityName: cityMap[lastSegment.arrival.iataCode] || lastSegment.arrival.iataCode
        },
        duration: itinerary.duration,
        stops: segments.length - 1,
        price: {
          amount: parseFloat(price.total),
          total: price.total,
          currency: price.currency || 'USD',
          base: price.base || '0',
          grandTotal: price.grandTotal || price.total,
          fees: price.fees || []
        },
        amenities: fareDetails?.amenities || [],
        // Null when the fare does not say. A `{weight: 0}` stand-in rendered
        // as "Cabin only" - a claim of no checked bag on fares that include one.
        baggage: {
          checked: fareDetails?.includedCheckedBags || null,
          cabin: fareDetails?.includedCabinBags || null
        },
        cabin: fareDetails?.cabin || null,
        class: fareDetails?.class || null,
        brandedFare: fareDetails?.brandedFare || null,
        brandedFareLabel: fareDetails?.brandedFareLabel || null,
        operatingCarrier: firstSegment.operating?.carrierCode || null,
        operatingAirlineName: firstSegment.operating?.carrierCode ? (dynamicAirlineMap[firstSegment.operating.carrierCode] || firstSegment.operating.carrierCode) : null,
        lastTicketingDate: flight.lastTicketingDate || null,
        numberOfBookableSeats: flight.numberOfBookableSeats || null,
        isUpsellOffer: flight.isUpsellOffer || false,
        refundable: flight._ama?.refundable ?? null,
        segments: segments.map(segment => ({
          departure: {
            time: airportClockLabel(segment.departure.at),
            airport: segment.departure.iataCode,
            terminal: segment.departure.terminal || '',
            cityName: cityMap[segment.departure.iataCode] || segment.departure.iataCode,
            at: segment.departure.at
          },
          arrival: {
            time: airportClockLabel(segment.arrival.at),
            airport: segment.arrival.iataCode,
            terminal: segment.arrival.terminal || '',
            cityName: cityMap[segment.arrival.iataCode] || segment.arrival.iataCode,
            at: segment.arrival.at
          },
          airline: {
            code: segment.carrierCode,
            name: dynamicAirlineMap[segment.carrierCode] || segment.carrierCode,
            logo: `https://pics.avs.io/200/200/${segment.carrierCode.toUpperCase()}.png`
          },
          operatingCarrier: segment.operating?.carrierCode || null,
          operatingAirlineName: segment.operating?.carrierCode ? (dynamicAirlineMap[segment.operating.carrierCode] || segment.operating.carrierCode) : null,
          duration: segment.duration,
          flightNumber: `${segment.carrierCode} ${segment.number}`,
          aircraft: dynamicAircraftMap[segment.aircraft?.code] || segment.aircraft?.code || 'Unknown Aircraft',
          stops: 0
        })),
        // IMPORTANT: Preserve original Amadeus offer for booking API
        originalOffer: flight
      };
    } else if (flight.originalOffer) {
      // Already has originalOffer from backend - preserve it
      return {
        id: flight.id,
        airline: {
          code: flight.airlineCode,
          name: flight.airline,
          logo: `https://pics.avs.io/200/200/${flight.airlineCode?.toUpperCase()}.png`
        },
        departure: {
          time: flight.departure.time,
          date: legDateLabel(flight.departure.date),
          rawDate: flight.departure.date,
          airport: flight.departure.airport,
          terminal: flight.departure.terminal || '',
          cityName: cityMap[flight.departure.airport] || flight.departure.airport
        },
        arrival: {
          time: flight.arrival.time,
          date: legDateLabel(flight.arrival.date),
          rawDate: flight.arrival.date,
          airport: flight.arrival.airport,
          terminal: flight.arrival.terminal || '',
          cityName: cityMap[flight.arrival.airport] || flight.arrival.airport
        },
        duration: flight.duration,
        durationMinutes: flight.durationMinutes ?? null,
        stops: flight.stops || 0,
        price: {
          amount: flight.price.amount,
          total: flight.price.total,
          currency: flight.price.currency || 'USD',
          base: flight.price.base || '0',
          grandTotal: flight.price.grandTotal || flight.price.total,
          fees: flight.price.fees || []
        },
        amenities: [],
        baggage: {
          checked: flight.baggageDetails?.checked || parseCheckedBagLabel(flight.baggage),
          cabin: flight.baggageDetails?.cabin || null
        },
        cabin: flight.cabin || null,
        class: flight.cabin || null,
        brandedFare: flight.brandedFare || null,
        brandedFareLabel: flight.brandedFareLabel || null,
        operatingCarrier: flight.operatingCarrier || null,
        operatingAirlineName: flight.operatingAirlineName || null,
        lastTicketingDate: flight.lastTicketingDate || null,
        numberOfBookableSeats: flight.numberOfBookableSeats || null,
        isUpsellOffer: flight.isUpsellOffer || false,
        aircraft: flight.aircraft || 'Unknown',
        flightNumber: flight.flightNumber,
        refundable: flight.refundable ?? null,
        amenities: flight.amenities || flight.originalOffer?.travelerPricings?.[0]?.fareDetailsBySegment?.[0]?.amenities || [],
        fareBasis: flight.fareBasis || null,
        bookingClass: flight.bookingClass || null,
        validatingAirlineCodes: flight.validatingAirlineCodes || [],
        seats: flight.numberOfBookableSeats ?? null,
        stopDetails: flight.stopDetails || [],
        segments: (() => {
          // Extract real segments from originalOffer for multi-stop flights
          const origSegs = flight.originalOffer?.itineraries?.[0]?.segments;
          // One real segment is used too: a single flight with a technical
          // stop counts a stop, and the fallback below draws nothing for a
          // flight with stops.
          if (origSegs && (origSegs.length > 1 || (flight.stops || 0) > 0)) {
            return origSegs.map(segment => ({
              departure: {
                time: airportClockLabel(segment.departure.at),
                airport: segment.departure.iataCode,
                terminal: segment.departure.terminal || '',
                cityName: cityMap[segment.departure.iataCode] || segment.departure.iataCode,
                at: segment.departure.at
              },
              arrival: {
                time: airportClockLabel(segment.arrival.at),
                airport: segment.arrival.iataCode,
                terminal: segment.arrival.terminal || '',
                cityName: cityMap[segment.arrival.iataCode] || segment.arrival.iataCode,
                at: segment.arrival.at
              },
              airline: {
                code: segment.carrierCode,
                name: dynamicAirlineMap[segment.carrierCode] || segment.carrierCode,
                logo: `https://pics.avs.io/200/200/${segment.carrierCode.toUpperCase()}.png`
              },
              operatingCarrier: segment.operating?.carrierCode || null,
              operatingAirlineName: segment.operating?.carrierCode ? (dynamicAirlineMap[segment.operating.carrierCode] || segment.operating.carrierCode) : null,
              duration: segment.duration,
              flightNumber: `${segment.carrierCode} ${segment.number}`,
              aircraft: dynamicAircraftMap[segment.aircraft?.code] || segment.aircraft?.code || 'Unknown Aircraft',
              stops: 0
            }));
          }
          // Single segment fallback - only for a flight that IS a single
          // segment. A connecting flight with no segment data used to be
          // drawn as one invented non-stop leg; the stop details say where
          // it stops instead.
          if ((flight.stops || 0) > 0) return [];
          return [{
            departure: {
              time: flight.departure.time,
              airport: flight.departure.airport,
              terminal: flight.departure.terminal || '',
              cityName: cityMap[flight.departure.airport] || flight.departure.airport,
              at: `${flight.departure.date}T${flight.departure.time}:00`
            },
            arrival: {
              time: flight.arrival.time,
              airport: flight.arrival.airport,
              terminal: flight.arrival.terminal || '',
              cityName: cityMap[flight.arrival.airport] || flight.arrival.airport,
              at: `${flight.arrival.date}T${flight.arrival.time}:00`
            },
            airline: {
              code: flight.airlineCode,
              name: flight.airline,
              logo: `https://pics.avs.io/200/200/${flight.airlineCode?.toUpperCase()}.png`
            },
            operatingCarrier: flight.operatingCarrier || null,
            operatingAirlineName: flight.operatingAirlineName || null,
            duration: flight.duration,
            flightNumber: flight.flightNumber,
            aircraft: flight.aircraft || 'Unknown Aircraft',
            stops: 0
          }];
        })(),
        // Return leg (round trips) and later flights (multi-city), from the offer's itineraries
        ...tripLegsOf(flight.originalOffer?.itineraries),
        // IMPORTANT: Preserve original Amadeus offer for booking API
        originalOffer: flight.originalOffer
      };
    } else {
      // Handle our simple API format (no originalOffer available)
      return {
        id: flight.id,
        airline: {
          code: flight.airlineCode,
          name: flight.airline,
          logo: `https://pics.avs.io/200/200/${flight.airlineCode.toUpperCase()}.png`
        },
        departure: {
          time: flight.departure.time,
          date: legDateLabel(flight.departure.date),
          rawDate: flight.departure.date,
          airport: flight.departure.airport,
          terminal: flight.departure.terminal || '',
          cityName: cityMap[flight.departure.airport] || flight.departure.airport
        },
        arrival: {
          time: flight.arrival.time,
          date: legDateLabel(flight.arrival.date),
          rawDate: flight.arrival.date,
          airport: flight.arrival.airport,
          terminal: flight.arrival.terminal || '',
          cityName: cityMap[flight.arrival.airport] || flight.arrival.airport
        },
        duration: flight.duration,
        durationMinutes: flight.durationMinutes ?? null,
        stops: flight.stops || 0,
        price: {
          amount: flight.price.amount,
          total: flight.price.total,
          // The fare's own currency, else USD - never the visitor's display
          // currency, which would relabel the number without converting it.
          currency: flight.price.currency || 'USD',
          base: flight.price.base || '0',
          grandTotal: flight.price.grandTotal || flight.price.total,
          fees: flight.price.fees || []
        },
        amenities: [],
        baggage: {
          checked: flight.baggageDetails?.checked || parseCheckedBagLabel(flight.baggage),
          cabin: flight.baggageDetails?.cabin || null
        },
        cabin: flight.cabin || null,
        class: flight.cabin || null,
        brandedFare: flight.brandedFare || null,
        brandedFareLabel: flight.brandedFareLabel || null,
        operatingCarrier: flight.operatingCarrier || null,
        operatingAirlineName: flight.operatingAirlineName || null,
        lastTicketingDate: flight.lastTicketingDate || null,
        numberOfBookableSeats: flight.numberOfBookableSeats || null,
        isUpsellOffer: flight.isUpsellOffer || false,
        aircraft: flight.aircraft || 'Unknown',
        flightNumber: flight.flightNumber,
        refundable: flight.refundable ?? null,
        seats: flight.numberOfBookableSeats ?? null,
        stopDetails: flight.stopDetails || [],
        // No invented non-stop leg for a connecting flight.
        segments: (flight.stops || 0) > 0 ? [] : [{
          departure: {
            time: flight.departure.time,
            airport: flight.departure.airport,
            terminal: flight.departure.terminal || '',
            cityName: cityMap[flight.departure.airport] || flight.departure.airport,
            at: `${flight.departure.date}T${flight.departure.time}:00`
          },
          arrival: {
            time: flight.arrival.time,
            airport: flight.arrival.airport,
            terminal: flight.arrival.terminal || '',
            cityName: cityMap[flight.arrival.airport] || flight.arrival.airport,
            at: `${flight.arrival.date}T${flight.arrival.time}:00`
          },
          airline: {
            code: flight.airlineCode,
            name: flight.airline,
            logo: `/images/airlines/${flight.airlineCode.toLowerCase()}.png`
          },
          operatingCarrier: flight.operatingCarrier || null,
          operatingAirlineName: flight.operatingAirlineName || null,
          duration: flight.duration,
          flightNumber: flight.flightNumber,
          aircraft: flight.aircraft || 'Unknown Aircraft',
          stops: 0
        }]
      };
    }
  });
};
