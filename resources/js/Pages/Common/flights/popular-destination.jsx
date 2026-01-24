import React, { useState } from "react"
import { destinations } from "./data.js"

export default function PopularDestinations({ onSelectDestination }) {
  const [selectedDestination, setSelectedDestination] = useState(null);

  const handleDestinationClick = (destination) => {
    setSelectedDestination(destination);
    if (onSelectDestination) {
      onSelectDestination(destination.name);
    }
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {destinations.map((destination, index) => (
        <div
          key={destination.id}
          className={`rounded-2xl overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300 relative h-[320px] cursor-pointer group ${selectedDestination?.id === destination.id ? 'ring-2 ring-[#055B75]' : ''
            }`}
          onClick={() => handleDestinationClick(destination)}
        >
          {/* Full bleed image with slight zoom on hover */}
          <div className="absolute inset-0 w-full h-full">
            <img
              src={destination.image || "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?q=80&w=2070&auto=format&fit=crop"}
              alt={destination.name}
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
              loading="lazy"
            />
            {/* Gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/50 to-black/30"></div>
          </div>

          {/* Badge - Only for first item */}
          {index === 0 && (
            <div className="absolute top-4 left-4 z-10">
              <div className="bg-[#055B75] text-white text-sm font-medium py-1 px-4 rounded-full shadow-md animate-pulse">
                Popular Choice
              </div>
            </div>
          )}

          {/* Content overlay */}
          <div className="absolute inset-0 flex flex-col justify-between p-5 z-10">
            {/* Top section empty */}
            <div></div>

            {/* Bottom section with information */}
            <div>
              <h3 className="text-white text-2xl font-bold mb-1">
                {destination.name}
                <span className="ml-2 text-[#65B3CF] text-sm font-normal">
                  ({destination.code})
                </span>
              </h3>

              <div className="flex items-center mb-4">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5 text-white/90 mr-1"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                  />
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                <span className="text-white/90">
                  {destination.region}
                </span>
              </div>

              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5 text-[#65B3CF] mr-1"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path
                      d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
                    />
                  </svg>
                  <span className="text-white">
                    {index % 2 === 0 ? '70' : '50'} properties available
                  </span>
                </div>

                {/* Book now button */}
                <button
                  className={`bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white text-xs font-medium py-1 px-3 rounded-lg transition-colors ${selectedDestination?.id === destination.id ? 'bg-[#055B75] hover:bg-[#044A5F]' : ''
                    }`}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('Book now clicked for destination:', destination.name);
                    handleDestinationClick(destination);
                  }}
                >
                  {selectedDestination?.id === destination.id ? 'Selected' : 'Book Now'}
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
