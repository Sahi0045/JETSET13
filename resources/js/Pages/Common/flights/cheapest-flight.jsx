"use client"

import React, { useState, useEffect, useCallback } from "react"
import { ChevronDown, Loader2, AlertCircle } from "lucide-react"
import Price from "../../../Components/Price"
import FlightAnalyticsService from "../../../Services/FlightAnalyticsService.js"
import GeoService from "../../../Services/GeoService.js"
import { allAirports } from "./airports.js"

// Build a lookup map: IATA code → city details
const airportByCode = allAirports.reduce((acc, a) => {
  if (a.code) acc[a.code] = a;
  return acc;
}, {});

// Curated Unsplash images keyed by city name (no API key needed)
const cityImages = {
  "London": "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?q=80&w=1200&auto=format&fit=crop",
  "Paris": "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?q=80&w=1200&auto=format&fit=crop",
  "Dubai": "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?q=80&w=1200&auto=format&fit=crop",
  "Singapore": "https://images.unsplash.com/photo-1525625293386-38f0e1d2b5e5?q=80&w=1200&auto=format&fit=crop",
  "Bangkok": "https://images.unsplash.com/photo-1563492065599-3520f775eeed?q=80&w=1200&auto=format&fit=crop",
  "New York": "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?q=80&w=1200&auto=format&fit=crop",
  "Sydney": "https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?q=80&w=1200&auto=format&fit=crop",
  "Tokyo": "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?q=80&w=1200&auto=format&fit=crop",
  "Barcelona": "https://images.unsplash.com/photo-1583422409516-2895a77efded?q=80&w=1200&auto=format&fit=crop",
  "Rome": "https://images.unsplash.com/photo-1552832230-c0197dd311b5?q=80&w=1200&auto=format&fit=crop",
  "Amsterdam": "https://images.unsplash.com/photo-1534351590666-13e3e96b5017?q=80&w=1200&auto=format&fit=crop",
  "Istanbul": "https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?q=80&w=1200&auto=format&fit=crop",
  "Mumbai": "https://images.unsplash.com/photo-1566552881560-0be862a7c445?q=80&w=1200&auto=format&fit=crop",
  "New Delhi": "https://images.unsplash.com/photo-1587474260584-136574528ed5?q=80&w=1200&auto=format&fit=crop",
  "Bangalore": "https://images.unsplash.com/photo-1596176530529-78163a4f7af2?q=80&w=1200&auto=format&fit=crop",
  "Hong Kong": "https://images.unsplash.com/photo-1536599018102-9f803c140fc1?q=80&w=1200&auto=format&fit=crop",
  "Seoul": "https://images.unsplash.com/photo-1538485399081-7c8070d2b08f?q=80&w=1200&auto=format&fit=crop",
  "Kuala Lumpur": "https://images.unsplash.com/photo-1596422846543-75c6fc197f07?q=80&w=1200&auto=format&fit=crop",
  "Los Angeles": "https://images.unsplash.com/photo-1534190760961-74e8c1c5c3da?q=80&w=1200&auto=format&fit=crop",
  "San Francisco": "https://images.unsplash.com/photo-1501594907352-04cda38ebc29?q=80&w=1200&auto=format&fit=crop",
  "Berlin": "https://images.unsplash.com/photo-1560969184-10fe8719e047?q=80&w=1200&auto=format&fit=crop",
  "Madrid": "https://images.unsplash.com/photo-1543783207-ec64e4d95325?q=80&w=1200&auto=format&fit=crop",
  "Lisbon": "https://images.unsplash.com/photo-1585208798174-6cedd86e019a?q=80&w=1200&auto=format&fit=crop",
  "Athens": "https://images.unsplash.com/photo-1555993539-1732b0258235?q=80&w=1200&auto=format&fit=crop",
  "Vienna": "https://images.unsplash.com/photo-1516550893923-42d28e5677af?q=80&w=1200&auto=format&fit=crop",
  "Prague": "https://images.unsplash.com/photo-1541849546-216549ae216d?q=80&w=1200&auto=format&fit=crop",
  "Zurich": "https://images.unsplash.com/photo-1515488764276-beab7607c1e6?q=80&w=1200&auto=format&fit=crop",
  "Frankfurt": "https://images.unsplash.com/photo-1467269204594-9661b134dd2b?q=80&w=1200&auto=format&fit=crop",
  "Milan": "https://images.unsplash.com/photo-1520440229-6469a149ac59?q=80&w=1200&auto=format&fit=crop",
  "Goa": "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?q=80&w=1200&auto=format&fit=crop",
  "Jaipur": "https://images.unsplash.com/photo-1524230507669-5ff97982bb6e?q=80&w=1200&auto=format&fit=crop",
  "Chennai": "https://images.unsplash.com/photo-1582510003544-4d00b7f74220?q=80&w=1200&auto=format&fit=crop",
  "Kolkata": "https://images.unsplash.com/photo-1558431382-27e303142255?q=80&w=1200&auto=format&fit=crop",
  "Hyderabad": "https://images.unsplash.com/photo-1572552667988-6abe1be60ce5?q=80&w=1200&auto=format&fit=crop",
  "Copenhagen": "https://images.unsplash.com/photo-1513622470522-26c3c8a854bc?q=80&w=1200&auto=format&fit=crop",
  "Stockholm": "https://images.unsplash.com/photo-1509356843151-3e7d96241e11?q=80&w=1200&auto=format&fit=crop",
};

// Get image for a city, with generic travel fallback
const getCityImage = (cityName) => {
  return cityImages[cityName] || `https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?q=80&w=1200&auto=format&fit=crop`;
};

// Format date nicely
const formatDate = (dateStr) => {
  if (!dateStr) return "Flexible dates";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { weekday: 'short', day: '2-digit', month: 'short' });
  } catch {
    return dateStr;
  }
};

export default function CheapestFlights({ onBookFlight }) {
  const [flights, setFlights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [originCity, setOriginCity] = useState("");
  const [originCode, setOriginCode] = useState("");
  const [loadedImages, setLoadedImages] = useState({});

  // Step 1: Discover destinations from API, then fetch cheapest dates for them
  useEffect(() => {
    let isMounted = true;

    const fetchCheapestFlights = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get user's origin city from geolocation
        const location = await GeoService.getUserLocation();
        const userOriginCode = location.cityCode || 'DEL';
        const userOriginCity = location.city || 'New Delhi';

        if (isMounted) {
          setOriginCode(userOriginCode);
          setOriginCity(userOriginCity);
        }

        console.log(`💰 Discovering destinations from ${userOriginCity} (${userOriginCode})`);

        // Step 1: Dynamically discover top destinations via Amadeus analytics
        const bookedData = await FlightAnalyticsService.getMostBookedDestinations(userOriginCode);

        // If API returns no data, use country-based curated destinations
        let destinationCodes;
        if (bookedData && bookedData.length > 0) {
          destinationCodes = bookedData.map(d => ({ destination: d.destination }));
          console.log(`📊 Discovered ${bookedData.length} popular destinations, fetching cheapest dates...`);
        } else {
          console.log('📊 API returned no destinations, using curated fallback for country:', location.countryCode);
          // Country-specific popular flight routes
          const countryFallbacks = {
            'IN': ['BOM', 'BLR', 'GOI', 'JAI', 'CCU', 'HYD', 'MAA', 'DXB', 'BKK', 'SIN'],
            'US': ['LAX', 'JFK', 'ORD', 'SFO', 'MIA', 'LHR', 'CDG', 'NRT', 'CUN', 'HNL'],
            'GB': ['CDG', 'BCN', 'AMS', 'DXB', 'JFK', 'FCO', 'IST', 'ATH', 'LIS', 'BKK'],
            'AE': ['BOM', 'DEL', 'LHR', 'BKK', 'IST', 'CDG', 'SIN', 'JFK', 'CAI', 'KUL'],
          };
          const fallbackCodes = countryFallbacks[location.countryCode] || countryFallbacks['IN'];
          // Remove origin from fallback list
          destinationCodes = fallbackCodes
            .filter(c => c !== userOriginCode)
            .map(c => ({ destination: c }));
        }

        // Step 2: For each discovered destination, fetch cheapest flight dates in parallel
        const promises = destinationCodes
          .slice(0, 6) // Limit parallel API calls to avoid timeouts
          .map(async (item) => {
            const destCode = item.destination;
            const airport = airportByCode[destCode];
            const cityName = airport?.name || destCode;
            const country = airport?.country || "International";

            try {
              const data = await FlightAnalyticsService.getCheapestFlightDates(
                userOriginCode,
                destCode,
                { oneWay: true }
              );

              if (data && data.length > 0) {
                // Get the cheapest option
                const cheapest = data.reduce((min, curr) =>
                  parseFloat(curr.price?.total || Infinity) < parseFloat(min.price?.total || Infinity) ? curr : min
                  , data[0]);

                return {
                  id: destCode,
                  destination: cityName,
                  destinationCode: destCode,
                  region: country,
                  price: parseFloat(cheapest.price?.total || 0),
                  currency: cheapest.price?.currency || 'USD',
                  date: formatDate(cheapest.departureDate),
                  image: getCityImage(cityName),
                  isApiData: true,
                };
              }
              return null;
            } catch (err) {
              console.warn(`⚠️ Failed to get cheapest for ${cityName}:`, err.message);
              return null;
            }
          });

        // Use allSettled so partial successes still display
        const settled = await Promise.allSettled(promises);
        const validFlights = settled
          .filter(r => r.status === 'fulfilled' && r.value)
          .map(r => r.value);

        if (isMounted) {
          if (validFlights.length > 0) {
            // Sort by price ascending
            validFlights.sort((a, b) => a.price - b.price);
            setFlights(validFlights);
          } else {
            // Fallback: show destination cards without prices
            const fallbackCards = destinationCodes.slice(0, 6).map(item => {
              const code = item.destination;
              const airport = airportByCode[code];
              return {
                id: code,
                destination: airport?.name || code,
                destinationCode: code,
                region: airport?.country || 'International',
                price: null,
                currency: 'USD',
                date: 'Flexible dates',
                image: getCityImage(airport?.name || code),
                isApiData: false,
              };
            }).filter(Boolean);
            if (fallbackCards.length > 0) {
              setFlights(fallbackCards);
            } else {
              setError("No cheapest fares available right now. Please try again later.");
            }
          }
          setLoading(false);
        }
      } catch (err) {
        console.error('❌ Cheapest flights fetch error:', err);
        if (isMounted) {
          setError("Unable to load cheapest fares. Please try again later.");
          setLoading(false);
        }
      }
    };

    fetchCheapestFlights();
    return () => { isMounted = false; };
  }, []);

  const handleImageLoad = useCallback((id) => {
    setLoadedImages(prev => ({ ...prev, [id]: true }));
  }, []);

  // Loading skeleton
  if (loading) {
    return (
      <div className="bg-[#B9D0DC] rounded-xl p-8 shadow-lg border border-white/20">
        <div className="flex items-center mb-8 gap-3">
          <h3 className="text-[#055B75] text-2xl font-bold">Cheapest Fares From</h3>
          <div className="bg-white/60 animate-pulse rounded-full px-4 py-1.5 w-32 h-8"></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="bg-white rounded-xl overflow-hidden shadow-md animate-pulse">
              <div className="h-32 bg-gray-200"></div>
              <div className="p-4">
                <div className="h-5 bg-gray-200 rounded w-24 mb-2"></div>
                <div className="h-4 bg-gray-200 rounded w-16 mb-3"></div>
                <div className="flex justify-between items-center pt-3 border-t border-gray-100">
                  <div className="h-6 bg-gray-200 rounded w-20"></div>
                  <div className="h-8 bg-gray-200 rounded w-24"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error && flights.length === 0) {
    return (
      <div className="bg-[#B9D0DC] rounded-xl p-8 shadow-lg border border-white/20">
        <div className="flex items-center mb-8 gap-3">
          <h3 className="text-[#055B75] text-2xl font-bold">Cheapest Fares</h3>
        </div>
        <div className="bg-white/80 backdrop-blur-sm rounded-lg p-8 text-center">
          <AlertCircle className="h-12 w-12 text-[#055B75] mx-auto mb-4 opacity-60" />
          <h4 className="text-xl font-medium text-gray-700 mb-2">No Fares Available</h4>
          <p className="text-gray-500">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-[#B9D0DC] rounded-xl p-8 shadow-lg border border-white/20">
      <div className="flex flex-col md:flex-row md:items-center mb-8 gap-4">
        <h3 className="text-[#055B75] text-2xl font-bold">Cheapest Fares From</h3>
        <div className="bg-white text-[#055B75] px-4 py-1.5 rounded-full border border-[#055B75]/30 text-base font-semibold">
          {originCity} ({originCode})
        </div>
        <div className="ml-auto flex items-center text-sm text-[#055B75]/70">
          <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
          Live prices from Amadeus
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {flights.map((flight) => (
          <div key={flight.id} className="bg-white rounded-xl overflow-hidden shadow-md hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300 group">
            {/* Image container */}
            <div className="relative h-32 overflow-hidden">
              {/* Skeleton while image loads */}
              {!loadedImages[flight.id] && (
                <div className="absolute inset-0 bg-gradient-to-br from-gray-200 via-gray-300 to-gray-200 animate-pulse z-5"></div>
              )}
              <img
                src={flight.image}
                alt={flight.destination}
                className={`w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500 ${loadedImages[flight.id] ? 'opacity-100' : 'opacity-0'}`}
                onLoad={() => handleImageLoad(flight.id)}
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?q=80&w=1200&auto=format&fit=crop";
                  handleImageLoad(flight.id);
                }}
              />
              {/* Overlay gradient */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent"></div>

              {/* Corner decoration */}
              <div className="absolute top-0 right-0 w-12 h-12 bg-[#65B3CF]/20 backdrop-blur-sm rounded-bl-xl"></div>

              {/* Price tag — only for API data */}
              {flight.isApiData && (
                <div className="absolute bottom-2 right-2 bg-[#055B75]/90 backdrop-blur-sm text-white text-xs font-bold py-1 px-2 rounded-md flex items-center shadow-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                  Best Price
                </div>
              )}
            </div>

            {/* Content section */}
            <div className="p-4">
              {/* Destination and region */}
              <div className="mb-2">
                <div className="flex items-center">
                  <h4 className="font-bold text-gray-800">{flight.destination}</h4>
                  <span className="text-[#65B3CF] text-xs font-medium ml-2">({flight.destinationCode})</span>
                  <span className="text-gray-400 mx-1">,</span>
                  <p className="text-gray-600 text-sm">{flight.region}</p>
                </div>
                <div className="flex items-center mt-1">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-gray-400 mr-1" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                  </svg>
                  <p className="text-gray-500 text-xs font-medium">{flight.date}</p>
                </div>
              </div>

              {/* Price and button */}
              <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-100">
                <div className="flex items-baseline">
                  {flight.price != null ? (
                    <>
                      <p className="font-bold text-[#055B75] text-lg">
                        <Price amount={flight.price} />
                      </p>
                      <span className="text-xs text-gray-500 ml-1">onwards</span>
                    </>
                  ) : (
                    <p className="font-semibold text-[#055B75] text-sm">Search flights</p>
                  )}
                </div>

                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onBookFlight && onBookFlight(flight.destination);
                  }}
                  className="bg-[#055B75] hover:bg-[#044A5F] text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors shadow-sm"
                >
                  Book Flight
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
