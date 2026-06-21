 
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Link, useSearchParams, useNavigate, useLocation } from "react-router-dom";
import { Plane, Calendar, Users, ArrowRight, X, Search, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Clock, Filter, ArrowUpDown, MapPin, Luggage, Sun, Sunrise, Sunset, Moon, ShieldCheck, RefreshCw, Briefcase } from "lucide-react";
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
import { getTodayDate, getSafeDate } from "../../../utils/dateUtils";

// Import centralized API configuration
import apiConfig from '@/config/api';
import LoadingSpinner from '../../../Components/LoadingSpinner';
import FlightCard from './FlightCard';
import FlightFilterSidebar from './FlightFilterSidebar';
import FlightModifyBar from './FlightModifyBar';
import FlightSortTabs from './FlightSortTabs';
import FlightFareOptions from './FlightFareOptions';
import FlightAppliedFilters from './FlightAppliedFilters';
import FlightFareCalendar from './FlightFareCalendar';
import { computeBounds, recommendScore } from './flightSort';

function FlightSearchPage() {
  const location = useLocation();
  const searchData = location.state?.searchData;
  const apiResponse = location.state?.apiResponse;

  console.log('searchData:', searchData);

  // const location = useLocation();
  const navigate = useNavigate();
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
  const [filters, setFilters] = useState({
    price: [0, 50000],
    stops: "any",
    airlines: [],
    departureTime: "any", // any, early_morning, morning, afternoon, evening, night
    baggage: "any", // any, included, cabin_only
    refundable: "any", // any, yes, no
    originAirports: [], // filter by specific departure airport(s)
    destAirports: [] // filter by specific arrival airport(s)
  });
  const [error, setError] = useState(null);
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

  // Generate date range based on current date
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    const generateDateRange = (centerDate) => {
      const dates = [];
      // Ensure we work with local noon to avoid timezone shifts
      const baseDate = centerDate instanceof Date ? centerDate : getSafeDate(centerDate);

      // Generate 3 days before and after the selected date
      for (let i = -3; i <= 3; i++) {
        const date = new Date(baseDate);
        date.setDate(baseDate.getDate() + i);

        const formattedDate = date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric'
        });

        const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });

        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        const isoDate = `${y}-${m}-${d}`;

        dates.push({
          date: formattedDate,
          day: dayName,
          isoDate: isoDate,
          price: null,
          selected: i === 0,
          isWeekend: [0, 6].includes(date.getDay()),
          isPast: isoDate < getTodayDate()
        });
      }

      return dates;
    };

    const initializeDates = () => {
      const searchDate = location.state?.searchData?.departDate;
      const centerDate = searchDate ? getSafeDate(searchDate) : new Date();
      const dates = generateDateRange(centerDate);
      setDateRange(dates);
    };

    // Initialize dates
    initializeDates();

    // Fetch flight data if search parameters are available
    const fetchInitialFlights = async () => {
      if (location.state?.searchData) {
        setLoading(true);
        setError(null);
        try {
          console.log('Fetching flights with search data:', location.state.searchData);

          // Ensure all required fields are present
          // Helper to extract code from string like "City (CODE)"
          const extractCode = (str) => {
            const match = str && str.match(/\(([A-Z]{3})\)$/);
            return match ? match[1] : str;
          };

          const sd = location.state.searchData;
          const searchData = {
            from: extractCode(sd.from),
            to: extractCode(sd.to),
            departDate: sd.departDate,
            returnDate: sd.returnDate,
            adults: parseInt(sd.adults) || parseInt(sd.travelers) || 1,
            children: parseInt(sd.children) || 0,
            infants: parseInt(sd.infants) || 0,
            travelClass: sd.travelClass || 'ECONOMY',
            max: 50
          };

          // Apply initial filters if passed in state (e.g. from a previous search or deep link)
          if (sd.maxPrice) searchData.maxPrice = sd.maxPrice;
          if (sd.nonStop) searchData.nonStop = sd.nonStop;
          if (sd.includedAirlineCodes) searchData.includedAirlineCodes = sd.includedAirlineCodes;
          if (sd.excludedAirlineCodes) searchData.excludedAirlineCodes = sd.excludedAirlineCodes;

          // Validate required fields
          if (!searchData.from || !searchData.to || !searchData.departDate) {
            throw new Error('Missing required fields: from, to, and departDate are required');
          }

          // Remove returnDate if it's empty
          if (!searchData.returnDate) {
            delete searchData.returnDate;
          }

          // Use API endpoint from centralized config
          const apiUrl = apiConfig.endpoints.flights.search;
          console.log('Making API request to:', apiUrl);

          const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            body: JSON.stringify(searchData),
            credentials: 'omit',
            signal: controller.signal
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
          }

          const data = await response.json();
          if (cancelled) return;
          console.log('API response received:', data);

          if (!data.success && !data.data) {
            throw new Error(data.error || 'Failed to fetch flights');
          }

          if (data.data && data.data.length === 0) {
            console.log('No flights found for the given search criteria');
            setFlights([]);
          } else {
            // Transform flight data
            const flightData = transformFlightData(data.data || []);
            console.log('Transformed flight data:', flightData);
            setFlights(flightData);

            // Build dynamic airline/aircraft maps from results
            const newAirlineMap = {};
            const newAircraftMap = {};
            flightData.forEach(f => {
              if (f.airline?.code && f.airline?.name) newAirlineMap[f.airline.code] = f.airline.name;
              if (f.operatingCarrier && f.operatingAirlineName) newAirlineMap[f.operatingCarrier] = f.operatingAirlineName;
              if (f.segments) f.segments.forEach(s => {
                if (s.airline?.code && s.airline?.name) newAirlineMap[s.airline.code] = s.airline.name;
                if (s.aircraft && typeof s.aircraft === 'string' && s.aircraft !== 'Unknown Aircraft') {
                  // aircraft is already a resolved name from backend
                }
              });
            });
            setDynamicAirlineMap(prev => ({ ...prev, ...newAirlineMap }));
            setDynamicAircraftMap(prev => ({ ...prev, ...newAircraftMap }));

            // Update prices in the date range
            if (data.data?.dateWisePrices) {
              setDateRange(prev =>
                prev.map(d => ({
                  ...d,
                  price: data.data.dateWisePrices?.[d.isoDate] || null,
                  isLowestPrice: data.data.lowestPrice && data.data.dateWisePrices?.[d.isoDate] === data.data.lowestPrice
                }))
              );
            }
          }
        } catch (error) {
          if (cancelled || error.name === 'AbortError') return;
          console.error('Error fetching initial flights:', error);
          setFlights([]);
          setError(error.message);
        } finally {
          if (!cancelled) setLoading(false);
        }
      } else {
        setLoading(false);
      }
    };

    fetchInitialFlights();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [location.state]);

  // Update search params when location state changes
  useEffect(() => {
    if (location.state?.searchData) {
      setSearchParams(location.state.searchData);
    }
  }, [location.state]);

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
          baggage: {
            checked: fareDetails?.includedCheckedBags || { weight: 0, weightUnit: 'KG' },
            cabin: fareDetails?.includedCabinBags || { weight: 0, weightUnit: 'KG' }
          },
          cabin: fareDetails?.cabin || 'ECONOMY',
          class: fareDetails?.class || 'ECONOMY',
          brandedFare: fareDetails?.brandedFare || null,
          brandedFareLabel: fareDetails?.brandedFareLabel || null,
          operatingCarrier: firstSegment.operating?.carrierCode || null,
          operatingAirlineName: firstSegment.operating?.carrierCode ? (dynamicAirlineMap[firstSegment.operating.carrierCode] || firstSegment.operating.carrierCode) : null,
          lastTicketingDate: flight.lastTicketingDate || null,
          numberOfBookableSeats: flight.numberOfBookableSeats || null,
          isUpsellOffer: flight.isUpsellOffer || false,
          refundable: travelerPricing?.price?.refundableTaxes ? true : false,
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
            checked: flight.baggageDetails?.checked || { weight: parseInt(flight.baggage) || 0, weightUnit: 'KG' },
            cabin: flight.baggageDetails?.cabin || { weight: 0, weightUnit: 'KG' }
          },
          cabin: flight.cabin || 'ECONOMY',
          class: flight.cabin || 'ECONOMY',
          brandedFare: flight.brandedFare || null,
          brandedFareLabel: flight.brandedFareLabel || null,
          operatingCarrier: flight.operatingCarrier || null,
          operatingAirlineName: flight.operatingAirlineName || null,
          lastTicketingDate: flight.lastTicketingDate || null,
          numberOfBookableSeats: flight.numberOfBookableSeats || null,
          isUpsellOffer: flight.isUpsellOffer || false,
          aircraft: flight.aircraft || 'Unknown',
          flightNumber: flight.flightNumber,
          refundable: flight.refundable || false,
          amenities: flight.amenities || flight.originalOffer?.travelerPricings?.[0]?.fareDetailsBySegment?.[0]?.amenities || [],
          fareBasis: flight.fareBasis || null,
          bookingClass: flight.bookingClass || null,
          validatingAirlineCodes: flight.validatingAirlineCodes || [],
          seats: flight.numberOfBookableSeats || flight.seats || 'Available',
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
            // Single segment fallback
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
          stops: flight.stops || 0,
          price: {
            amount: flight.price.amount,
            total: flight.price.total,
            currency: flight.price.currency || currencyService.getCurrency(),
            base: flight.price.base || '0',
            grandTotal: flight.price.grandTotal || flight.price.total,
            fees: flight.price.fees || []
          },
          amenities: [],
          baggage: {
            checked: flight.baggageDetails?.checked || { weight: parseInt(flight.baggage) || 0, weightUnit: 'KG' },
            cabin: flight.baggageDetails?.cabin || { weight: 0, weightUnit: 'KG' }
          },
          cabin: flight.cabin || 'Economy',
          class: flight.cabin || 'Economy',
          brandedFare: flight.brandedFare || null,
          brandedFareLabel: flight.brandedFareLabel || null,
          operatingCarrier: flight.operatingCarrier || null,
          operatingAirlineName: flight.operatingAirlineName || null,
          lastTicketingDate: flight.lastTicketingDate || null,
          numberOfBookableSeats: flight.numberOfBookableSeats || null,
          isUpsellOffer: flight.isUpsellOffer || false,
          aircraft: flight.aircraft || 'Unknown',
          flightNumber: flight.flightNumber,
          refundable: flight.refundable || false,
          seats: flight.numberOfBookableSeats || flight.seats || 0,
          stopDetails: flight.stopDetails || [],
          segments: [{
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


  // Handle search form submission
  const handleSearch = async (formData) => {
    setLoading(true);
    setSearchParams(formData);
    setError(null);

    try {
      // Use API endpoint from centralized config
      const apiUrl = apiConfig.endpoints.flights.search;

      // Add filters to payload
      const payload = {
        from: formData.from,
        to: formData.to,
        departDate: formData.departDate,
        returnDate: formData.returnDate,
        adults: parseInt(formData.adults) || parseInt(formData.travelers) || 1,
        children: parseInt(formData.children) || 0,
        infants: parseInt(formData.infants) || 0,
        travelClass: formData.travelClass || 'ECONOMY',
        max: 50,
        maxPrice: formData.maxPrice || (filters.price[1] < 50000 ? filters.price[1] : undefined),
        nonStop: filters.stops === '0',
        includedAirlineCodes: formData.includedAirlineCodes || undefined,
        excludedAirlineCodes: formData.excludedAirlineCodes || undefined,
      };

      // Remove returnDate if it's empty
      if (!payload.returnDate) {
        delete payload.returnDate;
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch flights');
      }

      const flightData = transformFlightData(data.data);
      setFlights(flightData);

      // Build dynamic airline map from search results for future reference
      const newAirlineMap = { ...dynamicAirlineMap };
      const newAircraftMap = { ...dynamicAircraftMap };
      flightData.forEach(f => {
        if (f.airline?.code && f.airline?.name) newAirlineMap[f.airline.code] = f.airline.name;
        if (f.operatingCarrier && f.operatingAirlineName) newAirlineMap[f.operatingCarrier] = f.operatingAirlineName;
        if (f.segments) {
          f.segments.forEach(s => {
            if (s.airline?.code && s.airline?.name) newAirlineMap[s.airline.code] = s.airline.name;
          });
        }
      });
      setDynamicAirlineMap(newAirlineMap);
      setDynamicAircraftMap(newAircraftMap);

      // Update prices in the date range if available
      if (data.data?.dateWisePrices) {
        setDateRange(prev =>
          prev.map(d => ({
            ...d,
            price: data.data.dateWisePrices?.[d.isoDate] || d.price,
            isLowestPrice: data.data.lowestPrice && data.data.dateWisePrices?.[d.isoDate] === data.data.lowestPrice
          }))
        );
      }
    } catch (error) {
      console.error('Error fetching flights:', error);
      setFlights([]);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle filter changes
  const handleFilterChange = useCallback((filterType, value) => {
    setFilters(prev => ({
      ...prev,
      [filterType]: value
    }));
  }, []);

  const handleResetAllFilters = useCallback(() => {
    setFilters({
      price: [0, 50000],
      stops: "any",
      airlines: [],
      departureTime: "any",
      baggage: "any",
      refundable: "any",
      originAirports: [],
      destAirports: []
    });
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

  useEffect(() => {
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
  }, [flights]);

  // Apply filters to flights (memoized — only recomputes when flights/filters/sort actually change)
  const filteredFlights = useMemo(() => {
    if (!flights || !Array.isArray(flights)) return [];

    const filtered = flights.filter(flight => {
      // Filter by price
      const flightPrice = getFlightPriceAmount(flight);
      if (flightPrice < filters.price[0] || flightPrice > filters.price[1]) {
        return false;
      }

      // Filter by stops
      if (filters.stops !== "any") {
        const stops = parseInt(filters.stops);
        const flightStops = flight.stops;

        if (stops === 2) {
          if (flightStops < 2) return false;
        } else if (stops === 1) {
          if (flightStops > 1) return false;
        } else {
          if (flightStops !== stops) return false;
        }
      }

      // Filter by airlines
      if (filters.airlines.length > 0) {
        const airlineName = flight.airline?.name;
        if (!filters.airlines.includes(airlineName)) {
          return false;
        }
      }

      // Filter by departure time
      if (filters.departureTime !== "any") {
        const depTime = flight.departure?.time;
        if (depTime) {
          const hour = parseInt(depTime.split(':')[0]) || parseInt(depTime.match(/(\d+)/)?.[1]) || 0;
          const isPM = depTime.toLowerCase().includes('pm');
          const isAM = depTime.toLowerCase().includes('am');
          let h24 = hour;
          if (isPM && hour !== 12) h24 = hour + 12;
          if (isAM && hour === 12) h24 = 0;

          switch (filters.departureTime) {
            case 'early_morning': if (h24 < 0 || h24 >= 6) return false; break;
            case 'morning': if (h24 < 6 || h24 >= 12) return false; break;
            case 'afternoon': if (h24 < 12 || h24 >= 18) return false; break;
            case 'evening': if (h24 < 18 || h24 >= 21) return false; break;
            case 'night': if (h24 < 21 && h24 >= 0) return false; break;
          }
        }
      }

      // Filter by baggage
      if (filters.baggage !== "any") {
        const checkedWeight = flight.baggage?.checked?.weight || 0;
        if (filters.baggage === 'included' && checkedWeight <= 0) return false;
        if (filters.baggage === 'cabin_only' && checkedWeight > 0) return false;
      }

      // Filter by refundable
      if (filters.refundable !== "any") {
        if (filters.refundable === 'yes' && !flight.refundable) return false;
        if (filters.refundable === 'no' && flight.refundable) return false;
      }

      // Filter by departure airport
      if (filters.originAirports?.length > 0) {
        if (!filters.originAirports.includes(flight.departure?.airport)) return false;
      }

      // Filter by arrival airport
      if (filters.destAirports?.length > 0) {
        if (!filters.destAirports.includes(flight.arrival?.airport)) return false;
      }

      return true;
    });

    // Bounds for the heuristic "recommended" score (You May Prefer)
    const bounds = computeBounds(filtered);

    return filtered.sort((a, b) => {
      // Sort by selected order
      const aPrice = a.price?.amount || 0;
      const bPrice = b.price?.amount || 0;

      if (sortOrder === "price") {
        return aPrice - bPrice;
      } else if (sortOrder === "recommended") {
        // Balanced score of price + duration + stops (lower is better)
        return recommendScore(a, bounds) - recommendScore(b, bounds);
      } else if (sortOrder === "nonstop_first") {
        // Non-stop flights first, then cheapest within each group
        const aStop = a.stops === 0 ? 0 : 1;
        const bStop = b.stops === 0 ? 0 : 1;
        if (aStop !== bStop) return aStop - bStop;
        return aPrice - bPrice;
      } else if (sortOrder === "-price") {
        return bPrice - aPrice;
      } else if (sortOrder === "duration") {
        // Parse duration of format PT2H45M
        const parseDuration = (durationStr) => {
          if (!durationStr) return 0;
          let hours = 0;
          let minutes = 0;

          if (durationStr.includes('H')) {
            hours = parseInt(durationStr.split('PT')[1].split('H')[0]) || 0;
            if (durationStr.includes('M')) {
              minutes = parseInt(durationStr.split('H')[1].split('M')[0]) || 0;
            }
          } else if (durationStr.includes('M')) {
            minutes = parseInt(durationStr.split('PT')[1].split('M')[0]) || 0;
          }

          return hours * 60 + minutes;
        };

        const aDuration = parseDuration(a.duration);
        const bDuration = parseDuration(b.duration);
        return aDuration - bDuration;
      } else if (sortOrder === "departure") {
        return (a.segments?.[0]?.departure?.at || '').localeCompare(b.segments?.[0]?.departure?.at || '');
      } else if (sortOrder === "arrival") {
        return (a.segments?.[0]?.arrival?.at || '').localeCompare(b.segments?.[0]?.arrival?.at || '');
      }

      return 0;
    });
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

  // Handle date navigation in the date bar
  const handleDateNavigate = async (direction) => {
    const currentSelectedDate = dateRange.find(d => d.selected)?.isoDate;
    if (!currentSelectedDate) return;

    const newCenterDate = new Date(currentSelectedDate);
    newCenterDate.setDate(newCenterDate.getDate() + (direction * 7));

    // Generate new date range
    const newDates = dateRange.map(d => {
      const date = new Date(d.isoDate);
      date.setDate(date.getDate() + (direction * 7));

      const formattedDate = date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      });

      const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
      const isoDate = date.toISOString().split('T')[0];

      return {
        ...d,
        date: formattedDate,
        day: dayName,
        isoDate: isoDate,
        price: null,
        isLowestPrice: false,
        isWeekend: [0, 6].includes(date.getDay()),
        isPast: date < new Date().setHours(0, 0, 0, 0)
      };
    });

    setDateRange(newDates);
    // Refresh lowest fares for the newly visible week
    loadDatePrices(searchParams, newDates.map(d => d.isoDate));
  };

  // Handle date selection in the date bar
  const handleDateSelect = async (selectedDate) => {
    if (!selectedDate || selectedDate.isPast) return;

    setLoading(true);
    setError(null);

    try {
      // Helper to extract code from string like "City (CODE)"
      const extractCode = (str) => {
        const match = str && str.match(/\(([A-Z]{3})\)$/);
        return match ? match[1] : str;
      };

      // Create new search params with updated date AND extracted codes
      const newSearchParams = {
        ...searchParams,
        from: extractCode(searchParams.from),
        to: extractCode(searchParams.to),
        departDate: selectedDate.isoDate,
        travelClass: searchParams.travelClass || 'ECONOMY',
        adults: parseInt(searchParams.adults) || parseInt(searchParams.travelers) || 1,
        children: parseInt(searchParams.children) || 0,
        infants: parseInt(searchParams.infants) || 0,
        max: 50
      };

      // Update local state and URL with the new params immediately
      setSearchParams(newSearchParams);

      // Update date range to show selection
      setDateRange(prev =>
        prev.map(d => ({
          ...d,
          selected: d.isoDate === selectedDate.isoDate
        }))
      );

      // Use API endpoint from centralized config
      const apiUrl = apiConfig.endpoints.flights.search;
      console.log('Making API request to:', apiUrl);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newSearchParams)
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch flights');
      }

      // Transform flight data — backend returns { data: [...flights] }, not { data: { flights: [...] } }
      const flightData = transformFlightData(data.data || []);
      setFlights(flightData);

      // Build dynamic airline/aircraft maps from date-select results
      const newAirlineMap = {};
      flightData.forEach(f => {
        if (f.airline?.code && f.airline?.name) newAirlineMap[f.airline.code] = f.airline.name;
        if (f.operatingCarrier && f.operatingAirlineName) newAirlineMap[f.operatingCarrier] = f.operatingAirlineName;
        if (f.segments) f.segments.forEach(s => {
          if (s.airline?.code && s.airline?.name) newAirlineMap[s.airline.code] = s.airline.name;
        });
      });
      setDynamicAirlineMap(prev => ({ ...prev, ...newAirlineMap }));

      // Update prices in the date range (only if dateWisePrices is available)
      const { dateWisePrices, lowestPrice } = data.data || {};
      if (dateWisePrices) {
        setDateRange(prev =>
          prev.map(d => ({
            ...d,
            price: dateWisePrices[d.isoDate] ? `$${dateWisePrices[d.isoDate]}` : d.price,
            isLowestPrice: dateWisePrices[d.isoDate] === lowestPrice
          }))
        );
      }

      // Update URL with new search params
      navigate(`/flights/search?from=${newSearchParams.from}&to=${newSearchParams.to}&date=${selectedDate.isoDate}`, {
        replace: true,
        state: { searchData: newSearchParams }
      });
    } catch (error) {
      console.error('Error fetching flights for date:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
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

  // Fetch lowest fare per day for the date strip (Amadeus cheapest-per-date)
  const loadDatePrices = useCallback(async (sp, isoDates) => {
    if (!sp || !Array.isArray(isoDates) || isoDates.length === 0) return;
    const extractCode = (str) => {
      if (!str) return '';
      const m = String(str).match(/\(([A-Z]{3})\)$/);
      if (m) return m[1];
      if (/^[A-Z]{3}$/.test(String(str).trim())) return String(str).trim();
      return str;
    };
    const fromCode = sp.fromCode || extractCode(sp.from);
    const toCode = sp.toCode || extractCode(sp.to);
    if (!fromCode || !toCode) return;
    try {
      const res = await fetch(apiConfig.endpoints.flights.datePrices, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: fromCode,
          to: toCode,
          dates: isoDates,
          adults: parseInt(sp.adults) || parseInt(sp.travelers) || 1,
          children: parseInt(sp.children) || 0,
          infants: parseInt(sp.infants) || 0,
          travelClass: sp.travelClass || 'ECONOMY',
        }),
      });
      const data = await res.json();
      if (data.success && data.dateWisePrices) {
        setDateRange(prev => prev.map(d => ({
          ...d,
          price: data.dateWisePrices[d.isoDate] != null ? data.dateWisePrices[d.isoDate] : d.price,
          isLowestPrice: data.lowestPrice != null && data.dateWisePrices[d.isoDate] === data.lowestPrice,
        })));
      }
    } catch {
      /* date strip simply shows no prices on failure */
    }
  }, []);

  // Load date-strip prices whenever the route or selected date changes
  useEffect(() => {
    if (!searchParams?.from || !searchParams?.to || !searchParams?.departDate) return;
    const center = getSafeDate(searchParams.departDate);
    const isoDates = [];
    for (let i = -3; i <= 3; i++) {
      const dt = new Date(center);
      dt.setDate(center.getDate() + i);
      const y = dt.getFullYear();
      const m = String(dt.getMonth() + 1).padStart(2, '0');
      const da = String(dt.getDate()).padStart(2, '0');
      isoDates.push(`${y}-${m}-${da}`);
    }
    loadDatePrices(searchParams, isoDates);
  }, [searchParams?.from, searchParams?.to, searchParams?.departDate, loadDatePrices]);

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

  const promoBanners = [
    { title: 'Price Drop Protection', desc: 'Get refund if fare drops', accent: 'from-emerald-500 to-teal-600', Icon: ShieldCheck },
    { title: 'VISA Exclusive Offer', desc: 'Extra 10% off with VISA cards', accent: 'from-indigo-500 to-blue-600', Icon: Briefcase },
    { title: 'Flat 10% Instant Discount', desc: 'On select banking partners', accent: 'from-amber-500 to-orange-600', Icon: RefreshCw },
  ];

  return (
    <div className="bg-gray-100 min-h-screen">
      <Navbar />



      {/* Compact modify-search bar (MakeMyTrip-style) */}
      <FlightModifyBar
        searchParams={searchParams}
        cityMap={cityMap}
        onSearch={handleSearch}
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
                      <Price amount={date.price} />
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
            {!loading && (
              <p className="text-sm text-gray-500 mt-0.5">
                <span className="font-semibold text-[#055B75]">{totalItems}</span> flight{totalItems !== 1 ? 's' : ''} found
              </p>
            )}
          </div>

          {/* Promotional banners */}
          <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-1 mb-5">
            {promoBanners.map(({ title, desc, accent, Icon }, i) => (
              <div key={i} className="flex items-center gap-3 min-w-[240px] flex-shrink-0 bg-white rounded-xl border border-gray-200 shadow-sm px-4 py-3">
                <div className={`h-9 w-9 rounded-lg bg-gradient-to-br ${accent} flex items-center justify-center text-white flex-shrink-0`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-800 truncate">{title}</div>
                  <div className="text-xs text-gray-500 truncate">{desc}</div>
                </div>
              </div>
            ))}
          </div>

          {loading ? (
            <div className="flex flex-col justify-center items-center py-20 bg-white rounded-xl shadow-md min-h-[400px]">
              <LoadingSpinner text="Searching for the best flights..." />
              <p className="text-gray-400 text-sm mt-2">Comparing prices from over 500+ airlines</p>
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
                {/* Mobile filters trigger */}
                <button
                  onClick={() => setShowMobileFilters(true)}
                  className="md:hidden w-full mb-3 flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm font-semibold text-[#055B75] shadow-sm"
                >
                  <Filter className="h-4 w-4" />
                  Filters &amp; Sort
                </button>

                {/* Applied filter chips */}
                <FlightAppliedFilters
                  filters={filters}
                  priceRangeBounds={priceRangeBounds}
                  onFilterChange={handleFilterChange}
                  onToggleAirline={toggleAirlineFilter}
                  onToggleAirport={toggleAirportFilter}
                  onResetAll={handleResetAllFilters}
                />

                {/* Sort tabs (Cheapest / Non Stop First / You May Prefer / Other) */}
                <FlightSortTabs
                  flights={filteredFlights}
                  sortOrder={sortOrder}
                  onSortChange={setSortOrder}
                />

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
                      onClick={() => {
                        setFilters({
                          price: [0, 50000],
                          stops: "any",
                          airlines: [],
                          departureTime: "any",
                          baggage: "any",
                          refundable: "any",
                          originAirports: [],
                          destAirports: []
                        });
                      }}
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

