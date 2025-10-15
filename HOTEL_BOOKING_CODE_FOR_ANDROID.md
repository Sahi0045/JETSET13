# 🏨 Jetsetterss Hotel Booking Code - Complete Implementation Guide

This document contains the complete hotel booking implementation from the Jetsetterss web platform. Use this code to replicate the exact same functionality and design in the Android app.

## 🎯 Hotel Booking Flow Structure

The hotel booking system consists of multiple interconnected components:

1. **HotelLanding** - Main hotel search page with hero section
2. **HotelSearch** - Advanced hotel search form
3. **HotelSearchResults** - Search results with filters and sorting
4. **HotelDetails** - Detailed hotel information and room selection
5. **HotelBooking** - Guest information and payment processing
6. **HotelBookingSuccess** - Confirmation and booking details

---

## 🏨 Hotel Landing Page Component

```jsx
import React from "react"
import { useNavigate } from "react-router-dom"
import Navbar from "../Navbar"
import Footer from "../Footer"
import {
  Search, Globe, Users, Calendar, Star, Mail, Check, Heart,
  ArrowRight, ChevronLeft, ChevronRight, Coffee, Wifi, Tv,
  Shield, Clock, MapPin, Award, Sparkles, X, Loader,
  ChevronDown, Minus, Plus
} from "lucide-react"
import { popularDestinations } from "./hotel"
import { useState, useEffect, useRef } from "react"
import axios from 'axios'
import * as amadeusUtils from './amadeusUtils'
import DirectAmadeusService from '../../../Services/DirectAmadeusService'
import { API_BASE_URL } from '../../../../../src/config/api.js'

function HotelLanding() {
  const navigate = useNavigate()

  // Search states
  const [searchDestination, setSearchDestination] = useState("")
  const [searchPackageType, setSearchPackageType] = useState("All Inclusive")
  const [searchDates, setSearchDates] = useState("Select dates")
  const [searchTravelers, setSearchTravelers] = useState(2)
  const [filteredHotels, setFilteredHotels] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState(null)
  const [cityCode, setCityCode] = useState("")

  // Date picker states
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth())
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear())
  const [selectedStartDate, setSelectedStartDate] = useState(null)
  const [selectedEndDate, setSelectedEndDate] = useState(null)
  const [hoverDate, setHoverDate] = useState(null)
  const datePickerRef = useRef(null)
  const months = ['January', 'February', 'March', 'April', 'May', 'June',
                  'July', 'August', 'September', 'October', 'November', 'December']

  // Destination search suggestion states
  const [destinationSuggestions, setDestinationSuggestions] = useState([])
  const [showDestinationSuggestions, setShowDestinationSuggestions] = useState(false)
  const [filteredSuggestions, setFilteredSuggestions] = useState([])
  const destinationRef = useRef(null)

  // Mobile search toggle
  const [showMobileSearch, setShowMobileSearch] = useState(false)

  // Mobile search modal state
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)

  // Mobile view detection
  const [isMobileView, setIsMobileView] = useState(false)

  // Fetch destinations from backend
  useEffect(() => {
    const fetchDestinations = async () => {
      try {
        console.log('Using API URL from config:', API_BASE_URL)
        const response = await axios.get(`${API_BASE_URL}/hotels/destinations`)
        if (response.data.success) {
          setDestinationSuggestions(response.data.data)
        } else {
          // Fallback to popular destinations if API doesn't return success
          setDestinationSuggestions(popularDestinations)
        }
      } catch (error) {
        console.error('Error fetching destinations:', error)
        // Fallback to popular destinations if API fails
        setDestinationSuggestions(popularDestinations)
      }
    }
    fetchDestinations()
  }, [])

  // Mobile detection
  useEffect(() => {
    const handleResize = () => {
      setIsMobileView(window.innerWidth < 768)
    }

    handleResize()
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Handle destination input change
  const handleDestinationChange = (e) => {
    const value = e.target.value
    setSearchDestination(value)
    setCityCode("")

    if (value.trim()) {
      setShowDestinationSuggestions(true)
      const filtered = destinationSuggestions.filter(dest =>
        dest.name.toLowerCase().includes(value.toLowerCase()) ||
        dest.country.toLowerCase().includes(value.toLowerCase()) ||
        dest.code.toLowerCase().includes(value.toLowerCase())
      )
      setFilteredSuggestions(filtered.slice(0, 5))
    } else {
      setShowDestinationSuggestions(false)
    }
  }

  // Handle destination suggestion click
  const handleSuggestionClick = (destination) => {
    setSearchDestination(destination.name)
    setCityCode(destination.code)
    setShowDestinationSuggestions(false)
  }

  // Handle search submission
  const handleSearch = () => {
    if (!searchDestination.trim()) {
      setSearchError("Please enter a destination")
      return
    }

    if (!selectedStartDate || !selectedEndDate) {
      setSearchError("Please select check-in and check-out dates")
      return
    }

    // Navigate to hotel search results
    navigate('/hotel-search-results', {
      state: {
        searchParams: {
          destination: searchDestination,
          cityCode: cityCode,
          checkInDate: selectedStartDate.toISOString().split('T')[0],
          checkOutDate: selectedEndDate.toISOString().split('T')[0],
          travelers: searchTravelers
        }
      }
    })
  }

  return (
    <div className="hotel-landing">
      <Navbar />

      {/* Service Banner - Same as other pages */}
      <div className="relative">
        <div className={`w-full text-center bg-gradient-to-r from-blue-900/90 via-blue-800/90 to-blue-900/90 py-3 backdrop-blur-sm z-20 border-y border-blue-500/30 ${isMobileView ? 'px-3' : ''}`} style={{position: 'absolute', top: isMobileView ? '60px' : '73px', left: 0, right: 0}}>
          <div className="container mx-auto px-2 flex justify-center items-center flex-wrap">
            <Sparkles className="h-5 w-5 text-yellow-300 mr-2 flex-shrink-0" />
            <p className={`text-white ${isMobileView ? 'text-xs' : 'text-base'} font-medium tracking-wide`}>
              <span className="font-bold">Self-Service Portal will be available very soon...</span> Meanwhile please Call <span className="text-yellow-300 font-bold whitespace-nowrap">((877) 538-7380)</span> or Email <a href="mailto:support@jetsetterss.com" className="underline text-yellow-300 font-bold">support@jetsetterss.com</a> for all your travel needs. Team Jetsetters!
            </p>
          </div>
        </div>
      </div>

      {/* Hero Section */}
      <section className="hero-section">
        <div
          className="hero-background"
          style={{
            backgroundImage: `url('/images/hotel-hero-bg.jpg')`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat'
          }}
        >
          <div className="hero-overlay"></div>
          <div className="hero-content">
            <div className="hero-text">
              <h1 className="hero-title">
                Find Your Perfect <span className="highlight">Hotel Stay</span>
              </h1>
              <p className="hero-subtitle">
                Discover amazing hotels worldwide with the best prices and amenities
              </p>
            </div>

            {/* Hotel Search Form */}
            <div className="search-container">
              <div className="search-form">
                {/* Destination Input */}
                <div className="form-group">
                  <label className="form-label">Destination</label>
                  <div className="input-container">
                    <MapPin className="input-icon" />
                    <input
                      ref={destinationRef}
                      type="text"
                      value={searchDestination}
                      onChange={handleDestinationChange}
                      placeholder="Where are you going?"
                      className="form-input"
                    />
                    {showDestinationSuggestions && filteredSuggestions.length > 0 && (
                      <div className="suggestions-dropdown">
                        {filteredSuggestions.map((dest, index) => (
                          <div
                            key={index}
                            className="suggestion-item"
                            onClick={() => handleSuggestionClick(dest)}
                          >
                            <div className="city-name">{dest.name}</div>
                            <div className="city-code">{dest.code} - {dest.country}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Date Picker */}
                <div className="form-group">
                  <label className="form-label">Check-in - Check-out</label>
                  <div className="input-container">
                    <Calendar className="input-icon" />
                    <input
                      type="text"
                      value={searchDates}
                      onClick={() => setShowDatePicker(!showDatePicker)}
                      placeholder="Select dates"
                      className="form-input"
                      readOnly
                    />
                  </div>
                </div>

                {/* Travelers */}
                <div className="form-group">
                  <label className="form-label">Guests</label>
                  <div className="input-container">
                    <Users className="input-icon" />
                    <input
                      type="number"
                      value={searchTravelers}
                      onChange={(e) => setSearchTravelers(parseInt(e.target.value) || 1)}
                      min="1"
                      max="10"
                      className="form-input"
                    />
                  </div>
                </div>

                {/* Search Button */}
                <button onClick={handleSearch} className="search-button">
                  <Search className="search-icon" />
                  Search Hotels
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Popular Destinations */}
      <section className="popular-destinations">
        <div className="section-container">
          <h2 className="section-title">Popular Destinations</h2>
          <div className="destinations-grid">
            {popularDestinations.slice(0, 8).map((destination) => (
              <div
                key={destination.id}
                className="destination-card"
                onClick={() => {
                  setSearchDestination(destination.name)
                  setCityCode(destination.code)
                }}
              >
                <div className="destination-image">
                  <img src={destination.image} alt={destination.name} />
                </div>
                <div className="destination-info">
                  <h4>{destination.name}</h4>
                  <p>{destination.country}</p>
                  <div className="destination-rating">
                    <Star className="star" />
                    <span>{destination.rating}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose Us */}
      <section className="why-choose-us">
        <div className="section-container">
          <h2 className="section-title">Why Choose Our Hotels</h2>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">
                <Award className="icon" />
              </div>
              <h4>Best Price Guarantee</h4>
              <p>Find the best deals with our price match guarantee</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <Shield className="icon" />
              </div>
              <h4>Verified Reviews</h4>
              <p>Read authentic reviews from real guests</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">
                <Clock className="icon" />
              </div>
              <h4>Free Cancellation</h4>
              <p>Flexible booking policies for peace of mind</p>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}

export default HotelLanding
```

---

## 🔍 Hotel Search Form Component

```jsx
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import { FaSearch, FaCalendarAlt, FaUser } from 'react-icons/fa';
import axios from 'axios';
import { popularDestinations } from './hotel';
import * as amadeusUtils from './amadeusUtils';

// Use environment variables instead of hardcoded credentials
const API_URL = import.meta.env.VITE_API_URL || 'https://prod-r8ncjf76l-shubhams-projects-4a867368.vercel.app/api';

const HotelSearch = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [destinations, setDestinations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Try to load last search from session storage
  const [searchParams, setSearchParams] = useState(() => {
    const savedSearch = sessionStorage.getItem('lastHotelSearch');
    if (savedSearch) {
      const parsed = JSON.parse(savedSearch);
      // Only use saved search if it's less than 24 hours old
      if (new Date().getTime() - new Date(parsed.timestamp).getTime() < 24 * 60 * 60 * 1000) {
        return {
          cityCode: parsed.cityCode,
          checkInDate: parsed.checkInDate,
          checkOutDate: parsed.checkOutDate,
          adults: parsed.adults
        };
      }
    }

    // Default search params with future dates
    const defaultDates = amadeusUtils.createDefaultDates();
    return {
      cityCode: '',
      checkInDate: defaultDates.checkInDate,
      checkOutDate: defaultDates.checkOutDate,
      adults: 2
    };
  });

  // Fetch destinations from API
  useEffect(() => {
    const fetchDestinations = async () => {
      try {
        const response = await axios.get(`${amadeusUtils.API_URL}/hotels/destinations`);
        if (response.data && response.data.success) {
          setDestinations(response.data.data);
        } else {
          // Use popular destinations as fallback
          setDestinations(popularDestinations);
        }
      } catch (error) {
        console.error('Error fetching destinations:', error);
        // Use popular destinations as fallback
        setDestinations(popularDestinations);
      }
    };

    fetchDestinations();
  }, []);

  const handleSearch = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Validate search parameters
    const validation = amadeusUtils.validateSearchParams(searchParams);
    if (!validation.isValid) {
      setError(validation.errors[0]);
      setLoading(false);
      return;
    }

    try {
      console.log('Searching with params:', searchParams);

      // Call the API with enhanced search parameters
      const response = await axios.get(`${amadeusUtils.API_URL}/hotels/search`, {
        params: amadeusUtils.buildSearchParams(searchParams),
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      if (response.data.success) {
        // Store search params in session storage for persistence
        sessionStorage.setItem('lastHotelSearch', JSON.stringify({
          ...searchParams,
          timestamp: new Date().toISOString()
        }));

        navigate('/hotel-search-results', {
          state: {
            searchResults: response.data.data,
            searchParams: searchParams
          }
        });
      } else {
        setError(response.data.message || 'No hotels found for these search criteria');
      }
    } catch (err) {
      console.error('Search error:', err);
      if (err.response?.status === 429) {
        setError('Too many requests. Please try again later.');
      } else {
        setError(err.response?.data?.message || 'An error occurred while searching. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDateChange = (date, field) => {
    const formattedDate = amadeusUtils.formatDate(date);
    setSearchParams(prev => ({
      ...prev,
      [field]: formattedDate
    }));

    // If setting check-in date and it's after check-out, update check-out
    if (field === 'checkInDate') {
      const checkOut = new Date(searchParams.checkOutDate);
      const newCheckIn = new Date(formattedDate);

      if (checkOut <= newCheckIn) {
        const newCheckOut = new Date(newCheckIn);
        newCheckOut.setDate(newCheckIn.getDate() + 1);
        setSearchParams(prev => ({
          ...prev,
          checkOutDate: amadeusUtils.formatDate(newCheckOut)
        }));
      }
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-xl p-6 md:p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8 text-center">
            Find Your Perfect Hotel
          </h1>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
              <div className="flex">
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">
                    Search Error
                  </h3>
                  <div className="mt-2 text-sm text-red-700">
                    {error}
                  </div>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSearch} className="space-y-6">
            {/* Destination Selection */}
            <div>
              <label htmlFor="destination" className="block text-sm font-medium text-gray-700 mb-2">
                Destination
              </label>
              <select
                id="destination"
                value={searchParams.cityCode}
                onChange={(e) => setSearchParams({...searchParams, cityCode: e.target.value})}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                required
              >
                <option value="">Select a destination</option>
                {destinations.map((dest) => (
                  <option key={dest.code} value={dest.code}>
                    {dest.name}, {dest.country}
                  </option>
                ))}
              </select>
            </div>

            {/* Check-in Date */}
            <div>
              <label htmlFor="checkIn" className="block text-sm font-medium text-gray-700 mb-2">
                Check-in Date
              </label>
              <DatePicker
                selected={searchParams.checkInDate ? new Date(searchParams.checkInDate) : null}
                onChange={(date) => handleDateChange(date, 'checkInDate')}
                minDate={new Date()}
                dateFormat="MMM dd, yyyy"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholderText="Select check-in date"
                required
              />
            </div>

            {/* Check-out Date */}
            <div>
              <label htmlFor="checkOut" className="block text-sm font-medium text-gray-700 mb-2">
                Check-out Date
              </label>
              <DatePicker
                selected={searchParams.checkOutDate ? new Date(searchParams.checkOutDate) : null}
                onChange={(date) => handleDateChange(date, 'checkOutDate')}
                minDate={searchParams.checkInDate ? new Date(searchParams.checkInDate) : new Date()}
                dateFormat="MMM dd, yyyy"
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                placeholderText="Select check-out date"
                required
              />
            </div>

            {/* Number of Adults */}
            <div>
              <label htmlFor="adults" className="block text-sm font-medium text-gray-700 mb-2">
                Number of Adults
              </label>
              <select
                id="adults"
                value={searchParams.adults}
                onChange={(e) => setSearchParams({...searchParams, adults: parseInt(e.target.value)})}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                required
              >
                {[1,2,3,4,5,6,7,8].map(num => (
                  <option key={num} value={num}>{num} Adult{num > 1 ? 's' : ''}</option>
                ))}
              </select>
            </div>

            {/* Search Button */}
            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Searching...
                  </>
                ) : (
                  <>
                    <FaSearch className="-ml-1 mr-3 h-5 w-5" />
                    Search Hotels
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default HotelSearch;
```

---

## 📋 Hotel Search Results Component

```jsx
import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Star, MapPin, Wifi, Coffee, Tv, Users, Heart, ArrowLeft, Search, X, Globe, Calendar, ChevronDown } from 'lucide-react';
import Navbar from '../Navbar';
import Footer from '../Footer';
import axios from 'axios';
import * as amadeusUtils from './amadeusUtils';
import DirectAmadeusService from '../../../Services/DirectAmadeusService';
import { popularDestinations } from './hotel';

export default function HotelSearchResults() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useState(location.state?.searchParams || {});
  const [searchResults, setSearchResults] = useState(location.state?.searchResults || []);
  const [filteredHotels, setFilteredHotels] = useState([]);
  const [sortBy, setSortBy] = useState('recommended');
  const [priceRange, setPriceRange] = useState([0, 1000]);
  const [selectedAmenities, setSelectedAmenities] = useState([]);
  const [selectedRating, setSelectedRating] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [favorites, setFavorites] = useState({});
  const [totalHotels, setTotalHotels] = useState(0);

  // Search states for modification
  const [searchDestination, setSearchDestination] = useState(searchParams.cityCode || "");
  const [searchDates, setSearchDates] = useState(() => {
    if (searchParams.checkInDate && searchParams.checkOutDate) {
      return amadeusUtils.formatDateRange(searchParams.checkInDate, searchParams.checkOutDate);
    }
    return "Select dates";
  });
  const [searchTravelers, setSearchTravelers] = useState(searchParams.adults || 2);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [cityCode, setCityCode] = useState(searchParams.cityCode || "");

  // Date picker states
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [selectedStartDate, setSelectedStartDate] = useState(searchParams.checkInDate ? new Date(searchParams.checkInDate) : null);
  const [selectedEndDate, setSelectedEndDate] = useState(searchParams.checkOutDate ? new Date(searchParams.checkOutDate) : null);
  const [hoverDate, setHoverDate] = useState(null);
  const datePickerRef = useRef(null);
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  // Destination search suggestion states
  const [destinationSuggestions, setDestinationSuggestions] = useState([]);
  const [showDestinationSuggestions, setShowDestinationSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState([]);
  const destinationRef = useRef(null);

  // Fetch destinations from backend
  useEffect(() => {
    const fetchDestinations = async () => {
      try {
        const apiUrl = 'https://jet-set-go-psi.vercel.app/api';
        const response = await axios.get(`${apiUrl}/hotels/destinations`, {
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        });
        if (response.data.success) {
          setDestinationSuggestions(response.data.data);
        } else {
          // Fallback to popular destinations if API doesn't return success
          setDestinationSuggestions(popularDestinations);
        }
      } catch (error) {
        console.error('Error fetching destinations:', error);
        // Fallback to popular destinations if API fails
        setDestinationSuggestions(popularDestinations);
      }
    };
    fetchDestinations();
  }, []);

  // Filter and sort hotels
  useEffect(() => {
    let filtered = searchResults.filter(hotel => {
      const hotelPrice = parseFloat(hotel.price) || 0;
      const hotelRating = parseFloat(hotel.rating) || 0;

      // Price filter
      if (hotelPrice < priceRange[0] || hotelPrice > priceRange[1]) {
        return false;
      }

      // Rating filter
      if (selectedRating > 0 && hotelRating < selectedRating) {
        return false;
      }

      // Amenity filter (if amenities data exists)
      if (selectedAmenities.length > 0 && hotel.amenities) {
        const hasSelectedAmenities = selectedAmenities.every(amenity =>
          hotel.amenities.includes(amenity)
        );
        if (!hasSelectedAmenities) {
          return false;
        }
      }

      return true;
    });

    // Sort hotels
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'price-low':
          return (parseFloat(a.price) || 0) - (parseFloat(b.price) || 0);
        case 'price-high':
          return (parseFloat(b.price) || 0) - (parseFloat(a.price) || 0);
        case 'rating':
          return (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0);
        case 'recommended':
        default:
          return (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0);
      }
    });

    setFilteredHotels(filtered);
    setTotalHotels(filtered.length);
  }, [searchResults, sortBy, priceRange, selectedAmenities, selectedRating]);

  const toggleFavorite = (hotelId) => {
    setFavorites(prev => ({
      ...prev,
      [hotelId]: !prev[hotelId]
    }));
  };

  const handleHotelSelect = (hotel) => {
    navigate('/hotel-details', {
      state: {
        hotelData: hotel,
        searchParams: searchParams
      }
    });
  };

  const formatPrice = (price) => {
    const numPrice = parseFloat(price);
    return isNaN(numPrice) ? '$0' : `$${numPrice.toFixed(2)}`;
  };

  const renderStars = (rating) => {
    const stars = [];
    const numRating = parseFloat(rating) || 0;

    for (let i = 1; i <= 5; i++) {
      stars.push(
        <Star
          key={i}
          className={`w-4 h-4 ${i <= numRating ? 'text-yellow-400 fill-current' : 'text-gray-300'}`}
        />
      );
    }

    return stars;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Searching for hotels...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Search Error</h2>
          <p className="text-gray-600 mb-8">{error}</p>
          <button
            onClick={() => navigate('/rental')}
            className="bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 transition-colors"
          >
            Back to Search
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      {/* Search Summary Bar */}
      <div className="bg-white border-b border-gray-200 px-4 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex items-center gap-2">
              <MapPin className="w-5 h-5 text-gray-500" />
              <span className="font-medium text-gray-900">
                {searchParams.cityCode || 'Destination'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-gray-500" />
              <span className="text-gray-600">
                {amadeusUtils.formatDateRange(searchParams.checkInDate, searchParams.checkOutDate)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="w-5 h-5 text-gray-500" />
              <span className="text-gray-600">
                {searchParams.adults} Guest{searchParams.adults !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          <button
            onClick={() => navigate('/rental')}
            className="flex items-center gap-2 text-blue-600 hover:text-blue-800 font-medium"
          >
            <ArrowLeft className="w-4 h-4" />
            Modify Search
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Filters Sidebar */}
          <div className="lg:w-1/4">
            <div className="bg-white rounded-lg shadow-sm p-6 sticky top-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Filters</h3>

              {/* Price Range */}
              <div className="mb-6">
                <h4 className="font-medium text-gray-900 mb-3">Price Range</h4>
                <div className="px-2">
                  <div className="flex justify-between text-sm text-gray-600 mb-2">
                    <span>${priceRange[0]}</span>
                    <span>${priceRange[1]}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1000"
                    step="50"
                    value={priceRange[1]}
                    onChange={(e) => setPriceRange([priceRange[0], parseInt(e.target.value)])}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              </div>

              {/* Rating Filter */}
              <div className="mb-6">
                <h4 className="font-medium text-gray-900 mb-3">Minimum Rating</h4>
                <div className="space-y-2">
                  {[5, 4, 3, 2, 1].map(rating => (
                    <label key={rating} className="flex items-center">
                      <input
                        type="radio"
                        name="rating"
                        value={rating}
                        checked={selectedRating === rating}
                        onChange={() => setSelectedRating(rating)}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <div className="flex items-center ml-2">
                        {renderStars(rating)}
                        <span className="ml-2 text-sm text-gray-600">& Up</span>
                      </div>
                    </label>
                  ))}
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="rating"
                      value={0}
                      checked={selectedRating === 0}
                      onChange={() => setSelectedRating(0)}
                      className="text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm text-gray-600">Any Rating</span>
                  </label>
                </div>
              </div>

              {/* Amenities Filter */}
              <div className="mb-6">
                <h4 className="font-medium text-gray-900 mb-3">Amenities</h4>
                <div className="space-y-2">
                  {['WiFi', 'Pool', 'Gym', 'Restaurant', 'Parking'].map(amenity => (
                    <label key={amenity} className="flex items-center">
                      <input
                        type="checkbox"
                        checked={selectedAmenities.includes(amenity)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedAmenities([...selectedAmenities, amenity]);
                          } else {
                            setSelectedAmenities(selectedAmenities.filter(a => a !== amenity));
                          }
                        }}
                        className="text-blue-600 focus:ring-blue-500"
                      />
                      <span className="ml-2 text-sm text-gray-700">{amenity}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Results */}
          <div className="lg:w-3/4">
            {/* Sort Options */}
            <div className="bg-white rounded-lg shadow-sm p-4 mb-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="text-gray-600">
                  {totalHotels} hotel{totalHotels !== 1 ? 's' : ''} found
                </div>

                <div className="flex items-center gap-4">
                  <span className="text-gray-600">Sort by:</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="recommended">Recommended</option>
                    <option value="price-low">Price: Low to High</option>
                    <option value="price-high">Price: High to Low</option>
                    <option value="rating">Rating</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Hotel Cards */}
            <div className="space-y-6">
              {filteredHotels.map((hotel) => (
                <div key={hotel.id || hotel.hotelId} className="bg-white rounded-lg shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                  <div className="flex flex-col md:flex-row">
                    {/* Hotel Image */}
                    <div className="md:w-1/3 relative">
                      <img
                        src={hotel.image || hotel.images?.[0] || '/images/hotel-placeholder.jpg'}
                        alt={hotel.name}
                        className="w-full h-48 md:h-full object-cover"
                      />
                      <button
                        onClick={() => toggleFavorite(hotel.id || hotel.hotelId)}
                        className="absolute top-4 right-4 p-2 bg-white bg-opacity-80 rounded-full hover:bg-opacity-100 transition-colors"
                      >
                        <Heart
                          className={`w-5 h-5 ${favorites[hotel.id || hotel.hotelId] ? 'text-red-500 fill-current' : 'text-gray-400'}`}
                        />
                      </button>
                    </div>

                    {/* Hotel Info */}
                    <div className="md:w-2/3 p-6">
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between mb-4">
                        <div>
                          <h3 className="text-xl font-semibold text-gray-900 mb-1">{hotel.name}</h3>
                          <div className="flex items-center gap-1 mb-2">
                            {renderStars(hotel.rating)}
                            <span className="text-sm text-gray-600 ml-2">
                              {hotel.rating || '4.0'} ({hotel.reviews || '120'} reviews)
                            </span>
                          </div>
                          <div className="flex items-center text-gray-600 mb-3">
                            <MapPin className="w-4 h-4 mr-1" />
                            <span className="text-sm">{hotel.address || hotel.location || 'Location not available'}</span>
                          </div>
                        </div>

                        <div className="text-right">
                          <div className="text-2xl font-bold text-gray-900">{formatPrice(hotel.price)}</div>
                          <div className="text-sm text-gray-600">per night</div>
                        </div>
                      </div>

                      {/* Amenities */}
                      <div className="flex flex-wrap gap-4 mb-4">
                        {hotel.amenities?.slice(0, 4).map((amenity, index) => (
                          <div key={index} className="flex items-center text-sm text-gray-600">
                            {amenity === 'WiFi' && <Wifi className="w-4 h-4 mr-1" />}
                            {amenity === 'Pool' && <Coffee className="w-4 h-4 mr-1" />}
                            {amenity === 'Gym' && <Heart className="w-4 h-4 mr-1" />}
                            {amenity === 'Restaurant' && <Coffee className="w-4 h-4 mr-1" />}
                            {amenity === 'Parking' && <Coffee className="w-4 h-4 mr-1" />}
                            <span>{amenity}</span>
                          </div>
                        )) || (
                          <>
                            <div className="flex items-center text-sm text-gray-600">
                              <Wifi className="w-4 h-4 mr-1" />
                              <span>Free WiFi</span>
                            </div>
                            <div className="flex items-center text-sm text-gray-600">
                              <Coffee className="w-4 h-4 mr-1" />
                              <span>Breakfast</span>
                            </div>
                          </>
                        )}
                      </div>

                      {/* Action Button */}
                      <div className="flex justify-end">
                        <button
                          onClick={() => handleHotelSelect(hotel)}
                          className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors font-medium"
                        >
                          View Details
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {filteredHotels.length === 0 && (
              <div className="text-center py-12">
                <Globe className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">No hotels found</h3>
                <p className="text-gray-600 mb-6">Try adjusting your filters or search criteria</p>
                <button
                  onClick={() => navigate('/rental')}
                  className="bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 transition-colors"
                >
                  Modify Search
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
```

---

## 🏨 Hotel Details Component

```jsx
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Star, MapPin, Check, ChevronLeft, Heart, Share, Calendar,
  Users, X, ChevronRight, ChevronDown, ThumbsUp, MessageCircle,
  Award, Camera, Coffee, ArrowRight, Bookmark, Phone, Mail, Facebook, Twitter, Instagram,
  Clock, Wifi, Tv, Shield, Utensils, Car, Sunset, Sparkles, Info
} from "lucide-react";
import Navbar from "../Navbar";
import Footer from "../Footer";
import "./styles.css";
import supabase from "../../../lib/supabase";
import axios from 'axios';
import { format } from 'date-fns';
import * as amadeusUtils from './amadeusUtils';
import DirectAmadeusService from '../../../Services/DirectAmadeusService';

export default function HotelDetails() {
  const navigate = useNavigate();
  const location = useLocation();
  const hotelData = location.state?.hotelData || {};
  const searchParams = location.state?.searchParams || {};

  const [selectedHotel, setSelectedHotel] = useState(null);
  const [activeImage, setActiveImage] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [showGalleryModal, setShowGalleryModal] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(0);
  const [guestCount, setGuestCount] = useState({
    adults: searchParams?.adults || 2,
    children: 1
  });
  const [showReviews, setShowReviews] = useState(false);
  const [checkInDate, setCheckInDate] = useState(() => {
    // Ensure checkInDate is a string
    if (searchParams?.checkInDate) {
      return typeof searchParams.checkInDate === 'string'
        ? searchParams.checkInDate
        : searchParams.checkInDate.toString();
    }
    return "Jul 24, 2025";
  });
  const [checkOutDate, setCheckOutDate] = useState(() => {
    // Ensure checkOutDate is a string
    if (searchParams?.checkOutDate) {
      return typeof searchParams.checkOutDate === 'string'
        ? searchParams.checkOutDate
        : searchParams.checkOutDate.toString();
    }
    return "Jul 28, 2025";
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showGuestDropdown, setShowGuestDropdown] = useState(false);
  const [showBookingConfirmation, setShowBookingConfirmation] = useState(false);
  const [showCallbackRequest, setShowCallbackRequest] = useState(false);
  const [callbackForm, setCallbackForm] = useState({
    name: "",
    phone: "",
    preferredTime: "morning",
    message: ""
  });
  const [callbackSubmitted, setCallbackSubmitted] = useState(false);
  const [showVirtualTour, setShowVirtualTour] = useState(false);
  const [scrollPosition, setScrollPosition] = useState(0);
  const [activeTab, setActiveTab] = useState('overview');
  const [showAmenityDetails, setShowAmenityDetails] = useState(null);
  const [isPromoActive, setIsPromoActive] = useState(false);
  const [roomTypes, setRoomTypes] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [enhancedAmenities, setEnhancedAmenities] = useState([]);
  const [hotelOffer, setHotelOffer] = useState(null);
  const [offerLoading, setOfferLoading] = useState(false);
  const [offerError, setOfferError] = useState('');

  const overviewRef = useRef(null);
  const roomsRef = useRef(null);
  const amenitiesRef = useRef(null);
  const locationRef = useRef(null);
  const reviewsRef = useRef(null);
  const [error, setError] = useState('');

  // Calculate the number of nights between check-in and check-out dates
  const calculateNights = useCallback(() => {
    if (!checkInDate || !checkOutDate) return 4; // Default to 4 nights if dates are missing

    const checkIn = new Date(checkInDate);
    const checkOut = new Date(checkOutDate);

    if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) return 4;

    // Calculate difference in days
    const timeDiff = Math.abs(checkOut.getTime() - checkIn.getTime());
    const nights = Math.ceil(timeDiff / (1000 * 3600 * 24));

    return Math.max(1, nights); // At least 1 night
  }, [checkInDate, checkOutDate]);

  const totalNights = calculateNights();

  // Calculate total price based on available data
  const calculateTotalPrice = useCallback(() => {
    // If we have hotel offer data, use that
    if (hotelOffer?.offers && hotelOffer.offers.length > 0) {
      const selectedOffer = hotelOffer.offers[0];
      if (selectedOffer.price) {
        if (typeof selectedOffer.price === 'object' && selectedOffer.price.total) {
          return parseFloat(selectedOffer.price.total);
        } else {
          return parseFloat(selectedOffer.price);
        }
      }
    }

    // Otherwise, calculate based on room price
    if (roomTypes && roomTypes.length > 0 && roomTypes[selectedRoom]) {
      const currentRoomPrice = roomTypes[selectedRoom].price || 0;
      const cleaningFee = 50; // Default cleaning fee
      const serviceFee = 30; // Default service fee
      return (currentRoomPrice * totalNights) + cleaningFee + serviceFee;
    }

    // Default fallback based on hotel data
    const fallbackPrice = parseFloat(hotelData?.price) || 199;
    const cleaningFee = 50;
    const serviceFee = 30;
    return (fallbackPrice * totalNights) + cleaningFee + serviceFee;
  }, [hotelOffer, roomTypes, selectedRoom, totalNights, hotelData]);

  useEffect(() => {
    if (!location.state?.hotelData) {
      navigate('/rental');
      return;
    }
  }, [location.state?.hotelData, navigate]);

  useEffect(() => {
    const fetchHotelDetails = async () => {
      try {
        setIsLoading(true);

        // Default values
        const defaultPrice = 199;
        const defaultRating = 4.5;
        const basePrice = parseFloat(hotelData?.price) || defaultPrice;
        const hotelRating = parseFloat(hotelData?.rating) || defaultRating;

        const mockRoomTypes = [
          {
            id: 0,
            name: "Deluxe Room",
            price: basePrice,
            originalPrice: basePrice * 1.2,
            description: "Spacious room with city views",
            amenities: ["Free WiFi", "Air Conditioning", "Mini Bar", "Room Service"],
            images: ["/images/room1.jpg", "/images/room2.jpg"],
            maxGuests: 2,
            size: "350 sq ft",
            bedType: "King Bed"
          },
          {
            id: 1,
            name: "Executive Suite",
            price: basePrice * 1.5,
            originalPrice: basePrice * 1.8,
            description: "Luxury suite with separate living area",
            amenities: ["Free WiFi", "Air Conditioning", "Mini Bar", "Room Service", "Balcony", "Jacuzzi"],
            images: ["/images/suite1.jpg", "/images/suite2.jpg"],
            maxGuests: 4,
            size: "650 sq ft",
            bedType: "King Bed + Sofa Bed"
          },
          {
            id: 2,
            name: "Presidential Suite",
            price: basePrice * 2.5,
            originalPrice: basePrice * 3.0,
            description: "Ultimate luxury with panoramic views",
            amenities: ["Free WiFi", "Air Conditioning", "Mini Bar", "Room Service", "Balcony", "Jacuzzi", "Butler Service"],
            images: ["/images/presidential1.jpg", "/images/presidential2.jpg"],
            maxGuests: 6,
            size: "1200 sq ft",
            bedType: "King Bed + 2 Double Beds"
          }
        ];

        setRoomTypes(mockRoomTypes);

        // Mock reviews
        const mockReviews = [
          {
            id: 1,
            name: "Sarah Johnson",
            rating: 5,
            date: "2024-01-15",
            comment: "Excellent hotel with great service. The room was clean and comfortable. Highly recommended!",
            helpful: 12,
            verified: true
          },
          {
            id: 2,
            name: "Michael Chen",
            rating: 4,
            date: "2024-01-10",
            comment: "Good location and nice amenities. Breakfast was delicious. Only minor issue with room temperature control.",
            helpful: 8,
            verified: true
          },
          {
            id: 3,
            name: "Emily Rodriguez",
            rating: 5,
            date: "2024-01-05",
            comment: "Perfect stay! Staff was incredibly helpful and the facilities were top-notch. Will definitely return.",
            helpful: 15,
            verified: true
          }
        ];

        setReviews(mockReviews);

        // Enhanced amenities based on hotel rating
        const baseAmenities = [
          { name: "Free WiFi", icon: "wifi", available: true },
          { name: "Air Conditioning", icon: "wind", available: true },
          { name: "Room Service", icon: "utensils", available: hotelRating >= 4.0 },
          { name: "Fitness Center", icon: "activity", available: hotelRating >= 4.0 },
          { name: "Swimming Pool", icon: "waves", available: hotelRating >= 4.5 },
          { name: "Restaurant", icon: "utensils", available: true },
          { name: "Bar", icon: "wine", available: hotelRating >= 4.0 },
          { name: "Spa", icon: "sparkles", available: hotelRating >= 4.5 },
          { name: "Parking", icon: "car", available: true },
          { name: "Concierge", icon: "user-check", available: hotelRating >= 4.5 }
        ];

        setEnhancedAmenities(baseAmenities);

        // Fetch hotel offers from Amadeus API
        try {
          setOfferLoading(true);
          const offerResponse = await DirectAmadeusService.getHotelOffers(
            hotelData.hotelId || 'HOTEL001',
            searchParams.checkInDate || '2025-07-24',
            searchParams.checkOutDate || '2025-07-28',
            searchParams.adults || 2
          );

          if (offerResponse && offerResponse.data) {
            setHotelOffer(offerResponse.data);
          }
        } catch (offerErr) {
          console.error('Error fetching hotel offers:', offerErr);
          setOfferError('Unable to load current pricing. Showing estimated rates.');
        } finally {
          setOfferLoading(false);
        }

        setIsLoading(false);
      } catch (error) {
        console.error('Error fetching hotel details:', error);
        setError('Failed to load hotel details. Please try again.');
        setIsLoading(false);
      }
    };

    fetchHotelDetails();
  }, [hotelData, navigate]);

  // Handle booking
  const handleBooking = () => {
    const totalPrice = calculateTotalPrice();
    const bookingData = {
      hotelData: {
        ...hotelData,
        selectedRoom: roomTypes[selectedRoom],
        roomType: roomTypes[selectedRoom]?.name || 'Standard Room'
      },
      searchParams: {
        ...searchParams,
        checkInDate,
        checkOutDate
      },
      guestCount,
      totalPrice,
      totalNights
    };

    navigate('/rental/booking', { state: bookingData });
  };

  // Handle callback request
  const handleCallbackSubmit = async (e) => {
    e.preventDefault();

    try {
      const { data, error } = await supabase
        .from('callback_requests')
        .insert([
          {
            name: callbackForm.name,
            phone: callbackForm.phone,
            email: hotelData.contactEmail || 'support@jetsetterss.com',
            preferred_time: callbackForm.preferredTime,
            message: callbackForm.message,
            service_type: 'hotel_booking',
            hotel_name: hotelData.name
          }
        ]);

      if (error) throw error;

      setCallbackSubmitted(true);
      setTimeout(() => {
        setShowCallbackRequest(false);
        setCallbackSubmitted(false);
        setCallbackForm({
          name: "",
          phone: "",
          preferredTime: "morning",
          message: ""
        });
      }, 3000);
    } catch (error) {
      console.error('Error submitting callback request:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading hotel details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Error Loading Hotel</h2>
          <p className="text-gray-600 mb-8">{error}</p>
          <button
            onClick={() => navigate('/rental')}
            className="bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 transition-colors"
          >
            Back to Search
          </button>
        </div>
      </div>
    );
  }

  const totalPrice = calculateTotalPrice();

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      {/* Service Banner */}
      <div className="relative">
        <div className={`w-full text-center bg-gradient-to-r from-blue-900/90 via-blue-800/90 to-blue-900/90 py-3 backdrop-blur-sm z-20 border-y border-blue-500/30 ${window.innerWidth < 768 ? 'px-3' : ''}`} style={{position: 'absolute', top: window.innerWidth < 768 ? '60px' : '73px', left: 0, right: 0}}>
          <div className="container mx-auto px-2 flex justify-center items-center flex-wrap">
            <div className="h-5 w-5 text-yellow-300 mr-2 flex-shrink-0">🏨</div>
            <p className={`text-white ${window.innerWidth < 768 ? 'text-xs' : 'text-base'} font-medium tracking-wide`}>
              <span className="font-bold">Self-Service Portal will be available very soon...</span> Meanwhile please Call <span className="text-yellow-300 font-bold whitespace-nowrap">((877) 538-7380)</span> or Email <a href="mailto:support@jetsetterss.com" className="underline text-yellow-300 font-bold">support@jetsetterss.com</a> for all your travel needs. Team Jetsetters!
            </p>
          </div>
        </div>
      </div>

      {/* Hero Section with Gallery */}
      <div className="relative bg-white">
        <div className="max-w-7xl mx-auto px-4 py-6">
          {/* Breadcrumb */}
          <nav className="flex mb-4" aria-label="Breadcrumb">
            <ol className="inline-flex items-center space-x-1 md:space-x-3">
              <li className="inline-flex items-center">
                <button onClick={() => navigate('/rental')} className="text-blue-600 hover:text-blue-800">
                  Hotels
                </button>
              </li>
              <li>
                <div className="flex items-center">
                  <ChevronRight className="w-4 h-4 text-gray-400 mx-1" />
                  <span className="text-gray-500">{hotelData.name}</span>
                </div>
              </li>
            </ol>
          </nav>

          {/* Image Gallery */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="md:col-span-2">
              <img
                src={hotelData.image || hotelData.images?.[0] || '/images/hotel-placeholder.jpg'}
                alt={hotelData.name}
                className="w-full h-96 object-cover rounded-lg cursor-pointer"
                onClick={() => setShowGalleryModal(true)}
              />
            </div>
            <div className="md:col-span-2 grid grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((index) => (
                <img
                  key={index}
                  src={hotelData.images?.[index] || `/images/hotel-${index}.jpg`}
                  alt={`${hotelData.name} ${index}`}
                  className="w-full h-44 object-cover rounded-lg cursor-pointer"
                  onClick={() => setShowGalleryModal(true)}
                />
              ))}
            </div>
          </div>

          {/* Hotel Header */}
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{hotelData.name}</h1>

              <div className="flex items-center gap-4 mb-4">
                <div className="flex items-center">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className={`w-5 h-5 ${i < Math.floor(hotelData.rating || 4.5) ? 'text-yellow-400 fill-current' : 'text-gray-300'}`}
                    />
                  ))}
                  <span className="ml-2 text-gray-600">
                    {hotelData.rating || '4.5'} ({hotelData.reviews || '120'} reviews)
                  </span>
                </div>
              </div>

              <div className="flex items-center text-gray-600 mb-4">
                <MapPin className="w-5 h-5 mr-2" />
                <span>{hotelData.address || hotelData.location || 'Location not available'}</span>
              </div>
            </div>

            {/* Booking Card */}
            <div className="lg:w-96 bg-white border border-gray-200 rounded-lg p-6 shadow-sm">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <div className="text-2xl font-bold text-gray-900">${totalPrice.toFixed(2)}</div>
                  <div className="text-sm text-gray-600">for {totalNights} night{totalNights !== 1 ? 's' : ''}</div>
                </div>
                {isPromoActive && (
                  <div className="bg-red-100 text-red-800 px-2 py-1 rounded text-sm font-medium">
                    20% OFF
                  </div>
                )}
              </div>

              {/* Date & Guest Selection */}
              <div className="space-y-3 mb-6">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Check-in</label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={checkInDate}
                        onClick={() => setShowDatePicker(!showDatePicker)}
                        className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        readOnly
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Check-out</label>
                    <div className="relative">
                      <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={checkOutDate}
                        onClick={() => setShowDatePicker(!showDatePicker)}
                        className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        readOnly
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Guests</label>
                  <div className="relative">
                    <Users className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <button
                      onClick={() => setShowGuestDropdown(!showGuestDropdown)}
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-left"
                    >
                      {guestCount.adults} Adult{guestCount.adults !== 1 ? 's' : ''}, {guestCount.children} Child{guestCount.children !== 1 ? 'ren' : ''}
                    </button>
                  </div>
                </div>
              </div>

              {/* Room Selection */}
              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Select Room</h3>
                <div className="space-y-3">
                  {roomTypes.map((room, index) => (
                    <div
                      key={room.id}
                      className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                        selectedRoom === index
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => setSelectedRoom(index)}
                    >
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-medium text-gray-900">{room.name}</h4>
                          <p className="text-sm text-gray-600">{room.description}</p>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {room.amenities.slice(0, 3).map((amenity, i) => (
                              <span key={i} className="text-xs bg-gray-100 text-gray-700 px-2 py-1 rounded">
                                {amenity}
                              </span>
                            ))}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-lg font-bold text-gray-900">${room.price}</div>
                          <div className="text-sm text-gray-600">per night</div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-3">
                <button
                  onClick={handleBooking}
                  className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 transition-colors font-medium"
                >
                  Book Now - ${totalPrice.toFixed(2)}
                </button>
                <button
                  onClick={() => setShowCallbackRequest(true)}
                  className="w-full border border-blue-600 text-blue-600 py-2 px-4 rounded-md hover:bg-blue-50 transition-colors"
                >
                  Request Callback
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4">
          <nav className="flex space-x-8">
            {[
              { id: 'overview', label: 'Overview', ref: overviewRef },
              { id: 'rooms', label: 'Rooms', ref: roomsRef },
              { id: 'amenities', label: 'Amenities', ref: amenitiesRef },
              { id: 'location', label: 'Location', ref: locationRef },
              { id: 'reviews', label: 'Reviews', ref: reviewsRef }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id);
                  tab.ref.current?.scrollIntoView({ behavior: 'smooth' });
                }}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Overview Tab */}
        <div ref={overviewRef} className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Overview</h2>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <p className="text-gray-700 mb-6">
                {hotelData.description || 'Experience luxury and comfort at our premium hotel. Featuring world-class amenities, exceptional service, and prime location, we ensure every guest enjoys an unforgettable stay.'}
              </p>

              <h3 className="text-xl font-semibold text-gray-900 mb-4">Highlights</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="flex items-center">
                  <Check className="w-5 h-5 text-green-500 mr-3" />
                  <span>Free WiFi throughout the property</span>
                </div>
                <div className="flex items-center">
                  <Check className="w-5 h-5 text-green-500 mr-3" />
                  <span>24-hour room service</span>
                </div>
                <div className="flex items-center">
                  <Check className="w-5 h-5 text-green-500 mr-3" />
                  <span>Fitness center and spa</span>
                </div>
                <div className="flex items-center">
                  <Check className="w-5 h-5 text-green-500 mr-3" />
                  <span>Concierge services</span>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-xl font-semibold text-gray-900 mb-4">Hotel Policies</h3>
              <div className="space-y-3">
                <div>
                  <h4 className="font-medium text-gray-900">Check-in</h4>
                  <p className="text-gray-600">3:00 PM - 12:00 AM</p>
                </div>
                <div>
                  <h4 className="font-medium text-gray-900">Check-out</h4>
                  <p className="text-gray-600">Until 11:00 AM</p>
                </div>
                <div>
                  <h4 className="font-medium text-gray-900">Cancellation</h4>
                  <p className="text-gray-600">Free cancellation until 24 hours before check-in</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Rooms Tab */}
        <div ref={roomsRef} className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Available Rooms</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {roomTypes.map((room) => (
              <div key={room.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                <img
                  src={room.images?.[0] || '/images/room-placeholder.jpg'}
                  alt={room.name}
                  className="w-full h-48 object-cover"
                />
                <div className="p-4">
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{room.name}</h3>
                  <p className="text-gray-600 mb-3">{room.description}</p>
                  <div className="flex flex-wrap gap-1 mb-4">
                    {room.amenities.map((amenity, index) => (
                      <span key={index} className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                        {amenity}
                      </span>
                    ))}
                  </div>
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-lg font-bold text-gray-900">${room.price}</div>
                      <div className="text-sm text-gray-600">per night</div>
                    </div>
                    <button
                      onClick={() => setSelectedRoom(room.id)}
                      className={`px-4 py-2 rounded-md text-sm font-medium ${
                        selectedRoom === room.id
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {selectedRoom === room.id ? 'Selected' : 'Select'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Amenities Tab */}
        <div ref={amenitiesRef} className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Amenities & Facilities</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {enhancedAmenities.map((amenity, index) => (
              <div key={index} className="flex items-center p-4 bg-white border border-gray-200 rounded-lg">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-4 ${
                  amenity.available ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'
                }`}>
                  {amenity.available ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="font-medium text-gray-900">{amenity.name}</h3>
                  <p className={`text-sm ${amenity.available ? 'text-green-600' : 'text-gray-400'}`}>
                    {amenity.available ? 'Available' : 'Not Available'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Location Tab */}
        <div ref={locationRef} className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Location & Directions</h2>
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-center mb-4">
              <MapPin className="w-6 h-6 text-gray-400 mr-2" />
              <span className="text-lg font-medium text-gray-900">
                {hotelData.address || hotelData.location || 'Location not available'}
              </span>
            </div>
            <div className="aspect-w-16 aspect-h-9 bg-gray-200 rounded-lg mb-4">
              {/* Placeholder for map */}
              <div className="w-full h-64 bg-gray-300 rounded-lg flex items-center justify-center">
                <span className="text-gray-600">Map Placeholder</span>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h3 className="font-medium text-gray-900 mb-2">Nearby Attractions</h3>
                <ul className="space-y-1 text-gray-600">
                  <li>• City Center - 2.5 km</li>
                  <li>• Airport - 15 km</li>
                  <li>• Shopping Mall - 1.2 km</li>
                  <li>• Restaurant District - 0.8 km</li>
                </ul>
              </div>
              <div>
                <h3 className="font-medium text-gray-900 mb-2">Transportation</h3>
                <ul className="space-y-1 text-gray-600">
                  <li>• Airport Shuttle - Available</li>
                  <li>• Metro Station - 500m</li>
                  <li>• Bus Stop - 200m</li>
                  <li>• Parking - Free</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Reviews Tab */}
        <div ref={reviewsRef} className="mb-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Guest Reviews</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {reviews.map((review) => (
              <div key={review.id} className="bg-white border border-gray-200 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center">
                    <div className="w-10 h-10 bg-blue-500 rounded-full flex items-center justify-center text-white font-bold mr-3">
                      {review.name.charAt(0)}
                    </div>
                    <div>
                      <h4 className="font-medium text-gray-900">{review.name}</h4>
                      <div className="flex items-center">
                        {[...Array(5)].map((_, i) => (
                          <Star
                            key={i}
                            className={`w-4 h-4 ${i < review.rating ? 'text-yellow-400 fill-current' : 'text-gray-300'}`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                  {review.verified && (
                    <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-medium">
                      Verified
                    </span>
                  )}
                </div>
                <p className="text-gray-700 mb-4">"{review.comment}"</p>
                <div className="flex items-center justify-between text-sm text-gray-600">
                  <span>{format(new Date(review.date), 'MMM dd, yyyy')}</span>
                  <button className="flex items-center text-blue-600 hover:text-blue-800">
                    <ThumbsUp className="w-4 h-4 mr-1" />
                    Helpful ({review.helpful})
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Callback Request Modal */}
      {showCallbackRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-900">Request a Callback</h3>
              <button onClick={() => setShowCallbackRequest(false)}>
                <X className="w-6 h-6 text-gray-400" />
              </button>
            </div>

            {callbackSubmitted ? (
              <div className="text-center py-8">
                <Check className="w-16 h-16 text-green-500 mx-auto mb-4" />
                <h4 className="text-lg font-semibold text-gray-900 mb-2">Request Submitted!</h4>
                <p className="text-gray-600">We'll call you back within 24 hours.</p>
              </div>
            ) : (
              <form onSubmit={handleCallbackSubmit}>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                    <input
                      type="text"
                      value={callbackForm.name}
                      onChange={(e) => setCallbackForm({...callbackForm, name: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <input
                      type="tel"
                      value={callbackForm.phone}
                      onChange={(e) => setCallbackForm({...callbackForm, phone: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Preferred Time</label>
                    <select
                      value={callbackForm.preferredTime}
                      onChange={(e) => setCallbackForm({...callbackForm, preferredTime: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="morning">Morning (9 AM - 12 PM)</option>
                      <option value="afternoon">Afternoon (12 PM - 5 PM)</option>
                      <option value="evening">Evening (5 PM - 9 PM)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Message (Optional)</label>
                    <textarea
                      value={callbackForm.message}
                      onChange={(e) => setCallbackForm({...callbackForm, message: e.target.value})}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Any specific questions or requirements..."
                    />
                  </div>
                  <button
                    type="submit"
                    className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors"
                  >
                    Request Callback
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}
```

---

## 📋 Hotel Booking Component

```jsx
"use client"

import React, { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, CreditCard, User, Calendar, Users, Shield, Check,
  AlertCircle, Loader2, X
} from 'lucide-react';
import Navbar from '../Navbar';
import Footer from '../Footer';
import axios from 'axios';

export default function Booking() {
  const navigate = useNavigate();
  const location = useLocation();
  const bookingData = location.state;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [bookingId, setBookingId] = useState('');
  const [paymentInfo, setPaymentInfo] = useState({
    method: 'CREDIT_CARD',
    cardNumber: '',
    expiryDate: '',
    cvv: '',
    cardHolderName: '',
    cardType: 'VISA',
    paymentOption: 'pay_now' // 'pay_now' or 'pay_at_hotel'
  });

  const [bookingRequest, setBookingRequest] = useState({
    name: '',
    email: '',
    phone: '',
    specialRequests: '',
    title: 'MR'
  });

  const handleBack = () => {
    navigate(-1);
  };

  const handlePaymentChange = (e) => {
    const { name, value } = e.target;
    setPaymentInfo(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleBookingRequestChange = (e) => {
    const { name, value } = e.target;
    setBookingRequest(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      console.log('Starting hotel booking with Arc Pay integration...');

      // Step 1: Create hotel booking
      const bookingRequestData = {
        action: 'bookHotel',
        hotelId: bookingData?.hotelData?.hotelId || 'HOTEL001',
        offerId: bookingData?.hotelData?.offerId || 'OFFER001',
        guestDetails: {
          firstName: bookingRequest.name.split(' ')[0] || 'Guest',
          lastName: bookingRequest.name.split(' ').slice(1).join(' ') || 'User',
          email: bookingRequest.email,
          phone: bookingRequest.phone
        },
        checkInDate: bookingData?.checkInDate || '2025-07-25',
        checkOutDate: bookingData?.checkOutDate || '2025-07-28',
        totalPrice: bookingData?.totalPrice || 299.99,
        currency: 'USD',
        specialRequests: bookingRequest.specialRequests
      };

      const hotelBookingResponse = await axios.post('https://prod-opznkssex-shubhams-projects-4a867368.vercel.app/api/hotels', bookingRequestData);

      if (hotelBookingResponse.data.success) {
        const booking = hotelBookingResponse.data.booking;
        console.log('Hotel booking created:', booking.bookingReference);
        setBookingId(booking.bookingReference);

        // Step 2: Create Arc Pay payment order (if paying now)
        if (paymentInfo.paymentOption === 'pay_now') {
          const paymentData = {
            action: 'createPayment',
            bookingReference: booking.bookingReference,
            amount: bookingData?.totalPrice || 299.99,
            currency: 'USD',
            guestDetails: bookingRequestData.guestDetails,
            hotelDetails: {
              name: bookingData?.hotelData?.name || 'Hotel',
              address: bookingData?.hotelData?.address || 'Location'
            }
          };

          const paymentResponse = await axios.post('https://prod-opznkssex-shubhams-projects-4a867368.vercel.app/api/hotels', paymentData);

          if (paymentResponse.data.success) {
            console.log('Arc Pay order created successfully');

            // Redirect to Arc Pay payment page or show success
            if (paymentResponse.data.paymentUrl) {
              window.location.href = paymentResponse.data.paymentUrl;
              return;
            }
          }
        }

        setSuccess(true);
      } else {
        throw new Error(hotelBookingResponse.data.error || 'Failed to create booking');
      }
    } catch (err) {
      console.error('Booking error:', err);
      const errorDetail = err.response?.data?.message ||
                         err.response?.data?.error ||
                         err.message ||
                         'Failed to process booking. Please try again.';
      setError(errorDetail);
    } finally {
      setLoading(false);
    }
  };

  if (!bookingData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">No Booking Data</h2>
          <p className="text-gray-600 mb-8">Please select a hotel and room first.</p>
          <button
            onClick={handleBack}
            className="bg-[#0061ff] hover:bg-blue-700 text-white px-6 py-3 rounded-md transition-colors"
          >
            Back to Hotels
          </button>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Check className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Booking Confirmed!</h2>
          <p className="text-gray-600 mb-2">Your booking reference is:</p>
          <p className="text-xl font-semibold text-blue-600 mb-8">{bookingId}</p>
          <div className="space-x-4">
            <Link
              to="/my-trips"
              className="bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 transition-colors"
            >
              View My Trips
            </Link>
            <Link
              to="/rental"
              className="border border-blue-600 text-blue-600 px-6 py-3 rounded-md hover:bg-blue-50 transition-colors"
            >
              Book Another Hotel
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      {/* Service Banner */}
      <div className="relative">
        <div className={`w-full text-center bg-gradient-to-r from-blue-900/90 via-blue-800/90 to-blue-900/90 py-3 backdrop-blur-sm z-20 border-y border-blue-500/30 ${window.innerWidth < 768 ? 'px-3' : ''}`} style={{position: 'absolute', top: window.innerWidth < 768 ? '60px' : '73px', left: 0, right: 0}}>
          <div className="container mx-auto px-2 flex justify-center items-center flex-wrap">
            <div className="h-5 w-5 text-yellow-300 mr-2 flex-shrink-0">🏨</div>
            <p className={`text-white ${window.innerWidth < 768 ? 'text-xs' : 'text-base'} font-medium tracking-wide`}>
              <span className="font-bold">Self-Service Portal will be available very soon...</span> Meanwhile please Call <span className="text-yellow-300 font-bold whitespace-nowrap">((877) 538-7380)</span> or Email <a href="mailto:support@jetsetterss.com" className="underline text-yellow-300 font-bold">support@jetsetterss.com</a> for all your travel needs. Team Jetsetters!
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <button
            onClick={handleBack}
            className="flex items-center text-blue-600 hover:text-blue-800 font-medium"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back to Hotel Details
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Booking Form */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-sm p-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-6">Complete Your Booking</h2>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
                  <div className="flex">
                    <div className="flex-shrink-0">
                      <AlertCircle className="h-5 w-5 text-red-400" />
                    </div>
                    <div className="ml-3">
                      <h3 className="text-sm font-medium text-red-800">
                        Booking Error
                      </h3>
                      <div className="mt-2 text-sm text-red-700">
                        {error}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Guest Information */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <User className="w-5 h-5 mr-2" />
                    Guest Information
                  </h3>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
                        Title
                      </label>
                      <select
                        id="title"
                        name="title"
                        value={bookingRequest.title}
                        onChange={handleBookingRequestChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="MR">Mr.</option>
                        <option value="MS">Ms.</option>
                        <option value="MRS">Mrs.</option>
                        <option value="DR">Dr.</option>
                      </select>
                    </div>

                    <div className="md:col-span-1">
                      <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
                        Full Name *
                      </label>
                      <input
                        type="text"
                        id="name"
                        name="name"
                        value={bookingRequest.name}
                        onChange={handleBookingRequestChange}
                        placeholder="Enter your full name"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>

                    <div>
                      <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                        Email Address *
                      </label>
                      <input
                        type="email"
                        id="email"
                        name="email"
                        value={bookingRequest.email}
                        onChange={handleBookingRequestChange}
                        placeholder="Enter your email"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>

                    <div>
                      <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">
                        Phone Number *
                      </label>
                      <input
                        type="tel"
                        id="phone"
                        name="phone"
                        value={bookingRequest.phone}
                        onChange={handleBookingRequestChange}
                        placeholder="Enter your phone number"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* Special Requests */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Special Requests</h3>
                  <textarea
                    name="specialRequests"
                    value={bookingRequest.specialRequests}
                    onChange={handleBookingRequestChange}
                    placeholder="Any special requests or requirements..."
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Payment Information */}
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <CreditCard className="w-5 h-5 mr-2" />
                    Payment Information
                  </h3>

                  {/* Payment Method Selection */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Payment Method
                    </label>
                    <div className="space-y-2">
                      <label className="flex items-center">
                        <input
                          type="radio"
                          name="paymentOption"
                          value="pay_now"
                          checked={paymentInfo.paymentOption === 'pay_now'}
                          onChange={handlePaymentChange}
                          className="text-blue-600 focus:ring-blue-500"
                        />
                        <span className="ml-2 text-sm text-gray-700">Pay now with credit card</span>
                      </label>
                      <label className="flex items-center">
                        <input
                          type="radio"
                          name="paymentOption"
                          value="pay_at_hotel"
                          checked={paymentInfo.paymentOption === 'pay_at_hotel'}
                          onChange={handlePaymentChange}
                          className="text-blue-600 focus:ring-blue-500"
                        />
                        <span className="ml-2 text-sm text-gray-700">Pay at hotel</span>
                      </label>
                    </div>
                  </div>

                  {paymentInfo.paymentOption === 'pay_now' && (
                    <div className="space-y-4">
                      <div>
                        <label htmlFor="cardNumber" className="block text-sm font-medium text-gray-700 mb-1">
                          Card Number *
                        </label>
                        <input
                          type="text"
                          id="cardNumber"
                          name="cardNumber"
                          value={paymentInfo.cardNumber}
                          onChange={handlePaymentChange}
                          placeholder="1234 5678 9012 3456"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          maxLength="19"
                          required
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label htmlFor="expiryDate" className="block text-sm font-medium text-gray-700 mb-1">
                            Expiry Date *
                          </label>
                          <input
                            type="text"
                            id="expiryDate"
                            name="expiryDate"
                            value={paymentInfo.expiryDate}
                            onChange={handlePaymentChange}
                            placeholder="MM/YY"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            maxLength="5"
                            required
                          />
                        </div>

                        <div>
                          <label htmlFor="cvv" className="block text-sm font-medium text-gray-700 mb-1">
                            CVV *
                          </label>
                          <input
                            type="text"
                            id="cvv"
                            name="cvv"
                            value={paymentInfo.cvv}
                            onChange={handlePaymentChange}
                            placeholder="123"
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            maxLength="4"
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label htmlFor="cardHolderName" className="block text-sm font-medium text-gray-700 mb-1">
                          Cardholder Name *
                        </label>
                        <input
                          type="text"
                          id="cardHolderName"
                          name="cardHolderName"
                          value={paymentInfo.cardHolderName}
                          onChange={handlePaymentChange}
                          placeholder="John Doe"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          required
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Terms and Conditions */}
                <div className="flex items-start">
                  <input
                    type="checkbox"
                    id="terms"
                    className="mt-1 text-blue-600 focus:ring-blue-500"
                    required
                  />
                  <label htmlFor="terms" className="ml-2 text-sm text-gray-700">
                    I agree to the <a href="#" className="text-blue-600 hover:underline">Terms and Conditions</a> and <a href="#" className="text-blue-600 hover:underline">Privacy Policy</a>
                  </label>
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Processing Booking...
                    </>
                  ) : (
                    `Complete Booking - $${bookingData?.totalPrice?.toFixed(2) || '0.00'}`
                  )}
                </button>
              </form>
            </div>
          </div>

          {/* Booking Summary */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-lg shadow-sm p-6 sticky top-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Booking Summary</h3>

              {/* Hotel Info */}
              <div className="mb-4">
                <h4 className="font-medium text-gray-900">{bookingData?.hotelData?.name || 'Hotel Name'}</h4>
                <div className="flex items-center text-sm text-gray-600 mt-1">
                  <Calendar className="w-4 h-4 mr-1" />
                  {bookingData?.checkInDate} - {bookingData?.checkOutDate}
                </div>
                <div className="flex items-center text-sm text-gray-600 mt-1">
                  <Users className="w-4 h-4 mr-1" />
                  {bookingData?.searchParams?.adults || 2} Guest{(bookingData?.searchParams?.adults || 2) !== 1 ? 's' : ''}
                </div>
              </div>

              {/* Price Breakdown */}
              <div className="border-t pt-4">
                <div className="flex justify-between text-sm text-gray-600 mb-2">
                  <span>Room rate</span>
                  <span>${bookingData?.totalPrice?.toFixed(2) || '0.00'}</span>
                </div>
                <div className="flex justify-between text-sm text-gray-600 mb-2">
                  <span>Taxes & fees</span>
                  <span>$0.00</span>
                </div>
                <div className="flex justify-between font-semibold text-lg text-gray-900 border-t pt-2 mt-2">
                  <span>Total</span>
                  <span>${bookingData?.totalPrice?.toFixed(2) || '0.00'}</span>
                </div>
              </div>

              {/* Cancellation Policy */}
              <div className="mt-4 p-3 bg-blue-50 rounded-md">
                <div className="flex items-start">
                  <Shield className="w-5 h-5 text-blue-600 mr-2 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-medium text-blue-900 mb-1">Free Cancellation</h4>
                    <p className="text-xs text-blue-700">
                      Cancel up to 24 hours before check-in for a full refund.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}
```

---

## 🎨 Hotel Search Form CSS Styles

```css
/* Hotel Landing Page Styles */
.hotel-landing {
  min-height: 100vh;
  background-color: #f9fafb;
}

/* Hero Section */
.hero-section {
  position: relative;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  overflow: hidden;
}

.hero-background {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-size: cover;
  background-position: center;
  opacity: 0.3;
}

.hero-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.4);
}

.hero-content {
  position: relative;
  z-index: 2;
  max-width: 1200px;
  margin: 0 auto;
  padding: 4rem 2rem;
  text-align: center;
}

.hero-title {
  font-size: 3rem;
  font-weight: 700;
  margin-bottom: 1rem;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
}

.hero-subtitle {
  font-size: 1.25rem;
  margin-bottom: 3rem;
  opacity: 0.9;
}

/* Search Container */
.search-container {
  background: white;
  border-radius: 16px;
  padding: 2rem;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
  max-width: 800px;
  margin: 0 auto;
  color: #374151;
}

.search-form {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
}

.form-group {
  text-align: left;
}

.form-label {
  display: block;
  font-weight: 600;
  color: #374151;
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
}

.input-container {
  position: relative;
}

.input-icon {
  position: absolute;
  left: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  color: #6b7280;
  width: 1rem;
  height: 1rem;
}

.form-input {
  width: 100%;
  padding: 0.75rem 1rem 0.75rem 2.5rem;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  font-size: 1rem;
  transition: border-color 0.3s ease;
}

.form-input:focus {
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

/* Popular Destinations */
.popular-destinations {
  padding: 4rem 0;
  background: white;
}

.section-container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 2rem;
}

.section-title {
  font-size: 2.5rem;
  font-weight: 700;
  color: #1f2937;
  text-align: center;
  margin-bottom: 1rem;
}

.destinations-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 2rem;
  margin-top: 3rem;
}

.destination-card {
  background: white;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  cursor: pointer;
}

.destination-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.15);
}

.destination-image {
  position: relative;
  height: 200px;
  overflow: hidden;
}

.destination-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.3s ease;
}

.destination-card:hover .destination-image img {
  transform: scale(1.05);
}

.destination-info {
  padding: 1.5rem;
}

.destination-info h4 {
  font-size: 1.25rem;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 0.5rem;
}

.destination-info p {
  color: #6b7280;
  margin-bottom: 1rem;
}

.destination-rating {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.destination-rating .star {
  color: #fbbf24;
}

/* Why Choose Us */
.why-choose-us {
  padding: 4rem 0;
  background: #f9fafb;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 2rem;
  margin-top: 3rem;
}

.feature-card {
  background: white;
  padding: 2rem;
  border-radius: 12px;
  text-align: center;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  transition: transform 0.3s ease;
}

.feature-card:hover {
  transform: translateY(-4px);
}

.feature-icon {
  width: 4rem;
  height: 4rem;
  background: linear-gradient(135deg, #0066b2 0%, #1e88e5 100%);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 1rem;
  color: white;
}

.feature-card h4 {
  font-size: 1.25rem;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 1rem;
}

.feature-card p {
  color: #6b7280;
  line-height: 1.6;
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

/* Mobile Responsive */
@media (max-width: 768px) {
  .hero-content {
    padding: 2rem 1rem;
  }

  .hero-title {
    font-size: 2rem;
  }

  .hero-subtitle {
    font-size: 1rem;
  }

  .search-container {
    padding: 1.5rem;
  }

  .destinations-grid {
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1rem;
  }

  .features-grid {
    grid-template-columns: 1fr;
  }

  .section-container {
    padding: 0 1rem;
  }
}
```

---

## 📊 Key Features Summary

### **Hotel Booking Flow:**
1. **HotelLanding** - Hero section with search form and popular destinations
2. **HotelSearch** - Advanced search form with date picker and destination autocomplete
3. **HotelSearchResults** - Results with filters, sorting, and Amadeus API integration
4. **HotelDetails** - Detailed hotel information, room selection, and booking
5. **HotelBooking** - Guest information and payment processing with Arc Pay

### **Core Functionality:**
- ✅ **Destination autocomplete** - Search cities with IATA codes
- ✅ **Advanced date picker** - Flexible check-in/out date selection
- ✅ **Real-time hotel search** - Amadeus API integration with 2M+ properties
- ✅ **Smart filtering** - Price, ratings, amenities, and location filters
- ✅ **Detailed hotel pages** - Image galleries, reviews, amenities, and policies
- ✅ **Room selection** - Multiple room types with pricing
- ✅ **Secure booking** - Guest details and special requests
- ✅ **Payment processing** - Arc Pay integration with multiple options
- ✅ **Booking confirmation** - Success page with booking reference

### **Technical Implementation:**
- **Amadeus Hotel API** for real hotel data and availability
- **Supabase** for storing bookings and user data
- **Arc Pay** for secure payment processing
- **React Router** for navigation between booking steps
- **Responsive design** with mobile-first approach
- **Form validation** and error handling
- **Real-time data** and loading states

This comprehensive hotel booking code provides all the functionality from the Jetsetterss web platform. Use this as the foundation for your Android app's hotel booking feature! 🏨


