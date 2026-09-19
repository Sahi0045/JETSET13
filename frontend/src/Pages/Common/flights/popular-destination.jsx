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
  "New York": "/images/destinations/photo-1496442226666-8d4d0e62e6e9.webp",
  "London": "/images/destinations/photo-1513635269975-59663e0ac1ad.webp",
  "Paris": "/images/destinations/photo-1502602898657-3e91760cbb34.webp",
  "Tokyo": "/images/destinations/photo-1540959733332-eab4deabeeaf.webp",
  "Dubai": "/images/destinations/photo-1512453979798-5ea266f8880c.webp",
  "Singapore": "/images/destinations/photo-1496939376851-89342e90adcd.webp",
  "Sydney": "/images/destinations/photo-1506973035872-a4ec16b8e8d9.webp",
  "Barcelona": "/images/destinations/photo-1583422409516-2895a77efded.webp",
  "Rome": "/images/destinations/photo-1552832230-c0197dd311b5.webp",
  "Amsterdam": "/images/destinations/photo-1534351590666-13e3e96b5017.webp",
  "Bangkok": "/images/destinations/photo-1563492065599-3520f775eeed.webp",
  "Istanbul": "/images/destinations/photo-1524231757912-21f4fe3a7200.webp",
  "Mumbai": "/images/destinations/photo-1566552881560-0be862a7c445.webp",
  "New Delhi": "/images/destinations/photo-1587474260584-136574528ed5.webp",
  "Bangalore": "/images/destinations/photo-1596176530529-78163a4f7af2.webp",
  "Hong Kong": "/images/destinations/photo-1536599018102-9f803c140fc1.webp",
  "Seoul": "/images/destinations/photo-1506351421178-63b52a2d2562.webp",
  "Kuala Lumpur": "/images/destinations/photo-1596422846543-75c6fc197f07.webp",
  "Los Angeles": "/images/destinations/photo-1534190760961-74e8c1c5c3da.webp",
  "San Francisco": "/images/destinations/photo-1501594907352-04cda38ebc29.webp",
  "Toronto": "/images/destinations/photo-1517935706615-2717063c2225.webp",
  "Berlin": "/images/destinations/photo-1560969184-10fe8719e047.webp",
  "Madrid": "/images/destinations/photo-1543783207-ec64e4d95325.webp",
  "Lisbon": "/images/destinations/photo-1585208798174-6cedd86e019a.webp",
  "Athens": "/images/destinations/photo-1555993539-1732b0258235.webp",
  "Vienna": "/images/destinations/photo-1516550893923-42d28e5677af.webp",
  "Prague": "/images/destinations/photo-1541849546-216549ae216d.webp",
  "Zurich": "/images/destinations/photo-1515488764276-beab7607c1e6.webp",
  "Frankfurt": "/images/destinations/photo-1467269204594-9661b134dd2b.webp",
  "Milan": "/images/destinations/photo-1520440229-6469a149ac59.webp",
  "Cairo": "/images/destinations/photo-1572252009286-268acec5ca0a.webp",
  "Johannesburg": "/images/destinations/photo-1577948000111-9c970dfe3743.webp",
  "São Paulo": "/images/destinations/photo-1543059080-f9b1272213d5.webp",
  "Mexico City": "/images/destinations/photo-1585464231875-d9ef1f5ad396.webp",
  "Copenhagen": "/images/destinations/photo-1513622470522-26c3c8a854bc.webp",
  "Stockholm": "/images/destinations/photo-1509356843151-3e7d96241e11.webp",
  "Moscow": "/images/destinations/photo-1513326738677-b964603b136d.webp",
  "Chennai": "/images/destinations/photo-1582510003544-4d00b7f74220.webp",
  "Kolkata": "/images/destinations/photo-1558431382-27e303142255.webp",
  "Hyderabad": "/images/destinations/photo-1567157577867-05ccb1388e66.webp",
  "Goa": "/images/destinations/photo-1512343879784-a960bf40e7f2.webp",
  "Jaipur": "/images/destinations/photo-1477587458883-47145ed94245.webp",
};

// A city is more than one photograph. Where we have several, the card cross-fades
// between them, so the gallery moves without the whole row sliding about.
// Every file is WebP and served by us: scripts/media/localise-unsplash.mjs
// downloads them and records the licence in public/images/destinations/credits.json.
const photo = (id) => `/images/destinations/${id}.webp`;

const cityGallery = {
  "New York": [photo('photo-1485871981521-5b1fd3805eee'), photo('photo-1522083165195-3424ed129620')],
  "London": [photo('photo-1520986606214-8b456906c813'), photo('photo-1486299267070-83823f5448dd')],
  "Paris": [photo('photo-1431274172761-fca41d930114'), photo('photo-1499856871958-5b9627545d1a')],
  "Tokyo": [photo('photo-1513407030348-c983a97b98d8'), photo('photo-1536098561742-ca998e48cbcc')],
  "Dubai": [photo('photo-1518684079-3c830dcef090'), photo('photo-1546412414-e1885259563a')],
  "Singapore": [photo('photo-1477959858617-67f85cf4f1df'), photo('photo-1565967511849-76a60a516170')],
  "Bangkok": [photo('photo-1508009603885-50cf7c579365'), photo('photo-1552465011-b4e21bf6e79a')],
  "Istanbul": [photo('photo-1541432901042-2d8bd64b4a9b'), photo('photo-1527838832700-5059252407fa')],
  "Sydney": [photo('photo-1523482580672-f109ba8cb9be')],
};

// The card's own photograph first, then any others we hold for that city.
const getCityImages = (cityName, primary) => {
  const first = primary || getCityImage(cityName);
  return [first, ...(cityGallery[cityName] || [])];
};

// Get image for a city, with fallback
const getCityImage = (cityName) => {
  return cityImages[cityName] || `/images/destinations/photo-1476514525535-07fb3b4ae5f1.webp`;
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
  // Which photograph each card is showing. One counter, offset per card, so
  // the row does not blink all at once.
  const [frame, setFrame] = useState(0);
  // A photograph only joins the rotation once it has actually arrived: fading
  // to one still loading left the card blank for a second.
  const [readyShots, setReadyShots] = useState({});

  useEffect(() => {
    const still = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (still) return undefined;
    const clock = setInterval(() => setFrame((n) => n + 1), 5000);
    return () => clearInterval(clock);
  }, []);

  // Fetch most booked destinations from API and build dynamic cards
  useEffect(() => {
    let isMounted = true;

    const fetchTrendingDestinations = async () => {
      // Wait for location context to be loaded
      if (locationLoading) return;

      try {
        // Get user location from shared LocationContext
        const originCode = cityCode || '';

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
        // The other views of the same city, fetched after the card's own so
        // they never compete with it. A lazy <img> sitting at opacity 0 was
        // being deferred indefinitely, so the card had nothing to fade to.
        const extra = getCityImages(destination.name, destination.image).slice(1);
        await Promise.all(extra.map(async (src) => {
          const ok = await preloadImage(src);
          if (ok && isMounted) setReadyShots((prev) => (prev[src] ? prev : { ...prev, [src]: true }));
        }));
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

  // Single destination card — `featured` controls the large left-hand tile
  const renderCard = (destination, index, featured) => (
    <div
      key={destination.id}
      className={`rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300 relative cursor-pointer group ${featured ? 'h-[380px] lg:h-full lg:min-h-[560px]' : 'h-[268px]'} ${selectedDestination?.id === destination.id ? 'ring-2 ring-brand-teal' : ''}`}
      onClick={() => handleDestinationClick(destination)}
    >
      {/* Skeleton loader */}
      {!loadedImages[destination.id] && (
        <div className="absolute inset-0 w-full h-full bg-gradient-to-br from-gray-200 via-gray-300 to-gray-200 animate-pulse z-[5]">
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-black/20 to-transparent"></div>
        </div>
      )}

      {/* Full bleed images: the first is the card's own, the rest are other
          views of the same city, cross-fading one into the next */}
      <div className={`absolute inset-0 w-full h-full transition-opacity duration-300 ${loadedImages[destination.id] ? 'opacity-100' : 'opacity-0'}`}>
        {(() => {
          const shots = getCityImages(destination.name, destination.image);
          // The card's own photograph is always in; the others join as they load.
          const inPlay = shots.filter((src, i) => i === 0 || readyShots[src]);
          const showing = inPlay.length > 1 ? inPlay[(frame + index) % inPlay.length] : shots[0];
          return shots.map((src, i) => (
            <img
              key={src}
              src={src}
              alt={i === 0 ? destination.name : ''}
              aria-hidden={i === 0 ? undefined : true}
              className={`absolute inset-0 w-full h-full object-cover transition-[opacity,transform] duration-[1200ms] group-hover:scale-110 ${src === showing ? 'opacity-100' : 'opacity-0'}`}
              loading="eager"
              fetchpriority={i === 0 && index < 4 ? "high" : "auto"}
              decoding="async"
              onLoad={() => {
                if (i === 0) handleImageLoad(destination.id);
                else setReadyShots((prev) => (prev[src] ? prev : { ...prev, [src]: true }));
              }}
              onError={(e) => {
                e.target.onerror = null;
                if (i === 0) {
                  e.target.src = "/images/destinations/photo-1476514525535-07fb3b4ae5f1.webp";
                  handleImageLoad(destination.id);
                } else {
                  // One missing view should not blank the card: it never joins.
                  e.target.style.display = 'none';
                }
              }}
            />
          ));
        })()}
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/45 to-black/15"></div>
      </div>

      {/* Dynamic Trending Badge */}
      {(trendingBadges[destination.code] || index === 0) && (
        <div className="absolute top-4 left-4 z-10">
          <div className="flex items-center gap-1.5 rounded-full border border-white/20 bg-black/30 backdrop-blur-md py-1.5 px-3.5 text-white text-[11px] font-medium uppercase tracking-[0.18em]">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-brand-sky"></span>
            {trendingBadges[destination.code]
              ? `No.${trendingBadges[destination.code].rank} Trending`
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
      <div className={`absolute inset-0 flex flex-col justify-end z-10 ${featured ? 'p-7 md:p-9' : 'p-5'}`}>
        <h3 className={`text-white font-serif font-semibold mb-1 leading-tight ${featured ? 'text-3xl md:text-5xl' : 'text-xl md:text-2xl'}`}>
          {destination.name}
          <span className={`ml-2 align-middle text-brand-sky font-sans font-normal ${featured ? 'text-base' : 'text-xs'}`}>
            ({destination.code})
          </span>
        </h3>

        <div className={`flex items-center text-white/85 ${featured ? 'mb-5 text-base' : 'mb-4 text-sm'}`}>
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span>{destination.region}</span>
        </div>

        <div className="flex items-center justify-between">
          {featured ? (
            <div className="flex items-center text-white/90 text-sm">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-brand-sky mr-1.5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              Editor&apos;s pick
            </div>
          ) : <span />}

          {/* Book now button */}
          <button
            className={`inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/15 backdrop-blur-sm hover:bg-white hover:text-ink text-white text-[11px] font-medium uppercase tracking-[0.15em] py-1.5 px-4 transition-all duration-300 ${selectedDestination?.id === destination.id ? 'bg-brand-teal border-brand-teal text-white hover:bg-brand-teal hover:text-white' : ''
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
  );

  return (
    <>
      {/* Mobile / tablet: horizontal swipe carousel — keeps the section to one
          card-height row instead of a long vertical stack. Peek of the next
          card hints there's more to scroll. */}
      <div className="lg:hidden">
        <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory pb-3 scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
          {displayDestinations.slice(0, 8).map((destination, i) => (
            <div key={destination.id} className="snap-start shrink-0 w-[80%] sm:w-[46%]">
              {renderCard(destination, i, false)}
            </div>
          ))}
        </div>
      </div>

      {/* Desktop: featured tile + 2×2 grid (fits the viewport, no excess scroll) */}
      <div className="hidden lg:grid lg:grid-cols-2 gap-6">
        {/* Featured destination */}
        {displayDestinations[0] && renderCard(displayDestinations[0], 0, true)}

        {/* Supporting 2×2 grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {displayDestinations.slice(1, 5).map((destination, i) => renderCard(destination, i + 1, false))}
        </div>
      </div>
    </>
  )
}
