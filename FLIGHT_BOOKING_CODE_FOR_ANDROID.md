# ✈️ Jetsetterss Flight Booking Code - Complete Implementation Guide

This document contains the complete flight booking implementation from the Jetsetterss web platform. Use this code to replicate the exact same functionality and design in the Android app.

## 🎯 Flight Booking Flow Structure

The flight booking system consists of multiple interconnected components:

1. **FlightLanding** - Main flight search page with hero section
2. **FlightSearchForm** - Advanced search form with autocomplete
3. **FlightSearchPage** - Search results with filters and sorting
4. **FlightPayment** - Secure payment processing with ARC Pay
5. **FlightBookingConfirmation** - Booking summary and passenger details
6. **FlightBookingSuccess** - Success confirmation page

---

## 🛫 Flight Landing Page Component

```jsx
import React from "react"
import { useNavigate } from "react-router-dom"
import FlightSearchForm from "./flight-search-form"
import PopularDestinations from "./popular-destination"
import CheapestFlights from "./cheapest-flight"
import SubscribeSection from "./subscribe-section"
import Navbar from "../Navbar"
import Footer from "../Footer"
import withPageElements from "../PageWrapper"
import axios from 'axios';
import { useState, useEffect } from "react";
// Import centralized API configuration
import apiConfig from '../../../../../src/config/api.js';
// Importing data from the data file
import { heroImage } from "./data.js"

function FlightLanding() {
  const navigate = useNavigate();

  // City to IATA code mapping (comprehensive)
  const cityToIATACode = {
    // Indian Cities
    "New Delhi": "DEL", "Mumbai": "BOM", "Bangalore": "BLR", "Chennai": "MAA",
    "Hyderabad": "HYD", "Kolkata": "CCU", "Ahmedabad": "AMD", "Pune": "PNQ",
    "Goa": "GOI", "Jaipur": "JAI", "Lucknow": "LKO", "Kochi": "COK",
    "Thiruvananthapuram": "TRV", "Guwahati": "GAU", "Varanasi": "VNS",
    "Amritsar": "ATQ", "Bhopal": "BHO", "Indore": "IDR", "Patna": "PAT",
    "Bhubaneswar": "BBI", "Nagpur": "NAG", "Vadodara": "BDQ", "Surat": "STV",
    "Visakhapatnam": "VTZ", "Coimbatore": "CJB", "Mangalore": "IXE",
    "Madurai": "IXM", "Tiruchirappalli": "TRZ", "Dehradun": "DED",
    "Srinagar": "SXR", "Chandigarh": "IXC", "Aurangabad": "IXU",
    "Jammu": "IXJ", "Ranchi": "IXR", "Bagdogra": "IXB", "Port Blair": "IXZ",
    "Agartala": "IXA", "Allahabad": "IXD", "Belgaum": "IXG",
    "Kailashahar": "IXH", "Lilabari": "IXI", "Keshod": "IXK", "Leh": "IXL",

    // International Cities - Major Hubs
    "London": "LHR", "New York": "JFK", "Paris": "CDG", "Tokyo": "NRT",
    "Singapore": "SIN", "Hong Kong": "HKG", "Dubai": "DXB", "Sydney": "SYD",
    "Los Angeles": "LAX", "Chicago": "ORD", "San Francisco": "SFO",
    "Toronto": "YYZ", "Vancouver": "YVR", "Montreal": "YUL", "Calgary": "YYC",

    // European Cities
    "Amsterdam": "AMS", "Frankfurt": "FRA", "Rome": "FCO", "Barcelona": "BCN",
    "Madrid": "MAD", "Milan": "MXP", "Vienna": "VIE", "Zurich": "ZRH",
    "Munich": "MUC", "Berlin": "BER", "Copenhagen": "CPH", "Stockholm": "ARN",
    "Oslo": "OSL", "Helsinki": "HEL", "Warsaw": "WAW", "Prague": "PRG",
    "Budapest": "BUD", "Athens": "ATH", "Lisbon": "LIS",

    // Asian Cities
    "Seoul": "ICN", "Shanghai": "PVG", "Beijing": "PEK", "Bangkok": "BKK",
    "Kuala Lumpur": "KUL", "Manila": "MNL", "Jakarta": "CGK", "Taipei": "TPE",
    "Ho Chi Minh City": "SGN", "Phnom Penh": "PNH", "Yangon": "RGN",
    "Colombo": "CMB", "Dhaka": "DAC", "Kathmandu": "KTM", "Islamabad": "ISB",

    // Middle East & Africa
    "Tel Aviv": "TLV", "Istanbul": "IST", "Doha": "DOH", "Kuwait": "KWI",
    "Riyadh": "RUH", "Jeddah": "JED", "Cairo": "CAI", "Cape Town": "CPT",
    "Johannesburg": "JNB", "Nairobi": "NBO", "Lagos": "LOS", "Addis Ababa": "ADD",

    // American Cities
    "Miami": "MIA", "Boston": "BOS", "Seattle": "SEA", "Denver": "DEN",
    "Dallas": "DFW", "Houston": "IAH", "Atlanta": "ATL", "Phoenix": "PHX",
    "Las Vegas": "LAS", "Orlando": "MCO", "Honolulu": "HNL", "Mexico City": "MEX",
    "Sao Paulo": "GRU", "Rio de Janeiro": "GIG", "Buenos Aires": "EZE",
    "Lima": "LIM", "Bogota": "BOG", "Santiago": "SCL"
  };

  // State management
  const [subscriptionEmail, setSubscriptionEmail] = useState('');
  const [subscriptionSubmitted, setSubscriptionSubmitted] = useState(false);
  const [subscriptionError, setSubscriptionError] = useState('');
  const [isMobileView, setIsMobileView] = useState(window.innerWidth < 768);

  // Mobile detection
  useEffect(() => {
    const handleResize = () => {
      setIsMobileView(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Newsletter subscription handler
  const handleSubscriptionSubmit = async (e) => {
    e.preventDefault();
    setSubscriptionError('');

    try {
      const response = await axios.post(`${apiConfig.baseUrl}/newsletter/subscribe`, {
        email: subscriptionEmail
      });

      setSubscriptionSubmitted(true);
      setSubscriptionEmail('');

      setTimeout(() => {
        setSubscriptionSubmitted(false);
      }, 3000);
    } catch (error) {
      setSubscriptionError('Subscription failed. Please try again.');
    }
  };

  return (
    <div className="flight-landing">
      <Navbar />

      {/* Service Banner - Same as home page */}
      <div className="relative">
        <div className={`w-full text-center bg-gradient-to-r from-blue-900/90 via-blue-800/90 to-blue-900/90 py-3 backdrop-blur-sm z-20 border-y border-blue-500/30 ${isMobileView ? 'px-3' : ''}`} style={{position: 'absolute', top: isMobileView ? '60px' : '73px', left: 0, right: 0}}>
          <div className="container mx-auto px-2 flex justify-center items-center flex-wrap">
            <div className="h-5 w-5 text-yellow-300 mr-2 flex-shrink-0">✈️</div>
            <p className={`text-white ${isMobileView ? 'text-xs' : 'text-base'} font-medium tracking-wide`}>
              <span className="font-bold">Self-Service Portal will be available very soon...</span> Meanwhile please Call <span className="text-yellow-300 font-bold whitespace-nowrap">((877) 538-7380)</span> or Email <a href="mailto:support@jetsetterss.com" className="underline text-yellow-300 font-bold">support@jetsetterss.com</a> for all your travel needs. Team Jetsetters!
            </p>
          </div>
        </div>
      </div>

      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-background" style={{backgroundImage: `url(${heroImage})`}}>
          <div className="hero-overlay"></div>
          <div className="hero-content">
            <div className="hero-text">
              <h1 className="hero-title">
                Find Your Perfect Flight
              </h1>
              <p className="hero-subtitle">
                Search across 500+ airlines worldwide for the best deals
              </p>
            </div>

            {/* Flight Search Form */}
            <FlightSearchForm
              initialData={{
                from: '',
                to: '',
                departDate: new Date().toISOString().split('T')[0],
                returnDate: '',
                travelers: 1,
                tripType: 'one-way',
                classType: 'economy'
              }}
              onSearch={(formData) => {
                navigate('/flights/search', { state: { searchData: formData } });
              }}
            />
          </div>
        </div>
      </section>

      {/* Popular Destinations */}
      <PopularDestinations />

      {/* Cheapest Flights */}
      <CheapestFlights />

      {/* Newsletter Subscription */}
      <SubscribeSection />

      <Footer />
    </div>
  );
}

export default withPageElements(FlightLanding);
```

---

## 🔍 Flight Search Form Component

```jsx
"use client"

import React, { useState, useEffect } from "react"
import { Calendar, Users, MapPin, Search, ChevronDown } from "lucide-react"
import { defaultSearchData, specialFares, sourceCities, allDestinations } from "./data.js"

const USE_AMADEUS_API = true;

export default function FlightSearchForm({ initialData, onSearch }) {
  const [formData, setFormData] = useState(initialData || defaultSearchData)
  const [formErrors, setFormErrors] = useState({})
  const [isMobileView, setIsMobileView] = useState(false)

  const [showFromSuggestions, setShowFromSuggestions] = useState(false);
  const [showToSuggestions, setShowToSuggestions] = useState(false);
  const [fromSuggestions, setFromSuggestions] = useState([]);
  const [toSuggestions, setToSuggestions] = useState([]);

  // Mobile detection
  useEffect(() => {
    const checkIfMobile = () => {
      setIsMobileView(window.innerWidth < 768);
    }

    checkIfMobile();
    window.addEventListener('resize', checkIfMobile);

    return () => window.removeEventListener('resize', checkIfMobile);
  }, []);

  // City code mappings
  const cityCodeMap = allDestinations.reduce((acc, city) => {
    acc[city.name] = city.code;
    return acc;
  }, {});

  const cityDetailsMap = allDestinations.reduce((acc, city) => {
    acc[city.code] = {
      name: city.name,
      country: city.country,
      type: city.type
    };
    return acc;
  }, {});

  // Update form data when initialData changes
  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
    }
  }, [initialData]);

  const handleTripTypeChange = (type) => {
    setFormData({ ...formData, tripType: type })
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));

    // Hide suggestions for the other field
    if (name === "from") {
      setShowToSuggestions(false);
    } else if (name === "to") {
      setShowFromSuggestions(false);
    }

    // Show suggestions for the current field
    if (name === "from" || name === "to") {
      const showSuggestions = name === "from" ? setShowFromSuggestions : setShowToSuggestions;
      const setSuggestions = name === "from" ? setFromSuggestions : setToSuggestions;

      showSuggestions(true);

      // Filter all destinations based on input
      const filtered = allDestinations
        .filter((city) => {
          const searchTerm = value.toLowerCase();
          return (
            city.name.toLowerCase().includes(searchTerm) ||
            city.code.toLowerCase().includes(searchTerm) ||
            city.country.toLowerCase().includes(searchTerm)
          );
        })
        .map(city => ({
          name: city.name,
          code: city.code,
          country: city.country,
          type: city.type
        }));

      setSuggestions(filtered);
    }

    // Clear validation error when field is changed
    if (formErrors[name]) {
      setFormErrors({
        ...formErrors,
        [name]: null
      });
    }
  }

  const handleSuggestionClick = (name, field) => {
    const selectedCity = field === "from"
      ? fromSuggestions.find(city => city.name === name)
      : toSuggestions.find(city => city.name === name);

    if (selectedCity) {
      setFormData((prev) => ({
        ...prev,
        [field]: selectedCity.name,
        [`${field}Code`]: selectedCity.code,
        [`${field}Country`]: selectedCity.country,
        [`${field}Type`]: selectedCity.type
      }));
    }

    // Hide suggestions for both fields after selection
    setShowFromSuggestions(false);
    setShowToSuggestions(false);
  };

  // Add blur handler to hide suggestions when input loses focus
  const handleInputBlur = (field) => {
    setTimeout(() => {
      if (field === "from") {
        setShowFromSuggestions(false);
      } else if (field === "to") {
        setShowToSuggestions(false);
      }
    }, 200);
  };

  const validateForm = () => {
    const errors = {};

    if (!formData.from) {
      errors.from = "Please enter departure city";
    }

    if (!formData.to) {
      errors.to = "Please enter destination city";
    }

    if (formData.from && formData.to && formData.from.toLowerCase() === formData.to.toLowerCase()) {
      errors.to = "Departure and destination cities cannot be the same";
    }

    if (!formData.departDate) {
      errors.departDate = "Please select departure date";
    }

    if (formData.tripType === 'round-trip' && !formData.returnDate) {
      errors.returnDate = "Please select return date";
    }

    if (formData.returnDate && new Date(formData.returnDate) <= new Date(formData.departDate)) {
      errors.returnDate = "Return date must be after departure date";
    }

    if (!formData.travelers || formData.travelers < 1) {
      errors.travelers = "Please select at least 1 traveler";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!validateForm()) return;

    // Convert city names to IATA codes if needed
    const searchData = {
      ...formData,
      from: cityCodeMap[formData.from] || formData.from,
      to: cityCodeMap[formData.to] || formData.to,
      fromCity: formData.from,
      toCity: formData.to
    };

    if (onSearch) {
      onSearch(searchData);
    }
  };

  return (
    <div className="flight-search-form">
      <div className="search-container">
        {/* Trip Type Tabs */}
        <div className="trip-type-tabs">
          <button
            type="button"
            className={`tab ${formData.tripType === 'one-way' ? 'active' : ''}`}
            onClick={() => handleTripTypeChange('one-way')}
          >
            One Way
          </button>
          <button
            type="button"
            className={`tab ${formData.tripType === 'round-trip' ? 'active' : ''}`}
            onClick={() => handleTripTypeChange('round-trip')}
          >
            Round Trip
          </button>
          <button
            type="button"
            className={`tab ${formData.tripType === 'multi-city' ? 'active' : ''}`}
            onClick={() => handleTripTypeChange('multi-city')}
          >
            Multi City
          </button>
        </div>

        <form onSubmit={handleSubmit} className="search-form">
          {/* From Field */}
          <div className="form-group">
            <label className="form-label">From</label>
            <div className="input-container">
              <MapPin className="input-icon" />
              <input
                type="text"
                name="from"
                value={formData.from}
                onChange={handleInputChange}
                onFocus={() => setShowFromSuggestions(true)}
                onBlur={() => handleInputBlur('from')}
                placeholder="Departure city"
                className={`form-input ${formErrors.from ? 'error' : ''}`}
              />
              {showFromSuggestions && fromSuggestions.length > 0 && (
                <div className="suggestions-dropdown">
                  {fromSuggestions.slice(0, 5).map((city, index) => (
                    <div
                      key={index}
                      className="suggestion-item"
                      onClick={() => handleSuggestionClick(city.name, 'from')}
                    >
                      <div className="city-name">{city.name}</div>
                      <div className="city-code">{city.code} - {city.country}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {formErrors.from && <div className="error-message">{formErrors.from}</div>}
          </div>

          {/* To Field */}
          <div className="form-group">
            <label className="form-label">To</label>
            <div className="input-container">
              <MapPin className="input-icon" />
              <input
                type="text"
                name="to"
                value={formData.to}
                onChange={handleInputChange}
                onFocus={() => setShowToSuggestions(true)}
                onBlur={() => handleInputBlur('to')}
                placeholder="Destination city"
                className={`form-input ${formErrors.to ? 'error' : ''}`}
              />
              {showToSuggestions && toSuggestions.length > 0 && (
                <div className="suggestions-dropdown">
                  {toSuggestions.slice(0, 5).map((city, index) => (
                    <div
                      key={index}
                      className="suggestion-item"
                      onClick={() => handleSuggestionClick(city.name, 'to')}
                    >
                      <div className="city-name">{city.name}</div>
                      <div className="city-code">{city.code} - {city.country}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {formErrors.to && <div className="error-message">{formErrors.to}</div>}
          </div>

          {/* Departure Date */}
          <div className="form-group">
            <label className="form-label">Departure</label>
            <div className="input-container">
              <Calendar className="input-icon" />
              <input
                type="date"
                name="departDate"
                value={formData.departDate}
                onChange={handleInputChange}
                min={new Date().toISOString().split('T')[0]}
                className={`form-input ${formErrors.departDate ? 'error' : ''}`}
              />
            </div>
            {formErrors.departDate && <div className="error-message">{formErrors.departDate}</div>}
          </div>

          {/* Return Date (Conditional) */}
          {formData.tripType === 'round-trip' && (
            <div className="form-group">
              <label className="form-label">Return</label>
              <div className="input-container">
                <Calendar className="input-icon" />
                <input
                  type="date"
                  name="returnDate"
                  value={formData.returnDate}
                  onChange={handleInputChange}
                  min={formData.departDate}
                  className={`form-input ${formErrors.returnDate ? 'error' : ''}`}
                />
              </div>
              {formErrors.returnDate && <div className="error-message">{formErrors.returnDate}</div>}
            </div>
          )}

          {/* Travelers */}
          <div className="form-group">
            <label className="form-label">Travelers</label>
            <div className="input-container">
              <Users className="input-icon" />
              <select
                name="travelers"
                value={formData.travelers}
                onChange={handleInputChange}
                className={`form-input ${formErrors.travelers ? 'error' : ''}`}
              >
                {[1,2,3,4,5,6,7,8,9].map(num => (
                  <option key={num} value={num}>{num} {num === 1 ? 'Traveler' : 'Travelers'}</option>
                ))}
              </select>
            </div>
            {formErrors.travelers && <div className="error-message">{formErrors.travelers}</div>}
          </div>

          {/* Class Type */}
          <div className="form-group">
            <label className="form-label">Class</label>
            <div className="input-container">
              <ChevronDown className="input-icon" />
              <select
                name="classType"
                value={formData.classType}
                onChange={handleInputChange}
                className="form-input"
              >
                <option value="economy">Economy</option>
                <option value="premium-economy">Premium Economy</option>
                <option value="business">Business</option>
                <option value="first">First Class</option>
              </select>
            </div>
          </div>

          {/* Search Button */}
          <button type="submit" className="search-button">
            <Search className="search-icon" />
            Search Flights
          </button>
        </form>

        {/* Special Fares */}
        <div className="special-fares">
          <h3>Special Fares</h3>
          <div className="fare-tags">
            {specialFares.map((fare, index) => (
              <span key={index} className="fare-tag">
                {fare}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

---

## 📋 Flight Search Results Page

```jsx
import React, { useState, useEffect, useRef } from "react";
import { Link, useSearchParams, useNavigate, useLocation } from "react-router-dom";
import { Plane, Calendar, Users, ArrowRight, X, Search, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Clock, Filter } from "lucide-react";
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

// Import centralized API configuration
import apiConfig from '../../../../../src/config/api.js';

function FlightSearchPage() {
  const location = useLocation();
  const searchData = location.state?.searchData;
  const apiResponse = location.state?.apiResponse;

  console.log('searchData:', searchData);

  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useState(searchData || {
    from: 'DEL',
    to: 'HYD',
    departDate: new Date().toISOString().split('T')[0],
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
      const baseDate = new Date(centerDate);

      // Generate 3 days before and after the selected date
      for (let i = -3; i <= 3; i++) {
        const date = new Date(baseDate);
        date.setDate(baseDate.getDate() + i);

        const formattedDate = date.toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric'
        });

        const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
        const isoDate = date.toISOString().split('T')[0];

        dates.push({
          date: formattedDate,
          day: dayName,
          isoDate: isoDate,
          price: null,
          selected: i === 0,
          isWeekend: [0, 6].includes(date.getDay()),
          isPast: date < new Date().setHours(0, 0, 0, 0)
        });
      }

      return dates;
    };

    const initializeDates = () => {
      const searchDate = location.state?.searchData?.departDate;
      const centerDate = searchDate ? new Date(searchDate) : new Date();
      const dates = generateDateRange(centerDate);
      setDateRange(dates);
    };

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

          const responseData = await response.json();
          console.log('Flight search response:', responseData);

          // Transform Amadeus API response to our format
          let transformedFlights = [];
          if (responseData.data && Array.isArray(responseData.data)) {
            transformedFlights = responseData.data.map(flight => ({
              id: flight.id,
              airline: flight.validatingAirlineCodes?.[0] || 'Unknown',
              flightNumber: flight.itineraries?.[0]?.segments?.[0]?.carrierCode +
                           flight.itineraries?.[0]?.segments?.[0]?.number || 'N/A',
              departure: {
                time: flight.itineraries?.[0]?.segments?.[0]?.departure?.at || '',
                airport: flight.itineraries?.[0]?.segments?.[0]?.departure?.iataCode || '',
                city: searchData.from
              },
              arrival: {
                time: flight.itineraries?.[0]?.segments?.slice(-1)?.[0]?.arrival?.at || '',
                airport: flight.itineraries?.[0]?.segments?.slice(-1)?.[0]?.arrival?.iataCode || '',
                city: searchData.to
              },
              duration: flight.itineraries?.[0]?.duration || '',
              stops: (flight.itineraries?.[0]?.segments?.length || 1) - 1,
              price: {
                amount: parseFloat(flight.price?.total || '0'),
                currency: flight.price?.currency || 'USD'
              },
              aircraft: flight.itineraries?.[0]?.segments?.[0]?.aircraft?.code || 'Unknown',
              class: searchData.classType || 'economy',
              baggage: {
                carryOn: '7kg',
                checked: '20kg'
              },
              segments: flight.itineraries?.[0]?.segments || []
            }));
          }

          setFlights(transformedFlights);
          setLoading(false);

        } catch (error) {
          console.error('Flight search error:', error);
          setError(error.message);
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    };

    fetchInitialFlights();
  }, [location.state]);

  // Filter and sort flights
  const filteredAndSortedFlights = React.useMemo(() => {
    let filtered = flights.filter(flight => {
      // Price filter
      if (flight.price.amount < filters.price[0] || flight.price.amount > filters.price[1]) {
        return false;
      }

      // Stops filter
      if (filters.stops !== "any" && flight.stops !== parseInt(filters.stops)) {
        return false;
      }

      // Airlines filter
      if (filters.airlines.length > 0 && !filters.airlines.includes(flight.airline)) {
        return false;
      }

      return true;
    });

    // Sort flights
    filtered.sort((a, b) => {
      switch (sortOrder) {
        case "price":
          return a.price.amount - b.price.amount;
        case "duration":
          return a.duration.localeCompare(b.duration);
        case "departure":
          return a.departure.time.localeCompare(b.departure.time);
        case "arrival":
          return a.arrival.time.localeCompare(b.arrival.time);
        default:
          return 0;
      }
    });

    return filtered;
  }, [flights, filters, sortOrder]);

  // Pagination
  const totalPages = Math.ceil(filteredAndSortedFlights.length / flightsPerPage);
  const startIndex = (currentPage - 1) * flightsPerPage;
  const endIndex = startIndex + flightsPerPage;
  const currentFlights = filteredAndSortedFlights.slice(startIndex, endIndex);

  const toggleFlightExpansion = (flightId) => {
    setExpandedFlights(prev => ({
      ...prev,
      [flightId]: !prev[flightId]
    }));
  };

  const handleBookFlight = (flight) => {
    navigate('/flight-booking-confirmation', {
      state: {
        flight: flight,
        searchData: searchParams,
        calculatedFare: {
          baseAmount: flight.price.amount,
          taxes: flight.price.amount * 0.18, // 18% GST
          totalAmount: flight.price.amount * 1.18
        }
      }
    });
  };

  const formatDuration = (duration) => {
    // Convert ISO 8601 duration to readable format
    const match = duration.match(/PT(\d+H)?(\d+M)?/);
    if (match) {
      const hours = match[1] ? match[1].replace('H', '') : '0';
      const minutes = match[2] ? match[2].replace('M', '') : '0';
      return `${hours}h ${minutes}m`;
    }
    return duration;
  };

  const formatTime = (dateTime) => {
    return new Date(dateTime).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };

  if (loading) {
    return (
      <div className="flight-search-page">
        <Navbar />
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Searching for the best flights...</p>
        </div>
        <Footer />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flight-search-page">
        <Navbar />
        <div className="error-container">
          <h2>Search Error</h2>
          <p>{error}</p>
          <button onClick={() => navigate('/flights')} className="retry-button">
            Try Again
          </button>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flight-search-page">
      <Navbar />

      {/* Search Summary */}
      <div className="search-summary">
        <div className="summary-content">
          <div className="route">
            <span className="from">{searchParams.from}</span>
            <ArrowRight className="arrow" />
            <span className="to">{searchParams.to}</span>
          </div>
          <div className="details">
            <span>{new Date(searchParams.departDate).toLocaleDateString()}</span>
            <span>{searchParams.travelers} {searchParams.travelers === 1 ? 'Traveler' : 'Travelers'}</span>
            <span>{searchParams.classType}</span>
          </div>
        </div>
        <button onClick={() => navigate('/flights')} className="modify-search">
          Modify Search
        </button>
      </div>

      {/* Filters and Sort */}
      <div className="filters-sort-container">
        <div className="sort-options">
          <select value={sortOrder} onChange={(e) => setSortOrder(e.target.value)}>
            <option value="price">Price (Low to High)</option>
            <option value="duration">Duration</option>
            <option value="departure">Departure Time</option>
            <option value="arrival">Arrival Time</option>
          </select>
        </div>

        <div className="filters">
          <button className="filter-button">
            <Filter /> Filters
          </button>
        </div>
      </div>

      {/* Date Range Selector */}
      <div className="date-range">
        {dateRange.map((dateInfo, index) => (
          <button
            key={index}
            className={`date-option ${dateInfo.selected ? 'selected' : ''} ${dateInfo.isPast ? 'disabled' : ''}`}
            disabled={dateInfo.isPast}
            onClick={() => {
              // Handle date change logic here
              console.log('Selected date:', dateInfo.isoDate);
            }}
          >
            <div className="day">{dateInfo.day}</div>
            <div className="date">{dateInfo.date}</div>
            {dateInfo.price && <div className="price">${dateInfo.price}</div>}
          </button>
        ))}
      </div>

      {/* Flight Results */}
      <div className="flight-results">
        {currentFlights.length === 0 ? (
          <div className="no-results">
            <h3>No flights found</h3>
            <p>Try adjusting your search criteria</p>
          </div>
        ) : (
          <>
            <div className="results-header">
              <span>{filteredAndSortedFlights.length} flights found</span>
            </div>

            {currentFlights.map((flight) => (
              <div key={flight.id} className="flight-card">
                <div className="flight-header">
                  <div className="airline-info">
                    <span className="airline">{flight.airline}</span>
                    <span className="flight-number">{flight.flightNumber}</span>
                  </div>
                  <div className="price">
                    <Price amount={flight.price.amount} />
                  </div>
                </div>

                <div className="flight-details">
                  <div className="departure">
                    <div className="time">{formatTime(flight.departure.time)}</div>
                    <div className="airport">{flight.departure.airport}</div>
                    <div className="city">{flight.departure.city}</div>
                  </div>

                  <div className="flight-path">
                    <div className="duration">{formatDuration(flight.duration)}</div>
                    <div className="stops">{flight.stops === 0 ? 'Direct' : `${flight.stops} stop${flight.stops > 1 ? 's' : ''}`}</div>
                  </div>

                  <div className="arrival">
                    <div className="time">{formatTime(flight.arrival.time)}</div>
                    <div className="airport">{flight.arrival.airport}</div>
                    <div className="city">{flight.arrival.city}</div>
                  </div>
                </div>

                <div className="flight-actions">
                  <button
                    className="expand-button"
                    onClick={() => toggleFlightExpansion(flight.id)}
                  >
                    {expandedFlights[flight.id] ? 'Hide Details' : 'Show Details'}
                    {expandedFlights[flight.id] ? <ChevronUp /> : <ChevronDown />}
                  </button>
                  <button
                    className="book-button"
                    onClick={() => handleBookFlight(flight)}
                  >
                    Book Now
                  </button>
                </div>

                {expandedFlights[flight.id] && (
                  <div className="flight-expanded">
                    <div className="segments">
                      {flight.segments.map((segment, index) => (
                        <div key={index} className="segment">
                          <div className="segment-airline">
                            {segment.carrierCode} {segment.number}
                          </div>
                          <div className="segment-route">
                            {segment.departure.iataCode} → {segment.arrival.iataCode}
                          </div>
                          <div className="segment-times">
                            {formatTime(segment.departure.at)} - {formatTime(segment.arrival.at)}
                          </div>
                          <div className="segment-aircraft">
                            Aircraft: {segment.aircraft.code}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="baggage-info">
                      <h4>Baggage Allowance</h4>
                      <div className="baggage-details">
                        <div>Cabin: {flight.baggage.carryOn}</div>
                        <div>Checked: {flight.baggage.checked}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="pagination">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft />
                </button>

                {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    className={currentPage === page ? 'active' : ''}
                    onClick={() => setCurrentPage(page)}
                  >
                    {page}
                  </button>
                ))}

                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <Footer />
    </div>
  );
}

export default withPageElements(FlightSearchPage);
```

---

## 💳 Flight Payment Component

```jsx
import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  CreditCard, Calendar, Lock, CheckCircle, ArrowLeft,
  ChevronDown, ChevronUp, X, Ticket, ShieldCheck,
  ArrowRight, ChevronsRight, MapPin, Check, Star,
  Clock, BadgeCheck, AlertCircle, Info, UserCircle
} from "lucide-react";
import Navbar from "../Navbar";
import Footer from "../Footer";
import withPageElements from "../PageWrapper";
import ArcPayService from "../../../Services/ArcPayService";

function FlightPayment() {
  const location = useLocation();
  const navigate = useNavigate();
  const [paymentData, setPaymentData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activePaymentMethod, setActivePaymentMethod] = useState("creditCard");
  const [cardDetails, setCardDetails] = useState({
    cardNumber: "",
    cardHolder: "",
    expiryDate: "",
    cvv: "",
  });
  const [upiId, setUpiId] = useState("");
  const [processingPayment, setProcessingPayment] = useState(false);
  const [showEmiOptions, setShowEmiOptions] = useState(false);
  const [showPaymentResult, setShowPaymentResult] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(true);
  const [showFareDetails, setShowFareDetails] = useState(true);
  const [promoCode, setPromoCode] = useState("");
  const [promoApplied, setPromoApplied] = useState(false);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [timeLeft, setTimeLeft] = useState(600); // 10 minutes in seconds
  const [timerExpired, setTimerExpired] = useState(false);
  const [pageLoaded, setPageLoaded] = useState(false);
  const [isCardFlipped, setIsCardFlipped] = useState(false);
  const [formErrors, setFormErrors] = useState({});
  const [showSecurityInfo, setShowSecurityInfo] = useState(false);

  // Timer Effect
  useEffect(() => {
    if (timeLeft <= 0) {
      setTimerExpired(true);
      return;
    }

    const timerId = setInterval(() => {
      setTimeLeft((prevTime) => prevTime - 1);
    }, 1000);

    return () => clearInterval(timerId);
  }, [timeLeft]);

  useEffect(() => {
    if (location.state) {
      setPaymentData(location.state);
      setLoading(false);
    } else {
      navigate("/flights");
    }
  }, [location, navigate]);

  useEffect(() => {
    const timer = setTimeout(() => setPageLoaded(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const handlePromoCodeChange = (e) => {
    setPromoCode(e.target.value.toUpperCase());
    setPromoApplied(false);
    setDiscountAmount(0);
    setFormErrors({ ...formErrors, promoCode: "" });
  };

  const applyPromoCode = () => {
    if (!promoCode) {
      setFormErrors({ ...formErrors, promoCode: "Please enter a promo code" });
      return;
    }

    if (promoCode === "FLYHIGH10") {
      const calculatedDiscount = Math.min(paymentData?.calculatedFare?.totalAmount * 0.1 || 0, 500);
      setDiscountAmount(calculatedDiscount);
      setPromoApplied(true);
      setFormErrors({ ...formErrors, promoCode: "" });
    } else {
      setFormErrors({ ...formErrors, promoCode: "Invalid promo code" });
      setPromoApplied(false);
      setDiscountAmount(0);
    }
  };

  const finalAmount = paymentData ? (paymentData.calculatedFare?.totalAmount || 0) - discountAmount : 0;

  const toggleFareDetails = () => {
    setShowFareDetails(!showFareDetails);
  };

  const handleCardDetailsChange = (e) => {
    const { name, value } = e.target;
    setFormErrors({ ...formErrors, [name]: "" });

    if (name === "cardNumber") {
      const formattedValue = value
        .replace(/\s/g, "")
        .replace(/(\d{4})/g, "$1 ")
        .trim()
        .slice(0, 19);
      setCardDetails({ ...cardDetails, [name]: formattedValue });
      return;
    }

    if (name === "expiryDate") {
      const formattedValue = value
        .replace(/\//g, "")
        .replace(/(\d{2})(\d{0,2})/, "$1/$2")
        .slice(0, 5);
      setCardDetails({ ...cardDetails, [name]: formattedValue });
      return;
    }

    setCardDetails({ ...cardDetails, [name]: value });
  };

  const validateForm = () => {
    const errors = {};

    if (activePaymentMethod === "creditCard") {
      if (!cardDetails.cardNumber.replace(/\s/g, "").match(/^\d{16}$/)) {
        errors.cardNumber = "Please enter a valid 16-digit card number";
      }
      if (!cardDetails.cardHolder.trim()) {
        errors.cardHolder = "Please enter the cardholder name";
      }
      if (!cardDetails.expiryDate.match(/^(0[1-9]|1[0-2])\/\d{2}$/)) {
        errors.expiryDate = "Please enter a valid expiry date (MM/YY)";
      }
      if (!cardDetails.cvv.match(/^\d{3,4}$/)) {
        errors.cvv = "Please enter a valid CVV";
      }
    } else if (activePaymentMethod === "upi") {
      if (!upiId.match(/^[a-zA-Z0-9.\-_]{2,}@[a-zA-Z]{2,}$/)) {
        errors.upiId = "Please enter a valid UPI ID";
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handlePayment = async () => {
    if (!validateForm()) return;

    setProcessingPayment(true);

    try {
      // Prepare payment data
      const paymentPayload = {
        orderId: `FLT-${Date.now()}`,
        amount: finalAmount,
        cardDetails: activePaymentMethod === "creditCard" ? {
          number: cardDetails.cardNumber.replace(/\s/g, ""),
          holder: cardDetails.cardHolder,
          expiry: cardDetails.expiryDate,
          cvv: cardDetails.cvv
        } : null,
        upiId: activePaymentMethod === "upi" ? upiId : null,
        customerInfo: {
          firstName: paymentData?.passengerDetails?.firstName || "John",
          lastName: paymentData?.passengerDetails?.lastName || "Doe",
          email: paymentData?.passengerDetails?.email || "john@example.com",
          phone: paymentData?.passengerDetails?.phone || "+1234567890"
        },
        billingAddress: {
          street: "123 Main St",
          city: "Anytown",
          state: "ST",
          zipCode: "12345",
          country: "US"
        }
      };

      console.log('Processing payment:', paymentPayload);

      // Process payment with ARC Pay
      const paymentResult = await ArcPayService.processPayment(paymentPayload);

      if (paymentResult.success) {
        setPaymentSuccess(true);
        setShowPaymentResult(true);

        // Navigate to success page after showing result
        setTimeout(() => {
          navigate('/flight-booking-success', {
            state: {
              bookingReference: `FLT${Date.now()}`,
              paymentData: paymentData,
              paymentResult: paymentResult
            }
          });
        }, 3000);
      } else {
        throw new Error(paymentResult.error || 'Payment failed');
      }

    } catch (error) {
      console.error('Payment error:', error);
      setPaymentSuccess(false);
      setShowPaymentResult(true);

      // Reset after showing error
      setTimeout(() => {
        setShowPaymentResult(false);
      }, 3000);
    } finally {
      setProcessingPayment(false);
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="flight-payment">
        <Navbar />
        <div className="loading">Loading payment details...</div>
        <Footer />
      </div>
    );
  }

  if (timerExpired) {
    return (
      <div className="flight-payment">
        <Navbar />
        <div className="timer-expired">
          <h2>Session Expired</h2>
          <p>Your booking session has expired. Please start over.</p>
          <button onClick={() => navigate('/flights')} className="retry-button">
            Start New Search
          </button>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="flight-payment">
      <Navbar />

      {/* Service Banner */}
      <div className="service-banner">
        <div className="container mx-auto px-2 flex justify-center items-center flex-wrap">
          <div className="h-5 w-5 text-yellow-300 mr-2 flex-shrink-0">✈️</div>
          <p className="text-white text-xs font-medium tracking-wide">
            <span className="font-bold">Self-Service Portal will be available very soon...</span>
            Meanwhile please Call <span className="text-yellow-300 font-bold whitespace-nowrap">((877) 538-7380)</span>
            or Email <a href="mailto:support@jetsetterss.com" className="underline text-yellow-300 font-bold">support@jetsetterss.com</a>
            for all your travel needs. Team Jetsetters!
          </p>
        </div>
      </div>

      <div className="payment-container">
        {/* Flight Summary Sidebar */}
        <div className="flight-summary">
          <div className="summary-header">
            <h3>Flight Summary</h3>
            <button onClick={() => navigate(-1)} className="edit-button">
              <ArrowLeft size={16} /> Edit
            </button>
          </div>

          <div className="flight-info">
            <div className="route">
              <span className="from">{paymentData?.flight?.departure?.city}</span>
              <ArrowRight className="arrow" />
              <span className="to">{paymentData?.flight?.arrival?.city}</span>
            </div>

            <div className="flight-details">
              <div className="airline">{paymentData?.flight?.airline} {paymentData?.flight?.flightNumber}</div>
              <div className="date">{new Date(paymentData?.searchData?.departDate).toLocaleDateString()}</div>
              <div className="passengers">{paymentData?.searchData?.travelers} Passenger{paymentData?.searchData?.travelers !== 1 ? 's' : ''}</div>
            </div>

            <div className="fare-breakdown">
              <button onClick={toggleFareDetails} className="fare-toggle">
                Fare Details {showFareDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {showFareDetails && (
                <div className="fare-details">
                  <div className="fare-item">
                    <span>Base Fare</span>
                    <span>${paymentData?.calculatedFare?.baseAmount?.toFixed(2) || '0.00'}</span>
                  </div>
                  <div className="fare-item">
                    <span>Taxes & Fees</span>
                    <span>${paymentData?.calculatedFare?.taxes?.toFixed(2) || '0.00'}</span>
                  </div>
                  {promoApplied && (
                    <div className="fare-item discount">
                      <span>Discount ({promoCode})</span>
                      <span>-${discountAmount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="fare-item total">
                    <span>Total</span>
                    <span>${finalAmount.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Payment Form */}
        <div className="payment-form">
          <div className="payment-header">
            <h2>Payment Details</h2>
            <div className="timer">
              <Clock size={16} />
              <span>Time left: {formatTime(timeLeft)}</span>
            </div>
          </div>

          {/* Promo Code */}
          <div className="promo-section">
            <div className="promo-input">
              <input
                type="text"
                placeholder="Enter promo code"
                value={promoCode}
                onChange={handlePromoCodeChange}
                className={formErrors.promoCode ? 'error' : ''}
              />
              <button onClick={applyPromoCode} className="apply-button">
                Apply
              </button>
            </div>
            {formErrors.promoCode && <div className="error-message">{formErrors.promoCode}</div>}
            {promoApplied && <div className="success-message">Promo code applied! You saved ${discountAmount.toFixed(2)}</div>}
          </div>

          {/* Payment Methods */}
          <div className="payment-methods">
            <h3>Choose Payment Method</h3>

            {/* Credit Card */}
            <div className={`payment-method ${activePaymentMethod === 'creditCard' ? 'active' : ''}`}
                 onClick={() => setActivePaymentMethod('creditCard')}>
              <div className="method-header">
                <CreditCard size={20} />
                <span>Credit/Debit Card</span>
                <input type="radio" checked={activePaymentMethod === 'creditCard'} readOnly />
              </div>

              {activePaymentMethod === 'creditCard' && (
                <div className="card-details">
                  <div className="card-preview">
                    <div className={`card ${isCardFlipped ? 'flipped' : ''}`}>
                      <div className="card-front">
                        <div className="card-chip"></div>
                        <div className="card-number">
                          {cardDetails.cardNumber || '•••• •••• •••• ••••'}
                        </div>
                        <div className="card-holder">
                          {cardDetails.cardHolder || 'CARDHOLDER NAME'}
                        </div>
                        <div className="card-expiry">
                          {cardDetails.expiryDate || 'MM/YY'}
                        </div>
                      </div>
                      <div className="card-back">
                        <div className="card-cvv">
                          {cardDetails.cvv || '•••'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="card-form">
                    <div className="form-group">
                      <label>Card Number</label>
                      <input
                        type="text"
                        name="cardNumber"
                        placeholder="1234 5678 9012 3456"
                        value={cardDetails.cardNumber}
                        onChange={handleCardDetailsChange}
                        onFocus={() => setIsCardFlipped(false)}
                        className={formErrors.cardNumber ? 'error' : ''}
                      />
                      {formErrors.cardNumber && <div className="error-message">{formErrors.cardNumber}</div>}
                    </div>

                    <div className="form-group">
                      <label>Cardholder Name</label>
                      <input
                        type="text"
                        name="cardHolder"
                        placeholder="John Doe"
                        value={cardDetails.cardHolder}
                        onChange={handleCardDetailsChange}
                        onFocus={() => setIsCardFlipped(false)}
                        className={formErrors.cardHolder ? 'error' : ''}
                      />
                      {formErrors.cardHolder && <div className="error-message">{formErrors.cardHolder}</div>}
                    </div>

                    <div className="form-row">
                      <div className="form-group">
                        <label>Expiry Date</label>
                        <input
                          type="text"
                          name="expiryDate"
                          placeholder="MM/YY"
                          value={cardDetails.expiryDate}
                          onChange={handleCardDetailsChange}
                          onFocus={() => setIsCardFlipped(false)}
                          className={formErrors.expiryDate ? 'error' : ''}
                        />
                        {formErrors.expiryDate && <div className="error-message">{formErrors.expiryDate}</div>}
                      </div>

                      <div className="form-group">
                        <label>CVV</label>
                        <input
                          type="text"
                          name="cvv"
                          placeholder="123"
                          value={cardDetails.cvv}
                          onChange={handleCardDetailsChange}
                          onFocus={() => setIsCardFlipped(true)}
                          maxLength="4"
                          className={formErrors.cvv ? 'error' : ''}
                        />
                        {formErrors.cvv && <div className="error-message">{formErrors.cvv}</div>}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* UPI */}
            <div className={`payment-method ${activePaymentMethod === 'upi' ? 'active' : ''}`}
                 onClick={() => setActivePaymentMethod('upi')}>
              <div className="method-header">
                <span className="upi-icon">UPI</span>
                <span>UPI Payment</span>
                <input type="radio" checked={activePaymentMethod === 'upi'} readOnly />
              </div>

              {activePaymentMethod === 'upi' && (
                <div className="upi-details">
                  <div className="form-group">
                    <label>UPI ID</label>
                    <input
                      type="text"
                      placeholder="yourname@upi"
                      value={upiId}
                      onChange={(e) => setUpiId(e.target.value)}
                      className={formErrors.upiId ? 'error' : ''}
                    />
                    {formErrors.upiId && <div className="error-message">{formErrors.upiId}</div>}
                  </div>
                </div>
              )}
            </div>

            {/* EMI Options */}
            <div className="emi-section">
              <button onClick={() => setShowEmiOptions(!showEmiOptions)} className="emi-toggle">
                EMI Options {showEmiOptions ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {showEmiOptions && (
                <div className="emi-options">
                  <div className="emi-plan">
                    <span>3 Months</span>
                    <span>${(finalAmount / 3).toFixed(2)}/month</span>
                  </div>
                  <div className="emi-plan">
                    <span>6 Months</span>
                    <span>${(finalAmount / 6).toFixed(2)}/month</span>
                  </div>
                  <div className="emi-plan">
                    <span>9 Months</span>
                    <span>${(finalAmount / 9).toFixed(2)}/month</span>
                  </div>
                  <div className="emi-plan">
                    <span>12 Months</span>
                    <span>${(finalAmount / 12).toFixed(2)}/month</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Pay Now Button */}
          <button
            onClick={handlePayment}
            disabled={processingPayment || timerExpired}
            className="pay-now-button"
          >
            {processingPayment ? (
              <>
                <div className="spinner"></div>
                Processing Payment...
              </>
            ) : (
              <>
                Pay ${finalAmount.toFixed(2)}
                <ArrowRight size={16} />
              </>
            )}
          </button>

          {/* Security Info */}
          <div className="security-info">
            <button onClick={() => setShowSecurityInfo(!showSecurityInfo)} className="security-toggle">
              <ShieldCheck size={16} />
              Secure Payment
              {showSecurityInfo ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>

            {showSecurityInfo && (
              <div className="security-details">
                <p>Your payment information is encrypted and secure. We use industry-standard SSL encryption and comply with PCI DSS standards.</p>
                <div className="security-badges">
                  <span className="badge">SSL Encrypted</span>
                  <span className="badge">PCI Compliant</span>
                  <span className="badge">Bank Grade Security</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Payment Result Modal */}
        {showPaymentResult && (
          <div className="payment-result-modal">
            <div className="modal-content">
              {paymentSuccess ? (
                <>
                  <CheckCircle size={48} className="success-icon" />
                  <h3>Payment Successful!</h3>
                  <p>Your flight booking has been confirmed.</p>
                </>
              ) : (
                <>
                  <AlertCircle size={48} className="error-icon" />
                  <h3>Payment Failed</h3>
                  <p>Please try again or contact support.</p>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      <Footer />
    </div>
  );
}

export default withPageElements(FlightPayment);
```

---

## 🎨 Flight Search Form CSS Styles

```css
/* Flight Search Form Styles */
.flight-search-form {
  background: linear-gradient(135deg, #0066b2 0%, #1e88e5 100%);
  padding: 2rem 0;
  color: white;
}

.search-container {
  max-width: 1000px;
  margin: 0 auto;
  padding: 0 1rem;
}

.trip-type-tabs {
  display: flex;
  margin-bottom: 2rem;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 0.25rem;
}

.tab {
  flex: 1;
  padding: 0.75rem 1rem;
  border: none;
  background: none;
  color: rgba(255, 255, 255, 0.8);
  font-weight: 600;
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.3s ease;
}

.tab.active {
  background: white;
  color: #0066b2;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.search-form {
  background: white;
  border-radius: 16px;
  padding: 2rem;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
}

.search-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.field-group {
  text-align: left;
}

.field-label {
  display: block;
  font-weight: 600;
  color: #374151;
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
}

.field-input {
  position: relative;
}

.field-icon {
  position: absolute;
  left: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  color: #6b7280;
  width: 1rem;
  height: 1rem;
}

.field-input input,
.field-input select {
  width: 100%;
  padding: 0.75rem 1rem 0.75rem 2.5rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 1rem;
  transition: border-color 0.3s ease;
}

.field-input input:focus,
.field-input select:focus {
  outline: none;
  border-color: #0066b2;
  box-shadow: 0 0 0 3px rgba(0, 102, 178, 0.1);
}

.search-button {
  width: 100%;
  background: linear-gradient(135deg, #0066b2 0%, #1e88e5 100%);
  color: white;
  border: none;
  padding: 1rem 2rem;
  border-radius: 8px;
  font-weight: 600;
  font-size: 1.125rem;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.search-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 10px 20px rgba(0, 102, 178, 0.3);
}

.special-fares {
  margin-top: 2rem;
  text-align: center;
}

.special-fares h3 {
  font-size: 1.125rem;
  font-weight: 600;
  margin-bottom: 1rem;
  color: rgba(255, 255, 255, 0.9);
}

.fare-tags {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem;
}

.fare-tag {
  background: rgba(255, 255, 255, 0.2);
  color: white;
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.875rem;
  font-weight: 500;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

/* Suggestions Dropdown */
.suggestions-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: white;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  box-shadow: 0 10px 20px rgba(0, 0, 0, 0.1);
  z-index: 1000;
  max-height: 200px;
  overflow-y: auto;
}

.suggestion-item {
  padding: 0.75rem 1rem;
  cursor: pointer;
  border-bottom: 1px solid #f3f4f6;
  transition: background-color 0.2s ease;
}

.suggestion-item:hover {
  background-color: #f9fafb;
}

.suggestion-item:last-child {
  border-bottom: none;
}

.city-name {
  font-weight: 600;
  color: #111827;
  margin-bottom: 0.25rem;
}

.city-code {
  font-size: 0.875rem;
  color: #6b7280;
}

/* Error States */
.error {
  border-color: #ef4444 !important;
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.1) !important;
}

.error-message {
  color: #ef4444;
  font-size: 0.75rem;
  margin-top: 0.25rem;
}

/* Mobile Responsive */
@media (max-width: 768px) {
  .search-container {
    padding: 0 0.5rem;
  }

  .search-form {
    padding: 1.5rem;
  }

  .search-fields {
    grid-template-columns: 1fr;
    gap: 1rem;
  }

  .trip-type-tabs {
    margin-bottom: 1.5rem;
  }

  .tab {
    padding: 0.5rem 0.75rem;
    font-size: 0.875rem;
  }

  .fare-tags {
    gap: 0.25rem;
  }

  .fare-tag {
    font-size: 0.75rem;
    padding: 0.2rem 0.5rem;
  }
}
```

---

## 📋 Key Features Summary

### **Flight Booking Flow:**
1. **FlightLanding** - Hero section with search form and popular destinations
2. **FlightSearchForm** - Advanced search with autocomplete and validation
3. **FlightSearchPage** - Results with filters, sorting, and pagination
4. **FlightPayment** - Secure payment with ARC Pay integration
5. **FlightBookingConfirmation** - Passenger details and booking summary
6. **FlightBookingSuccess** - Confirmation and booking details

### **Core Functionality:**
- ✅ **Multi-city search** - One-way, round-trip, multi-city options
- ✅ **Autocomplete** - City/airport suggestions with IATA codes
- ✅ **Advanced filters** - Price, stops, airlines, duration
- ✅ **Real-time search** - Amadeus API integration
- ✅ **Secure payments** - ARC Pay with multiple payment methods
- ✅ **Booking management** - View, modify, cancel bookings
- ✅ **Mobile responsive** - Optimized for all screen sizes

### **Technical Implementation:**
- **Amadeus API** for flight search and booking
- **ARC Pay** for secure payment processing
- **Supabase** for booking storage and user management
- **React Router** for navigation between booking steps
- **Real-time updates** and loading states
- **Form validation** and error handling
- **Responsive design** with mobile-first approach

This comprehensive flight booking code provides all the functionality from the Jetsetterss web platform. Use this as the foundation for your Android app's flight booking feature! ✈️


