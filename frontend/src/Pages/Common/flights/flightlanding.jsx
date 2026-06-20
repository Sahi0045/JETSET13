import React from "react"
import { useNavigate } from "react-router-dom"
import FlightSearchForm from "./flight-search-form"
import PopularDestinations from "./popular-destination"
import CheapestFlights from "./cheapest-flight"
import Navbar from "../Navbar"
import Footer from "../Footer"
import LoadingSpinner from "../../../Components/LoadingSpinner"
import ScrollFlightProgress from "../../../Components/ScrollFlightProgress"
import withPageElements from "../PageWrapper"
import axios from 'axios';
import { useState, useEffect } from "react";
import { Mail, Phone, ExternalLink, Calendar, MessageSquare, Clock, ArrowLeft, User, CheckCircle2, Ticket, Sparkles, ArrowRight, ArrowUpRight, ShieldCheck, Headphones, BadgePercent, Check, Plane, Compass, Star, Lock } from 'lucide-react';
// Import centralized API configuration
import apiConfig from '@/config/api';
// Importing data from the data file
import { heroImage } from "./data.js"
// Import airports database for dynamic city-to-IATA mapping
import { allAirports } from "./airports.js";

import { useLocationContext } from "../../../Context/LocationContext"
// Dynamically build city-to-IATA map from airports database
// This replaces the previous 180+ line hardcoded map and stays in sync with airports.js
const cityToIATACode = allAirports.reduce((acc, airport) => {
  if (airport.name && airport.code) {
    acc[airport.name] = airport.code;
  }
  return acc;
}, {});



function FlightLanding() {
  const navigate = useNavigate();
  const { city, cityCode } = useLocationContext();
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = async (formData) => {
    setIsSearching(true);
    try {
      // Use IATA codes from formData (set when user selects from suggestions)
      // Fall back to cityToIATACode map, then raw input as last resort
      const fromCode = formData.fromCode || cityToIATACode[formData.from] || formData.from;
      const toCode = formData.toCode || cityToIATACode[formData.to] || formData.to;

      console.log('Converting cities to IATA codes:', {
        from: `${formData.from} -> ${fromCode} (formData.fromCode: ${formData.fromCode})`,
        to: `${formData.to} -> ${toCode} (formData.toCode: ${formData.toCode})`
      });

      const searchData = {
        ...formData,
        from: fromCode,
        to: toCode
      };

      console.log('Sending search request with data:', searchData);

      // Save search data before making API request
      // This ensures we can navigate even if the API fails
      const requestData = {
        searchData: searchData
      };

      try {
        // Use API endpoint from centralized config
        const apiUrl = apiConfig.endpoints.flights.search;
        console.log('Using API URL:', apiUrl);

        const response = await axios.post(apiUrl, searchData, {
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          withCredentials: false,
          timeout: 10000 // 10 second timeout
        });

        console.log('Got response:', response);

        const data = response.data;
        if (data && data.success !== false) {
          console.log('Search successful, navigating to results with API response');
          navigate('/flights/search', {
            state: {
              searchData: searchData, // Original search parameters
              apiResponse: data // API response
            }
          });
        } else {
          console.log("No flight results found or API error:", data?.error || 'Unknown error');
          // Navigate anyway, and let the search page handle it
          navigate('/flights/search', { state: requestData });
        }
      } catch (error) {
        console.error('Search API error:', error.message);
        // Navigate to search page even if API fails
        // The search page will retry the search
        navigate('/flights/search', { state: requestData });
      }
    } catch (error) {
      console.error('Search function error:', error.message);
      // If any other error occurs, still try to navigate
      navigate('/flights/search', {
        state: {
          searchData: {
            ...formData,
            from: formData.fromCode || cityToIATACode[formData.from] || formData.from,
            to: formData.toCode || cityToIATACode[formData.to] || formData.to
          }
        }
      });
    } finally {
      setIsSearching(false);
    }
  };

  // Handle navigation to destination search
  const handleExploreDestinations = () => {
    const defaultOrigin = city || "";
    const defaultOriginCode = cityCode || "";

    // Navigate to search page with default search parameters
    navigate('/flights/search', {
      state: {
        searchData: {
          from: defaultOrigin,
          fromCode: defaultOriginCode,
          to: "",  // Empty destination for exploring all
          tripType: "oneWay",
          departDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 1 week from today
          returnDate: "",
          travelers: "1"
        }
      }
    });
  };

  // Handle book flight for a specific destination
  const handleBookFlight = (destination) => {
    const defaultOrigin = city || "";

    // Create a search request with the selected destination
    const searchData = {
      from: defaultOrigin,
      to: destination,
      tripType: "oneWay",
      departDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 1 week from today
      returnDate: "",
      travelers: "1"
    };

    // Get IATA codes for the cities
    const fromCode = cityToIATACode[searchData.from] || cityCode || searchData.from;
    const toCode = cityToIATACode[searchData.to] || searchData.to;

    // Add IATA codes to search data
    const searchRequestData = {
      ...searchData,
      from: fromCode,
      to: toCode
    };

    console.log('Booking flight to destination:', destination);
    console.log('Search data for booking:', searchRequestData);

    // Navigate directly to the search page with search parameters
    // This will trigger the search on the search page component
    navigate('/flights/search', {
      state: {
        searchData: searchRequestData
      }
    });
  };

  return (
    <div className="min-h-screen bg-ivory">
      {/* Loading Overlay */}
      {isSearching && (
        <div className="fixed inset-0 z-[999] bg-white/80 backdrop-blur-sm">
          <LoadingSpinner fullScreen={true} text="Searching for the best flights..." />
        </div>
      )}

      <Navbar />
      <ScrollFlightProgress />

      {/* Special Offer Banner — refined, slim */}
      <div className="w-full bg-ink text-white/90 border-b border-white/10">
        <div className="container mx-auto px-4 py-2 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-[11px] md:text-xs tracking-wide leading-tight">
          <span className="inline-flex items-center gap-1.5 text-brand-sky">
            <Sparkles className="h-3.5 w-3.5" /> Self-Service Portal Coming Soon
          </span>
          <span className="hidden sm:inline text-white/25">·</span>
          <span className="hidden sm:inline">Call <span className="font-semibold text-white">(877) 538-7380</span></span>
          <span className="hidden md:inline text-white/25">·</span>
          <a href="mailto:support@jetsetterss.com" className="hidden md:inline text-white underline decoration-white/30 underline-offset-2 hover:decoration-white">support@jetsetterss.com</a>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-yellow-300/40 bg-yellow-300/10 px-2.5 py-0.5 text-yellow-200">
            <Ticket className="h-3.5 w-3.5" /> <span className="font-semibold tracking-wider">$50 OFF</span> · today only
          </span>
        </div>
      </div>

      {/* ───────────────────────── Hero ───────────────────────── */}
      <section aria-labelledby="hero-heading" className="relative w-full flex flex-col justify-center overflow-x-clip bg-ivory">
        {/* Background image + editorial ivory wash */}
        <div
          className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: "url('https://images.unsplash.com/photo-1436491865332-7a61a109cc05?q=80&w=2074&auto=format&fit=crop')",
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-ivory/95 via-ivory/55 to-transparent"></div>
          <div className="absolute inset-0 bg-gradient-to-t from-ivory/70 via-transparent to-transparent"></div>
        </div>
        <div className="bg-grain absolute inset-0 z-[1]"></div>

        {/* Content */}
        <div className="relative z-10 w-full px-4 sm:px-6 md:px-12 pt-6 md:pt-8 pb-12 md:pb-16">
          <div className="container mx-auto">
            <div className="max-w-6xl mx-auto text-center">
              {/* Kicker */}
              <div className="reveal-up flex items-center justify-center gap-4 mb-5">
                <span className="hairline w-10 md:w-14 rotate-180" aria-hidden="true"></span>
                <span className="kicker text-brand-teal">Luxury Travel, Effortlessly Planned</span>
                <span className="hairline w-10 md:w-14" aria-hidden="true"></span>
              </div>

              <h1
                id="hero-heading"
                className="reveal-up font-serif text-ink font-semibold leading-[1.15] tracking-normal text-[2.4rem] sm:text-5xl md:text-6xl lg:text-7xl xl:text-[5rem]"
                style={{ animationDelay: '0.1s' }}
              >
                Find Your <span className="text-brand-teal">Perfect Flight</span>
                <br className="hidden sm:block" /> Today
              </h1>

              <p
                className="reveal-up mx-auto mt-8 max-w-xl text-neutral-600 text-base sm:text-lg leading-relaxed"
                style={{ animationDelay: '0.15s' }}
              >
                Handpicked fares, real human concierges, and a best-price promise —
                book with confidence and travel with peace of mind.
              </p>
            </div>

            {/* Booking card — relative z-30 keeps its open dropdowns above the
                content below (the reveal-up transform creates a stacking context) */}
            <div className="reveal-up relative z-30 mt-11 md:mt-14 max-w-5xl mx-auto" style={{ animationDelay: '0.28s' }}>
              <FlightSearchForm onSearch={handleSearch} />
            </div>

            {/* Security reassurance */}
            <div
              className="reveal-up mt-8 flex items-center justify-center gap-2 text-sm text-ink/60"
              style={{ animationDelay: '0.36s' }}
            >
              <Lock className="h-4 w-4 text-brand-teal" aria-hidden="true" /> Secure checkout · SSL encrypted
            </div>
          </div>
        </div>
      </section>

      {/* ──────────────── Popular Destinations ──────────────── */}
      <section className="relative bg-grain bg-ivory pt-12 md:pt-14 pb-16">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <p className="kicker text-brand-teal mb-5">Top Trending Destinations</p>
            <h2 className="font-serif font-semibold text-ink text-4xl md:text-6xl tracking-tight leading-[1.05]">
              Explore popular destinations
            </h2>
            <p className="mt-5 text-neutral-600 text-lg leading-relaxed">
              A carefully selected collection loved by travellers worldwide —
              perfect places for your next adventure.
            </p>
          </div>

          <PopularDestinations onSelectDestination={handleBookFlight} />

          <div className="flex justify-center mt-12">
            <button
              onClick={handleExploreDestinations}
              className="group inline-flex items-center gap-3 rounded-full border border-brand-teal/40 bg-white/60 px-7 py-3.5 text-brand-teal font-medium tracking-wide transition-all duration-300 hover:bg-brand-teal hover:text-white hover:border-brand-teal"
            >
              Explore more destinations
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </button>
          </div>
        </div>
      </section>

      {/* ──────────────── Lowest Fares ──────────────── */}
      <section className="bg-sand pt-20 md:pt-24 pb-20">
        <div className="container mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center gap-12 md:gap-16 mb-16">
            {/* Framed image */}
            <div className="md:w-1/2 w-full">
              <div className="relative">
                <img loading="lazy" decoding="async"
                  src="https://images.unsplash.com/photo-1436491865332-7a61a109cc05?q=80&w=1474&auto=format&fit=crop"
                  alt="Airplane flying in sky"
                  className="w-full h-[300px] md:h-[420px] object-cover relative z-10 rounded-[1.5rem] shadow-large"
                  onError={(e) => {
                    e.target.onerror = null;
                    e.target.src = 'https://images.unsplash.com/photo-1569154941061-e231b4725ef1?q=80&w=1470&auto=format&fit=crop';
                  }}
                />
              </div>
            </div>

            <div className="md:w-1/2">
              <p className="kicker text-brand-teal mb-5">Incredible Savings</p>
              <h2 className="font-serif font-semibold text-ink text-4xl md:text-5xl leading-[1.08] tracking-tight mb-6">
                Our lowest fares to the world's<span className="italic text-brand-teal"> most-loved</span> places
              </h2>
              <p className="text-neutral-600 text-lg leading-relaxed mb-8">
                Take advantage of our special deals and promotions to get the best value
                for your travel budget — the most affordable flights, without compromising on quality.
              </p>
              <ul className="space-y-3.5">
                {['Price match guarantee', 'No hidden fees or charges', '24/7 customer support'].map((item) => (
                  <li key={item} className="flex items-center text-ink/80">
                    <span className="flex-shrink-0 mr-3 flex h-6 w-6 items-center justify-center rounded-full bg-brand-teal/10 text-brand-teal">
                      <Check className="h-3.5 w-3.5" strokeWidth={3} />
                    </span>
                    <span className="text-base">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Cheapest Flights Component */}
          <CheapestFlights onBookFlight={handleBookFlight} />
        </div>
      </section>

      {/* Newsletter signup now lives in the footer */}
      <Footer />
    </div>
  )
}

export default withPageElements(FlightLanding);
