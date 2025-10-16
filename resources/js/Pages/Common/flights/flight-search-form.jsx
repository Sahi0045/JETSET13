"use client"

import React, { useState, useEffect } from "react"
import { Calendar, Users, MapPin, Search, ChevronDown } from "lucide-react"
import { defaultSearchData, specialFares, sourceCities, allDestinations } from "./data.js"

// Get this from a config or parent component
const USE_AMADEUS_API = true;

export default function FlightSearchForm({ initialData, onSearch }) {
  const [formData, setFormData] = useState(initialData || defaultSearchData)
  const [formErrors, setFormErrors] = useState({})
  const [isMobileView, setIsMobileView] = useState(false)

  const [showFromSuggestions, setShowFromSuggestions] = useState(false);
  const [showToSuggestions, setShowToSuggestions] = useState(false);
  const [fromSuggestions, setFromSuggestions] = useState([]);
  const [toSuggestions, setToSuggestions] = useState([]);

  // Check if screen is mobile-sized on mount and resize
  useEffect(() => {
    const checkIfMobile = () => {
      // Consider mobile for screens smaller than 1024px (includes tablets)
      setIsMobileView(window.innerWidth < 1024);
    }
    
    // Set initial value
    checkIfMobile();
    
    // Add event listener
    window.addEventListener('resize', checkIfMobile);
    
    // Clean up
    return () => window.removeEventListener('resize', checkIfMobile);
  }, []);

  // Create a map of city names to their codes
  const cityCodeMap = allDestinations.reduce((acc, city) => {
    acc[city.name] = city.code;
    return acc;
  }, {});

  // Create a map of codes to city details
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
    if (type === "roundTrip") {
      const baseDepart = formData.departDate ? new Date(formData.departDate) : new Date();
      const suggestedReturn = new Date(baseDepart);
      suggestedReturn.setDate(baseDepart.getDate() + 3);
      const suggestedReturnStr = suggestedReturn.toISOString().split('T')[0];
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

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    // Update the field
    setFormData((prev) => {
      const next = { ...prev, [name]: value };
      // If departDate changes in roundTrip, enforce returnDate >= departDate + 1
      if (name === 'departDate' && prev.tripType === 'roundTrip') {
        const depart = value ? new Date(value) : null;
        if (depart) {
          const minReturn = new Date(depart);
          minReturn.setDate(depart.getDate() + 1);
          const minReturnStr = minReturn.toISOString().split('T')[0];
          if (!next.returnDate || new Date(next.returnDate) <= depart) {
            next.returnDate = minReturnStr;
          }
        }
      }
      // If returnDate set earlier than departDate, bump it
      if (name === 'returnDate' && prev.tripType === 'roundTrip' && prev.departDate) {
        const depart = new Date(prev.departDate);
        const ret = new Date(value);
        if (ret <= depart) {
          const minReturn = new Date(depart);
          minReturn.setDate(depart.getDate() + 1);
          next.returnDate = minReturn.toISOString().split('T')[0];
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

    // Ensure we have the city codes
    const searchData = {
      ...formData,
      fromCode: formData.fromCode || cityCodeMap[formData.from],
      toCode: formData.toCode || cityCodeMap[formData.to]
    };
    
    if (onSearch) {
      onSearch(searchData);
    } else {
      console.log("Search data:", searchData);
    }
  };

  return isMobileView ? (
    // Mobile/Tablet View - Modern Search Bar Style
    <div className="w-full min-h-screen bg-cover bg-center flex flex-col items-center" style={{ backgroundImage: "url('/path/to/your/background.jpg')" }}>
      {/* Search Bar Card - Responsive for tablets */}
      <div className="w-full max-w-md md:max-w-lg lg:max-w-xl mx-auto mt-4 px-2 md:px-4">
        <div className="bg-white/95 rounded-2xl shadow-xl p-3 md:p-4 lg:p-6 flex flex-col gap-2 md:gap-3">
          {/* Title */}
          <div className="mb-1 md:mb-2">
            <h2 className="text-base md:text-lg lg:text-xl font-bold text-blue-700 leading-tight">Find and Book <span className="text-blue-400">Flights</span></h2>
            <p className="text-gray-500 text-xs md:text-sm">Search across multiple airlines and destinations</p>
          </div>
          {/* Trip Type Selector */}
          <div className="flex gap-1 mb-1 md:mb-2">
            <button
              onClick={() => handleTripTypeChange("oneWay")}
              className={`flex-1 py-2 md:py-3 text-center text-xs md:text-sm font-medium rounded-full transition-all ${formData.tripType === "oneWay" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"}`}
            >
              One Way
            </button>
            <button
              onClick={() => handleTripTypeChange("roundTrip")}
              className={`flex-1 py-2 md:py-3 text-center text-xs md:text-sm font-medium rounded-full transition-all ${formData.tripType === "roundTrip" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"}`}
            >
              Round Trip
            </button>
          </div>
          {/* From Field */}
          <div>
            <label className="text-xs md:text-sm font-medium text-gray-500 mb-0.5 md:mb-1 block">From</label>
            <div className="relative">
              <MapPin className="absolute left-2 md:left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4 md:h-5 md:w-5" />
              <input
                type="text"
                name="from"
                value={formData.from || ""}
                onChange={handleInputChange}
                onBlur={() => handleInputBlur("from")}
                className="w-full pl-8 md:pl-10 pr-2 md:pr-3 py-1.5 md:py-2.5 text-gray-900 placeholder-gray-400 text-sm md:text-base font-medium rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter city or airport"
                autoComplete="off"
                inputMode="text"
              />
            </div>
            {formErrors.from && (
              <p className="text-red-500 text-xs mt-0.5">{formErrors.from}</p>
            )}
            {showFromSuggestions && fromSuggestions.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 max-h-48 overflow-auto">
                {fromSuggestions.map((city, index) => (
                  <div
                    key={index}
                    className="px-3 py-2 hover:bg-gray-50 active:bg-gray-100 cursor-pointer transition-colors"
                    onClick={() => {
                      handleSuggestionClick(city.name, "from");
                      setTimeout(() => {
                        document.getElementById('to-input-mobile')?.focus();
                      }, 100);
                    }}
                  >
                    <div className="font-medium text-gray-900 text-sm">{city.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{city.code} • {city.country}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* To Field */}
          <div>
            <label className="text-xs md:text-sm font-medium text-gray-500 mb-0.5 md:mb-1 block">To</label>
            <div className="relative">
              <MapPin className="absolute left-2 md:left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4 md:h-5 md:w-5" />
              <input
                id="to-input-mobile"
                type="text"
                name="to"
                value={formData.to || ""}
                onChange={handleInputChange}
                onBlur={() => handleInputBlur("to")}
                className="w-full pl-8 md:pl-10 pr-2 md:pr-3 py-1.5 md:py-2.5 text-gray-900 placeholder-gray-400 text-sm md:text-base font-medium rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter city or airport"
                autoComplete="off"
                inputMode="text"
              />
            </div>
            {formErrors.to && (
              <p className="text-red-500 text-xs mt-0.5">{formErrors.to}</p>
            )}
            {showToSuggestions && toSuggestions.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 max-h-48 overflow-auto">
                {toSuggestions.map((city, index) => (
                  <div
                    key={index}
                    className="px-3 py-2 hover:bg-gray-50 active:bg-gray-100 cursor-pointer transition-colors"
                    onClick={() => {
                      handleSuggestionClick(city.name, "to");
                      setTimeout(() => {
                        document.getElementById('depart-date-mobile')?.focus();
                      }, 100);
                    }}
                  >
                    <div className="font-medium text-gray-900 text-sm">{city.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{city.code} • {city.country}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Dates */}
          <div className={`${formData.tripType === "roundTrip" ? "grid grid-cols-2" : "grid grid-cols-1"} gap-2 md:gap-3`}>
            <div className="flex-1">
              <label className="text-xs md:text-sm font-medium text-gray-500 mb-0.5 md:mb-1 block">Departure</label>
              <div className="relative">
                <Calendar className="absolute left-2 md:left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4 md:h-5 md:w-5" />
                <input
                  id="depart-date-mobile"
                  type="date"
                  name="departDate"
                  value={formData.departDate || ""}
                  onChange={handleInputChange}
                  className="w-full pl-8 md:pl-10 pr-2 md:pr-3 py-1.5 md:py-2.5 text-gray-900 text-xs md:text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              {formErrors.departDate && (
                <p className="text-red-500 text-xs md:text-sm mt-0.5">{formErrors.departDate}</p>
              )}
            </div>
            {formData.tripType === "roundTrip" && (
              <div className="flex-1">
                <label className="text-xs md:text-sm font-medium text-gray-500 mb-0.5 md:mb-1 block">Return</label>
                <div className="relative">
                  <Calendar className="absolute left-2 md:left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4 md:h-5 md:w-5" />
                  <input
                    id="return-date-mobile"
                    type="date"
                    name="returnDate"
                    value={formData.returnDate || ""}
                    onChange={handleInputChange}
                    min={formData.departDate ? new Date(new Date(formData.departDate).getTime() + 86400000).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]}
                    className="w-full pl-8 md:pl-10 pr-2 md:pr-3 py-1.5 md:py-2.5 text-gray-900 text-xs md:text-sm rounded-lg border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                {formErrors.returnDate && (
                  <p className="text-red-500 text-xs md:text-sm mt-0.5">{formErrors.returnDate}</p>
                )}
              </div>
            )}
          </div>
          {/* Travelers */}
          <div>
            <label className="text-xs md:text-sm font-medium text-gray-500 mb-0.5 md:mb-1 block">Travelers</label>
            <div className="relative">
              <Users className="absolute left-2 md:left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4 md:h-5 md:w-5" />
              <select
                name="travelers"
                value={formData.travelers || "1"}
                onChange={handleInputChange}
                className="w-full pl-8 md:pl-10 pr-2 md:pr-3 py-1.5 md:py-2.5 text-gray-900 text-xs md:text-sm rounded-lg border border-gray-200 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="1">1 Traveler</option>
                <option value="2">2 Travelers</option>
                <option value="3">3 Travelers</option>
                <option value="4">4+ Travelers</option>
              </select>
              <ChevronDown className="absolute right-2 md:right-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4 md:h-5 md:w-5" />
            </div>

          </div>
          {/* Special Fares */}
          <div className="flex gap-2 mt-1 md:mt-2">
            <button className="flex-1 px-3 md:px-4 py-1.5 md:py-2 bg-blue-50 text-blue-700 rounded-lg text-xs md:text-sm font-medium shadow-sm hover:bg-blue-100 transition-colors">Student</button>
            <button className="flex-1 px-3 md:px-4 py-1.5 md:py-2 bg-blue-50 text-blue-700 rounded-lg text-xs md:text-sm font-medium shadow-sm hover:bg-blue-100 transition-colors">Senior Citizen</button>
          </div>
          {/* Search Button */}
          <button
            onClick={handleSearch}
            className="w-full bg-blue-600 text-white py-3 md:py-4 rounded-xl flex items-center justify-center transition-colors hover:bg-blue-700 active:bg-blue-800 font-semibold text-base md:text-lg shadow-md mt-2 md:mt-3"
          >
            <Search className="h-5 w-5 md:h-6 md:w-6 mr-2" />
            Search Flights
          </button>
        </div>
      </div>
    </div>
  ) : (
    // Desktop View
    <div className="flex flex-col gap-4">
      {/* Trip Type Selector */}
      <div className="w-72 rounded-full overflow-hidden bg-white">
        <div className="flex">
          <button
            onClick={() => handleTripTypeChange("oneWay")}
            className={`w-1/2 py-3 text-center font-medium transition-colors ${
              formData.tripType === "oneWay" 
                ? "bg-blue-500 text-white" 
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            One Way
          </button>
          <button
            onClick={() => handleTripTypeChange("roundTrip")}
            className={`w-1/2 py-3 text-center font-medium transition-colors ${
              formData.tripType === "roundTrip" 
                ? "bg-blue-500 text-white" 
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            Round Trip
          </button>
        </div>
      </div>

      {/* Main Search Form */}
      <div className="w-full mx-auto bg-white rounded-xl shadow-md p-6 max-w-5xl lg:max-w-6xl xl:max-w-7xl">
        <div className="flex flex-row items-end justify-between gap-4">
          {/* From */}
          <div className="flex-1">
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
              <div className="absolute z-10 w-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 max-h-60 overflow-auto">
                {fromSuggestions.map((city, index) => (
                  <div
                    key={index}
                    className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                    onClick={() => handleSuggestionClick(city.name, "from")}
                  >
                    <div className="font-medium">{city.name}</div>
                    <div className="text-sm text-gray-500">{city.code}</div>
                  </div>
                ))}
              </div>
            )}
            {formErrors.from && (
              <p className="text-red-500 text-xs mt-1">{formErrors.from}</p>
            )}
          </div>
          
          {/* To */}
          <div className="flex-1">
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
              <div className="absolute z-10 w-full mt-1 bg-white rounded-lg shadow-lg border border-gray-200 max-h-60 overflow-auto">
                {toSuggestions.map((city, index) => (
                  <div
                    key={index}
                    className="px-4 py-2 hover:bg-gray-100 cursor-pointer"
                    onClick={() => handleSuggestionClick(city.name, "to")}
                  >
                    <div className="font-medium">{city.name}</div>
                    <div className="text-sm text-gray-500">
                      {city.code} - {city.country} ({city.type})
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
          <div className="flex-1">
            <label className="text-gray-600 text-sm font-medium mb-2 block">Depart Date</label>
            <div className="relative">
              <input
                type="date"
                name="departDate"
                value={formData.departDate || ""}
                onChange={handleInputChange}
                className="w-full p-3 border border-gray-200 rounded-md text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Select date"
              />
              <Calendar className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5 pointer-events-none" />
            </div>
            {formErrors.departDate && (
              <p className="text-red-500 text-xs mt-1">{formErrors.departDate}</p>
            )}
          </div>
          
          {/* Return Date - Only visible for Round Trip */}
          {formData.tripType === "roundTrip" && (
            <div className="flex-1">
              <label className="text-gray-600 text-sm font-medium mb-2 block">Return Date</label>
              <div className="relative">
                <input
                  type="date"
                  name="returnDate"
                  value={formData.returnDate || ""}
                  onChange={handleInputChange}
                  className="w-full p-3 border border-gray-200 rounded-md text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Select date"
                />
                <Calendar className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5 pointer-events-none" />
              </div>
              {formErrors.returnDate && (
                <p className="text-red-500 text-xs mt-1">{formErrors.returnDate}</p>
              )}
            </div>
          )}
          
          {/* Travelers */}
          <div className="flex-1">
            <label className="text-gray-600 text-sm font-medium mb-2 block">Travelers</label>
            <div className="relative">
              <select
                name="travelers"
                value={formData.travelers || "2"}
                onChange={handleInputChange}
                className="w-full p-3 appearance-none border border-gray-200 rounded-md text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="1">1 Traveler</option>
                <option value="2">2 Travelers</option>
                <option value="3">3 Travelers</option>
                <option value="4">4+ Travelers</option>
              </select>
              <Users className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
            </div>
          </div>
          
          {/* Search Button */}
          <div className="ml-2">
            <button
              onClick={handleSearch}
              className="h-12 bg-[#1a56db] hover:bg-blue-700 text-white px-8 rounded-md flex items-center justify-center transition-colors"
            >
              <Search className="h-5 w-5 mr-2" />
              <span className="font-medium">Search</span>
            </button>
          </div>
        </div>
      </div>

      {/* Special Fares */}
      <div className="flex items-center gap-3">
        <span className="text-white font-medium">Special Fares:</span>
        <div className="flex gap-3">
          <button className="px-6 py-2 bg-gray-100 bg-opacity-30 hover:bg-opacity-40 text-white rounded-full border border-white">
            Student
          </button>
          <button className="px-6 py-2 bg-gray-100 bg-opacity-30 hover:bg-opacity-40 text-white rounded-full border border-white">
            Senior Citizen
          </button>
          <button className="px-6 py-2 bg-gray-100 bg-opacity-30 hover:bg-opacity-40 text-white rounded-full border border-white">
            Armed Forces
          </button>
        </div>
      </div>
    </div>
  );
}

