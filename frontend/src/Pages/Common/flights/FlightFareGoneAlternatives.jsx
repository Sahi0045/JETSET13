import React from 'react';
import { ArrowRight, Loader2, RefreshCw } from 'lucide-react';
import Price from '../../../Components/Price';

/**
 * The fares on sale now, shown where the dead one was.
 *
 * A fare can be withdrawn between the search and the payment - the class
 * closes, the airline stops selling it - and checkout finds out when it asks
 * the airline to confirm the seats, which is the last moment before the card
 * is charged. That is the right place to find out. It was the wrong place to
 * end the booking.
 *
 * What happened until now: the page said "this fare is no longer available"
 * and offered one button, back to the search results. Everything typed - every
 * name, date of birth and passport number - was left behind, because the
 * traveller draft is tied to the exact flight. On routes where refusals are
 * common the customer typed it all again, and was refused again.
 *
 * So the alternatives come to the customer instead. Same route, same dates,
 * same travellers, priced for the same group; picking one swaps the flight on
 * the page and keeps every field already filled in.
 */

const Row = ({ flight, onChoose, busy }) => {
  const stops = flight.stops === 0
    ? 'Non-stop'
    : `${flight.stops} ${flight.stops === 1 ? 'stop' : 'stops'}`;

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-gray-100 px-4 py-3 last:border-b-0 sm:px-5">
      <div className="flex min-w-0 flex-1 items-baseline gap-3">
        <span className="font-grotesk text-lg font-bold tabular-nums text-ink sm:text-xl">
          {flight.departure?.time}
        </span>
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-gray-300" aria-hidden="true" />
        <span className="font-grotesk text-lg font-bold tabular-nums text-ink sm:text-xl">
          {flight.arrival?.time}
          {flight.arrival?.date && flight.departure?.date && flight.arrival.date !== flight.departure.date && (
            <sup className="ml-0.5 text-[10px] font-bold text-[#055B75]">+1</sup>
          )}
        </span>
        <span className="min-w-0 truncate text-[13px] text-gray-500">
          {flight.airline} {flight.flightNumber} · {flight.duration} · {stops}
        </span>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <span className="font-grotesk text-[17px] font-bold text-ink">
          <Price amount={flight.price?.amount ?? Number(flight.price?.grandTotal ?? flight.price?.total)} />
        </span>
        <button
          type="button"
          disabled={busy}
          onClick={() => onChoose(flight)}
          className="rounded-full bg-[#055B75] px-4 py-1.5 text-[13px] font-bold text-white transition-colors hover:bg-[#04485c] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Choose
        </button>
      </div>
    </li>
  );
};

function FlightFareGoneAlternatives({ state, onChoose, onSearchAgain }) {
  // No state yet means the search is about to start, not that there is nothing
  // to show: the panel appears the moment the fare is refused, so the customer
  // never sees the dead fare with no way forward.
  const { busy, error, flights, switching } = state ?? { busy: true, error: null, flights: null, switching: false };

  return (
    <section
      aria-live="polite"
      className="mb-6 overflow-hidden rounded-2xl border border-[#E6DFD2] bg-white shadow-[0_18px_40px_-30px_rgba(12,42,51,0.45)]"
    >
      <header className="border-b border-gray-100 px-4 py-3.5 sm:px-5">
        <h3 className="font-grotesk text-[17px] font-bold text-ink">Fares available now</h3>
        <p className="mt-0.5 text-[13px] text-gray-500">
          Same route, same dates, same travellers. Everything you have typed is kept - pick a flight and carry on.
        </p>
      </header>

      {busy && (
        <p className="flex items-center gap-2 px-4 py-6 text-sm text-gray-500 sm:px-5">
          <Loader2 className="h-4 w-4 animate-spin text-[#055B75]" aria-hidden="true" />
          Checking what the airlines are selling now...
        </p>
      )}

      {!busy && error && (
        <div className="px-4 py-5 sm:px-5">
          <p className="text-sm text-gray-600">{error}</p>
          <button
            type="button"
            onClick={onSearchAgain}
            className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-bold text-[#055B75] hover:underline"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Search again
          </button>
        </div>
      )}

      {!busy && !error && flights?.length > 0 && (
        <>
          <ul className="m-0 list-none p-0">
            {flights.map((flight) => (
              <Row key={flight.id ?? flight.flightNumber} flight={flight} onChoose={onChoose} busy={switching} />
            ))}
          </ul>
          <div className="border-t border-gray-100 px-4 py-3 sm:px-5">
            <button
              type="button"
              onClick={onSearchAgain}
              className="text-[13px] font-semibold text-[#055B75] hover:underline"
            >
              See all flights for this search
            </button>
          </div>
        </>
      )}

      {!busy && !error && flights?.length === 0 && (
        <div className="px-4 py-5 sm:px-5">
          <p className="text-sm text-gray-600">
            The airlines have nothing else on this route for these dates right now. Try another date, or search again.
          </p>
          <button
            type="button"
            onClick={onSearchAgain}
            className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-bold text-[#055B75] hover:underline"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Search again
          </button>
        </div>
      )}
    </section>
  );
}

export default React.memo(FlightFareGoneAlternatives);
