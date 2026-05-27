import React from 'react';
import Price from '../../../Components/Price';

const AIRLINE_LOGO_FALLBACK = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiByeD0iOCIgZmlsbD0iIzM3NzNmNCIvPgo8dGV4dCB4PSIyMCIgeT0iMjgiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxOCIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiPuKciO+4jzwvdGV4dD4KPHN2Zz4K';

function StopDetails({ flight, isStopOpen, onToggleStop, cityMap }) {
  if (flight.stops === 0) {
    return <span className="text-green-600 font-medium">Non-stop</span>;
  }

  const layovers = flight.stopDetails || [];

  return (
    <div className="relative inline-block z-20">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleStop(flight.id);
        }}
        className="text-orange-600 font-medium border-b border-dashed border-orange-300 hover:border-orange-600 transition-colors focus:outline-none"
      >
        {flight.stops} {flight.stops === 1 ? 'stop' : 'stops'}
        {layovers.length > 0 && <span className="text-xs ml-1 text-gray-500">via {layovers[0].airport}</span>}
      </button>

      {isStopOpen && layovers.length > 0 && (
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 w-max max-w-[280px] sm:max-w-xs bg-gray-900 text-white text-xs rounded-lg p-3 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-200">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleStop(flight.id);
            }}
            className="absolute top-1 right-1 text-gray-400 hover:text-white p-1"
          >
            ×
          </button>

          <div className="font-bold text-[#65B3CF] mb-1.5 border-b border-gray-700 pb-1 pr-4">Layover Information</div>
          {layovers.map((l, idx) => (
            <div key={idx} className="mb-2 last:mb-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-500"></span>
                <span className="text-gray-300">Stop {idx + 1}:</span>
                <span className="font-semibold text-white">{cityMap[l.airport] || l.airport} ({l.airport})</span>
              </div>
              <div className="pl-3.5 text-gray-400">
                <span className="text-yellow-400 font-mono">{l.duration}</span> layover
              </div>
            </div>
          ))}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
        </div>
      )}
    </div>
  );
}

function FlightCard({ flight, onBook, isStopOpen, onToggleStop, cityMap }) {
  return (
    <div
      className="bg-white rounded-xl shadow-sm hover:shadow-md border border-gray-200 hover:border-[#65B3CF] transition-all duration-300 group"
      style={{ overflow: 'visible' }}
    >
      <div className="p-5">
        <div className="flex flex-col md:flex-row items-center justify-between">
          <div className="flex items-center mb-4 md:mb-0">
            <div className="w-16 h-16 flex items-center justify-center bg-[#F0FAFC] rounded-xl mr-4 overflow-hidden border border-gray-100 group-hover:border-[#B9D0DC] transition-colors">
              <img
                loading="lazy"
                decoding="async"
                src={flight.airline?.logo}
                alt={flight.airline?.name || 'Airline'}
                className="w-12 h-12 object-contain"
                onError={(e) => {
                  e.target.onerror = null;
                  e.target.src = AIRLINE_LOGO_FALLBACK;
                }}
              />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-lg">{flight.airline?.name || 'Unknown Airline'}</h3>
              <div className="text-sm text-gray-500 flex items-center flex-wrap gap-x-2">
                <span className="font-medium text-[#055B75]">{flight.segments?.[0]?.flightNumber || 'N/A'}</span>
                <span className="mx-1">•</span>
                <span>{flight.segments?.[0]?.aircraft || flight.aircraft || 'Unknown Aircraft'}</span>
                {flight.operatingCarrier && flight.operatingCarrier !== flight.airline?.code && (
                  <>
                    <span className="mx-1">•</span>
                    <span className="text-xs text-orange-600">Operated by {flight.operatingAirlineName || flight.operatingCarrier}</span>
                  </>
                )}
              </div>
              {flight.brandedFare && (
                <span className="inline-block mt-1 text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded font-medium">
                  {flight.brandedFareLabel || flight.brandedFare}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col items-end">
            <div className="text-right mb-3">
              <div className="text-xl sm:text-2xl md:text-3xl font-bold text-[#055B75] flex items-center">
                <Price amount={flight.price} showCode={true} />
              </div>
              <div className="text-xs text-gray-500">per passenger</div>
            </div>
            <button
              onClick={() => onBook(flight)}
              className="w-full md:w-auto px-8 py-3 bg-[#055B75] hover:bg-[#034457] text-white rounded-lg font-semibold shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5"
            >
              Book Now
            </button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-gray-600">
          <div>
            <div className="font-medium text-gray-500 mb-1">Departure</div>
            <div className="font-bold text-gray-800 text-lg">{flight.departure?.time || 'N/A'}</div>
            <div className="text-gray-500 mb-1">{flight.departure?.date || 'N/A'}</div>
            <div className="text-xs">
              <span className="font-medium">{flight.departure?.cityName || flight.departure?.airport || 'N/A'}</span>
              {flight.departure?.terminal && (
                <span className="ml-1 text-[#055B75] bg-[#F0FAFC] px-1 rounded">T{flight.departure?.terminal}</span>
              )}
            </div>
          </div>
          <div>
            <div className="font-medium text-gray-500 mb-1">Arrival</div>
            <div className="font-bold text-gray-800 text-lg">{flight.arrival?.time || 'N/A'}</div>
            <div className="text-gray-500 mb-1">{flight.arrival?.date || 'N/A'}</div>
            <div className="text-xs">
              <span className="font-medium">{flight.arrival?.cityName || flight.arrival?.airport || 'N/A'}</span>
              {flight.arrival?.terminal && (
                <span className="ml-1 text-[#055B75] bg-[#F0FAFC] px-1 rounded">T{flight.arrival?.terminal}</span>
              )}
            </div>
          </div>
          <div>
            <div className="font-medium text-gray-500 mb-1">Duration</div>
            <div className="font-bold text-gray-800">
              {flight.duration?.replace('PT', '').replace('H', 'h ').replace('M', 'm') || 'N/A'}
            </div>
            <div className="text-xs mt-1">
              <StopDetails
                flight={flight}
                isStopOpen={isStopOpen}
                onToggleStop={onToggleStop}
                cityMap={cityMap}
              />
            </div>
          </div>
          <div>
            <div className="font-medium text-gray-500 mb-1">Class</div>
            <div className="font-bold text-gray-800">
              {flight.cabin ? flight.cabin.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') : 'Economy'}
            </div>
            <div className="text-xs mt-1">
              {flight.baggage?.checked?.weight ? `${flight.baggage.checked.weight}${flight.baggage.checked.weightUnit}` : 'No checked baggage'}
            </div>
            {flight.numberOfBookableSeats && flight.numberOfBookableSeats <= 9 && (
              <div className="text-xs mt-1 text-red-600 font-medium">
                Only {flight.numberOfBookableSeats} seat{flight.numberOfBookableSeats > 1 ? 's' : ''} left
              </div>
            )}
            {flight.lastTicketingDate && (
              <div className="text-xs mt-0.5 text-gray-400">
                Book by {new Date(flight.lastTicketingDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default React.memo(FlightCard);
