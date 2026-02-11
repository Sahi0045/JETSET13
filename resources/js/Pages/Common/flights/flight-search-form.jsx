"use client"

import React, { useState, useEffect, useRef, useCallback } from "react"
import { Calendar, Users, MapPin, Search, ChevronDown } from "lucide-react"
import { defaultSearchData, specialFares, sourceCities, allDestinations } from "./data.js"
import { allAirports } from "./airports.js";
import AirportService from "../../../Services/AirportService";
import { getTodayDate, getNextDay, getSafeDate } from "../../../utils/dateUtils";
import { useLocationContext } from '../../../Context/LocationContext';
import CustomFlightCalendar from "./CustomFlightCalendar";
import { format, parseISO, isValid } from 'date-fns';

// Get this from a config or parent component
const USE_AMADEUS_API = true;

export default function FlightSearchForm({ initialData, onSearch }) {
  const { city, loaded, country: userCountry } = useLocationContext();
  const [formData, setFormData] = useState(initialData || defaultSearchData)
  const [formErrors, setFormErrors] = useState({})
  const [showFromSuggestions, setShowFromSuggestions] = useState(false);
  const [showToSuggestions, setShowToSuggestions] = useState(false);
  const [fromSuggestions, setFromSuggestions] = useState([]);
  const [toSuggestions, setToSuggestions] = useState([]);
  const [selectedFare, setSelectedFare] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [showDepartCalendar, setShowDepartCalendar] = useState(false);
  const [showReturnCalendar, setShowReturnCalendar] = useState(false);

  const departCalendarRef = useRef(null);
  const returnCalendarRef = useRef(null);

  // Debounce timer ref
  const searchTimeoutRef = useRef(null);

  // Create a map of city names to their codes
  const cityCodeMap = allAirports.reduce((acc, city) => {
    acc[city.name] = city.code;
    return acc;
  }, {});

  // Create a map of codes to city details
  const cityDetailsMap = allAirports.reduce((acc, city) => {
    acc[city.code] = {
      name: city.name,
      country: city.country,
      type: city.type
    };
    return acc;
  }, {});

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
    }
  }, [initialData]);

  // Set default "From" location based on user's location
  useEffect(() => {
    const setDefaultFrom = async () => {
      if (loaded && !initialData?.from && !formData.from && city) {
        // 1. Try local match first for instant result
        let match = allAirports.find(d => d.name.toLowerCase() === city.toLowerCase());

        if (!match) {
          // 2. Try loose local match
          match = allAirports.find(d =>
            d.name.toLowerCase().includes(city.toLowerCase()) ||
            city.toLowerCase().includes(d.name.toLowerCase())
          );
        }

        if (match) {
          setFormData(prev => ({
            ...prev,
            from: `${match.name} (${match.code})`,
            fromCode: match.code,
            fromCountry: match.country,
            fromType: match.type
          }));
        } else {
          // 3. Last resort: Dynamic search via API
          try {
            const dynamicResults = await AirportService.searchAirports(city, { limit: 1 });
            if (dynamicResults && dynamicResults.length > 0) {
              const bestMatch = dynamicResults[0];
              setFormData(prev => ({
                ...prev,
                from: `${bestMatch.name} (${bestMatch.code})`,
                fromCode: bestMatch.code,
                fromCountry: bestMatch.country,
                fromType: bestMatch.type || 'international'
              }));
            }
          } catch (e) {
            console.warn('Failed to fetch dynamic default from location', e);
          }
        }
      }
    };

    setDefaultFrom();
  }, [loaded, city, initialData]);

  const handleTripTypeChange = (type) => {
    if (type === "roundTrip") {
      const currentDepart = formData.departDate || getTodayDate();

      // Suggest return date 3 days after departure
      const baseDepart = getSafeDate(currentDepart);
      const suggestedReturn = new Date(baseDepart);
      suggestedReturn.setDate(suggestedReturn.getDate() + 3);

      const year = suggestedReturn.getFullYear();
      const month = String(suggestedReturn.getMonth() + 1).padStart(2, '0');
      const day = String(suggestedReturn.getDate()).padStart(2, '0');
      const suggestedReturnStr = `${year}-${month}-${day}`;

      setFormData(prev => ({
        ...prev,
        tripType: "roundTrip",
        returnDate: prev.returnDate || suggestedReturnStr
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        tripType: "oneWay",
        returnDate: ''
      }));
    }
  }

  // Handle outside click for calendars
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (departCalendarRef.current && !departCalendarRef.current.contains(event.target)) {
        setShowDepartCalendar(false);
      }
      if (returnCalendarRef.current && !returnCalendarRef.current.contains(event.target)) {
        setShowReturnCalendar(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const formatDateDisplay = (dateStr) => {
    if (!dateStr) return "";
    try {
      const date = parseISO(dateStr);
      if (!isValid(date)) return dateStr;
      return format(date, 'dd/MM/yyyy');
    } catch {
      return dateStr;
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    // Update the field
    setFormData((prev) => {
      const next = { ...prev, [name]: value };

      // If departDate changes
      if (name === 'departDate') {
        const today = getTodayDate();
        if (value && value < today) {
          // Don't allow past dates if user manually types? HTML5 min attribute handles this usually but good to be safe
          // next.departDate = today; // Optional: Force reset or let validation handle it
        }

        // In round trip, ensure return date is valid
        if (prev.tripType === 'roundTrip' && value) {
          const minReturn = value; // Can return same day
          if (!next.returnDate || next.returnDate < minReturn) {
            next.returnDate = getNextDay(value); // Suggest next day or same day? Usually airlines allow same day returns. Let's suggest next day for better UX but allow same day via min attribute if needed. The original logic was +1 day.
          }
        }
      }

      // If returnDate changes, ensure it's not before departDate
      if (name === 'returnDate' && prev.tripType === 'roundTrip' && prev.departDate) {
        if (value < prev.departDate) {
          // If user selects a return date before depart date, maybe update depart date? 
          // Or just reset return date. 
          // Better UX: prevent selection via min attribute.
          // But if they type it:
          next.returnDate = getNextDay(prev.departDate);
        }
      }
      return next;
    });

    // Hide suggestions for the other field
    if (name === "from") {
      setShowToSuggestions(false);
    } else if (name === "to") {
      setShowFromSuggestions(false);
    }

    // Show suggestions for the current field with dynamic API search
    if (name === "from" || name === "to") {
      const showSuggestions = name === "from" ? setShowFromSuggestions : setShowToSuggestions;
      const setSuggestions = name === "from" ? setFromSuggestions : setToSuggestions;

      showSuggestions(true);

      // Clear previous timeout
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }

      // Show local results immediately for responsiveness
      const localFiltered = AirportService.searchLocalAirports(value);
      setSuggestions(localFiltered);

      // Debounce API call (300ms)
      if (value.trim().length >= 2) {
        searchTimeoutRef.current = setTimeout(async () => {
          setIsSearching(true);
          try {
            const apiResults = await AirportService.searchAirports(value);
            if (apiResults && apiResults.length > 0) {
              setSuggestions(apiResults);
            }
          } catch (error) {
            console.warn('Airport search API error:', error);
            // Keep local results on API failure
          } finally {
            setIsSearching(false);
          }
        }, 300);
      }
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
        [field]: `${selectedCity.name} (${selectedCity.code})`,
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
    // Use setTimeout to allow click events to fire before hiding suggestions
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

    if (!formData.departDate) {
      errors.departDate = "Please select departure date";
    }

    if (formData.tripType === "roundTrip" && !formData.returnDate) {
      errors.returnDate = "Please select return date";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  const handleSearch = () => {
    // Validate form before submitting
    if (!validateForm()) {
      return;
    }

    // Helper to extract code from string like "City (CODE)"
    const extractCode = (str) => {
      const match = str && str.match(/\(([A-Z]{3})\)$/);
      return match ? match[1] : null;
    };

    // Ensure we have the city codes
    const searchData = {
      ...formData,
      fromCode: formData.fromCode || extractCode(formData.from) || cityCodeMap[formData.from],
      toCode: formData.toCode || extractCode(formData.to) || cityCodeMap[formData.to]
    };

    if (onSearch) {
      onSearch(searchData);
    } else {
      console.log("Search data:", searchData);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Trip Type Selector */}
      <div className="w-72 rounded-full overflow-hidden bg-white mx-auto lg:mx-0">
        <div className="flex">
          <button
            onClick={() => handleTripTypeChange("oneWay")}
            className={`w-1/2 py-3 text-center font-medium transition-colors ${formData.tripType === "oneWay"
              ? "bg-[#055B75] text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
          >
            One Way
          </button>
          <button
            onClick={() => handleTripTypeChange("roundTrip")}
            className={`w-1/2 py-3 text-center font-medium transition-colors ${formData.tripType === "roundTrip"
              ? "bg-[#055B75] text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
          >
            Round Trip
          </button>
        </div>
      </div>

      {/* Main Search Form */}
      <div className="w-full mx-auto bg-white rounded-xl shadow-md p-6 max-w-7xl">
        <div className="flex flex-col lg:flex-row lg:flex-wrap items-end gap-3">
          {/* From */}
          <div className="flex-[1.5] min-w-[160px] w-full lg:w-auto">
            <label className="text-gray-600 text-sm font-medium mb-2 block">From</label>
            <div className="relative">
              <input
                type="text"
                name="from"
                value={formData.from || ""}
                onChange={handleInputChange}
                onBlur={() => handleInputBlur("from")}
                className="w-full p-3 border border-gray-200 rounded-md text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Departure city"
              />
              <MapPin className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            </div>
            {showFromSuggestions && fromSuggestions.length > 0 && (
              <div className="absolute z-20 w-full min-w-[280px] max-w-[90vw] sm:max-w-sm mt-1 bg-white rounded-lg shadow-xl border border-gray-200 max-h-60 overflow-auto left-0">
                {fromSuggestions.map((city, index) => (
                  <div
                    key={index}
                    className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b last:border-0 border-gray-100 transition-colors"
                    onClick={() => handleSuggestionClick(city.name, "from")}
                  >
                    <div className="font-semibold text-gray-800">{city.name}</div>
                    <div className="text-xs text-gray-500 flex justify-between">
                      <span>{city.code}</span>
                      <span>{city.country}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {formErrors.from && (
              <p className="text-red-500 text-xs mt-1">{formErrors.from}</p>
            )}
          </div>

          {/* To */}
          <div className="flex-[1.5] min-w-[160px] w-full lg:w-auto">
            <label className="text-gray-600 text-sm font-medium mb-2 block">To</label>
            <div className="relative">
              <input
                type="text"
                name="to"
                value={formData.to || ""}
                onChange={handleInputChange}
                onBlur={() => handleInputBlur("to")}
                className="w-full p-3 border border-gray-200 rounded-md text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Destination city"
              />
              <MapPin className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            </div>
            {showToSuggestions && toSuggestions.length > 0 && (
              <div className="absolute z-20 w-full min-w-[280px] max-w-[90vw] sm:max-w-sm mt-1 bg-white rounded-lg shadow-xl border border-gray-200 max-h-60 overflow-auto right-0 sm:left-0 sm:right-auto">
                {toSuggestions.map((city, index) => (
                  <div
                    key={index}
                    className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b last:border-0 border-gray-100 transition-colors"
                    onClick={() => handleSuggestionClick(city.name, "to")}
                  >
                    <div className="font-semibold text-gray-800">{city.name}</div>
                    <div className="text-xs text-gray-500 flex justify-between">
                      <span>{city.code}</span>
                      <span>{city.country}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {formErrors.to && (
              <p className="text-red-500 text-xs mt-1">{formErrors.to}</p>
            )}
          </div>

          {/* Depart Date */}
          <div className="flex-1 min-w-[140px] w-full lg:w-auto relative" ref={departCalendarRef}>
            <label className="text-gray-600 text-sm font-medium mb-2 block">Depart Date</label>
            <div className="relative">
              <div
                onClick={() => {
                  setShowDepartCalendar(!showDepartCalendar);
                  setShowReturnCalendar(false);
                }}
                className="w-full p-3 pr-10 border border-gray-200 rounded-md text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white cursor-pointer min-h-[50px] flex items-center"
              >
                {formData.departDate ? formatDateDisplay(formData.departDate) : <span className="text-gray-400">dd/mm/yyyy</span>}
              </div>
              <Calendar className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5 pointer-events-none" />

                {showDepartCalendar && (
                  <CustomFlightCalendar
                    selectedDate={formData.departDate}
                    minDate={new Date()}
                    originCode={formData.fromCode || (formData.from?.match(/\(([A-Z]{3})\)/)?.[1])}
                    destinationCode={formData.toCode || (formData.to?.match(/\(([A-Z]{3})\)/)?.[1])}
                    onSelect={(date) => {
                    handleInputChange({ target: { name: 'departDate', value: date } });
                    setShowDepartCalendar(false);
                  }}
                  onClose={() => setShowDepartCalendar(false)}
                />
              )}
            </div>
            {formErrors.departDate && (
              <p className="text-red-500 text-xs mt-1">{formErrors.departDate}</p>
            )}
          </div>

          {/* Return Date - Only visible for Round Trip */}
          {formData.tripType === "roundTrip" && (
            <div className="flex-1 min-w-[140px] w-full lg:w-auto relative" ref={returnCalendarRef}>
              <label className="text-gray-600 text-sm font-medium mb-2 block">Return Date</label>
              <div className="relative">
                <div
                  onClick={() => {
                    setShowReturnCalendar(!showReturnCalendar);
                    setShowDepartCalendar(false);
                  }}
                  className="w-full p-3 pr-10 border border-gray-200 rounded-md text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white cursor-pointer min-h-[50px] flex items-center"
                >
                  {formData.returnDate ? formatDateDisplay(formData.returnDate) : <span className="text-gray-400">dd/mm/yyyy</span>}
                </div>
                <Calendar className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5 pointer-events-none" />

                  {showReturnCalendar && (
                    <CustomFlightCalendar
                      selectedDate={formData.returnDate}
                      minDate={formData.departDate ? parseISO(formData.departDate) : new Date()}
                      originCode={formData.fromCode || (formData.from?.match(/\(([A-Z]{3})\)/)?.[1])}
                      destinationCode={formData.toCode || (formData.to?.match(/\(([A-Z]{3})\)/)?.[1])}
                      onSelect={(date) => {
                      handleInputChange({ target: { name: 'returnDate', value: date } });
                      setShowReturnCalendar(false);
                    }}
                    onClose={() => setShowReturnCalendar(false)}
                  />
                )}
              </div>
              {formErrors.returnDate && (
                <p className="text-red-500 text-xs mt-1">{formErrors.returnDate}</p>
              )}
            </div>
          )}

          {/* Travelers */}
          <div className="flex-1 min-w-[130px] w-full lg:w-auto">
            <label className="text-gray-600 text-sm font-medium mb-2 block">Travelers</label>
            <div className="relative">
              <select
                name="travelers"
                value={formData.travelers || "1"}
                onChange={handleInputChange}
                className="w-full p-3 pr-10 appearance-none border border-gray-200 rounded-md text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white cursor-pointer"
              >
                <option value="1">1 Traveler</option>
                <option value="2">2 Travelers</option>
                <option value="3">3 Travelers</option>
                <option value="4">4+ Travelers</option>
              </select>
              <Users className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5 pointer-events-none" />
            </div>
          </div>

          {/* Class */}
          <div className="flex-1 min-w-[120px] w-full lg:w-auto">
            <label className="text-gray-600 text-sm font-medium mb-2 block">Class</label>
            <div className="relative">
              <select
                name="travelClass"
                value={formData.travelClass || "ECONOMY"}
                onChange={handleInputChange}
                className="w-full p-3 pr-10 appearance-none border border-gray-200 rounded-md text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white cursor-pointer"
              >
                <option value="ECONOMY">Economy</option>
                <option value="PREMIUM_ECONOMY">Premium Economy</option>
                <option value="BUSINESS">Business</option>
                <option value="FIRST">First Class</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5 pointer-events-none" />
            </div>
          </div>

          {/* Search Button */}
          <div className={`w-full lg:w-auto lg:flex-shrink-0 ${formData.tripType === "roundTrip" ? "lg:basis-full lg:flex lg:justify-center lg:mt-4" : ""}`}>
            <button
              onClick={handleSearch}
              className="h-12 w-full lg:w-auto bg-[#055B75] hover:bg-[#044A5F] text-white px-8 rounded-md flex items-center justify-center transition-colors shadow-md hover:shadow-lg"
            >
              <Search className="h-5 w-5 mr-2" />
              <span className="font-medium">Search</span>
            </button>
          </div>
        </div>
      </div>

      {/* Special Fares */}
      <div className="flex flex-wrap items-center gap-3 mt-2 justify-center lg:justify-start">
        <span className="text-[#055B75] font-medium drop-shadow-sm">Special Fares:</span>
        <div className="flex flex-wrap gap-2 lg:gap-3">
          <button
            onClick={() => setSelectedFare(selectedFare === 'student' ? null : 'student')}
            className={`px-4 lg:px-6 py-2 rounded-full border border-[#055B75] font-medium shadow-sm transition-all text-sm lg:text-base ${selectedFare === 'student'
              ? 'bg-[#055B75] text-white'
              : 'bg-white text-[#055B75] hover:bg-[#055B75] hover:text-white'
              }`}
          >
            Student
          </button>
          <button
            onClick={() => setSelectedFare(selectedFare === 'senior' ? null : 'senior')}
            className={`px-4 lg:px-6 py-2 rounded-full border border-[#055B75] font-medium shadow-sm transition-all text-sm lg:text-base ${selectedFare === 'senior'
              ? 'bg-[#055B75] text-white'
              : 'bg-white text-[#055B75] hover:bg-[#055B75] hover:text-white'
              }`}
          >
            Senior Citizen
          </button>
          <button
            onClick={() => setSelectedFare(selectedFare === 'armed' ? null : 'armed')}
            className={`px-4 lg:px-6 py-2 rounded-full border border-[#055B75] font-medium shadow-sm transition-all text-sm lg:text-base ${selectedFare === 'armed'
              ? 'bg-[#055B75] text-white'
              : 'bg-white text-[#055B75] hover:bg-[#055B75] hover:text-white'
              }`}
          >
            Armed Forces
          </button>
        </div>
      </div>
    </div>
  );
}

