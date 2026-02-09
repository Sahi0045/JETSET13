import React, { useState, useEffect, useRef } from "react";
import { Link, useSearchParams, useNavigate, useLocation } from "react-router-dom";
import { Plane, Calendar, Users, ArrowRight, X, Search, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Clock, Filter, ArrowUpDown, MapPin } from "lucide-react";
import Navbar from '../Navbar';
import Footer from '../Footer';
import withPageElements from '../PageWrapper';
import Price from '../../../Components/Price';
import currencyService from '../../../Services/CurrencyService';
import {
  defaultSearchData,
  cheapFlights,
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
    price: [0, 20000],
    stops: "any",
    airlines: []
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
          const searchData = {
            from: location.state.searchData.from,
            to: location.state.searchData.to,
            departDate: location.state.searchData.departDate,
            returnDate: location.state.searchData.returnDate,
            travelers: parseInt(location.state.searchData.travelers) || 1,
            max: 20 // Increased max results
          };

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

          // Use mock data if API fails
          if (cheapFlights && cheapFlights.length > 0) {
            console.log('Using mock flight data as fallback');
            setFlights(cheapFlights);
          } else {
            setFlights([]);
          }
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

  // Airline code to name mapping
  const airlineMap = {
    // Full-service carriers
    'AI': 'Air India',
    'IX': 'Air India Express',
    'UK': 'Vistara',
    // Low-cost carriers
    '6E': 'IndiGo',
    'SG': 'SpiceJet',
    'G8': 'Go First',
    'I5': 'AirAsia India',
    'QP': 'Akasa Air',
    // International airlines
    'EK': 'Emirates',
    'EY': 'Etihad Airways',
    'QR': 'Qatar Airways',
    'SQ': 'Singapore Airlines',
    'TG': 'Thai Airways',
    'MH': 'Malaysia Airlines',
    'BA': 'British Airways',
    'LH': 'Lufthansa',
    'AF': 'Air France',
    'KL': 'KLM Royal Dutch',
    'DL': 'Delta Air Lines',
    'AA': 'American Airlines',
    'UA': 'United Airlines',
    'CX': 'Cathay Pacific',
    'QF': 'Qantas',
    'JL': 'Japan Airlines',
    'NH': 'ANA',
    'KE': 'Korean Air',
    'OZ': 'Asiana Airlines'
  };

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


  // Aircraft code to name mapping
  const aircraftMap = {
    // Narrow-body aircraft
    '320': 'Airbus A320',
    '321': 'Airbus A321',
    '32N': 'Airbus A320neo',
    '32Q': 'Airbus A321neo',
    '738': 'Boeing 737-800',
    '739': 'Boeing 737-900',
    '7M8': 'Boeing 737 MAX 8',
    // Wide-body aircraft
    '788': 'Boeing 787-8 Dreamliner',
    '789': 'Boeing 787-9 Dreamliner',
    '77W': 'Boeing 777-300ER',
    '359': 'Airbus A350-900',
    '351': 'Airbus A350-1000',
    // Regional aircraft
    'AT7': 'ATR 72',
    'AT4': 'ATR 42',
    'E90': 'Embraer E190',
    'E95': 'Embraer E195'
  };

  // Transform Amadeus API flight data to our format
  const transformFlightData = (data) => {
    if (!data || !Array.isArray(data)) return [];

    return data.map(flight => {
      // Check if this is our API format (simple) or Amadeus format (complex)
      if (flight.itineraries) {
        // Handle Amadeus API format (existing logic)
        const itinerary = flight.itineraries[0];
        const segments = itinerary.segments;
        const firstSegment = segments[0];
        const lastSegment = segments[segments.length - 1];
        const price = flight.price;

        return {
          id: flight.id,
          airline: {
            code: firstSegment.carrierCode,
            name: airlineMap[firstSegment.carrierCode] || firstSegment.carrierCode,
            logo: `https://pics.avs.io/200/200/${firstSegment.carrierCode.toUpperCase()}.png`
          },
          departure: {
            time: new Date(firstSegment.departure.at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            date: new Date(firstSegment.departure.at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
            airport: firstSegment.departure.iataCode,
            terminal: firstSegment.departure.terminal || 'T1',
            cityName: cityMap[firstSegment.departure.iataCode] || firstSegment.departure.iataCode
          },
          arrival: {
            time: new Date(lastSegment.arrival.at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            date: new Date(lastSegment.arrival.at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
            airport: lastSegment.arrival.iataCode,
            terminal: lastSegment.arrival.terminal || 'T1',
            cityName: cityMap[lastSegment.arrival.iataCode] || lastSegment.arrival.iataCode
          },
          duration: itinerary.duration,
          stops: segments.length - 1,
          price: {
            amount: parseFloat(price.total),
            total: price.total,
            currency: price.currency || 'USD',
            base: price.base,
            fees: price.fees
          },
          amenities: flight.travelerPricings[0].fareDetailsBySegment[0].amenities || [],
          baggage: {
            checked: flight.travelerPricings[0].fareDetailsBySegment[0].includedCheckedBags || { weight: 0, weightUnit: 'KG' },
            cabin: flight.travelerPricings[0].fareDetailsBySegment[0].includedCabinBags || { weight: 0, weightUnit: 'KG' }
          },
          cabin: flight.travelerPricings[0].fareDetailsBySegment[0].cabin || 'ECONOMY',
          class: flight.travelerPricings[0].fareDetailsBySegment[0].class || 'ECONOMY',
          segments: segments.map(segment => ({
            departure: {
              time: new Date(segment.departure.at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
              airport: segment.departure.iataCode,
              terminal: segment.departure.terminal || 'T1',
              cityName: cityMap[segment.departure.iataCode] || segment.departure.iataCode,
              at: segment.departure.at
            },
            arrival: {
              time: new Date(segment.arrival.at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
              airport: segment.arrival.iataCode,
              terminal: segment.arrival.terminal || 'T1',
              cityName: cityMap[segment.arrival.iataCode] || segment.arrival.iataCode,
              at: segment.arrival.at
            },
            airline: {
              code: segment.carrierCode,
              name: airlineMap[segment.carrierCode] || segment.carrierCode,
              logo: `https://pics.avs.io/200/200/${segment.carrierCode.toUpperCase()}.png`
            },
            duration: segment.duration,
            flightNumber: `${segment.carrierCode} ${segment.number}`,
            aircraft: aircraftMap[segment.aircraft?.code] || segment.aircraft?.code || 'Unknown Aircraft',
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
            airport: flight.departure.airport,
            terminal: flight.departure.terminal || 'T1',
            cityName: cityMap[flight.departure.airport] || flight.departure.airport
          },
          arrival: {
            time: flight.arrival.time,
            date: new Date(flight.arrival.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
            airport: flight.arrival.airport,
            terminal: flight.arrival.terminal || 'T1',
            cityName: cityMap[flight.arrival.airport] || flight.arrival.airport
          },
          duration: flight.duration,
          stops: flight.stops || 0,
          price: {
            amount: flight.price.amount,
            total: flight.price.total,
            currency: flight.price.currency || 'USD'
          },
          amenities: [],
          baggage: {
            checked: { weight: parseInt(flight.baggage) || 15, weightUnit: 'KG' },
            cabin: { weight: 7, weightUnit: 'KG' }
          },
          cabin: flight.cabin || 'ECONOMY',
          class: flight.cabin || 'ECONOMY',
          aircraft: flight.aircraft || 'Unknown',
          flightNumber: flight.flightNumber,
          refundable: flight.refundable || false,
          seats: flight.seats || 'Available',
          stopDetails: flight.stopDetails || [], // Preserve stop details from API
          segments: [{
            departure: {
              time: flight.departure.time,
              airport: flight.departure.airport,
              terminal: flight.departure.terminal || 'T1',
              cityName: cityMap[flight.departure.airport] || flight.departure.airport,
              at: `${flight.departure.date}T${flight.departure.time}:00`
            },
            arrival: {
              time: flight.arrival.time,
              airport: flight.arrival.airport,
              terminal: flight.arrival.terminal || 'T1',
              cityName: cityMap[flight.arrival.airport] || flight.arrival.airport,
              at: `${flight.arrival.date}T${flight.arrival.time}:00`
            },
            airline: {
              code: flight.airlineCode,
              name: flight.airline,
              logo: `https://pics.avs.io/200/200/${flight.airlineCode?.toUpperCase()}.png`
            },
            duration: flight.duration,
            flightNumber: flight.flightNumber,
            aircraft: flight.aircraft || 'Unknown Aircraft',
            stops: 0
          }],
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
            airport: flight.departure.airport,
            terminal: flight.departure.terminal || 'T1',
            cityName: cityMap[flight.departure.airport] || flight.departure.airport
          },
          arrival: {
            time: flight.arrival.time,
            date: new Date(flight.arrival.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
            airport: flight.arrival.airport,
            terminal: flight.arrival.terminal || 'T1',
            cityName: cityMap[flight.arrival.airport] || flight.arrival.airport
          },
          duration: flight.duration,
          stops: flight.stops || 0,
          price: {
            amount: flight.price.amount,
            total: flight.price.total,
            currency: flight.price.currency || currencyService.getCurrency()
          },
          amenities: [],
          baggage: {
            checked: { weight: parseInt(flight.baggage) || 0, weightUnit: 'KG' },
            cabin: { weight: 7, weightUnit: 'KG' }
          },
          cabin: flight.cabin || 'Economy',
          class: flight.cabin || 'Economy',
          aircraft: flight.aircraft || 'Unknown',
          flightNumber: flight.flightNumber,
          refundable: flight.refundable || false,
          seats: flight.seats || 0,
          stopDetails: flight.stopDetails || [], // Preserve stop details from API
          segments: [{
            departure: {
              time: flight.departure.time,
              airport: flight.departure.airport,
              terminal: flight.departure.terminal || 'T1',
              cityName: cityMap[flight.departure.airport] || flight.departure.airport,
              at: `${flight.departure.date}T${flight.departure.time}:00`
            },
            arrival: {
              time: flight.arrival.time,
              airport: flight.arrival.airport,
              terminal: flight.arrival.terminal || 'T1',
              cityName: cityMap[flight.arrival.airport] || flight.arrival.airport,
              at: `${flight.arrival.date}T${flight.arrival.time}:00`
            },
            airline: {
              code: flight.airlineCode,
              name: flight.airline,
              logo: `/images/airlines/${flight.airlineCode.toLowerCase()}.png`
            },
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

    // Use stopDetails from API if available, otherwise try to calculate from segments
    let layovers = [];

    if (flight.stopDetails && flight.stopDetails.length > 0) {
      // Use pre-calculated stop details from API
      layovers = flight.stopDetails.map(stop => ({
        code: stop.airport,
        cityName: cityMap[stop.airport] || stop.airport,
        duration: stop.duration || 'N/A'
      }));
    } else if (flight.segments && flight.segments.length > 1) {
      // Fallback: Calculate layovers from segments
      layovers = flight.segments.slice(0, -1).map((seg, i) => {
        const nextSeg = flight.segments[i + 1];
        const arrival = new Date(seg.arrival.at);
        const departure = new Date(nextSeg.departure.at);
        const diffMs = departure - arrival;
        const hours = Math.floor(diffMs / 3600000);
        const mins = Math.floor((diffMs % 3600000) / 60000);
        return {
          code: seg.arrival.airport,
          cityName: seg.arrival.cityName || cityMap[seg.arrival.airport] || seg.arrival.airport,
          duration: `${hours}h ${mins > 0 ? mins + 'm' : ''}`
        };
      });
    }

    return (
      <div className="relative group cursor-pointer inline-block z-20">
        <span className="text-orange-600 font-medium border-b border-dashed border-orange-300 hover:border-orange-600 transition-colors">
          {flight.stops} {flight.stops === 1 ? 'stop' : 'stops'}
          {layovers.length > 0 && <span className="text-xs ml-1 text-gray-500">via {layovers[0].code}</span>}
        </span>

        {/* Enhanced Tooltip */}
        {layovers.length > 0 && (
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-max bg-gray-900 text-white text-xs rounded-lg p-3 shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 pointer-events-none z-50">
            <div className="font-bold text-[#65B3CF] mb-1.5 border-b border-gray-700 pb-1">Layover Information</div>
            {layovers.map((l, idx) => (
              <div key={idx} className="flex items-center gap-2 mb-1 last:mb-0 whitespace-nowrap">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
                <span className="text-gray-300">Stop {idx + 1}:</span>
                <span className="font-semibold text-white">{l.cityName} ({l.code})</span>
                <span className="text-gray-400">•</span>
                <span className="text-yellow-400 font-mono">{l.duration}</span>
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

    // Ensure all required fields are present
    if (!formData.from || !formData.to || !formData.departDate) {
      setError('Please fill in all required fields');
      setLoading(false);
      return;
    }

    try {
      const searchData = {
        from: formData.from,
        to: formData.to,
        departDate: formData.departDate,
        returnDate: formData.returnDate,
        travelers: parseInt(formData.travelers) || 1,
        travelClass: formData.travelClass || 'ECONOMY',
        max: 10
      };

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
        },
        body: JSON.stringify(searchData)
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

      // Use mock data if API fails
      if (cheapFlights && cheapFlights.length > 0) {
        console.log('Using mock flight data as fallback for search');
        setFlights(cheapFlights);
      } else {
        setFlights([]);
        setError(error.message);
      }
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
      if (filters.stops !== "any" && String(flight.stops) !== String(filters.stops)) {
        return false;
      }

      // Filter by airlines
      if (filters.airlines.length > 0) {
        const airlineName = flight.airline?.name;
        if (!filters.airlines.includes(airlineName)) {
          return false;
        }
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
      // Update search params with new date
      const newSearchParams = {
        ...searchParams,
        from: searchParams.from || 'DEL',
        to: searchParams.to || 'HYD',
        departDate: selectedDate.isoDate
      };
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

      // Transform flight data
      const flightData = transformFlightData(data.data.flights);
      setFlights(flightData);

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

  // Get all airlines for filtering
  const getAllAirlines = () => {
    // Return all airlines from the airlineMap
    return Object.values(airlineMap).sort();
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
                      { value: '1', label: '1 stop maximum', icon: '🛑' }
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
                    onFilterChange('price', [0, 20000]);
                    onFilterChange('stops', 'any');
                    onFilterChange('airlines', []);
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

  const MobileSearchBar = ({ searchParams, onSearch, filters, onFilterChange, sortOrder, onSortChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [isFilterOpen, setIsFilterOpen] = useState(false);
    const [localSearchParams, setLocalSearchParams] = useState(searchParams);

    // Calculate active filters count
    const activeFiltersCount = [
      filters.stops !== 'any',
      filters.price[1] !== 20000,
      filters.airlines.length > 0
    ].filter(Boolean).length;

    const handleSubmit = (e) => {
      e.preventDefault();
      onSearch(localSearchParams);
      setIsOpen(false);
    };

    return (
      <>
        {/* Collapsed Search Bar */}
        {!isOpen && (
          <div className="bg-white shadow-md rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between">
              <div
                className="flex-1 cursor-pointer"
                onClick={() => setIsOpen(true)}
              >
                <div className="flex items-center text-gray-800 mb-2">
                  <div className="font-semibold">{localSearchParams.from || 'From'}</div>
                  <ArrowRight className="h-4 w-4 mx-2 text-gray-400" />
                  <div className="font-semibold">{localSearchParams.to || 'To'}</div>
                </div>
                <div className="text-sm text-gray-500">
                  {localSearchParams.departDate ? new Date(localSearchParams.departDate).toLocaleDateString('en-US', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short'
                  }) : 'Select dates'} • {localSearchParams.travelers} traveler{localSearchParams.travelers !== 1 ? 's' : ''}
                </div>
              </div>
              <button
                onClick={() => setIsFilterOpen(true)}
                className="ml-4 bg-[#F0FAFC] hover:bg-[#D4EFFA] rounded-lg p-2 transition-colors"
              >
                <Filter className="h-5 w-5 text-[#055B75]" />
              </button>
            </div>
          </div>
        )}

        {/* Expanded Search Form */}
        {isOpen && (
          <div className="fixed inset-0 bg-white z-50 overflow-y-auto">
            <div className="p-4">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold">Modify Search</h2>
                <button
                  onClick={() => setIsOpen(false)}
                  className="p-2 hover:bg-gray-100 rounded-full"
                >
                  <X className="h-6 w-6" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* From and To Fields */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
                    <input
                      type="text"
                      value={localSearchParams.from}
                      onChange={(e) => setLocalSearchParams(prev => ({ ...prev, from: e.target.value }))}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#055B75]"
                      placeholder="Enter city or airport"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
                    <input
                      type="text"
                      value={localSearchParams.to}
                      onChange={(e) => setLocalSearchParams(prev => ({ ...prev, to: e.target.value }))}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#055B75]"
                      placeholder="Enter city or airport"
                    />
                  </div>
                </div>

                {/* Date Fields */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Departure Date</label>
                    <input
                      type="date"
                      value={localSearchParams.departDate}
                      onChange={(e) => setLocalSearchParams(prev => ({ ...prev, departDate: e.target.value }))}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#055B75]"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Return Date (Optional)</label>
                    <input
                      type="date"
                      value={localSearchParams.returnDate || ''}
                      onChange={(e) => setLocalSearchParams(prev => ({ ...prev, returnDate: e.target.value }))}
                      className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#055B75]"
                    />
                  </div>
                </div>

                {/* Travelers */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Travelers</label>
                  <select
                    value={localSearchParams.travelers}
                    onChange={(e) => setLocalSearchParams(prev => ({ ...prev, travelers: e.target.value }))}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#055B75]"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                      <option key={num} value={num}>{num} Traveler{num !== 1 ? 's' : ''}</option>
                    ))}
                  </select>
                </div>

                {/* Search Button */}
                <button
                  type="submit"
                  className="w-full py-4 bg-[#055B75] text-white rounded-xl font-semibold text-lg shadow-md hover:bg-[#034457] transition-colors"
                >
                  Search Flights
                </button>
              </form>
            </div>
          </div>
        )}

        {/* Filter Drawer */}
        <MobileFilterDrawer
          isOpen={isFilterOpen}
          onClose={() => setIsFilterOpen(false)}
          filters={filters}
          onFilterChange={onFilterChange}
          airlines={getAllAirlines()}
          sortOrder={sortOrder}
          onSortChange={onSortChange}
        />
      </>
    );
  };

  if (isMobileView) {
    const { currentItems, totalPages, totalItems, startIndex, endIndex } = getPaginatedData();

    return (
      <div className="w-full min-h-screen bg-[#F0FAFC] flex flex-col">
        <Navbar />
        <div className="flex-1 px-4 pt-4 pb-24">
          <MobileSearchBar
            searchParams={searchParams}
            onSearch={handleSearch}
            filters={filters}
            onFilterChange={handleFilterChange}
            sortOrder={sortOrder}
            onSortChange={setSortOrder}
          />

          {loading ? (
            <div className="flex flex-col justify-center items-center h-64 bg-white rounded-xl shadow-md p-8">
              <div className="relative">
                <div className="animate-spin rounded-full h-16 w-16 border-t-2 border-b-2 border-blue-500"></div>
                <Plane className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 h-6 w-6 text-blue-500" />
              </div>
              <p className="mt-6 text-gray-600 font-medium">Searching for the best flights...</p>
            </div>
          ) : currentItems.length === 0 ? (
            <div className="bg-white rounded-xl shadow-md p-8 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 mb-4">
                <Plane className="h-8 w-8 text-blue-500" />
              </div>
              <h3 className="text-xl font-bold text-gray-800 mb-2">No flights found</h3>
              <p className="text-gray-600">Try adjusting your search filters or dates.</p>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {currentItems.map((flight, idx) => (
                  <div key={idx} className="bg-white rounded-xl shadow-md p-4 border border-gray-100">
                    {/* Flight Card Content */}
                    <div className="flex items-center gap-3 mb-4">
                      <img
                        src={flight.airline?.logo}
                        alt={flight.airline?.name}
                        className="w-12 h-12 object-contain rounded-lg bg-gray-50"
                        onError={(e) => {
                          e.target.onerror = null;
                          e.target.src = 'https://via.placeholder.com/40?text=✈️';
                        }}
                      />
                      <div className="flex-1">
                        <div className="font-bold text-gray-900">{flight.airline?.name}</div>
                        <div className="text-sm text-gray-500">{flight.segments?.[0]?.flightNumber}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xl font-bold text-blue-600">
                          <Price amount={flight.price?.amount} showCode={true} />
                        </div>
                        <div className="text-xs text-gray-500">per person</div>
                      </div>
                    </div>

                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="font-bold">{flight.departure?.time}</div>
                          <div className="text-gray-500">{flight.departure?.cityName}</div>
                        </div>
                        <div className="text-center flex-1 px-4">
                          <div className="text-xs text-gray-500">{flight.duration?.replace('PT', '').replace('H', 'h ').replace('M', 'm')}</div>
                          <div className="border-t border-gray-300 my-1"></div>
                          <div className="text-xs text-gray-500">
                            {flight.stops === 0 ? 'Non-stop' : `${flight.stops} stop${flight.stops > 1 ? 's' : ''}`}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold">{flight.arrival?.time}</div>
                          <div className="text-gray-500">{flight.arrival?.cityName}</div>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => handleBookFlight(flight)}
                      className="w-full mt-4 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
                    >
                      Select Flight
                    </button>
                  </div>
                ))}
              </div>

              {/* Pagination Controls */}
              <div className="mt-8 flex flex-col items-center">
                <div className="text-sm text-gray-600 mb-4">
                  Showing {startIndex + 1} to {endIndex} of {totalItems} flights
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg bg-white shadow-sm text-gray-500 disabled:opacity-50"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <span className="px-4 py-2 rounded-lg bg-white shadow-sm">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-lg bg-white shadow-sm text-gray-500 disabled:opacity-50"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
        <Footer />
      </div>
    );
  }

  // Desktop view
  const { currentItems, totalPages, totalItems, startIndex, endIndex } = getPaginatedData();

  // Flight Search Form Component
  const FlightSearchForm = ({ initialData, onSearch }) => {
    // Curated city images for visual impact
    const cityImages = {
      DEL: "https://images.unsplash.com/photo-1587474265584-bc778c18d390?q=80&w=200&auto=format&fit=crop", // Delhi
      BOM: "https://images.unsplash.com/photo-1529253355930-ddbe30b0be8a?q=80&w=200&auto=format&fit=crop", // Mumbai
      BLR: "https://images.unsplash.com/photo-1596176530529-1bb3202e8afd?q=80&w=200&auto=format&fit=crop", // Bangalore
      HYD: "https://images.unsplash.com/photo-1626014903708-377e30d0568,9?q=80&w=200&auto=format&fit=crop", // Hyderabad (Charminar usually) - using generic India fallback if specific not found
      GOI: "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?q=80&w=200&auto=format&fit=crop", // Goa
      MAA: "https://images.unsplash.com/photo-1582510003544-08d5b84d46a4?q=80&w=200&auto=format&fit=crop", // Chennai
      CCU: "https://images.unsplash.com/photo-1536421469767-80559bb6f5e1?q=80&w=200&auto=format&fit=crop", // Kolkata
      PNQ: "https://images.unsplash.com/photo-1572973418512-c9772c91839c?q=80&w=200&auto=format&fit=crop", // Pune
      DXB: "https://images.unsplash.com/photo-1546412414-8035e1776c0a?q=80&w=200&auto=format&fit=crop", // Dubai
      LHR: "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?q=80&w=200&auto=format&fit=crop", // London
      JFK: "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?q=80&w=200&auto=format&fit=crop", // NYC
      SIN: "https://images.unsplash.com/photo-1525625293386-3f8f99389edd?q=80&w=200&auto=format&fit=crop", // Singapore
      BKK: "https://images.unsplash.com/photo-1508009603885-50cf7c579365?q=80&w=200&auto=format&fit=crop", // Bangkok
      AMD: "https://images.unsplash.com/photo-1588661635384-5f5328246d65?q=80&w=200&auto=format&fit=crop", // Ahmedabad
    };

    // Default fallback image
    const validCityImages = cityImages; // Alias for cleaner use
    const defaultCityImage = "https://images.unsplash.com/photo-1477959858617-67f85cf4f1df?q=80&w=200&auto=format&fit=crop"; // Generic travel

    const [formData, setFormData] = useState({
      from: initialData.from || 'DEL',
      to: initialData.to || 'HYD',
      departDate: initialData.departDate || new Date().toISOString().split('T')[0],
      returnDate: initialData.returnDate || '',
      travelers: initialData.travelers || 1,
      travelClass: initialData.travelClass || 'ECONOMY',
      tripType: initialData.tripType || 'one-way'
    });
    const [activeField, setActiveField] = useState(null);

    const handleInputChange = (field, value) => {
      setFormData(prev => ({
        ...prev,
        [field]: value
      }));
    };

    const handleSelectCity = (field, code) => {
      setFormData(prev => ({
        ...prev,
        [field]: code
      }));
      setActiveField(null);
    };

    const renderSuggestions = (field) => {
      if (activeField !== field) return null;

      const input = formData[field];
      if (!input) return null;

      const searchTerm = input.toLowerCase();
      // Simple filtering based on cityMap access from parent scope
      const suggestions = Object.entries(cityMap)
        .filter(([code, name]) =>
          name.toLowerCase().includes(searchTerm) ||
          code.toLowerCase().includes(searchTerm)
        )
        .map(([code, name]) => ({
          code,
          name,
          country: getCountryByCode(code)
        }))
        .slice(0, 8); // Limit to 8 suggestions

      if (suggestions.length === 0) return null;

      return (
        <div className="absolute z-50 w-full mt-2 bg-white rounded-xl shadow-2xl max-h-80 overflow-y-auto border border-gray-100 divide-y divide-gray-50 overflow-hidden ring-1 ring-black ring-opacity-5">
          {suggestions.map((s) => (
            <div
              key={s.code}
              className="flex items-center px-4 py-3 hover:bg-blue-50 cursor-pointer transition-colors duration-150 group"
              onClick={() => handleSelectCity(field, s.code)}
            >
              {/* City Image */}
              <div className="flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden mr-4 shadow-sm border border-gray-100 group-hover:border-blue-200">
                <img
                  src={validCityImages[s.code] || defaultCityImage}
                  alt={s.name}
                  className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-500"
                  onError={(e) => { e.target.src = defaultCityImage; }}
                />
              </div>

              {/* Text Info */}
              <div className="flex-grow">
                <div className="font-bold text-gray-800 flex items-center justify-between">
                  <span>{s.name}</span>
                  <span className="text-xs font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded group-hover:bg-blue-200 group-hover:text-blue-800 transition-colors">{s.code}</span>
                </div>
                <div className="text-xs text-gray-500 flex items-center mt-0.5">
                  <MapPin className="w-3 h-3 mr-1 text-gray-400 group-hover:text-blue-400" />
                  {s.country || 'Unknown Country'}
                </div>
              </div>
            </div>
          ))}
        </div>
      );
    };


    const handleSubmit = (e) => {
      e.preventDefault();
      onSearch(formData);
    };

    // Close suggestions on click outside
    useEffect(() => {
      const handleClickOutside = (e) => {
        if (!e.target.closest('.search-field-container')) {
          setActiveField(null);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
      <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="col-span-1 bg-white/10 backdrop-blur-md rounded-lg p-3 search-field-container relative">
          <label className="block text-sm font-medium text-white mb-1">From</label>
          <div className="relative">
            <input
              type="text"
              value={formData.from}
              onChange={(e) => handleInputChange('from', e.target.value)}
              onFocus={() => setActiveField('from')}
              className="w-full p-2.5 pl-10 bg-white/20 border border-white/30 text-white placeholder-white/70 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent uppercase"
              placeholder="City or Airport"
            />
            <Plane className="absolute left-3 top-3 h-4 w-4 text-white/70" />
            {renderSuggestions('from')}
          </div>
        </div>

        <div className="col-span-1 bg-white/10 backdrop-blur-md rounded-lg p-3 search-field-container relative">
          <label className="block text-sm font-medium text-white mb-1">To</label>
          <div className="relative">
            <input
              type="text"
              value={formData.to}
              onChange={(e) => handleInputChange('to', e.target.value)}
              onFocus={() => setActiveField('to')}
              className="w-full p-2.5 pl-10 bg-white/20 border border-white/30 text-white placeholder-white/70 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent uppercase"
              placeholder="City or Airport"
            />
            <Plane className="absolute left-3 top-3 h-4 w-4 text-white/70 transform rotate-90" />
            {renderSuggestions('to')}
          </div>
        </div>

        <div className="col-span-1 bg-white/10 backdrop-blur-md rounded-lg p-3">
          <label className="block text-sm font-medium text-white mb-1">Departure Date</label>
          <div className="relative">
            <input
              type="date"
              value={formData.departDate}
              onChange={(e) => handleInputChange('departDate', e.target.value)}
              className="w-full p-2.5 pl-10 bg-white/20 border border-white/30 text-white placeholder-white/70 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent"
            />
            <Calendar className="absolute left-3 top-3 h-4 w-4 text-white/70" />
          </div>
        </div>

        <div className="col-span-1 bg-white/10 backdrop-blur-md rounded-lg p-3">
          <label className="block text-sm font-medium text-white mb-1">Travelers</label>
          <div className="relative">
            <select
              value={formData.travelers}
              onChange={(e) => handleInputChange('travelers', e.target.value)}
              className="w-full p-2.5 pl-10 bg-white/20 border border-white/30 text-white placeholder-white/70 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent appearance-none"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                <option key={num} value={num} className="text-gray-800">{num} Traveler{num !== 1 ? 's' : ''}</option>
              ))}
            </select>
            <Users className="absolute left-3 top-3 h-4 w-4 text-white/70" />
            <ChevronDown className="absolute right-3 top-3 h-4 w-4 text-white/70" />
          </div>
        </div>

        <div className="col-span-1 bg-white/10 backdrop-blur-md rounded-lg p-3">
          <label className="block text-sm font-medium text-white mb-1">Class</label>
          <div className="relative">
            <select
              value={formData.travelClass}
              onChange={(e) => handleInputChange('travelClass', e.target.value)}
              className="w-full p-2.5 pl-3 bg-white/20 border border-white/30 text-white placeholder-white/70 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent appearance-none"
            >
              <option value="ECONOMY" className="text-gray-800">Economy</option>
              <option value="PREMIUM_ECONOMY" className="text-gray-800">Premium Economy</option>
              <option value="BUSINESS" className="text-gray-800">Business</option>
              <option value="FIRST" className="text-gray-800">First Class</option>
            </select>
            <ChevronDown className="absolute right-3 top-3 h-4 w-4 text-white/70" />
          </div>
        </div>

        <div className="col-span-1 md:col-span-5 flex justify-center">
          <button
            type="submit"
            className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-lg transition-colors duration-200 flex items-center"
          >
            <Search className="h-5 w-5 mr-2" />
            Search Flights
          </button>
        </div>
      </form>
    );
  };

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

          <div className="bg-white/10 backdrop-blur-md rounded-xl p-6 shadow-xl border border-white/20 transform hover:scale-[1.01] transition-transform duration-300">
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
          <div className="flex items-center justify-between bg-white rounded-lg relative">
            <button
              onClick={() => handleDateNavigate(-1)}
              className="text-gray-600 hover:text-gray-800 p-2 rounded-full hover:bg-gray-100 transition-all"
              aria-label="Previous week"
            >
              <ChevronLeft className="h-6 w-6" />
            </button>

            <div className="flex space-x-2 overflow-x-auto hide-scrollbar mx-4 flex-grow">
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
              className="text-gray-600 hover:text-gray-800 p-2 rounded-full hover:bg-gray-100 transition-all"
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
              {/* Enhanced Filter Sidebar */}
              <div className="w-full md:w-1/4">
                <div className="bg-white rounded-lg shadow-md border border-gray-200 sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
                  {/* Filter Header */}
                  <div className="bg-gradient-to-r from-[#055B75] to-[#034457] p-5 text-white relative overflow-hidden">
                    <div className="absolute -right-4 -top-4 h-16 w-16 rounded-full bg-white/10"></div>
                    <div className="absolute -right-1 top-8 h-8 w-8 rounded-full bg-white/10"></div>
                    <h3 className="text-lg font-bold flex items-center relative z-10">
                      <Filter className="h-5 w-5 mr-2" />
                      Filters
                    </h3>
                  </div>

                  {/* Price Range */}
                  <div className="p-5 border-b border-gray-200 bg-white">
                    <h4 className="font-medium text-gray-800 mb-4">Price Range</h4>
                    <div className="px-2">
                      <div className="flex justify-between mb-3">
                        <span className="text-sm font-medium text-[#055B75]">{currencyService.getCurrencySymbol()}{filters.price[0]}</span>
                        <span className="text-sm font-medium text-[#055B75]">{currencyService.getCurrencySymbol()}{filters.price[1]}</span>
                      </div>

                      <input
                        type="range"
                        min="0"
                        max="50000"
                        step="1000"
                        value={filters.price[1]}
                        onChange={(e) => handleFilterChange('price', [filters.price[0], parseInt(e.target.value)])}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-[#055B75] focus:ring-[#055B75]"
                      />
                    </div>
                  </div>

                  {/* Stops */}
                  <div className="p-5 border-b border-gray-200 bg-white">
                    <h4 className="font-medium text-gray-800 mb-4">Stops</h4>
                    <div className="space-y-2">
                      <label className="flex items-center p-3 hover:bg-[#F0FAFC] rounded-lg transition-colors cursor-pointer">
                        <input
                          type="radio"
                          name="stops"
                          className="w-4 h-4 text-[#055B75] border-gray-300 focus:ring-[#055B75]"
                          checked={filters.stops === "any"}
                          onChange={() => handleFilterChange('stops', "any")}
                        />
                        <span className="ml-3 text-sm text-gray-700 font-medium">Any number of stops</span>
                      </label>

                      <label className="flex items-center p-2 hover:bg-[#F0FAFC] rounded-md transition-colors cursor-pointer">
                        <input
                          type="radio"
                          name="stops"
                          className="w-4 h-4 text-[#055B75] border-gray-300 focus:ring-[#055B75] focus:ring-2"
                          checked={filters.stops === "0"}
                          onChange={() => handleFilterChange('stops', "0")}
                        />
                        <span className="ml-2 text-sm text-gray-700">Non-stop only</span>
                      </label>

                      <label className="flex items-center p-2 hover:bg-[#F0FAFC] rounded-md transition-colors cursor-pointer">
                        <input
                          type="radio"
                          name="stops"
                          className="w-4 h-4 text-[#055B75] border-gray-300 focus:ring-[#055B75] focus:ring-2"
                          checked={filters.stops === "1"}
                          onChange={() => handleFilterChange('stops', "1")}
                        />
                        <span className="ml-2 text-sm text-gray-700">1 stop max</span>
                      </label>
                    </div>
                  </div>

                  {/* Airlines */}
                  <div className="p-5 bg-white">
                    <h4 className="font-medium text-gray-800 mb-4">Airlines</h4>
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-[#65B3CF] scrollbar-track-gray-100">
                      {getAllAirlines().map(airline => (
                        <label key={airline} className="flex items-center p-2 hover:bg-[#F0FAFC] rounded-md transition-colors cursor-pointer">
                          <input
                            type="checkbox"
                            className="w-4 h-4 text-[#055B75] border-gray-300 rounded focus:ring-[#055B75] focus:ring-2"
                            checked={filters.airlines.includes(airline)}
                            onChange={() => toggleAirlineFilter(airline)}
                          />
                          <span className="ml-2 text-sm text-gray-700 font-medium">{airline}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  {/* Reset Filters */}
                  <div className="p-5 border-t border-gray-200 bg-gray-50">
                    <button
                      onClick={() => {
                        setFilters({
                          price: [0, 20000],
                          stops: "any",
                          airlines: []
                        });
                      }}
                      className="w-full py-2.5 bg-white border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 transition-colors flex items-center justify-center"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Reset Filters
                    </button>
                  </div>
                </div>
              </div>

              {/* Results */}
              <div className="w-full md:w-3/4">
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

                    <div className="flex items-center space-x-4">
                      <span className="text-gray-700 font-medium">Sort by:</span>
                      <div className="relative">
                        <select
                          value={sortOrder}
                          onChange={(e) => setSortOrder(e.target.value)}
                          className="appearance-none pl-3 pr-10 py-2 bg-[#B9D0DC] border border-[#B9D0DC] rounded-lg text-[#055B75] font-medium focus:ring-2 focus:ring-[#65B3CF] focus:outline-none placeholder-[#055B75]"
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
                          price: [0, 20000],
                          stops: "any",
                          airlines: []
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
                        className="bg-white rounded-xl shadow-sm hover:shadow-md overflow-hidden border border-gray-200 hover:border-[#65B3CF] transition-all duration-300 group"
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
                                <div className="text-sm text-gray-500 flex items-center">
                                  <span className="font-medium text-[#055B75]">{flight.segments?.[0]?.flightNumber || 'N/A'}</span>
                                  <span className="mx-2">•</span>
                                  <span>{flight.segments?.[0]?.aircraft || 'Unknown Aircraft'}</span>
                                </div>
                              </div>
                            </div>

                            {/* Price and Book Button */}
                            <div className="flex flex-col items-end">
                              <div className="text-right mb-3">
                                <div className="text-3xl font-bold text-[#055B75] flex items-center">
                                  <Price amount={flight.price} showCode={true} />
                                  {Math.random() > 0.7 && (
                                    <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs font-bold">DEAL</span>
                                  )}
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
                                {flight.cabin?.charAt(0).toUpperCase() + flight.cabin?.slice(1).toLowerCase() || 'Economy'}
                              </div>
                              <div className="text-xs mt-1">
                                {flight.baggage?.checked?.weight ? `${flight.baggage.checked.weight}${flight.baggage.checked.weightUnit}` : 'No checked baggage'}
                              </div>
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

