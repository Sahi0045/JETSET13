"use client"

import React, { useState } from "react"
import { cheapFlightsBySource, sourceCities } from "./data.js"
import { ChevronDown } from "lucide-react"
import Price from "../../../Components/Price"

export default function CheapestFlights({ onBookFlight }) {
  const [selectedCity, setSelectedCity] = useState(sourceCities[0])
  const [showCityDropdown, setShowCityDropdown] = useState(false)
  const [selectedRegion, setSelectedRegion] = useState("All Regions")
  const [showRegionDropdown, setShowRegionDropdown] = useState(false)

  // Get unique regions for the selected city
  const getRegions = () => {
    const flights = cheapFlightsBySource[selectedCity] || [];
    const regions = ["All Regions", ...new Set(flights.map(flight => flight.region))];
    return regions;
  }

  // Get filtered flights based on selected region
  const getFilteredFlights = () => {
    const flights = cheapFlightsBySource[selectedCity] || [];
    if (selectedRegion === "All Regions") {
      return flights;
    }
    return flights.filter(flight => flight.region === selectedRegion);
  }

  const handleCitySelect = (city) => {
    setSelectedCity(city)
    setShowCityDropdown(false)
    // Reset region selection when city changes
    setSelectedRegion("All Regions")
  }

  const handleRegionSelect = (region) => {
    setSelectedRegion(region)
    setShowRegionDropdown(false)
  }

  const regions = getRegions();
  const filteredFlights = getFilteredFlights();

  return (
    <div className="bg-[#B9D0DC] rounded-xl p-8 shadow-lg border border-white/20">
      <div className="flex flex-col md:flex-row md:items-center mb-8 gap-4">
        <h3 className="text-[#055B75] text-2xl font-bold">Cheapest Fares From</h3>

        {/* Source City Dropdown */}
        <div className="relative">
          <button
            className="bg-white text-[#055B75] px-4 py-1.5 rounded-full border border-[#055B75]/30 text-base flex items-center gap-1 hover:bg-[#F0FAFC] hover:border-[#055B75] transition-all"
            onClick={() => setShowCityDropdown(!showCityDropdown)}
          >
            {selectedCity}
            <ChevronDown size={16} className={`ml-1 transition-transform ${showCityDropdown ? 'rotate-180' : ''}`} />
          </button>

          {showCityDropdown && (
            <div className="absolute top-full left-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-100 z-20 max-h-60 overflow-y-auto w-full min-w-[180px] p-1">
              {sourceCities.map((city) => (
                <button
                  key={city}
                  className="block w-full text-left px-4 py-2.5 text-sm md:text-base text-gray-700 hover:bg-[#F0FAFC] hover:text-[#055B75] rounded-lg transition-colors font-medium"
                  onClick={() => handleCitySelect(city)}
                >
                  {city}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Region Dropdown */}
        <div className="relative ml-0 md:ml-2">
          <button
            className="bg-white text-[#055B75] px-4 py-1.5 rounded-full border border-[#055B75]/30 text-base flex items-center gap-1 hover:bg-[#F0FAFC] hover:border-[#055B75] transition-all"
            onClick={() => setShowRegionDropdown(!showRegionDropdown)}
          >
            {selectedRegion}
            <ChevronDown size={16} className={`ml-1 transition-transform ${showRegionDropdown ? 'rotate-180' : ''}`} />
          </button>

          {showRegionDropdown && (
            <div className="absolute top-full left-0 mt-1 bg-white rounded-md shadow-lg z-10 max-h-60 overflow-y-auto w-full min-w-[150px]">
              {regions.map((region) => (
                <button
                  key={region}
                  className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 transition-colors"
                  onClick={() => handleRegionSelect(region)}
                >
                  {region}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {filteredFlights.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredFlights.map((flight) => (
            <div key={flight.id} className="bg-white rounded-xl overflow-hidden shadow-md hover:shadow-xl transform hover:-translate-y-1 transition-all duration-300 group">
              {/* Image container with decorative elements */}
              <div className="relative h-32 overflow-hidden">
                <img
                  src={flight.image || "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?q=80&w=2070&auto=format&fit=crop"}
                  alt={flight.destination}
                  className="w-full h-full object-cover transform group-hover:scale-105 transition-transform duration-500"
                />
                {/* Overlay gradient for better text visibility */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent"></div>

                {/* Corner decoration */}
                <div className="absolute top-0 right-0 w-12 h-12 bg-[#65B3CF]/20 backdrop-blur-sm rounded-bl-xl"></div>

                {/* Price tag */}
                <div className="absolute bottom-2 right-2 bg-[#055B75]/90 backdrop-blur-sm text-white text-xs font-bold py-1 px-2 rounded-md flex items-center shadow-sm">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 mr-1" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                  Best Price
                </div>
              </div>

              {/* Content section */}
              <div className="p-4">
                {/* Destination and region */}
                <div className="mb-2">
                  <div className="flex items-center">
                    <h4 className="font-bold text-gray-800">{flight.destination}</h4>
                    <span className="text-gray-400 mx-1">,</span>
                    <p className="text-gray-600">{flight.region}</p>
                  </div>
                  <div className="flex items-center mt-1">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-gray-400 mr-1" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                    </svg>
                    <p className="text-gray-500 text-xs font-medium">{flight.date}</p>
                  </div>
                </div>

                {/* Price and button */}
                <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-100">
                  <div className="flex items-baseline">
                    <p className="font-bold text-[#055B75] text-lg">
                      <Price amount={flight.price.replace(/[^0-9.]/g, '')} />
                    </p>
                    <span className="text-xs text-gray-500 ml-1">onwards</span>
                  </div>

                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onBookFlight && onBookFlight(flight.destination);
                    }}
                    className="bg-[#055B75] hover:bg-[#044A5F] text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors shadow-sm"
                  >
                    Book Flight
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white/10 backdrop-blur-sm text-white rounded-lg p-8 text-center">
          <h4 className="text-xl font-medium mb-2">No flights found</h4>
          <p>No flights available for the selected filters. Please try another city or region.</p>
        </div>
      )}
    </div>
  )
}
