import React, { useState, useEffect, useRef } from "react";
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
import apiConfig from '../../../../../src/config/api.js';
import LoadingSpinner from '../../../Components/LoadingSpinner';
import FlightSearchForm from './flight-search-form';

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
  const [openTooltipId, setOpenTooltipId] = useState(null); // ID of the currently open layover tooltip
  const [loading, setLoading] = useState(true);
  const [sortOrder, setSortOrder] = useState("price");
  const [dateRange, setDateRange] = useState([]);
    const [filters, setFilters] = useState({
      price: [0, 50000],
      stops: "any",
      airlines: [],
      departureTime: "any", // any, early_morning, morning, afternoon, evening, night
      baggage: "any", // any, included, cabin_only
      refundable: "any" // any, yes, no
    });
  const [error, setError] = useState(null);
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
            credentials: 'omit'
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
          }

          const data = await response.json();
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
            console.error('Error fetching initial flights:', error);
            setFlights([]);
            setError(error.message);
          } finally {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    };

    fetchInitialFlights();
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
  const cityMap = allAirports.reduce((acc, airport) => {
    acc[airport.code] = `${airport.name}${airport.country ? ` (${airport.name === airport.city ? airport.country : airport.name + ', ' + airport.country})` : ''}`;
    // Actually, simpler mapping is better for most UI parts
    acc[airport.code] = airport.name;
    return acc;
  }, {});

  // Full name mapping for search/display
  const fullCityMap = allAirports.reduce((acc, airport) => {
    acc[airport.code] = `${airport.name} (${airport.code})`;
    return acc;
  }, {});
  // No static mappings needed - all airports are handled dynamically from airports.js
  // No static mappings needed


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

  // Render stop details with tooltip
  const renderStopDetails = (flight) => {
    if (flight.stops === 0) {
      return <span className="text-green-600 font-medium">Non-stop</span>;
    }

    // Use detailed stop info from backend
    const layovers = flight.stopDetails || [];
    const isOpen = openTooltipId === flight.id;

    return (
      <div className="relative inline-block z-20">
        <button
          onClick={(e) => {
            e.stopPropagation(); // Prevent triggering row click if any
            setOpenTooltipId(isOpen ? null : flight.id);
          }}
          className="text-orange-600 font-medium border-b border-dashed border-orange-300 hover:border-orange-600 transition-colors focus:outline-none"
        >
          {flight.stops} {flight.stops === 1 ? 'stop' : 'stops'}
          {layovers.length > 0 && <span className="text-xs ml-1 text-gray-500">via {layovers[0].airport}</span>}
        </button>

        {/* Enhanced Tooltip - Click activated */}
        {isOpen && layovers.length > 0 && (
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-max max-w-[280px] sm:max-w-xs bg-gray-900 text-white text-xs rounded-lg p-3 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-200">
            {/* Close button for mobile convenience */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setOpenTooltipId(null);
              }}
              className="absolute top-1 right-1 text-gray-400 hover:text-white p-1"
            >
              ×
            </button>

            <div className="font-bold text-[#65B3CF] mb-1.5 border-b border-gray-700 pb-1 pr-4">Layover Information</div>
            {layovers.map((l, idx) => (
              <div key={idx} className="mb-2 last:mb-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
                  <span className="text-gray-300">Stop {idx + 1}:</span>
                  <span className="font-semibold text-white">{cityMap[l.airport] || l.airport} ({l.airport})</span>
                </div>
                <div className="pl-3.5 text-gray-400">
                  <span className="text-yellow-400 font-mono">{l.duration}</span> layover
                </div>
              </div>
            ))}
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
          </div>
        )}
      </div>
    );
  };

  // Get flights from API
  const getFlights = async (searchData) => {
    try {
      // Check if we have the required data
      if (!searchData || !searchData.data || !searchData.data.flights) {
        throw new Error('Missing flight data');
      }

      // Update date range prices
      if (searchData.data.dateWisePrices) {
        setDateRange(Object.entries(searchData.data.dateWisePrices).map(([date, price]) => ({
          date,
          price: price || null
        })));
      }

      // Return the transformed flight data
      return transformFlightData(searchData.data.flights);
    } catch (error) {
      console.error('Error processing flights:', error);
      setError(error.message);
      return [];
    }
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
  const handleFilterChange = (filterType, value) => {
    setFilters({
      ...filters,
      [filterType]: value
    });
  };

    // Apply filters to flights
    const getFilteredFlights = () => {
      if (!flights || !Array.isArray(flights)) return [];

      return flights.filter(flight => {
        // Filter by price
        const flightPrice = flight.price?.amount || 0;
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

        return true;
    }).sort((a, b) => {
      // Sort by selected order
      const aPrice = a.price?.amount || 0;
      const bPrice = b.price?.amount || 0;

      if (sortOrder === "price") {
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
  };

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
        isWeekend: [0, 6].includes(date.getDay()),
        isPast: date < new Date().setHours(0, 0, 0, 0)
      };
    });

    setDateRange(newDates);
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
  const toggleAirlineFilter = (airline) => {
    const updatedAirlines = filters.airlines.includes(airline)
      ? filters.airlines.filter(a => a !== airline)
      : [...filters.airlines, airline];

    handleFilterChange('airlines', updatedAirlines);
  };

  // Get all airlines for filtering - dynamically from current search results
  const getAllAirlines = () => {
    if (!flights || flights.length === 0) return [];
    const airlineNames = new Set();
    flights.forEach(f => {
      const name = f.airline?.name || f.airline;
      if (name) airlineNames.add(name);
    });
    return [...airlineNames].sort();
  };

  // Handle booking a flight
  const handleBookFlight = (flight) => {
    // Navigate to passenger details and booking confirmation page with flight data
    navigate('/flights/booking-confirmation', {
      state: {
        flightData: flight,
        searchData: searchParams
      }
    });
  };

  // Get city suggestions based on search input
  const getCitySuggestions = (input, field) => {
    if (!input) return [];

    const searchTerm = input.toLowerCase();
    const currentFrom = field === 'to' ? searchParams.from : null;
    const currentTo = field === 'from' ? searchParams.to : null;

    return Object.entries(cityMap)
      .filter(([code, name]) => {
        // Skip the current selected city in the other field
        if ((field === 'to' && code === currentFrom) ||
          (field === 'from' && code === currentTo)) {
          return false;
        }

        return name.toLowerCase().includes(searchTerm) ||
          code.toLowerCase().includes(searchTerm);
      })
      .map(([code, name]) => ({
        code,
        name,
        country: getCountryByCode(code)
      }));
  };

  // Get country by airport code
  const getCountryByCode = (code) => {
    const airport = allAirports.find(a => a.code === code);
    return airport ? airport.country : 'Unknown';
  };

  // Handle city selection
  const handleCitySelect = (field, value) => {
    setSearchParams(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Validate city selection
  const validateCitySelection = (from, to) => {
    if (!from || !to) return true; // Allow empty values during selection
    return from !== to;
  };

  // Update the search form component
  const renderCityInput = (field) => {
    const value = searchParams[field];
    const suggestions = getCitySuggestions(value, field);
    const isValid = validateCitySelection(
      field === 'from' ? value : searchParams.from,
      field === 'to' ? value : searchParams.to
    );

    return (
      <div className="relative">
        <input
          type="text"
          value={value}
          onChange={(e) => handleCitySelect(field, e.target.value)}
          placeholder={field === 'from' ? 'From' : 'To'}
          className={`w-full p-2 border rounded-md ${!isValid ? 'border-red-500' : 'border-gray-300'
            }`}
        />
        {!isValid && (
          <p className="text-red-500 text-sm mt-1">
            Please select different cities for departure and arrival
          </p>
        )}
        {suggestions.length > 0 && (
          <div className="absolute z-10 w-full mt-1 bg-white border rounded-md shadow-lg">
            {suggestions.map((suggestion) => (
              <div
                key={suggestion.code}
                onClick={() => handleCitySelect(field, suggestion.code)}
                className="p-2 hover:bg-gray-100 cursor-pointer"
              >
                <div className="font-medium">{suggestion.name}</div>
                <div className="text-sm text-gray-500">
                  {suggestion.code} - {suggestion.country}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const filteredFlights = getFilteredFlights();

  const getPaginatedData = () => {
    const filteredData = getFilteredFlights();
    const totalItems = filteredData.length;
    const totalPages = Math.ceil(totalItems / flightsPerPage);

    // Calculate the start and end index for the current page
    const startIndex = (currentPage - 1) * flightsPerPage;
    const endIndex = Math.min(startIndex + flightsPerPage, totalItems);

    // Get the current page's items
    const currentItems = filteredData.slice(startIndex, endIndex);

    return {
      currentItems,
      totalPages,
      totalItems,
      currentPage,
      startIndex,
      endIndex
    };
  };

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
    // Scroll to top when changing pages
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const MobileQuickFilters = ({ filters, onFilterChange, sortOrder, onSortChange, activeFiltersCount, setIsFilterOpen }) => {
    const [showSortOptions, setShowSortOptions] = useState(false);

    const sortOptions = [
      { value: 'price', label: 'Cheapest', icon: '💰' },
      { value: 'duration', label: 'Fastest', icon: '⚡' },
      { value: 'departure', label: 'Earliest', icon: '🌅' },
      { value: '-price', label: 'Luxury', icon: '✨' }
    ];

    const quickFilters = [
      { type: 'stops', value: '0', label: 'Non-stop' },
      { type: 'stops', value: '1', label: '1 Stop max' },
      { type: 'price', value: [0, 5000], label: `Under ${currencyService.getCurrencySymbol()}5000` },
      { type: 'price', value: [0, 10000], label: `Under ${currencyService.getCurrencySymbol()}10000` }
    ];

    return (
      <div className="mb-4">
        {/* Sort Dropdown */}
        <div className="relative mb-3">
          <button
            onClick={() => setShowSortOptions(!showSortOptions)}
            className="w-full flex items-center justify-between px-4 py-3 bg-white rounded-xl shadow-sm border border-gray-200"
          >
            <div className="flex items-center">
              <ArrowUpDown className="h-4 w-4 text-[#055B75] mr-2" />
              <span className="text-gray-700">Sort by: </span>
              <span className="font-medium text-[#055B75] ml-1">
                {sortOptions.find(opt => opt.value === sortOrder)?.label || 'Best Match'}
              </span>
            </div>
            <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${showSortOptions ? 'transform rotate-180' : ''}`} />
          </button>

          {showSortOptions && (
            <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
              {sortOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => {
                    onSortChange(option.value);
                    setShowSortOptions(false);
                  }}
                  className={`w-full flex items-center px-4 py-3 hover:bg-[#F0FAFC] ${sortOrder === option.value
                    ? 'bg-[#F0FAFC] text-[#055B75]'
                    : 'text-gray-700'
                    }`}
                >
                  <span className="text-xl mr-3">{option.icon}</span>
                  <span className="font-medium">{option.label}</span>
                  {sortOrder === option.value && (
                    <span className="ml-auto text-[#055B75]">✓</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Quick Filter Chips */}
        <div className="flex overflow-x-auto hide-scrollbar gap-2 pb-1">
          <button
            onClick={() => setIsFilterOpen(true)}
            className={`flex items-center px-3 py-2 rounded-full border shadow-sm whitespace-nowrap ${activeFiltersCount > 0
              ? 'bg-[#055B75] text-white border-[#034457]'
              : 'bg-white text-gray-700 border-gray-200'
              }`}
          >
            <Filter className="h-4 w-4 mr-1" />
            {activeFiltersCount > 0 ? `${activeFiltersCount} Active` : 'All Filters'}
          </button>

          {quickFilters.map((filter, index) => (
            <button
              key={index}
              onClick={() => onFilterChange(filter.type, filter.value)}
              className={`px-3 py-2 rounded-full border shadow-sm whitespace-nowrap ${(filter.type === 'stops' && filters.stops === filter.value) ||
                (filter.type === 'price' && filters.price[1] === filter.value[1])
                ? 'bg-[#055B75] text-white border-[#034457]'
                : 'bg-white text-gray-700 border-gray-200'
                }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const MobileFilterDrawer = ({ isOpen, onClose, filters, onFilterChange, airlines, sortOrder, onSortChange }) => {
    if (!isOpen) return null;

    const [activeTab, setActiveTab] = useState('sort');
    const tabs = [
      { id: 'sort', label: 'Sort', icon: ArrowUpDown },
      { id: 'price', label: 'Price', icon: () => <span className="text-lg">💰</span> },
      { id: 'stops', label: 'Stops', icon: () => <span className="text-lg">✈️</span> },
      { id: 'airlines', label: 'Airlines', icon: () => <span className="text-lg">🏢</span> }
    ];

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50">
        <div className="absolute inset-x-0 bottom-0 h-[90vh] bg-white rounded-t-2xl shadow-xl transform transition-transform duration-300 ease-in-out">
          <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-[#055B75] to-[#034457] text-white rounded-t-2xl">
              <h2 className="text-xl font-bold">Filters & Sort</h2>
              <button
                onClick={onClose}
                className="p-2 hover:bg-white/10 rounded-full text-white"
              >
                <X className="h-6 w-6" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b overflow-x-auto hide-scrollbar">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 min-w-[100px] flex flex-col items-center py-3 px-4 ${activeTab === tab.id
                    ? 'text-[#055B75] border-b-2 border-[#055B75]'
                    : 'text-gray-500'
                    }`}
                >
                  <tab.icon className="h-5 w-5 mb-1" />
                  <span className="text-sm font-medium">{tab.label}</span>
                </button>
              ))}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-4">
                {activeTab === 'sort' && (
                  <div className="space-y-2">
                    {[
                      { value: 'price', label: 'Lowest price first', icon: '💰' },
                      { value: '-price', label: 'Highest price first', icon: '✨' },
                      { value: 'duration', label: 'Shortest duration', icon: '⚡' },
                      { value: 'departure', label: 'Earliest departure', icon: '🌅' },
                      { value: 'arrival', label: 'Earliest arrival', icon: '🌆' }
                    ].map(option => (
                      <button
                        key={option.value}
                        onClick={() => onSortChange(option.value)}
                        className={`w-full flex items-center p-4 rounded-xl ${sortOrder === option.value
                          ? 'bg-[#F0FAFC] border-[#65B3CF]'
                          : 'bg-white border-gray-200'
                          } border`}
                      >
                        <span className="text-xl mr-3">{option.icon}</span>
                        <span className="font-medium text-gray-700">{option.label}</span>
                        {sortOrder === option.value && (
                          <span className="ml-auto text-[#055B75]">✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {activeTab === 'price' && (
                  <div className="space-y-6">
                    <div>
                      <div className="flex justify-between mb-2">
                        <span className="font-medium text-gray-700">Price range</span>
                        <span className="text-[#055B75] font-medium">
                          {currencyService.getCurrencySymbol()}{filters.price[0]} - {currencyService.getCurrencySymbol()}{filters.price[1]}
                        </span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="50000"
                        step="1000"
                        value={filters.price[1]}
                        onChange={(e) => onFilterChange('price', [filters.price[0], parseInt(e.target.value)])}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#055B75]"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {[5000, 10000, 15000, 20000].map(price => (
                        <button
                          key={price}
                          onClick={() => onFilterChange('price', [0, price])}
                          className={`p-3 rounded-xl border ${filters.price[1] === price
                            ? 'bg-[#F0FAFC] border-[#65B3CF] text-[#055B75]'
                            : 'bg-white border-gray-200 text-gray-700'
                            }`}
                        >
                          Under {currencyService.getCurrencySymbol()}{price.toLocaleString()}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'stops' && (
                  <div className="space-y-3">
                    {[
                      { value: 'any', label: 'Any number of stops', icon: '🔄' },
                      { value: '0', label: 'Non-stop only', icon: '✈️' },
                      { value: '1', label: '1 stop maximum', icon: '🛑' },
                      { value: '2', label: '2+ stops', icon: '🛑' }
                    ].map(option => (
                      <button
                        key={option.value}
                        onClick={() => onFilterChange('stops', option.value)}
                        className={`w-full flex items-center p-4 rounded-xl ${filters.stops === option.value
                          ? 'bg-[#F0FAFC] border-[#65B3CF]'
                          : 'bg-white border-gray-200'
                          } border`}
                      >
                        <span className="text-xl mr-3">{option.icon}</span>
                        <span className="font-medium text-gray-700">{option.label}</span>
                        {filters.stops === option.value && (
                          <span className="ml-auto text-[#055B75]">✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                {activeTab === 'airlines' && (
                  <div className="space-y-2">
                    {airlines.map(airline => (
                      <button
                        key={airline}
                        onClick={() => {
                          const updatedAirlines = filters.airlines.includes(airline)
                            ? filters.airlines.filter(a => a !== airline)
                            : [...filters.airlines, airline];
                          onFilterChange('airlines', updatedAirlines);
                        }}
                        className={`w-full flex items-center p-4 rounded-xl ${filters.airlines.includes(airline)
                          ? 'bg-[#F0FAFC] border-[#65B3CF]'
                          : 'bg-white border-gray-200'
                          } border`}
                      >
                        <span className="font-medium text-gray-700">{airline}</span>
                        {filters.airlines.includes(airline) && (
                          <span className="ml-auto text-[#055B75]">✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 border-t bg-gray-50">
              <div className="flex gap-3">
                <button
                    onClick={() => {
                        onFilterChange('price', [0, 50000]);
                        onFilterChange('stops', 'any');
                        onFilterChange('airlines', []);
                        onFilterChange('departureTime', 'any');
                        onFilterChange('baggage', 'any');
                        onFilterChange('refundable', 'any');
                        onSortChange('price');
                      }}
                    className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors"
                  >
                    Reset All
                  </button>
                  <button
                    onClick={onClose}
                    className="flex-1 py-3 bg-[#055B75] text-white rounded-xl font-medium hover:bg-[#034457] transition-colors"
                  >
                    Apply Filters
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    };

    // MobileSearchBar removed - using FlightSearchForm instead

  const { currentItems, totalPages, totalItems, startIndex, endIndex } = getPaginatedData();

  return (
    <div className="bg-gray-100 min-h-screen">
      <Navbar />



      {/* Enhanced Header Section with Background Image */}
      <div className="relative px-4 py-12 bg-gradient-to-r from-[#055B75] to-[#034457] text-white overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <img
            src="https://images.unsplash.com/photo-1569154941061-e231b4725ef1?q=80&w=2070&auto=format&fit=crop"
            alt="Clouds from airplane window"
            className="w-full h-full object-cover opacity-20"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#055B75]/80 to-[#034457]/80"></div>
        </div>

        <div className="container mx-auto relative z-10">
          <div className="flex flex-col items-center mb-8">
            <div className="flex items-center mb-3">
              <div className="h-0.5 w-10 bg-[#65B3CF] mr-3"></div>
              <span className="text-[#9FD6E8] uppercase tracking-wider text-sm font-medium">Flight Search</span>
              <div className="h-0.5 w-10 bg-[#65B3CF] ml-3"></div>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold mb-3 text-center">Find Your Perfect Flight</h1>
            <p className="text-[#B9D0DC] text-center max-w-2xl mb-6">Compare prices, schedules, and amenities from top airlines to book the best deal for your trip</p>
          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 shadow-xl border border-white/20 transform hover:scale-[1.01] transition-transform duration-300" style={{ overflow: 'visible' }}>
            <FlightSearchForm
              initialData={searchParams}
              onSearch={handleSearch}
            />
          </div>
        </div>
      </div>

        {/* Enhanced Date Navigation Bar */}
        <div className="bg-white shadow-md border-b border-gray-200 sticky top-0 z-20">
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

              {loading && (
                <div className="absolute inset-0 bg-white/50 flex items-center justify-center">
                  <div className="transform scale-50">
                    <LoadingSpinner />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

      <div className="bg-[#F0FAFC] min-h-screen pb-12 pt-8">
        <div className="container mx-auto max-w-6xl px-4">
          {loading ? (
            <div className="flex flex-col justify-center items-center py-20 bg-white rounded-xl shadow-md min-h-[400px]">
              <LoadingSpinner text="Searching for the best flights..." />
              <p className="text-gray-400 text-sm mt-2">Comparing prices from over 500+ airlines</p>
            </div>
          ) : (
            <div className="flex flex-col md:flex-row gap-6">
                {/* Professional OTA-Style Filter Sidebar */}
                <div className="w-full md:w-[280px] lg:w-[300px] flex-shrink-0">
                  <div className="bg-white rounded-xl shadow-sm border border-gray-100 sticky top-24 max-h-[calc(100vh-7rem)] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
                    
                    {/* Filter Header */}
                    <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                      <div className="flex items-center gap-2">
                        <Filter className="h-4 w-4 text-[#055B75]" />
                        <span className="text-sm font-bold text-gray-800 uppercase tracking-wide">Filters</span>
                      </div>
                      <button
                        onClick={() => {
                          setFilters({
                            price: [0, 50000],
                            stops: "any",
                            airlines: [],
                            departureTime: "any",
                            baggage: "any",
                            refundable: "any"
                          });
                        }}
                        className="text-xs font-semibold text-[#055B75] hover:text-[#034457] hover:underline transition-colors"
                      >
                        RESET ALL
                      </button>
                    </div>

                    {/* Popular Filters (Quick Filters) */}
                    <div className="px-5 py-4 border-b border-gray-100">
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Popular Filters</h4>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { label: 'Non-Stop', action: () => handleFilterChange('stops', filters.stops === '0' ? 'any' : '0'), active: filters.stops === '0' },
                          { label: 'Refundable', action: () => handleFilterChange('refundable', filters.refundable === 'yes' ? 'any' : 'yes'), active: filters.refundable === 'yes' },
                          { label: 'With Baggage', action: () => handleFilterChange('baggage', filters.baggage === 'included' ? 'any' : 'included'), active: filters.baggage === 'included' },
                          { label: 'Morning Dep.', action: () => handleFilterChange('departureTime', filters.departureTime === 'morning' ? 'any' : 'morning'), active: filters.departureTime === 'morning' },
                        ].map((chip, idx) => (
                          <button
                            key={idx}
                            onClick={chip.action}
                            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-200 ${
                              chip.active
                                ? 'bg-[#055B75] text-white border-[#055B75] shadow-sm'
                                : 'bg-white text-gray-600 border-gray-200 hover:border-[#055B75] hover:text-[#055B75]'
                            }`}
                          >
                            {chip.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Price Range - Professional dual slider */}
                    <div className="px-5 py-4 border-b border-gray-100">
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Price Range</h4>
                      <div className="mb-3">
                        <div className="flex items-center gap-2 mb-4">
                          <div className="flex-1">
                            <label className="text-[10px] text-gray-400 font-medium mb-1 block">MIN</label>
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">{currencyService.getCurrencySymbol()}</span>
                              <input
                                type="number"
                                min="0"
                                max={filters.price[1]}
                                step="500"
                                value={filters.price[0]}
                                onChange={(e) => handleFilterChange('price', [Math.min(parseInt(e.target.value) || 0, filters.price[1]), filters.price[1]])}
                                className="w-full pl-5 pr-2 py-1.5 text-xs border border-gray-200 rounded-md text-gray-700 focus:border-[#055B75] focus:ring-1 focus:ring-[#055B75] outline-none"
                              />
                            </div>
                          </div>
                          <span className="text-gray-300 mt-4">-</span>
                          <div className="flex-1">
                            <label className="text-[10px] text-gray-400 font-medium mb-1 block">MAX</label>
                            <div className="relative">
                              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">{currencyService.getCurrencySymbol()}</span>
                              <input
                                type="number"
                                min={filters.price[0]}
                                max="50000"
                                step="500"
                                value={filters.price[1]}
                                onChange={(e) => handleFilterChange('price', [filters.price[0], Math.max(parseInt(e.target.value) || 0, filters.price[0])])}
                                className="w-full pl-5 pr-2 py-1.5 text-xs border border-gray-200 rounded-md text-gray-700 focus:border-[#055B75] focus:ring-1 focus:ring-[#055B75] outline-none"
                              />
                            </div>
                          </div>
                        </div>
                          {/* Dual Range Slider */}
                          <div className="relative h-6 mx-1">
                            {/* Background track */}
                            <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-1.5 bg-gray-200 rounded-full" />
                            {/* Active track */}
                            <div
                              className="absolute top-1/2 -translate-y-1/2 h-1.5 bg-[#055B75] rounded-full"
                              style={{
                                left: `${(filters.price[0] / 50000) * 100}%`,
                                right: `${100 - (filters.price[1] / 50000) * 100}%`
                              }}
                            />
                            {/* Min thumb */}
                            <input
                              type="range"
                              min="0"
                              max="50000"
                              step="500"
                              value={filters.price[0]}
                              onChange={(e) => handleFilterChange('price', [Math.min(parseInt(e.target.value), filters.price[1] - 500), filters.price[1]])}
                              className="absolute top-0 left-0 w-full h-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[#055B75] [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-30 [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-[#055B75] [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:cursor-pointer"
                              style={{ zIndex: filters.price[0] > 25000 ? 20 : 10 }}
                            />
                            {/* Max thumb */}
                            <input
                              type="range"
                              min="0"
                              max="50000"
                              step="500"
                              value={filters.price[1]}
                              onChange={(e) => handleFilterChange('price', [filters.price[0], Math.max(parseInt(e.target.value), filters.price[0] + 500)])}
                              className="absolute top-0 left-0 w-full h-full appearance-none bg-transparent pointer-events-none [&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[#055B75] [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-30 [&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-white [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-[#055B75] [&::-moz-range-thumb]:shadow-md [&::-moz-range-thumb]:cursor-pointer"
                              style={{ zIndex: filters.price[1] < 25000 ? 20 : 10 }}
                            />
                          </div>
                        <div className="flex justify-between mt-1.5">
                          <span className="text-[10px] text-gray-400">{currencyService.getCurrencySymbol()}0</span>
                          <span className="text-[10px] text-gray-400">{currencyService.getCurrencySymbol()}50,000</span>
                        </div>
                      </div>
                    </div>

                    {/* Stops Filter */}
                    <div className="px-5 py-4 border-b border-gray-100">
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Stops</h4>
                      <div className="grid grid-cols-3 gap-1.5">
                        {[
                          { value: 'any', label: 'Any' },
                          { value: '0', label: 'Non-stop' },
                          { value: '1', label: '1 Stop' },
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => handleFilterChange('stops', opt.value)}
                            className={`px-2 py-2 rounded-lg text-xs font-medium border text-center transition-all duration-200 ${
                              filters.stops === opt.value
                                ? 'bg-[#055B75] text-white border-[#055B75] shadow-sm'
                                : 'bg-white text-gray-600 border-gray-200 hover:border-[#65B3CF]'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                      <button
                        onClick={() => handleFilterChange('stops', filters.stops === '2' ? 'any' : '2')}
                        className={`mt-1.5 w-full px-2 py-2 rounded-lg text-xs font-medium border text-center transition-all duration-200 ${
                          filters.stops === '2'
                            ? 'bg-[#055B75] text-white border-[#055B75] shadow-sm'
                            : 'bg-white text-gray-600 border-gray-200 hover:border-[#65B3CF]'
                        }`}
                      >
                        2+ Stops
                      </button>
                    </div>

                    {/* Departure Time Filter */}
                    <div className="px-5 py-4 border-b border-gray-100">
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Departure Time</h4>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { value: 'early_morning', label: 'Before 6 AM', sublabel: 'Early Morning', icon: <Moon className="h-3.5 w-3.5" /> },
                          { value: 'morning', label: '6 AM - 12 PM', sublabel: 'Morning', icon: <Sunrise className="h-3.5 w-3.5" /> },
                          { value: 'afternoon', label: '12 PM - 6 PM', sublabel: 'Afternoon', icon: <Sun className="h-3.5 w-3.5" /> },
                          { value: 'evening', label: '6 PM - 9 PM', sublabel: 'Evening', icon: <Sunset className="h-3.5 w-3.5" /> },
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => handleFilterChange('departureTime', filters.departureTime === opt.value ? 'any' : opt.value)}
                            className={`flex flex-col items-center p-2.5 rounded-lg border text-center transition-all duration-200 ${
                              filters.departureTime === opt.value
                                ? 'bg-[#F0FAFC] border-[#055B75] text-[#055B75]'
                                : 'bg-white border-gray-200 text-gray-500 hover:border-[#65B3CF]'
                            }`}
                          >
                            <span className={`mb-1 ${filters.departureTime === opt.value ? 'text-[#055B75]' : 'text-gray-400'}`}>{opt.icon}</span>
                            <span className="text-[10px] font-semibold leading-tight">{opt.sublabel}</span>
                            <span className="text-[9px] text-gray-400 mt-0.5">{opt.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Baggage Filter */}
                    <div className="px-5 py-4 border-b border-gray-100">
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                        <Briefcase className="h-3.5 w-3.5 text-gray-400" />
                        Baggage
                      </h4>
                      <div className="space-y-1.5">
                        {[
                          { value: 'any', label: 'Any', desc: 'Show all flights' },
                          { value: 'included', label: 'Check-in Baggage Included', desc: 'Flights with checked baggage' },
                          { value: 'cabin_only', label: 'Cabin Baggage Only', desc: 'No checked baggage' },
                        ].map((opt) => (
                          <label
                            key={opt.value}
                            className={`flex items-start gap-2.5 p-2.5 rounded-lg cursor-pointer transition-all duration-200 ${
                              filters.baggage === opt.value
                                ? 'bg-[#F0FAFC] border border-[#055B75]/20'
                                : 'hover:bg-gray-50 border border-transparent'
                            }`}
                          >
                            <input
                              type="radio"
                              name="baggage"
                              className="mt-0.5 w-3.5 h-3.5 text-[#055B75] border-gray-300 focus:ring-[#055B75]"
                              checked={filters.baggage === opt.value}
                              onChange={() => handleFilterChange('baggage', opt.value)}
                            />
                            <div>
                              <div className="text-xs font-medium text-gray-700">{opt.label}</div>
                              <div className="text-[10px] text-gray-400">{opt.desc}</div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Refundable Filter */}
                    <div className="px-5 py-4 border-b border-gray-100">
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                        <ShieldCheck className="h-3.5 w-3.5 text-gray-400" />
                        Fare Type
                      </h4>
                      <div className="space-y-1.5">
                        {[
                          { value: 'any', label: 'All Fares' },
                          { value: 'yes', label: 'Refundable Only' },
                          { value: 'no', label: 'Non-Refundable Only' },
                        ].map((opt) => (
                          <label
                            key={opt.value}
                            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-all duration-200 ${
                              filters.refundable === opt.value
                                ? 'bg-[#F0FAFC] border border-[#055B75]/20'
                                : 'hover:bg-gray-50 border border-transparent'
                            }`}
                          >
                            <input
                              type="radio"
                              name="refundable"
                              className="w-3.5 h-3.5 text-[#055B75] border-gray-300 focus:ring-[#055B75]"
                              checked={filters.refundable === opt.value}
                              onChange={() => handleFilterChange('refundable', opt.value)}
                            />
                            <span className="text-xs font-medium text-gray-700">{opt.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Airlines Filter */}
                    <div className="px-5 py-4">
                      <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Airlines</h4>
                      {getAllAirlines().length > 0 ? (
                        <div className="space-y-0.5 max-h-52 overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent">
                          {getAllAirlines().map(airline => {
                            const airlineFlights = flights.filter(f => f.airline?.name === airline);
                            const minPrice = airlineFlights.length > 0 ? Math.min(...airlineFlights.map(f => f.price?.amount || 0)) : null;
                            return (
                              <label
                                key={airline}
                                className={`flex items-center justify-between px-2.5 py-2 rounded-lg cursor-pointer transition-all duration-200 ${
                                  filters.airlines.includes(airline)
                                    ? 'bg-[#F0FAFC]'
                                    : 'hover:bg-gray-50'
                                }`}
                              >
                                <div className="flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    className="w-3.5 h-3.5 text-[#055B75] border-gray-300 rounded focus:ring-[#055B75]"
                                    checked={filters.airlines.includes(airline)}
                                    onChange={() => toggleAirlineFilter(airline)}
                                  />
                                  <span className="text-xs text-gray-700 font-medium">{airline}</span>
                                </div>
                                {minPrice !== null && (
                                  <span className="text-[10px] text-gray-400 font-medium">
                                    {currencyService.getCurrencySymbol()}{Math.round(minPrice).toLocaleString()}
                                  </span>
                                )}
                              </label>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400 italic">No airlines to filter</p>
                      )}
                    </div>

                  </div>
                </div>

              {/* Results */}
              <div className="flex-1 min-w-0">
                {/* Sort Controls */}
                <div className="bg-white rounded-xl shadow-sm p-6 mb-6 border border-gray-200">
                  <div className="flex flex-col md:flex-row items-center justify-between">
                    <div className="mb-4 md:mb-0">
                      <p className="text-gray-600">
                        <span className="font-bold text-[#055B75] text-lg">{totalItems}</span>
                        <span className="text-gray-700"> flights found</span>
                        <span className="text-sm text-gray-500 ml-2">
                          (Showing {startIndex + 1} to {endIndex})
                        </span>
                      </p>
                    </div>

                      <div className="flex items-center space-x-3">
                        <span className="text-gray-600 text-sm font-medium">Sort by:</span>
                        <div className="relative">
                          <select
                            value={sortOrder}
                            onChange={(e) => setSortOrder(e.target.value)}
                            className="cursor-pointer appearance-none pl-4 pr-10 py-2.5 bg-white border-2 border-gray-200 rounded-xl text-[#055B75] font-semibold text-sm focus:ring-2 focus:ring-[#65B3CF] focus:border-[#65B3CF] focus:outline-none hover:border-[#B9D0DC] hover:shadow-sm transition-all"
                          >
                            <option value="price">Price - Low to High</option>
                            <option value="-price">Price - High to Low</option>
                            <option value="duration">Duration - Shortest</option>
                            <option value="departure">Departure - Earliest</option>
                            <option value="arrival">Arrival - Earliest</option>
                          </select>
                          <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-[#055B75] h-4 w-4 pointer-events-none" />
                        </div>
                      </div>
                  </div>
                </div>

                {/* Enhanced Flight Cards */}
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
                          refundable: "any"
                        });
                      }}
                      className="px-6 py-3 bg-[#055B75] text-white rounded-lg font-medium hover:bg-[#034457] transition-colors"
                    >
                      <X className="h-4 w-4 mr-2 inline" />
                      Reset All Filters
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {currentItems.map((flight, index) => (
                      <div
                        key={index}
                        className="bg-white rounded-xl shadow-sm hover:shadow-md border border-gray-200 hover:border-[#65B3CF] transition-all duration-300 group" style={{ overflow: 'visible' }}
                      >
                        {/* Top section with airline and price */}
                        <div className="p-5">
                          <div className="flex flex-col md:flex-row items-center justify-between">
                            {/* Airline and Flight Info */}
                            <div className="flex items-center mb-4 md:mb-0">
                              <div className="w-16 h-16 flex items-center justify-center bg-[#F0FAFC] rounded-xl mr-4 overflow-hidden border border-gray-100 group-hover:border-[#B9D0DC] transition-colors">
                                <img
                                  src={flight.airline?.logo}
                                  alt={flight.airline?.name || 'Airline'}
                                  className="w-12 h-12 object-contain"
                                  onError={(e) => {
                                    e.target.onerror = null;
                                    // Use a data URL for the airplane emoji as fallback
                                    e.target.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiByeD0iOCIgZmlsbD0iIzM3NzNmNCIvPgo8dGV4dCB4PSIyMCIgeT0iMjgiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxOCIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiPuKciO+4jzwvdGV4dD4KPHN2Zz4K';
                                  }}
                                />
                              </div>
                              <div>
                                <h3 className="font-bold text-gray-900 text-lg">{flight.airline?.name || 'Unknown Airline'}</h3>
                                <div className="text-sm text-gray-500 flex items-center flex-wrap gap-x-2">
                                  <span className="font-medium text-[#055B75]">{flight.segments?.[0]?.flightNumber || 'N/A'}</span>
                                  <span className="mx-1">•</span>
                                  <span>{flight.segments?.[0]?.aircraft || flight.aircraft || 'Unknown Aircraft'}</span>
                                  {flight.operatingCarrier && flight.operatingCarrier !== flight.airline?.code && (
                                    <>
                                      <span className="mx-1">•</span>
                                      <span className="text-xs text-orange-600">Operated by {flight.operatingAirlineName || flight.operatingCarrier}</span>
                                    </>
                                  )}
                                </div>
                                {flight.brandedFare && (
                                  <span className="inline-block mt-1 text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded font-medium">
                                    {flight.brandedFareLabel || flight.brandedFare}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Price and Book Button */}
                            <div className="flex flex-col items-end">
                              <div className="text-right mb-3">
                                <div className="text-3xl font-bold text-[#055B75] flex items-center">
                                  <Price amount={flight.price} showCode={true} />
                                </div>
                                <div className="text-xs text-gray-500">per passenger</div>
                              </div>
                              <button
                                onClick={() => handleBookFlight(flight)}
                                className="px-8 py-3 bg-[#055B75] hover:bg-[#034457] text-white rounded-lg font-semibold shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5"
                              >
                                Book Now
                              </button>
                            </div>
                          </div>

                          {/* Flight Details */}
                          <div className="mt-6 grid grid-cols-4 gap-4 text-sm text-gray-600">
                            <div>
                              <div className="font-medium text-gray-500 mb-1">Departure</div>
                              <div className="font-bold text-gray-800 text-lg">{flight.departure?.time || 'N/A'}</div>
                              <div className="text-gray-500 mb-1">{flight.departure?.date || 'N/A'}</div>
                              <div className="text-xs">
                                <span className="font-medium">{flight.departure?.cityName || flight.departure?.airport || 'N/A'}</span>
                                {flight.departure?.terminal && (
                                  <span className="ml-1 text-[#055B75] bg-[#F0FAFC] px-1 rounded">T{flight.departure?.terminal}</span>
                                )}
                              </div>
                            </div>
                            <div>
                              <div className="font-medium text-gray-500 mb-1">Arrival</div>
                              <div className="font-bold text-gray-800 text-lg">{flight.arrival?.time || 'N/A'}</div>
                              <div className="text-gray-500 mb-1">{flight.arrival?.date || 'N/A'}</div>
                              <div className="text-xs">
                                <span className="font-medium">{flight.arrival?.cityName || flight.arrival?.airport || 'N/A'}</span>
                                {flight.arrival?.terminal && (
                                  <span className="ml-1 text-[#055B75] bg-[#F0FAFC] px-1 rounded">T{flight.arrival?.terminal}</span>
                                )}
                              </div>
                            </div>
                            <div>
                              <div className="font-medium text-gray-500 mb-1">Duration</div>
                              <div className="font-bold text-gray-800">
                                {flight.duration?.replace('PT', '').replace('H', 'h ').replace('M', 'm') || 'N/A'}
                              </div>
                              <div className="text-xs mt-1">
                                {renderStopDetails(flight)}
                              </div>
                            </div>
                            <div>
                              <div className="font-medium text-gray-500 mb-1">Class</div>
                              <div className="font-bold text-gray-800">
                                {flight.cabin ? flight.cabin.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') : 'Economy'}
                              </div>
                              <div className="text-xs mt-1">
                                {flight.baggage?.checked?.weight ? `${flight.baggage.checked.weight}${flight.baggage.checked.weightUnit}` : 'No checked baggage'}
                              </div>
                              {flight.numberOfBookableSeats && flight.numberOfBookableSeats <= 9 && (
                                <div className="text-xs mt-1 text-red-600 font-medium">
                                  Only {flight.numberOfBookableSeats} seat{flight.numberOfBookableSeats > 1 ? 's' : ''} left
                                </div>
                              )}
                              {flight.lastTicketingDate && (
                                <div className="text-xs mt-0.5 text-gray-400">
                                  Book by {new Date(flight.lastTicketingDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
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

      <Footer />
    </div>
  )
}

export default withPageElements(FlightSearchPage);

