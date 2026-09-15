import React from 'react';
import { formatCalendarDate, formatIsoDuration } from '../../../utils/dateUtils';
import { clockTime, layoverBetween, legLabel } from '../../../../../shared/bookingItineraries';

/**
 * Every leg of a booked trip and every flight in it: flight number, times,
 * dates and terminals, with the wait at each connection.
 *
 * The pages after payment showed the outbound leg only, and of that only its
 * first flight number beside its last arrival: a round trip's return flight
 * appeared nowhere, and a connection looked like one non-stop flight.
 *
 * `legs` come from shared/bookingItineraries.js (bookingItineraries).
 *
 * @param {object} props
 * @param {object[]} props.legs
 * @param {'full'|'compact'} [props.variant] full for the confirmation page, Manage
 *   Booking and the travel document; compact for a My Trips card
 * @param {Intl.DateTimeFormatOptions} [props.dateOptions] how dates are printed
 * @param {string} [props.className]
 */
const DEFAULT_DATE = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };

const stopsText = (stops) => (stops === 0 ? 'Non-stop' : `${stops} stop${stops === 1 ? '' : 's'}`);

export default function BookingItinerary({ legs, variant = 'full', dateOptions = DEFAULT_DATE, className = '' }) {
  if (!Array.isArray(legs) || legs.length === 0) return null;
  const count = legs.length;

  if (variant === 'compact') {
    return (
      <div className={`space-y-2 ${className}`}>
        {legs.map((leg, index) => (
          <div key={`${leg.origin}-${leg.destination}-${index}`} className="bg-white rounded-lg p-2.5 border border-[#D1E9F0] min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#0890BC] mb-1">
              {[
                legLabel(leg, index, count),
                formatCalendarDate(leg.departureDate, { weekday: 'short', month: 'short', day: 'numeric' }),
                formatIsoDuration(leg.duration),
                stopsText(leg.stops),
              ].filter(Boolean).join(' · ')}
            </p>
            <ul className="space-y-1">
              {leg.segments.map((segment, i) => (
                <li key={i} className="text-[13px] sm:text-sm text-gray-900 break-words">
                  <span className="font-bold">{segment.flightNumber || 'Flight'}</span>{' '}
                  {segment.origin}{segment.departureTerminal ? ` T${segment.departureTerminal}` : ''} {clockTime(segment.departureTime)}
                  {' → '}
                  {segment.destination}{segment.arrivalTerminal ? ` T${segment.arrivalTerminal}` : ''} {clockTime(segment.arrivalTime)}
                  {segment.arrivalDate && segment.departureDate && segment.arrivalDate !== segment.departureDate && (
                    <span className="text-gray-500"> ({formatCalendarDate(segment.arrivalDate, { month: 'short', day: 'numeric' })})</span>
                  )}
                </li>
              ))}
            </ul>
            {leg.partial && (
              <p className="text-xs text-gray-500 mt-1">Connecting flights were not saved with this booking.</p>
            )}
          </div>
        ))}
      </div>
    );
  }

  const End = ({ label, time, code, date, terminal, align }) => (
    <div className={`min-w-0 ${align === 'right' ? 'text-right' : ''}`}>
      <p className="text-[11px] uppercase tracking-wider text-gray-400">{label}</p>
      <p className="text-lg sm:text-xl font-bold text-gray-900 leading-tight">{clockTime(time) || '--:--'}</p>
      <p className="text-sm font-semibold text-[#055B75]">{code}</p>
      <p className="text-xs text-gray-500">{formatCalendarDate(date, dateOptions, 'Date not recorded')}</p>
      {terminal && <p className="text-xs text-gray-500">Terminal {terminal}</p>}
    </div>
  );

  return (
    <div className={`space-y-4 ${className}`}>
      {legs.map((leg, index) => (
        <section key={`${leg.origin}-${leg.destination}-${index}`} className="rounded-xl border border-gray-200 overflow-hidden bg-white">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 bg-gray-50 px-4 py-2.5 border-b border-gray-200">
            <p className="text-sm font-bold text-gray-800">
              {legLabel(leg, index, count)}: {leg.origin} → {leg.destination}
            </p>
            <p className="text-xs text-gray-500">
              {[formatCalendarDate(leg.departureDate, dateOptions), formatIsoDuration(leg.duration), stopsText(leg.stops)].filter(Boolean).join(' · ')}
            </p>
          </div>
          <ol className="divide-y divide-gray-100">
            {leg.segments.map((segment, i) => {
              const wait = i > 0 ? layoverBetween(leg.segments[i - 1], segment) : '';
              return (
                <li key={i} className="px-4 py-3">
                  {i > 0 && (
                    <p className="text-xs font-medium text-amber-700 mb-2">
                      Connection in {segment.origin}{wait ? ` · ${wait} between flights` : ''}
                    </p>
                  )}
                  <p className="flex flex-wrap gap-x-2 text-xs text-gray-500 mb-2">
                    <span className="font-semibold text-gray-800">{segment.flightNumber || 'Flight number not recorded'}</span>
                    {segment.operatingCarrier && <span>Operated by {segment.operatingCarrier}</span>}
                    {segment.cabin && <span className="capitalize">{segment.cabin.toLowerCase().replace(/_/g, ' ')}</span>}
                    {segment.aircraft && <span>Aircraft {segment.aircraft}</span>}
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <End label="Departs" time={segment.departureTime} code={segment.origin} date={segment.departureDate} terminal={segment.departureTerminal} />
                    <End label="Arrives" time={segment.arrivalTime} code={segment.destination} date={segment.arrivalDate} terminal={segment.arrivalTerminal} align="right" />
                  </div>
                </li>
              );
            })}
          </ol>
          {leg.partial && (
            <p className="px-4 py-2 text-xs text-gray-500 border-t border-gray-100">
              This flight has {stopsText(leg.stops).toLowerCase()}, but its connecting flights were not saved with the booking. Call (877) 538-7380 for the full itinerary.
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
