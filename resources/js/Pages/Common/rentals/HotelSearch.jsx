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

          <form onSubmit={handleSearch} className="space-y-6">
            {/* City Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Destination
              </label>
              <select
                value={searchParams.cityCode}
                onChange={(e) => setSearchParams({...searchParams, cityCode: e.target.value})}
                className="w-full p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                required
              >
                <option value="">Select a destination</option>
                {destinations.map((city) => (
                  <option key={city.code} value={city.code}>
                    {city.name}, {city.country} ({city.code})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-sm text-gray-500">
                Popular destinations worldwide
              </p>
            </div>

            {/* Date Selection */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Check-in Date
                </label>
                <div className="relative">
                  <DatePicker
                    selected={new Date(searchParams.checkInDate)}
                    onChange={(date) => handleDateChange(date, 'checkInDate')}
                    minDate={new Date()}
                    dateFormat="yyyy-MM-dd"
                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                  <FaCalendarAlt className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Check-out Date
                </label>
                <div className="relative">
                  <DatePicker
                    selected={new Date(searchParams.checkOutDate)}
                    onChange={(date) => handleDateChange(date, 'checkOutDate')}
                    minDate={new Date(searchParams.checkInDate)}
                    dateFormat="yyyy-MM-dd"
                    className="w-full p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                  <FaCalendarAlt className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
                </div>
              </div>
            </div>

            {/* Number of Adults */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Number of Adults
              </label>
              <div className="relative">
                <select
                  value={searchParams.adults}
                  onChange={(e) => setSearchParams({...searchParams, adults: parseInt(e.target.value)})}
                  className="w-full p-3 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  required
                >
                  {[1, 2, 3, 4, 5].map(num => (
                    <option key={num} value={num}>{num} {num === 1 ? 'Adult' : 'Adults'}</option>
                  ))}
                </select>
                <FaUser className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              </div>
            </div>

            {/* Error Message */}
            {error && (
              <div className="text-red-500 text-sm text-center">
                {error}
              </div>
            )}

            {/* Search Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors duration-200 flex items-center justify-center space-x-2"
            >
              {loading ? (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
              ) : (
                <>
                  <FaSearch />
                  <span>Search Hotels</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default HotelSearch;
