import React, { useState, useEffect, useCallback } from "react"
import { destinations } from "./data.js"
import FlightAnalyticsService from "../../../Services/FlightAnalyticsService.js"
import { allAirports } from "./airports.js"
import { useLocationContext } from "../../../Context/LocationContext"

// Build IATA code → airport details lookup
const airportByCode = allAirports.reduce((acc, a) => {
  if (a.code) acc[a.code] = a;
  return acc;
}, {});

// Curated Unsplash images for popular cities (high quality, reliable)
const cityImages = {
  "New York": "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?q=80&w=2074&auto=format&fit=crop",
  "London": "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?q=80&w=2074&auto=format&fit=crop",
  "Paris": "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?q=80&w=2074&auto=format&fit=crop",
  "Tokyo": "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?q=80&w=2074&auto=format&fit=crop",
  "Dubai": "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?q=80&w=2074&auto=format&fit=crop",
  "Singapore": "https://images.unsplash.com/photo-1525625293386-38f0e1d2b5e5?q=80&w=2074&auto=format&fit=crop",
  "Sydney": "https://images.unsplash.com/photo-1506973035872-a4ec16b8e8d9?q=80&w=2074&auto=format&fit=crop",
  "Barcelona": "https://images.unsplash.com/photo-1583422409516-2895a77efded?q=80&w=2074&auto=format&fit=crop",
  "Rome": "https://images.unsplash.com/photo-1552832230-c0197dd311b5?q=80&w=2074&auto=format&fit=crop",
  "Amsterdam": "https://images.unsplash.com/photo-1534351590666-13e3e96b5017?q=80&w=2074&auto=format&fit=crop",
  "Bangkok": "https://images.unsplash.com/photo-1563492065599-3520f775eeed?q=80&w=2074&auto=format&fit=crop",
  "Istanbul": "https://images.unsplash.com/photo-1524231757912-21f4fe3a7200?q=80&w=2074&auto=format&fit=crop",
  "Mumbai": "https://images.unsplash.com/photo-1566552881560-0be862a7c445?q=80&w=2074&auto=format&fit=crop",
  "New Delhi": "https://images.unsplash.com/photo-1587474260584-136574528ed5?q=80&w=2074&auto=format&fit=crop",
  "Bangalore": "https://images.unsplash.com/photo-1596176530529-78163a4f7af2?q=80&w=2074&auto=format&fit=crop",
  "Hong Kong": "https://images.unsplash.com/photo-1536599018102-9f803c140fc1?q=80&w=2074&auto=format&fit=crop",
  "Seoul": "https://images.unsplash.com/photo-1538485399081-7c8070d2b08f?q=80&w=2074&auto=format&fit=crop",
  "Kuala Lumpur": "https://images.unsplash.com/photo-1596422846543-75c6fc197f07?q=80&w=2074&auto=format&fit=crop",
  "Los Angeles": "https://images.unsplash.com/photo-1534190760961-74e8c1c5c3da?q=80&w=2074&auto=format&fit=crop",
  "San Francisco": "https://images.unsplash.com/photo-1501594907352-04cda38ebc29?q=80&w=2074&auto=format&fit=crop",
  "Toronto": "https://images.unsplash.com/photo-1517090504332-af790e7d0e82?q=80&w=2074&auto=format&fit=crop",
  "Berlin": "https://images.unsplash.com/photo-1560969184-10fe8719e047?q=80&w=2074&auto=format&fit=crop",
  "Madrid": "https://images.unsplash.com/photo-1543783207-ec64e4d95325?q=80&w=2074&auto=format&fit=crop",
  "Lisbon": "https://images.unsplash.com/photo-1585208798174-6cedd86e019a?q=80&w=2074&auto=format&fit=crop",
  "Athens": "https://images.unsplash.com/photo-1555993539-1732b0258235?q=80&w=2074&auto=format&fit=crop",
  "Vienna": "https://images.unsplash.com/photo-1516550893923-42d28e5677af?q=80&w=2074&auto=format&fit=crop",
  "Prague": "https://images.unsplash.com/photo-1541849546-216549ae216d?q=80&w=2074&auto=format&fit=crop",
  "Zurich": "https://images.unsplash.com/photo-1515488764276-beab7607c1e6?q=80&w=2074&auto=format&fit=crop",
  "Frankfurt": "https://images.unsplash.com/photo-1467269204594-9661b134dd2b?q=80&w=2074&auto=format&fit=crop",
  "Milan": "https://images.unsplash.com/photo-1520440229-6469a149ac59?q=80&w=2074&auto=format&fit=crop",
  "Cairo": "https://images.unsplash.com/photo-1539768942893-daf53e736b68?q=80&w=2074&auto=format&fit=crop",
  "Johannesburg": "https://images.unsplash.com/photo-1577948000111-9c970dfe3743?q=80&w=2074&auto=format&fit=crop",
  "São Paulo": "https://images.unsplash.com/photo-1543059080-f9b1272213d5?q=80&w=2074&auto=format&fit=crop",
  "Mexico City": "https://images.unsplash.com/photo-1585464231875-d9ef1f5ad396?q=80&w=2074&auto=format&fit=crop",
  "Copenhagen": "https://images.unsplash.com/photo-1513622470522-26c3c8a854bc?q=80&w=2074&auto=format&fit=crop",
  "Stockholm": "https://images.unsplash.com/photo-1509356843151-3e7d96241e11?q=80&w=2074&auto=format&fit=crop",
  "Moscow": "https://images.unsplash.com/photo-1513326738677-b964603b136d?q=80&w=2074&auto=format&fit=crop",
  "Chennai": "https://images.unsplash.com/photo-1582510003544-4d00b7f74220?q=80&w=2074&auto=format&fit=crop",
  "Kolkata": "https://images.unsplash.com/photo-1558431382-27e303142255?q=80&w=2074&auto=format&fit=crop",
  "Hyderabad": "https://images.unsplash.com/photo-1572552667988-6abe1be60ce5?q=80&w=2074&auto=format&fit=crop",
  "Goa": "https://images.unsplash.com/photo-1512343879784-a960bf40e7f2?q=80&w=2074&auto=format&fit=crop",
  "Jaipur": "https://images.unsplash.com/photo-1524230507669-5ff97982bb6e?q=80&w=2074&auto=format&fit=crop",
};

// Get image for a city, with fallback
const getCityImage = (cityName) => {
  return cityImages[cityName] || `https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?q=80&w=2070&auto=format&fit=crop`;
};

// Preload images
const preloadImage = (src) => {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = src;
    if (img.complete) resolve(true);
  });
};

export default function PopularDestinations({ onSelectDestination }) {
  const { cityCode, loading: locationLoading } = useLocationContext();
  const [displayDestinations, setDisplayDestinations] = useState(destinations);
  const [trendingBadges, setTrendingBadges] = useState({});
  const [isApiLoading, setIsApiLoading] = useState(true);
  const [selectedDestination, setSelectedDestination] = useState(null);
  const [loadedImages, setLoadedImages] = useState({});
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  // Fetch most booked destinations from API and build dynamic cards
  useEffect(() => {
    let isMounted = true;

    const fetchTrendingDestinations = async () => {
      // Wait for location context to be loaded
      if (locationLoading) return;

      try {
        // Get user location from shared LocationContext
        const originCode = cityCode || 'DEL';

        console.log(`📊 Fetching most booked destinations from ${originCode}`);

        const bookedData = await FlightAnalyticsService.getMostBookedDestinations(originCode);

        if (isMounted && bookedData && bookedData.length > 0) {
          console.log(`✅ Got ${bookedData.length} trending destinations from API`);

          // Build dynamic destination cards from API data
          const apiDestinations = [];
          const badges = {};

          bookedData.forEach((item, index) => {
            const code = item.destination;
            const airport = airportByCode[code];

            if (airport || code) {
              const cityName = airport?.name || code;
              const region = airport?.country || item.subType || "International";

              apiDestinations.push({
                id: `api-${code}`,
                name: cityName,
                code: code,
                region: region,
                image: getCityImage(cityName),
                isApiData: true,
              });

              badges[code] = {
                rank: index + 1,
                score: item.flightScore || item.travelerScore
              };
            }
          });

          setTrendingBadges(badges);

          if (apiDestinations.length >= 4) {
            // We got enough API destinations, use them directly
            setDisplayDestinations(apiDestinations.slice(0, 8));
          } else {
            // Supplement with static destinations (de-duped)
            const apiCodes = new Set(apiDestinations.map(d => d.code));
            const staticFiller = destinations
              .filter(d => !apiCodes.has(d.code))
              .map(d => ({
                ...d,
                image: getCityImage(d.name) // Use dynamic images
              }));
            setDisplayDestinations([
              ...apiDestinations,
              ...staticFiller
            ].slice(0, 8));
          }
        } else {
          // API returned no data, use static destinations with dynamic images
          setDisplayDestinations(destinations.map(d => ({
            ...d,
            image: getCityImage(d.name)
          })));
        }
      } catch (error) {
        console.warn('⚠️ Could not fetch trending destinations:', error.message);
        // Use static destinations with dynamic images as fallback
        setDisplayDestinations(destinations.map(d => ({
          ...d,
          image: getCityImage(d.name)
        })));
      } finally {
        if (isMounted) {
          setIsApiLoading(false);
        }
      }
    };

    fetchTrendingDestinations();

    return () => {
      isMounted = false;
    };
  }, [cityCode, locationLoading]);

  // Preload images on component mount
  useEffect(() => {
    let isMounted = true;

    const loadImages = async () => {
      const loadPromises = displayDestinations.map(async (destination) => {
        if (destination.image) {
          await preloadImage(destination.image);
          if (isMounted) {
            setLoadedImages(prev => ({ ...prev, [destination.id]: true }));
          }
        }
      });

      await Promise.all(loadPromises);
      if (isMounted) {
        setIsInitialLoad(false);
      }
    };

    loadImages();

    return () => {
      isMounted = false;
    };
  }, [displayDestinations]);

  const handleImageLoad = useCallback((destinationId) => {
    setLoadedImages(prev => ({ ...prev, [destinationId]: true }));
  }, []);

  const handleDestinationClick = (destination) => {
    setSelectedDestination(destination);
    if (onSelectDestination) {
      onSelectDestination(destination.name);
    }
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {displayDestinations.map((destination, index) => (
        <div
          key={destination.id}
          className={`rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300 relative h-[320px] cursor-pointer group ${selectedDestination?.id === destination.id ? 'ring-2 ring-[#055B75]' : ''
            }`}
          onClick={() => handleDestinationClick(destination)}
        >
          {/* Skeleton loader */}
          {!loadedImages[destination.id] && (
            <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-gray-200 via-gray-300 to-gray-200 animate-pulse z-5">
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/20 to-transparent"></div>
              <div className="absolute bottom-5 left-5 right-5">
                <div className="h-7 bg-gray-400/50 rounded w-32 mb-2"></div>
                <div className="h-4 bg-gray-400/30 rounded w-24"></div>
              </div>
            </div>
          )}

          {/* Full bleed image */}
          <div className={`absolute inset-0 w-full h-full transition-opacity duration-300 ${loadedImages[destination.id] ? 'opacity-100' : 'opacity-0'}`}>
            <img
              src={destination.image || getCityImage(destination.name)}
              alt={destination.name}
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
              loading="eager"
              fetchpriority={index < 4 ? "high" : "auto"}
              onLoad={() => handleImageLoad(destination.id)}
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?q=80&w=2070&auto=format&fit=crop";
                handleImageLoad(destination.id);
              }}
            />
            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-black/30"></div>
          </div>

          {/* Dynamic Trending Badge */}
          {(trendingBadges[destination.code] || index === 0) && (
            <div className="absolute top-4 left-4 z-10">
              <div className={`text-white text-sm font-medium py-1 px-4 rounded-full shadow-md ${trendingBadges[destination.code] ? 'bg-gradient-to-r from-[#FF6B6B] to-[#FF8E53]' : 'bg-[#055B75] animate-pulse'}`}>
                {trendingBadges[destination.code]
                  ? `🔥 #${trendingBadges[destination.code].rank} Trending`
                  : 'Popular Choice'}
              </div>
            </div>
          )}

          {/* API data indicator */}
          {destination.isApiData && (
            <div className="absolute top-4 right-4 z-10">
              <div className="bg-green-500/80 backdrop-blur-sm text-white text-[10px] font-medium py-0.5 px-2 rounded-full">
                <span className="inline-block w-1.5 h-1.5 bg-white rounded-full mr-1 animate-pulse"></span>
                Live
              </div>
            </div>
          )}

          {/* Content overlay */}
          <div className="absolute inset-0 flex flex-col justify-between p-5 z-10">
            <div></div>

            {/* Bottom section */}
            <div>
              <h3 className="text-white text-2xl font-bold mb-1">
                {destination.name}
                <span className="ml-2 text-[#65B3CF] text-sm font-normal">
                  ({destination.code})
                </span>
              </h3>

              <div className="flex items-center mb-4">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 text-white/90 mr-1"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                <span className="text-white/90">
                  {destination.region}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5 text-[#65B3CF] mr-1"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
                    />
                  </svg>
                  <span className="text-white"></span>
                </div>

                {/* Book now button */}
                <button
                  className={`bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white text-xs font-medium py-1 px-3 rounded-lg transition-colors ${selectedDestination?.id === destination.id ? 'bg-[#055B75] hover:bg-[#044A5F]' : ''
                    }`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleDestinationClick(destination);
                  }}
                >
                  {selectedDestination?.id === destination.id ? 'Selected' : 'Book Now'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
