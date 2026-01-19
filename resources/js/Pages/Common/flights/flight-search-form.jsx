"use client"

import React, { useState, useEffect } from "react"
import { Calendar, Users, MapPin, Search, ChevronDown } from "lucide-react"
import { defaultSearchData, specialFares, sourceCities, allDestinations } from "./data.js"

// Get this from a config or parent component
const USE_AMADEUS_API = true;

export default function FlightSearchForm({ initialData, onSearch }) {
  const [formData, setFormData] = useState(initialData || defaultSearchData)
  const [formErrors, setFormErrors] = useState({})
  const [showFromSuggestions, setShowFromSuggestions] = useState(false);
  const [showToSuggestions, setShowToSuggestions] = useState(false);
  const [fromSuggestions, setFromSuggestions] = useState([]);
  const [toSuggestions, setToSuggestions] = useState([]);

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

  return (
    <div className="flex flex-col gap-4">
      {/* Trip Type Selector */}
      <div className="w-72 rounded-full overflow-hidden bg-white mx-auto lg:mx-0">
        <div className="flex">
          <button
            onClick={() => handleTripTypeChange("oneWay")}
            className={`w-1/2 py-3 text-center font-medium transition-colors ${formData.tripType === "oneWay"
              ? "bg-blue-500 text-white"
              : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
          >
            One Way
          </button>
          <button
            onClick={() => handleTripTypeChange("roundTrip")}
            className={`w-1/2 py-3 text-center font-medium transition-colors ${formData.tripType === "roundTrip"
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
        <div className="flex flex-col lg:flex-row items-end justify-between gap-4">
          {/* From */}
          <div className="flex-1 w-full">
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
          <div className="flex-1 w-full">
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
          <div className="flex-1 w-full">
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
            <div className="flex-1 w-full">
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
          <div className="flex-1 w-full">
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
          <div className="ml-2 w-full lg:w-auto">
            <button
              onClick={handleSearch}
              className="h-12 w-full lg:w-auto bg-[#1a56db] hover:bg-blue-700 text-white px-8 rounded-md flex items-center justify-center transition-colors"
            >
              <Search className="h-5 w-5 mr-2" />
              <span className="font-medium">Search</span>
            </button>
          </div>
        </div>
      </div>

      {/* Special Fares */}
      <div className="flex flex-wrap items-center gap-3 mt-2 justify-center lg:justify-start">
        <span className="text-white font-medium text-shadow-sm drop-shadow-md">Special Fares:</span>
        <div className="flex flex-wrap gap-2 lg:gap-3">
          <button className="px-4 lg:px-6 py-2 bg-blue-600/80 hover:bg-blue-600 text-white rounded-full border border-blue-400 font-medium shadow-md backdrop-blur-sm transition-all text-sm lg:text-base">
            Student
          </button>
          <button className="px-4 lg:px-6 py-2 bg-blue-600/80 hover:bg-blue-600 text-white rounded-full border border-blue-400 font-medium shadow-md backdrop-blur-sm transition-all text-sm lg:text-base">
            Senior Citizen
          </button>
          <button className="px-4 lg:px-6 py-2 bg-blue-600/80 hover:bg-blue-600 text-white rounded-full border border-blue-400 font-medium shadow-md backdrop-blur-sm transition-all text-sm lg:text-base">
            Armed Forces
          </button>
        </div>
      </div>
    </div>
  );
}

