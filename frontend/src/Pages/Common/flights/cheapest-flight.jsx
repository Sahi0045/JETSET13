"use client"

import React, { useState, useEffect, useCallback } from "react"
import { ChevronDown, Loader2, AlertCircle } from "lucide-react"
import Price from "../../../Components/Price"
import FlightAnalyticsService from "../../../Services/FlightAnalyticsService.js"

import { allAirports } from "./airports.js"

import { useLocationContext } from "../../../Context/LocationContext"
import { fallbackImageFor, getDestImage } from "../../../utils/destinationImage"
// Build a lookup map: IATA code → city details
const airportByCode = allAirports.reduce((acc, a) => {
  if (a.code) acc[a.code] = a;
  return acc;
}, {});

// Desktop shows two rows of three (6 cards). Mobile/tablet stay compact, showing
// only the first MOBILE_CARD_COUNT — the rest are hidden below the lg breakpoint.
const CARD_COUNT = 6;
const MOBILE_CARD_COUNT = 3;

// Fisher-Yates shuffle (returns a new array, does not mutate the input)
const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
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
  const { city, cityCode, countryCode, loading: locationLoading } = useLocationContext();
  const [flights, setFlights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [originCity, setOriginCity] = useState("");
  const [originCode, setOriginCode] = useState("");
  const [loadedImages, setLoadedImages] = useState({});
  // When the prices shown were fetched, and whether that fetch was just now.
  // A cache up to six hours old used to be painted under "Live prices".
  const [pricesAsOf, setPricesAsOf] = useState(null);
  const [pricesLive, setPricesLive] = useState(false);

  // Render destination cards instantly; enrich with live prices in the background.
  useEffect(() => {
    let isMounted = true;

    // Wait for location context, then need an origin
    if (locationLoading) return;
    if (!cityCode) { setLoading(false); return; }

    const origin = cityCode;
    const originCityName = city || '';
    const country = countryCode || 'IN';
    setOriginCode(origin);
    setOriginCity(originCityName);

    // Country-specific popular routes (used immediately — no network wait)
    const countryFallbacks = {
      'IN': ['BOM', 'BLR', 'GOI', 'JAI', 'CCU', 'HYD', 'MAA', 'DXB', 'BKK', 'SIN'],
      'US': ['LAX', 'JFK', 'ORD', 'SFO', 'MIA', 'LHR', 'CDG', 'NRT', 'CUN', 'HNL'],
      'GB': ['CDG', 'BCN', 'AMS', 'DXB', 'JFK', 'FCO', 'IST', 'ATH', 'LIS', 'BKK'],
      'AE': ['BOM', 'DEL', 'LHR', 'BKK', 'IST', 'CDG', 'SIN', 'JFK', 'CAI', 'KUL'],
    };
    const pool = (countryFallbacks[country] || countryFallbacks['IN'])
      .filter((c) => c !== origin);

    const buildCard = (code, priced) => {
      const airport = airportByCode[code];
      const cityName = airport?.name || code;
      return {
        id: code,
        destination: cityName,
        destinationCode: code,
        region: airport?.country || 'International',
        price: priced ? priced.price : null,
        currency: priced ? priced.currency : 'USD',
        date: priced ? priced.date : 'Flexible dates',
        image: getDestImage(code, cityName),
        isApiData: !!priced,
      };
    };

    // Decide which destinations to show. Reuse a fresh cache so the instant
    // paint matches the prices we re-fetch (no content swap); otherwise pick a
    // fresh shuffled subset so the line-up varies between visits.
    const cacheKey = `cheapestFares_${origin}`;
    let cached = null;
    try {
      const parsed = JSON.parse(localStorage.getItem(cacheKey) || 'null');
      if (parsed && parsed.at && (Date.now() - parsed.at) < 6 * 60 * 60 * 1000 && Array.isArray(parsed.flights) && parsed.flights.length) {
        cached = parsed;
      }
    } catch (e) { /* ignore bad cache */ }

    let codes;
    let initial;
    if (cached) {
      codes = cached.flights.map((f) => f.destinationCode).slice(0, CARD_COUNT);
      // Re-resolve images on read so older cached entries pick up corrected URLs
      initial = cached.flights
        .slice(0, CARD_COUNT)
        .map((f) => ({ ...f, image: getDestImage(f.destinationCode, f.destination) }));
    } else {
      codes = shuffle(pool).slice(0, CARD_COUNT);
      initial = codes.map((c) => buildCard(c, null));
    }

    const baseCards = codes.map((c) => buildCard(c, null));

    // 1) Paint immediately — never block on Amadeus
    if (isMounted) {
      setFlights(initial);
      setError(null);
      setLoading(false);
      setPricesLive(false);
      setPricesAsOf(cached ? cached.at : null);
    }

    // 2) Enrich with live cheapest prices in the background (never blocks the UI)
    (async () => {
      try {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const depDate = tomorrow.toISOString().split('T')[0];

        const results = await Promise.allSettled(
          codes.map(async (code) => {
            try {
              const data = await FlightAnalyticsService.getCheapestFlightDates(
                origin, code, { oneWay: true, departureDate: depDate }
              );
              if (data && data.length > 0) {
                const cheapest = data.reduce((min, curr) =>
                  parseFloat(curr.price?.total || Infinity) < parseFloat(min.price?.total || Infinity) ? curr : min, data[0]);
                return buildCard(code, {
                  price: parseFloat(cheapest.price?.total || 0),
                  currency: cheapest.price?.currency || 'USD',
                  date: formatDate(cheapest.departureDate),
                });
              }
            } catch (e) { /* destination price unavailable */ }
            return null;
          })
        );

        const byCode = {};
        results.forEach((r) => { if (r.status === 'fulfilled' && r.value) byCode[r.value.destinationCode] = r.value; });

        if (Object.keys(byCode).length > 0 && isMounted) {
          const merged = baseCards
            .map((b) => byCode[b.destinationCode] || b)
            .sort((a, b) => (a.price == null ? Infinity : a.price) - (b.price == null ? Infinity : b.price));
          setFlights(merged);
          setPricesLive(true);
          setPricesAsOf(Date.now());
          try { localStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), flights: merged })); } catch (e) { /* quota */ }
        }
      } catch (e) {
        // Background enrichment failed — the instant cards stay; no error surfaced
        console.warn('Cheapest-fares price enrichment skipped:', e?.message);
      }
    })();

    return () => { isMounted = false; };
  }, [cityCode, city, countryCode, locationLoading]);

  const handleImageLoad = useCallback((id) => {
    setLoadedImages(prev => ({ ...prev, [id]: true }));
  }, []);

  // "Best Price" means the lowest price shown - one card, not every card that
  // has a price, which is what it used to label.
  const cheapestId = flights
    .filter((f) => f.isApiData && f.price != null)
    .sort((a, b) => a.price - b.price)[0]?.id;

  // Loading skeleton
  if (loading) {
    return (
      <div>
        <div className="flex items-center mb-8 gap-3">
          <h3 className="font-grotesk text-ink text-3xl md:text-5xl font-semibold tracking-tight">Cheapest fares from</h3>
          <div className="bg-white/60 animate-pulse rounded-full px-4 py-1.5 w-32 h-8"></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: CARD_COUNT }).map((_, i) => (
            <div key={i} className={`bg-white rounded-xl overflow-hidden shadow-md animate-pulse ${i >= MOBILE_CARD_COUNT ? 'hidden lg:block' : ''}`}>
              <div className="h-64 bg-gray-200"></div>
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
      <div>
        <div className="flex items-center mb-8 gap-3">
          <h3 className="font-grotesk text-ink text-3xl md:text-5xl font-semibold tracking-tight">Cheapest fares</h3>
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
    <div>
      <div className="flex flex-col items-center text-center gap-3 mb-9">
        <div className="flex items-center justify-center gap-4">
          <span className="hairline w-10 md:w-14 rotate-180" aria-hidden="true"></span>
          <span className="kicker text-brand-teal">Lowest fares this week</span>
          <span className="hairline w-10 md:w-14" aria-hidden="true"></span>
        </div>
        <h3 className="font-grotesk text-ink text-3xl md:text-5xl font-semibold tracking-tight leading-[1.08]">
          Cheapest fares from
          {originCity && originCode && (
            <span className="inline-flex items-center align-middle ml-3 bg-white text-brand-teal px-5 py-1 rounded-full border border-brand-teal/25 font-semibold text-2xl md:text-4xl">
              {originCity} ({originCode})
            </span>
          )}
        </h3>
        <div className="flex items-center text-sm text-ink/60">
          {pricesLive ? (
            <>
              <span className="inline-block w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></span>
              Live prices from Amadeus
            </>
          ) : pricesAsOf ? (
            <>Prices as of {new Date(pricesAsOf).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}, updating…</>
          ) : (
            <>Checking prices…</>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Three fares, large enough to read across a room; the rest are one
            link away. Six small cards read as filler beside the destination
            gallery below, which is the same shape. */}
        {flights.slice(0, 3).map((flight, idx) => (
          <div key={flight.id} className="bg-white rounded-2xl overflow-hidden shadow-md hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300 group">
            {/* Image container */}
            <div className="relative h-64 overflow-hidden">
              {/* Skeleton while image loads */}
              {!loadedImages[flight.id] && (
                <div className="absolute inset-0 bg-gradient-to-br from-gray-200 via-gray-300 to-gray-200 animate-pulse z-5"></div>
              )}
              <img loading="lazy" decoding="async"
                src={flight.image}
                alt={flight.destination}
                className={`w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500 ${loadedImages[flight.id] ? 'opacity-100' : 'opacity-0'}`}
                onLoad={() => handleImageLoad(flight.id)}
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = fallbackImageFor(flight.destinationCode || flight.destination);
                  handleImageLoad(flight.id);
                }}
              />
              {/* Overlay gradient */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent"></div>

              {/* City on the photograph, where the eye already is */}
              <div className="absolute left-5 bottom-4 z-10 flex items-baseline gap-2 text-white">
                <span className="font-grotesk text-2xl font-semibold leading-none">{flight.destination}</span>
                <span className="text-brand-sky text-[13px] font-bold tracking-wide">{flight.destinationCode}</span>
              </div>

              {/* Price tag — only on the cheapest priced card */}
              {flight.isApiData && flight.id === cheapestId && (
                <div className="absolute top-3 right-3 z-10 bg-[#055B75]/90 backdrop-blur-sm text-white text-xs font-bold py-1 px-2 rounded-md flex items-center shadow-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                  Best Price
                </div>
              )}
            </div>

            {/* Content section */}
            <div className="p-5">
              {/* Where it goes and when */}
              <div className="mb-2">
                <div className="flex items-center gap-2 text-ink font-bold text-[15px]">
                  {originCode && <span>{originCode}</span>}
                  {originCode && <span className="text-brand-sky" aria-hidden="true">→</span>}
                  <span>{flight.destinationCode}</span>
                  <span className="text-gray-500 font-normal">· {flight.region}</span>
                </div>
                <div className="flex items-center mt-1.5">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-gray-400 mr-1" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                  </svg>
                  <p className="text-gray-500 text-[13px] font-medium">{flight.date}</p>
                </div>
              </div>

              {/* Price and button */}
              <div className="flex justify-between items-center mt-4 pt-4 border-t border-gray-100">
                <div className="flex items-baseline">
                  {flight.price != null ? (
                    <>
                      <p className="font-grotesk font-bold text-[#055B75] text-2xl tracking-tight">
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
                  className="bg-[#055B75] hover:bg-[#044A5F] text-white text-[13px] font-semibold px-4 py-2.5 rounded-lg transition-colors shadow-sm"
                >
                  Book now
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
