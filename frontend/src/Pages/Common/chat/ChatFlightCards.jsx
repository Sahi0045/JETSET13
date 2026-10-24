import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import Price from '../../../Components/Price';
import useCityNames, { airportCodesOf } from '../../../hooks/useCityNames';
import FlightFareOptions from '../flights/FlightFareOptions';
import { pricedForLabel } from '../flights/FlightCard';
import { toDisplayFlights } from '../flights/flightOffers';
import { bookingHandoffState } from '../flights/bookingHandoff';
import { searchFromQuery, searchToQuery } from '../flights/searchQuery';

const stopsLabel = (stops) => (stops === 0 ? 'Nonstop' : `${stops} stop${stops === 1 ? '' : 's'}`);

const cabinLabel = (cabin) => String(cabin || 'ECONOMY')
  .toLowerCase()
  .split('_')
  .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
  .join(' ');

const tripDay = (isoDate) => new Date(`${isoDate}T00:00:00Z`)
  .toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

const travellersLabel = ({ adults = 1, children = 0, infants = 0 }) => [
  plural(adults, 'adult'),
  ...(children ? [`${children} ${children === 1 ? 'child' : 'children'}`] : []),
  ...(infants ? [plural(infants, 'infant')] : []),
].join(', ');

const placeLabel = (code, cityMap) => (cityMap[code] && cityMap[code] !== code ? `${cityMap[code]} (${code})` : code);

const logEvent = (sessionId, event, offerId) => {
  if (!sessionId) return;
  fetch('/api/chat/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, event, ...(offerId ? { offerId } : {}) }),
  }).catch(() => {});
};

function ChatFlightCards({ results, sessionId }) {
  const navigate = useNavigate();
  const [fareFlight, setFareFlight] = useState(null);
  const offers = results?.offers || [];
  const searchData = useMemo(() => searchFromQuery(searchToQuery(results?.search || {})), [results?.search]);
  const cityMap = useCityNames([results?.search?.from, results?.search?.to, ...offers.flatMap(airportCodesOf)].filter(Boolean));
  const flights = useMemo(() => toDisplayFlights(offers, { cityMap }), [offers, cityMap]);
  const foundAt = results?.searchedAt
    ? new Date(results.searchedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : null;

  if (!flights.length || !searchData) return null;

  const book = (flight) => {
    logEvent(sessionId, 'flight_book_clicked', flight.id);
    setFareFlight(flight);
  };

  return (
    <div className="chat-flight-cards flex flex-col gap-2 my-2">
      <div className="text-xs text-[#034457]">
        <p className="font-semibold">{`${placeLabel(searchData.from, cityMap)} → ${placeLabel(searchData.to, cityMap)}`}</p>
        <p>
          {`${tripDay(searchData.departDate)}${searchData.returnDate ? ` – ${tripDay(searchData.returnDate)}` : ''} · ${travellersLabel(searchData)} · ${cabinLabel(searchData.travelClass)}`}
        </p>
      </div>
      {flights.map((flight) => (
        <div key={flight.id} className="rounded-lg border border-[#65B3CF]/50 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <img
                src={flight.airline?.logo}
                alt=""
                className="w-6 h-6 object-contain shrink-0"
                onError={(e) => { e.target.style.visibility = 'hidden'; }}
              />
              <span className="text-sm font-semibold text-[#034457] truncate">{flight.airline?.name}</span>
            </div>
            <span className="text-sm font-bold text-[#055B75] whitespace-nowrap"><Price amount={flight.price} /></span>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 text-xs text-gray-600">
            <span>{`${flight.departure.time} ${flight.departure.airport} → ${flight.arrival.time} ${flight.arrival.airport}`}</span>
            <span className="text-[11px] text-gray-400 text-right">{pricedForLabel(flight.originalOffer)}</span>
          </div>
          {flight.returnLeg && (
            <div className="mt-1 text-xs text-gray-600">
              <span>{`Return ${flight.returnLeg.departure.time} ${flight.returnLeg.departure.airport} → ${flight.returnLeg.arrival.time} ${flight.returnLeg.arrival.airport} · ${stopsLabel(flight.returnLeg.stops)}`}</span>
            </div>
          )}
          <div className="mt-2 flex items-center justify-between gap-2">
            <span className="text-xs text-gray-500">
              {`${flight.duration} · ${stopsLabel(flight.stops)} · ${cabinLabel(flight.cabin || searchData.travelClass)}`}
            </span>
            <button
              type="button"
              onClick={() => book(flight)}
              className="rounded-md bg-[#055B75] px-3 py-1 text-xs font-semibold text-white hover:bg-[#034457]"
            >
              Book
            </button>
          </div>
        </div>
      ))}
      {foundAt && <p className="text-[11px] text-gray-500">{`Prices found at ${foundAt} · confirmed at checkout`}</p>}
      <Link
        to={`/flights/search?${searchToQuery(searchData)}`}
        state={{ searchData }}
        onClick={() => logEvent(sessionId, 'flight_see_all_clicked')}
        className="text-xs font-semibold text-[#0890BC] hover:text-[#055B75]"
      >
        {`See all ${results.total} flights`}
      </Link>
      {fareFlight && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000 }}>
          <FlightFareOptions
            flight={fareFlight}
            onClose={() => setFareFlight(null)}
            onSelect={(chosenFlight, fareCheck) => {
              setFareFlight(null);
              navigate('/flights/booking-confirmation', { state: bookingHandoffState(chosenFlight, searchData, fareCheck) });
            }}
          />
        </div>,
        document.body,
      )}
    </div>
  );
}

export default ChatFlightCards;
