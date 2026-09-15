 
import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { Plane, Calendar, Users, ArrowRight, X, Search, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Clock, ArrowUpDown, MapPin, Luggage, Sun, Sunrise, Sunset, Moon, ShieldCheck, RefreshCw, Briefcase, AlertTriangle } from "lucide-react";
import Navbar from '../Navbar';
import Footer from '../Footer';
import withPageElements from '../PageWrapper';
import Price from '../../../Components/Price';
import currencyService from '../../../Services/CurrencyService';
import {
  defaultSearchData,
  destinations,
  sourceCities,
  specialFares
} from "./data.js";
import { allAirports } from "./airports.js";
import AirportService from "../../../Services/AirportService";
import { getTodayDate } from "../../../utils/dateUtils";
import { parseCheckedBagLabel } from "../../../utils/baggage";

// Import centralized API configuration
import apiConfig from '@/config/api';
import LoadingSpinner from '../../../Components/LoadingSpinner';
import FlightCard from './FlightCard';
import FlightFilterSidebar from './FlightFilterSidebar';
import FlightModifyBar from './FlightModifyBar';
import FlightSortTabs from './FlightSortTabs';
import FlightMobileSortFilter from './FlightMobileSortFilter';
import FlightFareOptions from './FlightFareOptions';
import FlightAppliedFilters from './FlightAppliedFilters';
import FlightFareCalendar from './FlightFareCalendar';
import { sortFlights } from './flightSort';
import { buildSearchPayload, fieldCode, searchFromQuery, searchKeyOf, searchToQuery } from './searchQuery';
import { buildDateStrip, filtersWithin, matchesFilters, searchFailureMessage, shiftDateStrip } from './searchResults';

function FlightSearchPage() {
  const location = useLocation();

  /**
   * Where the search comes from, in priority order.
   *
   * This page already writes `?from=&to=&date=` onto its own URL when the user
   * picks a date in the strip, so that URL is a real, shareable search — but
   * nothing ever read it back. Router state does not survive a refresh, a
   * bookmark, a pasted link or a restored tab, and every one of those fell
   * through to a hardcoded DEL-HYD search for today: the wrong route, silently,
   * under the URL the user was actually looking at.
   */
  const searchDataFromUrl = useMemo(() => searchFromQuery(location.search), [location.search]);
  const searchData = location.state?.searchData ?? searchDataFromUrl;
  const apiResponse = location.state?.apiResponse;

  // What the fetch below depends on: the search itself, not the object
  // carrying it (see searchKeyOf).
  const searchKey = useMemo(() => searchKeyOf(searchData), [searchData]);

  // const location = useLocation();
  const navigate = useNavigate();

  // Sent back from the review page to change who is travelling: open the modify
  // form on the traveller picker, once. The flag is then dropped from history,
  // so a refresh shows the results rather than reopening the picker.
  const [openTravellers] = useState(() => Boolean(location.state?.editTravellers));
  useEffect(() => {
    if (!location.state?.editTravellers) return;
    const { editTravellers: _opened, ...state } = location.state;
    navigate(`${location.pathname}${location.search}`, { replace: true, state });
  }, []);
  const [searchParams, setSearchParams] = useState(searchData || {
    from: 'DEL',
    to: 'HYD',
    departDate: getTodayDate(),
    returnDate: '',
    travelers: 1,
    tripType: 'one-way'
  });
  const [flights, setFlights] = useState(apiResponse?.data || []);
  const [loading, setLoading] = useState(true);
  const [sortOrder, setSortOrder] = useState("price");
  const [dateRange, setDateRange] = useState([]);
  // Until results arrive; the price range is then set from them (below).
  const [filters, setFilters] = useState(() => filtersWithin({ min: 0, max: 50000 }));
  // The currency prices are shown in. The price filter and its bounds are in
  // this currency, so they are worked out again whenever it changes: the bounds
  // stayed in the old currency and hid every flight whose converted fare was
  // above the old maximum.
  const [displayCurrency, setDisplayCurrency] = useState(() => currencyService.getCurrency());
  useEffect(() => {
    const onCurrencyChanged = (event) => setDisplayCurrency(event?.detail?.currency || currencyService.getCurrency());
    window.addEventListener('currencyChanged', onCurrencyChanged);
    return () => window.removeEventListener('currencyChanged', onCurrencyChanged);
  }, []);
  const [error, setError] = useState(null);
  const [searchAttempt, setSearchAttempt] = useState(0); // Retry re-runs an unchanged search
  const [fareFlight, setFareFlight] = useState(null); // flight whose fare-options modal is open
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [showFareCalendar, setShowFareCalendar] = useState(false);
  const [expandedFlights, setExpandedFlights] = useState({});
  const [isMobileView, setIsMobileView] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const flightsPerPage = 10;

  useEffect(() => {
    const checkIfMobile = () => {
      setIsMobileView(window.innerWidth < 768);
    };
    checkIfMobile();
    window.addEventListener('resize', checkIfMobile);
    return () => window.removeEventListener('resize', checkIfMobile);
  }, []);

  /**
   * The date strip for this search: seven days around its date, and their fares.
   *
   * Rebuilt whenever the search changes - route, dates, passengers or cabin -
   * because a fare is only true for the passengers and cabin it was priced
   * for. The fares used to reload only when the route or date changed, so a
   * modified search kept the old passengers' prices on the strip.
   */
  useEffect(() => {
    const strip = buildDateStrip(searchData?.departDate || getTodayDate());
    setDateRange(strip);
    if (searchData) loadDatePrices(searchData, strip.map((d) => d.isoDate));
  }, [searchKey]);

  /**
   * Run the search.
   *
   * Every search the page runs comes through here - the first load, a date
   * picked in the strip or the fare calendar, a modified search and Retry -
   * because each of those changes the URL, or the attempt count, this is keyed
   * on. Each run aborts the one before it and ignores anything that arrives
   * for it afterwards, so only the latest search can fill the results. A date
   * click used to move the selection and fire its own request with neither,
   * leaving the previous date's flights under the new date whenever that
   * request failed or lost the race.
   *
   * A failure is shown as one. The error used to be stored and never
   * rendered, so an outage, a timeout and a refused request all read
   * "No flights found" beside a "Reset All Filters" button.
   */
  useEffect(() => {
    if (!searchData) {
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    let cancelled = false;

    const runSearch = async () => {
      setLoading(true);
      setError(null);

      const payload = buildSearchPayload(searchData);
      if (!payload.from || !payload.to || !payload.departDate) {
        setFlights([]);
        setError('Please choose where you are flying from, where to, and the date.');
        setLoading(false);
        return;
      }

      try {
        const response = await fetch(apiConfig.endpoints.flights.search, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(payload),
          credentials: 'omit',
          signal: controller.signal
        });
        // A gateway timeout answers with an HTML page, not JSON.
        const body = await response.json().catch(() => null);
        if (cancelled) return;

        if (!response.ok || !body || body.success === false) {
          setFlights([]);
          setError(searchFailureMessage(response.status, body));
          return;
        }

        const flightData = transformFlightData(body.data || []);
        setFlights(flightData);

        // Build dynamic airline map from results
        const newAirlineMap = {};
        flightData.forEach(f => {
          if (f.airline?.code && f.airline?.name) newAirlineMap[f.airline.code] = f.airline.name;
          if (f.operatingCarrier && f.operatingAirlineName) newAirlineMap[f.operatingCarrier] = f.operatingAirlineName;
          if (f.segments) f.segments.forEach(s => {
            if (s.airline?.code && s.airline?.name) newAirlineMap[s.airline.code] = s.airline.name;
          });
        });
        setDynamicAirlineMap(prev => ({ ...prev, ...newAirlineMap }));
      } catch (err) {
        if (cancelled || err.name === 'AbortError') return;
        console.error('Flight search failed:', err);
        setFlights([]);
        setError(searchFailureMessage(null, null));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    runSearch();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [searchKey, searchAttempt]);

  // Keep the modify bar and filters in step with the resolved search,
  // whether it arrived as router state or in the URL.
  useEffect(() => {
    if (searchData) {
      setSearchParams(searchData);
    }
  }, [searchKey]);

  /**
   * Put the search on the URL when it arrived only as router state.
   *
   * Reading the URL alone fixes half the problem: it only helps once the URL
   * has criteria on it, which until now happened only if the user picked a
   * date in the strip. A search from the landing page left a bare
   * /flights/search, so refreshing it still lost everything.
   *
   * `replace` so the back button still returns to the search form rather than
   * to the same results under a different URL. The fetch is keyed on
   * `searchKey`, so the new router state this creates does not re-run it.
   */
  useEffect(() => {
    if (!searchData || location.search) return;
    navigate(`/flights/search?${searchToQuery(searchData)}`, {
      replace: true,
      state: location.state,
    });
  }, [searchKey, location.search]);

  // Dynamic airline names - populated from Amadeus API responses (no hardcoding)
  // The backend transform already resolves airline codes to names using Amadeus dictionaries.carriers
  // This map is only used as a fallback cache and gets populated dynamically from search results
  const [dynamicAirlineMap, setDynamicAirlineMap] = useState({});

  // City code to name mapping - Generated from comprehensive airports database
  const cityMap = useMemo(() => allAirports.reduce((acc, airport) => {
    acc[airport.code] = airport.name;
    return acc;
  }, {}), []);

  // No static mappings needed - all airports are handled dynamically from airports.js


  // Dynamic aircraft names - populated from Amadeus API responses (no hardcoding)
  // The backend transform already resolves aircraft codes to names using Amadeus dictionaries.aircraft
  const [dynamicAircraftMap, setDynamicAircraftMap] = useState({});

  // Transform Amadeus API flight data to our format
  const transformFlightData = (data) => {
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
            time: new Date(firstSegment.departure.at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            date: new Date(firstSegment.departure.at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
            rawDate: firstSegment.departure.at?.split('T')[0] || firstSegment.departure.at,
            airport: firstSegment.departure.iataCode,
            terminal: firstSegment.departure.terminal || '',
            cityName: cityMap[firstSegment.departure.iataCode] || firstSegment.departure.iataCode
          },
          arrival: {
            time: new Date(lastSegment.arrival.at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            date: new Date(lastSegment.arrival.at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
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
              time: new Date(segment.departure.at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
              airport: segment.departure.iataCode,
              terminal: segment.departure.terminal || '',
              cityName: cityMap[segment.departure.iataCode] || segment.departure.iataCode,
              at: segment.departure.at
            },
            arrival: {
              time: new Date(segment.arrival.at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
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
            date: new Date(flight.departure.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
            rawDate: flight.departure.date,
            airport: flight.departure.airport,
            terminal: flight.departure.terminal || '',
            cityName: cityMap[flight.departure.airport] || flight.departure.airport
          },
          arrival: {
            time: flight.arrival.time,
            date: new Date(flight.arrival.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
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
            if (origSegs && origSegs.length > 1) {
              return origSegs.map(segment => ({
                departure: {
                  time: new Date(segment.departure.at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
                  airport: segment.departure.iataCode,
                  terminal: segment.departure.terminal || '',
                  cityName: cityMap[segment.departure.iataCode] || segment.departure.iataCode,
                  at: segment.departure.at
                },
                arrival: {
                  time: new Date(segment.arrival.at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
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
          // Return leg (round trips) — built from the second Amadeus itinerary
          isRoundTrip: (flight.originalOffer?.itineraries?.length || 1) > 1,
          returnLeg: (() => {
            const itin = flight.originalOffer?.itineraries?.[1];
            const segs = itin?.segments;
            if (!segs || segs.length === 0) return null;
            const first = segs[0];
            const last = segs[segs.length - 1];
            const stopDetails = segs.slice(0, -1).map((seg, idx) => {
              const next = segs[idx + 1];
              const ms = new Date(next.departure.at) - new Date(seg.arrival.at);
              const h = Math.floor(ms / 3600000);
              const m = Math.floor((ms % 3600000) / 60000);
              return { airport: seg.arrival.iataCode, duration: `${h}h ${m}m` };
            });
            return {
              departure: {
                time: new Date(first.departure.at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
                airport: first.departure.iataCode,
                terminal: first.departure.terminal || '',
                cityName: cityMap[first.departure.iataCode] || first.departure.iataCode,
              },
              arrival: {
                time: new Date(last.arrival.at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
                airport: last.arrival.iataCode,
                terminal: last.arrival.terminal || '',
                cityName: cityMap[last.arrival.iataCode] || last.arrival.iataCode,
              },
              duration: itin.duration,
              stops: segs.length - 1,
              stopDetails,
              airline: {
                code: first.carrierCode,
                name: dynamicAirlineMap[first.carrierCode] || first.carrierCode,
                logo: `https://pics.avs.io/200/200/${first.carrierCode.toUpperCase()}.png`,
              },
              segments: segs.map(segment => ({
                departure: {
                  time: new Date(segment.departure.at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
                  airport: segment.departure.iataCode,
                  terminal: segment.departure.terminal || '',
                  cityName: cityMap[segment.departure.iataCode] || segment.departure.iataCode,
                  at: segment.departure.at,
                },
                arrival: {
                  time: new Date(segment.arrival.at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
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
                duration: segment.duration,
                flightNumber: `${segment.carrierCode} ${segment.number}`,
                aircraft: dynamicAircraftMap[segment.aircraft?.code] || segment.aircraft?.code || 'Unknown Aircraft',
                stops: 0,
              })),
            };
          })(),
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
            date: new Date(flight.departure.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
            rawDate: flight.departure.date,
            airport: flight.departure.airport,
            terminal: flight.departure.terminal || '',
            cityName: cityMap[flight.departure.airport] || flight.departure.airport
          },
          arrival: {
            time: flight.arrival.time,
            date: new Date(flight.arrival.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
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


  /**
   * A search from the modify bar.
   *
   * It goes onto the URL and the keyed fetch above runs it, like every other
   * search on this page. It used to fetch by itself: it sent the field's label,
   * "New Delhi (DEL)", which the server matched to New York; it left the URL
   * naming the previous search, so a refresh ran that one again; and it never
   * rebuilt the date strip, whose fares stayed the old passengers' and cabin's.
   */
  const handleSearch = (formData) => {
    const from = fieldCode(formData.from, formData.fromCode);
    const to = fieldCode(formData.to, formData.toCode);
    const isIata = (code) => /^[A-Z]{3}$/.test(code);
    const next = {
      ...formData,
      from,
      to,
      fromCode: isIata(from) ? from : undefined,
      toCode: isIata(to) ? to : undefined,
    };

    // The same search again still searches again. The fetch is keyed on the
    // criteria, so an unchanged search needs its attempt counted to re-run.
    const isSameSearch = searchKeyOf(next) === searchKey;
    if (isSameSearch) setSearchAttempt((n) => n + 1);
    navigate(`/flights/search?${searchToQuery(next)}`, {
      replace: isSameSearch,
      state: { searchData: next },
    });
  };

  // Handle filter changes
  const handleFilterChange = useCallback((filterType, value) => {
    setFilters(prev => ({
      ...prev,
      [filterType]: value
    }));
  }, []);


  // Helper to get a reliable numeric price for filtering
  // Returns the price converted to the user's display currency so filters match what the user sees
  const getFlightPriceAmount = (flight) => {
    if (!flight || !flight.price) return 0;
    let amount = flight.price.amount;
    if (typeof amount === 'string') {
      amount = parseFloat(amount.replace(/,/g, ''));
    }
    if (typeof amount !== 'number' || Number.isNaN(amount)) {
      const total = flight.price.total;
      if (typeof total === 'string') {
        amount = parseFloat(total.replace(/,/g, ''));
      } else if (typeof total === 'number') {
        amount = total;
      }
    }
    if (!Number.isFinite(amount)) return 0;

    // Convert from source currency (API) to user's display currency
    const sourceCurrency = flight.price.currency || 'USD';
    const targetCurrency = currencyService.getCurrency();
    if (sourceCurrency !== targetCurrency) {
      // Convert source → USD → target
      const usdAmount = sourceCurrency === 'USD' ? amount : amount / (currencyService.getExchangeRate(sourceCurrency) || 1);
      amount = currencyService.convertPrice(usdAmount, targetCurrency);
    }
    return Math.round(amount);
  };

  // Dynamically compute price range bounds from current flights
  const [priceRangeBounds, setPriceRangeBounds] = useState({ min: 0, max: 50000 });

  // A layout effect, so the price filter is settled in the same pass as the
  // flights it is derived from, before anything is painted. As a plain effect
  // it landed one render later, and that second filter change set off the
  // back-to-page-1 reset below: whoever reached page 2 or 3 in that moment was
  // thrown back to page 1. CI's slower runner hit it every time.
  //
  // Again when the display currency changes: the prices the filter compares
  // are converted into it.
  useLayoutEffect(() => {
    if (flights && flights.length > 0) {
      const prices = flights.map(f => getFlightPriceAmount(f)).filter(p => p > 0);
      if (prices.length > 0) {
        const maxPrice = Math.ceil(Math.max(...prices) / 500) * 500;  // round up to nearest 500
        setPriceRangeBounds({ min: 0, max: maxPrice });
        // Auto-set filter: 0 to max so all flights show initially
        setFilters(prev => ({
          ...prev,
          price: [0, maxPrice]
        }));
      }
    }
  }, [flights, displayCurrency]);

  // Every filter cleared, and the price back to the whole range of these
  // results - never a fixed figure in some currency (searchResults.js).
  const handleResetAllFilters = useCallback(() => {
    setFilters(filtersWithin(priceRangeBounds));
  }, [priceRangeBounds]);

  // Apply filters and sort (memoized — only recomputes when flights/filters/sort actually change)
  const filteredFlights = useMemo(() => {
    if (!flights || !Array.isArray(flights)) return [];
    const filtered = flights.filter((flight) => matchesFilters(flight, filters, getFlightPriceAmount));
    return sortFlights(filtered, sortOrder);
  }, [flights, filters, sortOrder, displayCurrency]);

  // Back to page 1 whenever the list changes under the pager. It kept its
  // page, so on page 3, filtering down to 15 flights showed an empty page
  // reading "No flights found".
  useEffect(() => {
    setCurrentPage(1);
  }, [flights, filters, sortOrder]);

  // Price distribution across current results — powers the per-card deal badge
  const priceStats = useMemo(() => {
    const ps = filteredFlights
      .map(f => f.price?.amount)
      .filter(n => typeof n === 'number' && n > 0)
      .sort((a, b) => a - b);
    if (ps.length < 3) return null;
    return { min: ps[0], median: ps[Math.floor(ps.length / 2)] };
  }, [filteredFlights]);

  // Move the date strip a week either way. Nothing is searched until a date is
  // picked, so no date in the new week is marked as the one searched.
  const handleDateNavigate = (direction) => {
    if (dateRange.length === 0) return;
    const newDates = shiftDateStrip(dateRange, direction * 7, { selectedIso: searchData?.departDate });
    setDateRange(newDates);
    // Refresh lowest fares for the newly visible week
    if (searchData) loadDatePrices(searchData, newDates.map(d => d.isoDate));
  };

  /**
   * A date picked in the strip or the fare calendar.
   *
   * It only changes the URL - the whole search, so a refresh keeps the same
   * passengers and cabin - and the keyed fetch above runs it. The strip, the
   * results and the address bar move together, and a slow or failed answer
   * cannot leave one date's flights under another date.
   */
  const handleDateSelect = (selectedDate) => {
    if (!selectedDate || selectedDate.isPast || !searchData) return;
    const next = { ...searchData, departDate: selectedDate.isoDate };
    navigate(`/flights/search?${searchToQuery(next)}`, {
      replace: true,
      state: { searchData: next }
    });
  };

  // Toggle an airline in the filter
  const toggleAirlineFilter = useCallback((airline) => {
    setFilters(prev => {
      const updatedAirlines = prev.airlines.includes(airline)
        ? prev.airlines.filter(a => a !== airline)
        : [...prev.airlines, airline];
      return { ...prev, airlines: updatedAirlines };
    });
  }, []);

  // Aggregate airline stats once per flight-list change (count + minPrice per airline)
  const airlineStats = useMemo(() => {
    const stats = new Map();
    if (!flights || flights.length === 0) return stats;
    flights.forEach(f => {
      const name = f.airline?.name || f.airline;
      if (!name) return;
      const price = f.price?.amount ?? 0;
      const existing = stats.get(name);
      if (existing) {
        existing.count += 1;
        if (price < existing.minPrice) existing.minPrice = price;
      } else {
        stats.set(name, { count: 1, minPrice: price });
      }
    });
    return stats;
  }, [flights]);

  const allAirlines = useMemo(
    () => Array.from(airlineStats.keys()).sort(),
    [airlineStats]
  );

  // Toggle a departure/arrival airport in the filter
  const toggleAirportFilter = useCallback((type, code) => {
    const key = type === 'origin' ? 'originAirports' : 'destAirports';
    setFilters(prev => {
      const list = prev[key] || [];
      const updated = list.includes(code) ? list.filter(c => c !== code) : [...list, code];
      return { ...prev, [key]: updated };
    });
  }, []);

  // Aggregate distinct origin/destination airports from results (with counts)
  const airportStats = useMemo(() => {
    const origins = new Map();
    const dests = new Map();
    (flights || []).forEach(f => {
      const o = f.departure?.airport;
      const d = f.arrival?.airport;
      if (o) origins.set(o, { code: o, city: f.departure?.cityName || o, count: (origins.get(o)?.count || 0) + 1 });
      if (d) dests.set(d, { code: d, city: f.arrival?.cityName || d, count: (dests.get(d)?.count || 0) + 1 });
    });
    return {
      origins: Array.from(origins.values()).sort((a, b) => b.count - a.count),
      dests: Array.from(dests.values()).sort((a, b) => b.count - a.count),
    };
  }, [flights]);

  // Handle booking a flight
  const handleBookFlight = useCallback((flight) => {
    navigate('/flights/booking-confirmation', {
      state: {
        flightData: flight,
        searchData: searchParams
      }
    });
  }, [navigate, searchParams]);

  // Open the branded-fare options modal for a flight
  const handleViewPrices = useCallback((flight) => {
    setFareFlight(flight);
  }, []);

  // Fetch lowest fare per day for the date strip. Only the latest request may
  // write, or paging weeks quickly lets an earlier week's answer land last.
  const datePricesRequest = useRef(0);
  const loadDatePrices = useCallback(async (sp, isoDates) => {
    if (!sp || !Array.isArray(isoDates) || isoDates.length === 0) return;
    const { from, to, adults, children, infants, travelClass } = buildSearchPayload(sp);
    if (!from || !to) return;
    const requestId = ++datePricesRequest.current;
    try {
      const res = await fetch(apiConfig.endpoints.flights.datePrices, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, dates: isoDates, adults, children, infants, travelClass }),
      });
      const data = await res.json();
      if (requestId !== datePricesRequest.current) return;
      if (data.success && data.dateWisePrices) {
        setDateRange(prev => prev.map(d => {
          const price = data.dateWisePrices[d.isoDate];
          return {
            ...d,
            price: price != null ? price : d.price,
            currency: price != null ? (data.currency || 'USD') : d.currency,
            isLowestPrice: data.lowestPrice != null && price === data.lowestPrice,
          };
        }));
      }
    } catch {
      /* date strip simply shows no prices on failure */
    }
  }, []);

  const paginatedData = useMemo(() => {
    const totalItems = filteredFlights.length;
    const totalPages = Math.ceil(totalItems / flightsPerPage);
    const startIndex = (currentPage - 1) * flightsPerPage;
    const endIndex = Math.min(startIndex + flightsPerPage, totalItems);
    const currentItems = filteredFlights.slice(startIndex, endIndex);

    return {
      currentItems,
      totalPages,
      totalItems,
      currentPage,
      startIndex,
      endIndex
    };
  }, [filteredFlights, currentPage, flightsPerPage]);

  const getPaginatedData = () => paginatedData;

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
    // Scroll to top when changing pages
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const { currentItems, totalPages, totalItems, startIndex, endIndex } = getPaginatedData();

  // Resolve readable origin/destination city names for the results header
  const extractRouteCode = (str) => {
    if (!str) return '';
    const match = str.match?.(/\(([A-Z]{3})\)$/);
    if (match) return match[1];
    if (/^[A-Z]{3}$/.test(String(str).trim())) return String(str).trim();
    return str;
  };
  const fromCode = searchParams.fromCode || extractRouteCode(searchParams.from);
  const toCode = searchParams.toCode || extractRouteCode(searchParams.to);
  const fromCityName = cityMap[fromCode] || String(searchParams.from || '').replace(/\s*\([A-Z]{3}\)$/, '') || fromCode;
  const toCityName = cityMap[toCode] || String(searchParams.to || '').replace(/\s*\([A-Z]{3}\)$/, '') || toCode;

  return (
    <div className="bg-gray-100 min-h-screen">
      <Navbar />



      {/* Compact modify-search bar (MakeMyTrip-style) */}
      <FlightModifyBar
        searchParams={searchParams}
        cityMap={cityMap}
        onSearch={handleSearch}
        openTravellers={openTravellers}
      />

      {/* Date Navigation Bar */}
      <div className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-20">
        <div className="container mx-auto max-w-6xl px-4 py-3">
          {/* Date selector */}
          <div className="flex items-center justify-center bg-white rounded-lg relative">
            <button
              onClick={() => handleDateNavigate(-1)}
              className="text-gray-600 hover:text-gray-800 p-2 rounded-full hover:bg-gray-100 transition-all flex-shrink-0"
              aria-label="Previous week"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>

            <div className="flex items-center justify-center space-x-2 overflow-x-auto hide-scrollbar mx-4">
              {dateRange.map((date, index) => (
                <button
                  key={index}
                  onClick={() => !date.isPast && handleDateSelect(date)}
                  disabled={date.isPast}
                  className={`
                      date-button flex flex-col items-center p-2 rounded-lg min-w-[80px]
                      ${date.selected ? 'selected bg-[#055B75] text-white shadow-md' : 'hover:bg-[#F0FAFC]'}
                      ${date.isWeekend && !date.selected ? 'text-[#055B75]' : ''}
                      ${date.isLowestPrice && !date.selected ? 'border border-[#65B3CF] bg-[#F0FAFC]' : ''}
                      ${date.isPast ? 'opacity-50 cursor-not-allowed' : ''}
                    `}
                >
                  <span className={`text-sm font-medium ${date.selected ? 'text-blue-100' : ''}`}>
                    {date.day}
                  </span>
                  <span className={`text-lg font-bold ${date.selected ? 'text-white' : ''}`}>
                    {date.date}
                  </span>
                  {date.price && (
                    <span className="price text-sm font-medium">
                      <Price amount={{ amount: date.price, currency: date.currency || 'USD' }} />
                      {date.isLowestPrice && !date.selected && (
                        <span className="ml-1 text-xs">↓</span>
                      )}
                    </span>
                  )}
                </button>
              ))}
            </div>

            <button
              onClick={() => handleDateNavigate(1)}
              className="text-gray-600 hover:text-gray-800 p-2 rounded-full hover:bg-gray-100 transition-all flex-shrink-0"
              aria-label="Next week"
            >
              <ChevronRight className="h-6 w-6" />
            </button>

            <button
              onClick={() => setShowFareCalendar(true)}
              className="hidden sm:inline-flex items-center gap-1.5 ml-2 px-3 py-2 rounded-lg border border-[#B9D0DC] text-[#055B75] text-xs font-semibold hover:bg-[#F0FAFC] transition-colors flex-shrink-0"
            >
              <Calendar className="h-4 w-4" />
              Fare Calendar
            </button>
          </div>
        </div>
      </div>

      <div className="bg-[#F0FAFC] min-h-screen pb-12 pt-6">
        <div className="container mx-auto max-w-6xl px-4">
          {/* Route header */}
          <div className="mb-4">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
              Flights from {fromCityName} <span className="text-gray-400 font-normal">to</span> {toCityName}
            </h1>
            {!loading && !error && (
              <p className="text-sm text-gray-500 mt-0.5">
                <span className="font-semibold text-[#055B75]">{totalItems}</span> flight{totalItems !== 1 ? 's' : ''} found
              </p>
            )}
          </div>

          {/* The promotional strip that sat here advertised "Price Drop
              Protection", "Extra 10% off with VISA cards" and a "Flat 10%
              Instant Discount". None of them existed: no product, no discount
              logic, nothing a customer could claim. */}

          {loading ? (
            <div className="flex flex-col justify-center items-center py-20 bg-white rounded-xl shadow-md min-h-[400px]">
              <LoadingSpinner text="Searching for the best flights..." />
              <p className="text-gray-400 text-sm mt-2">Comparing prices from over 500+ airlines</p>
            </div>
          ) : error ? (
            <div role="alert" className="bg-white rounded-xl shadow-md p-10 sm:p-12 text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-amber-50 mb-6">
                <AlertTriangle className="h-10 w-10 text-amber-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-3">We couldn't search these flights</h3>
              <p className="text-gray-600 mb-8 max-w-md mx-auto">{error}</p>
              <button
                type="button"
                onClick={() => setSearchAttempt((n) => n + 1)}
                className="px-6 py-3 bg-[#055B75] text-white rounded-lg font-medium hover:bg-[#034457] transition-colors"
              >
                <RefreshCw className="h-4 w-4 mr-2 inline" />
                Retry
              </button>
            </div>
          ) : (
            <div className="flex flex-col md:flex-row gap-6">
              <FlightFilterSidebar
                filters={filters}
                priceRangeBounds={priceRangeBounds}
                airlines={allAirlines}
                airlineStats={airlineStats}
                airportStats={airportStats}
                onFilterChange={handleFilterChange}
                onToggleAirline={toggleAirlineFilter}
                onToggleAirport={toggleAirportFilter}
                onResetAll={handleResetAllFilters}
              />

              {/* Results */}
              <div className="flex-1 min-w-0">
                {/* Mobile: single-line filter + sort bar */}
                <FlightMobileSortFilter
                  filters={filters}
                  priceRangeBounds={priceRangeBounds}
                  sortOrder={sortOrder}
                  onSortChange={setSortOrder}
                  onOpenFilters={() => setShowMobileFilters(true)}
                />

                {/* Applied filter chips (desktop) */}
                <div className="hidden md:block">
                  <FlightAppliedFilters
                    filters={filters}
                    priceRangeBounds={priceRangeBounds}
                    onFilterChange={handleFilterChange}
                    onToggleAirline={toggleAirlineFilter}
                    onToggleAirport={toggleAirportFilter}
                    onResetAll={handleResetAllFilters}
                  />
                </div>

                {/* Sort tabs (desktop): Cheapest / Non Stop First / You May Prefer / Other */}
                <div className="hidden md:block">
                  <FlightSortTabs
                    flights={filteredFlights}
                    sortOrder={sortOrder}
                    onSortChange={setSortOrder}
                  />
                </div>

                {/* Result count subtitle */}
                <div className="flex items-center justify-between mb-3 px-1">
                  <p className="text-xs text-gray-500">
                    Showing <span className="font-semibold text-gray-700">{totalItems === 0 ? 0 : startIndex + 1}–{endIndex}</span> of {totalItems}
                    {sortOrder === 'price' && ' · sorted by lowest fare'}
                    {sortOrder === 'recommended' && ' · recommended for you'}
                    {sortOrder === 'nonstop_first' && ' · non-stop first'}
                    {sortOrder === 'duration' && ' · fastest first'}
                  </p>
                </div>

                {/* Flight Cards */}
                {currentItems.length === 0 ? (
                  <div className="bg-white rounded-xl shadow-md p-12 text-center">
                    <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-[#F0FAFC] mb-8 animate-bounce-gentle">
                      <Plane className="h-12 w-12 text-[#055B75]" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-800 mb-4">No flights found</h3>
                    <p className="text-gray-600 mb-8 max-w-md mx-auto">We couldn't find any flights matching your criteria. Try adjusting your search filters or dates.</p>
                    <button
                      onClick={handleResetAllFilters}
                      className="px-6 py-3 bg-[#055B75] text-white rounded-lg font-medium hover:bg-[#034457] transition-colors"
                    >
                      <X className="h-4 w-4 mr-2 inline" />
                      Reset All Filters
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {currentItems.map((flight, index) => (
                      <FlightCard
                        key={flight.id ?? index}
                        flight={flight}
                        onBook={handleBookFlight}
                        onViewPrices={handleViewPrices}
                        priceStats={priceStats}
                        cityMap={cityMap}
                      />
                    ))}
                  </div>
                )}

                {/* Enhanced Pagination */}
                <div className="mt-8 flex flex-col items-center">
                  <div className="text-sm text-gray-600 mb-4">
                    Showing {startIndex + 1} to {endIndex} of {totalItems} flights
                  </div>
                  <nav className="inline-flex items-center gap-1 bg-white rounded-lg p-2 border border-gray-200 shadow-sm">
                    <button
                      onClick={() => handlePageChange(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="p-2 rounded-md text-gray-500 hover:bg-[#F0FAFC] hover:text-[#055B75] transition-colors disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-gray-500"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>

                    {[...Array(totalPages)].map((_, idx) => {
                      const pageNumber = idx + 1;
                      const isCurrentPage = pageNumber === currentPage;

                      // Show first page, last page, and pages around current page
                      if (
                        pageNumber === 1 ||
                        pageNumber === totalPages ||
                        (pageNumber >= currentPage - 1 && pageNumber <= currentPage + 1)
                      ) {
                        return (
                          <button
                            key={pageNumber}
                            onClick={() => handlePageChange(pageNumber)}
                            className={`w-9 h-9 rounded-md font-medium flex items-center justify-center transition-all ${isCurrentPage
                              ? 'bg-[#055B75] text-white shadow-md'
                              : 'text-gray-700 hover:bg-[#F0FAFC] hover:text-[#055B75]'
                              }`}
                          >
                            {pageNumber}
                          </button>
                        );
                      }

                      // Show ellipsis for skipped pages
                      if (
                        (pageNumber === 2 && currentPage > 3) ||
                        (pageNumber === totalPages - 1 && currentPage < totalPages - 2)
                      ) {
                        return (
                          <span
                            key={pageNumber}
                            className="w-9 h-9 flex items-center justify-center text-gray-400"
                          >
                            ...
                          </span>
                        );
                      }

                      return null;
                    })}

                    <button
                      onClick={() => handlePageChange(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="p-2 rounded-md text-gray-500 hover:bg-[#F0FAFC] hover:text-[#055B75] transition-colors disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-gray-500"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </nav>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Fare calendar (month grid) */}
      {showFareCalendar && (
        <FlightFareCalendar
          searchParams={searchParams}
          initialDate={dateRange.find(d => d.selected)?.isoDate || searchParams.departDate}
          selectedDate={dateRange.find(d => d.selected)?.isoDate || searchParams.departDate}
          onSelectDate={(isoDate) => handleDateSelect({ isoDate, isPast: false })}
          onClose={() => setShowFareCalendar(false)}
        />
      )}

      {/* Mobile filter drawer */}
      {showMobileFilters && (
        <div className="fixed inset-0 z-[150] md:hidden flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowMobileFilters(false)} />
          <div className="relative ml-auto w-[88%] max-w-sm h-full bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
              <span className="text-sm font-bold text-gray-800 uppercase tracking-wide">Filters &amp; Sort</span>
              <button onClick={() => setShowMobileFilters(false)} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              <FlightFilterSidebar
                variant="mobile"
                filters={filters}
                priceRangeBounds={priceRangeBounds}
                airlines={allAirlines}
                airlineStats={airlineStats}
                airportStats={airportStats}
                onFilterChange={handleFilterChange}
                onToggleAirline={toggleAirlineFilter}
                onToggleAirport={toggleAirportFilter}
                onResetAll={handleResetAllFilters}
              />
            </div>
            <div className="p-3 border-t border-gray-100 flex-shrink-0">
              <button
                onClick={() => setShowMobileFilters(false)}
                className="w-full py-3 rounded-lg bg-[#055B75] text-white font-bold text-sm"
              >
                Show {totalItems} flights
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Branded-fare options modal (opened by VIEW PRICES) */}
      {fareFlight && (
        <FlightFareOptions
          flight={fareFlight}
          onClose={() => setFareFlight(null)}
          onSelect={(chosenFlight) => {
            setFareFlight(null);
            handleBookFlight(chosenFlight);
          }}
        />
      )}

      <Footer />
    </div>
  )
}

export default withPageElements(FlightSearchPage);

