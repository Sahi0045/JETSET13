import React, { useState } from 'react';
import {
  Plane, Clock, ChevronDown, Luggage, ShieldCheck, Dot,
  Wifi, Utensils, Armchair, Tv, Sparkles, Ticket, Briefcase,
  RefreshCw, Check, Info, X,
} from 'lucide-react';
import Price from '../../../Components/Price';
import { formatCheckedBag } from '../../../utils/baggage';
import { formatCalendarDate } from '../../../utils/dateUtils';
import { arrivalDayOffset, layoverLabel, layoversOf, legDateLabel, seatsLeftLabel } from './searchResults';

const AIRLINE_LOGO_FALLBACK = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiByeD0iOCIgZmlsbD0iIzM3NzNmNCIvPgo8dGV4dCB4PSIyMCIgeT0iMjgiIGZvbnQtZmFtaWx5PSJBcmlhbCIgZm9udC1zaXplPSIxOCIgZmlsbD0id2hpdGUiIHRleHQtYW5jaG9yPSJtaWRkbGUiPuKciO+4jzwvdGV4dD4KPHN2Zz4K';

// "PT2H35M" -> "02h 35m"
function formatDuration(durationStr) {
  if (!durationStr) return 'N/A';
  const h = durationStr.match(/(\d+)H/);
  const m = durationStr.match(/(\d+)M/);
  const hours = h ? parseInt(h[1], 10) : 0;
  const mins = m ? parseInt(m[1], 10) : 0;
  if (!h && !m) return durationStr;
  return `${String(hours).padStart(2, '0')}h ${String(mins).padStart(2, '0')}m`;
}

// Map Amadeus amenityType -> icon
const AMENITY_ICON = {
  BAGGAGE: Luggage,
  CHECKED_BAGS: Luggage,
  CARRY_ON_BAGGAGE: Briefcase,
  MEAL: Utensils,
  PRE_RESERVED_SEAT: Armchair,
  SEAT: Armchair,
  ENTERTAINMENT: Tv,
  WIFI: Wifi,
  UPGRADES: Sparkles,
  BRANDED_FARES: Ticket,
  TRAVEL_SERVICES: Briefcase,
};

// Shorten verbose Amadeus amenity descriptions to a friendly label
function amenityLabel(a) {
  const d = (a.description || '').toUpperCase();
  if (d.includes('BAGGAGE') || d.includes('BAG')) return 'Checked baggage';
  if (d.includes('MEAL') || d.includes('FOOD') || d.includes('SNACK')) return 'Meal';
  if (d.includes('SEAT')) return 'Seat selection';
  if (d.includes('REFUND')) return 'Refundable';
  if (d.includes('CHANGE')) return 'Date change';
  if (d.includes('UPGRADE')) return 'Upgrade';
  if (d.includes('WIFI') || d.includes('WI-FI')) return 'Wi-Fi';
  if (d.includes('ENTERTAIN')) return 'Entertainment';
  if (d.includes('LOUNGE')) return 'Lounge';
  if (d.includes('PRIORITY') || d.includes('FAST')) return 'Priority';
  // Title-case fallback
  return (a.description || 'Included')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function amenityIcon(a) {
  return AMENITY_ICON[a.amenityType] || (amenityLabel(a) === 'Date change' ? RefreshCw : Check);
}

function StopsLabel({ leg, cityMap = {} }) {
  // A pill rather than a word: stops are what people scan a results list for,
  // and non-stop should look different from a connection at a glance.
  if (!leg.stops || leg.stops === 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-700">
        Non-stop
      </span>
    );
  }
  // Where it stops and how long it waits, worked out from the segments. The
  // label fell back to a bare airport code, or to nothing at all.
  const computed = layoversOf(leg.segments, cityMap);
  const fromDetails = (leg.stopDetails || []).map((l) => ({ airport: l.airport, city: cityMap[l.airport] || l.airport, minutes: null, text: l.duration }));
  const layovers = computed.length ? computed : fromDetails;

  const one = layovers.length === 1 ? layovers[0] : null;
  const wait = one ? (layoverLabel(one.minutes) || one.text || '') : '';

  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">
      <span className="whitespace-nowrap">{leg.stops} {leg.stops === 1 ? 'stop' : 'stops'} ·</span>
      {one ? (
        <span className="truncate font-semibold text-amber-800/90">
          {one.city}{wait ? ` · ${wait} wait` : ''}
        </span>
      ) : layovers.length > 1 ? (
        <span className="truncate font-semibold text-amber-800/90">
          {layovers.map((l) => l.airport).filter(Boolean).join(', ')}
        </span>
      ) : null}
    </span>
  );
}

// One leg's timeline: departure — duration/stops — arrival
// Airlines flying this leg for another: every segment whose operator is not
// the airline selling it. The card named the operator of the first flight only.
const operatorsOf = (segments = []) => [...new Set(segments
  .filter((seg) => seg?.operatingCarrier && seg.operatingCarrier !== seg.airline?.code)
  .map((seg) => seg.operatingAirlineName || seg.operatingCarrier))];

function Leg({ leg, label, operators = [], cityMap = {} }) {
  const dayOffset = arrivalDayOffset(leg.departure?.rawDate, leg.arrival?.rawDate);
  return (
    <div>
      {label && <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">{label}</div>}
      {operators.length > 0 && (
        <div className="text-[10px] text-amber-600 mb-1">Operated by {operators.join(', ')}</div>
      )}
      <div className="flex items-center justify-between gap-2 sm:gap-4">
        {/* Departure */}
        <div className="text-left">
          <div className="font-grotesk text-2xl sm:text-[28px] font-semibold text-ink leading-none tracking-tight">{leg.departure?.time || 'N/A'}</div>
          <div className="text-[11px] text-gray-500 mt-1">{legDateLabel(leg.departure?.rawDate)}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            <span className="font-semibold text-gray-700">{leg.departure?.airport}</span>
            {leg.departure?.terminal && <span className="ml-1 text-[10px]">T{leg.departure.terminal}</span>}
          </div>
          <div className="text-[11px] text-gray-400 truncate max-w-[90px]">{leg.departure?.cityName || ''}</div>
        </div>

        {/* Middle */}
        <div className="flex-1 flex flex-col items-center px-1">
          <div className="text-[13px] font-bold text-ink mb-1.5 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-gray-400" />
            {formatDuration(leg.duration)}
          </div>
          <div className="w-full flex items-center gap-1">
            <span className="h-2 w-2 rounded-full border-2 border-gray-300 flex-shrink-0" />
            <span className="flex-1 h-px bg-gray-300 relative">
              {leg.stops > 0 && Array.from({ length: Math.min(leg.stops, 3) }).map((_, i, all) => (
                <span
                  key={i}
                  style={{ left: `${((i + 1) / (all.length + 1)) * 100}%` }}
                  className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 h-2 w-2 rounded-full border-2 border-white bg-amber-500"
                />
              ))}
            </span>
            <Plane className="h-3 w-3 text-gray-400 rotate-90 flex-shrink-0" />
          </div>
          <div className="mt-2 flex justify-center text-center"><StopsLabel leg={leg} cityMap={cityMap} /></div>
        </div>

        {/* Arrival */}
        <div className="text-right">
          <div className="font-grotesk text-2xl sm:text-[28px] font-semibold text-ink leading-none tracking-tight">
            {leg.arrival?.time || 'N/A'}
            {dayOffset && (
              <sup className="ml-0.5 text-[10px] font-semibold text-amber-600" title="Arrives on a different day">{dayOffset}</sup>
            )}
          </div>
          <div className="text-[11px] text-gray-500 mt-1">{legDateLabel(leg.arrival?.rawDate)}</div>
          <div className="text-xs text-gray-500 mt-0.5">
            <span className="font-semibold text-gray-700">{leg.arrival?.airport}</span>
            {leg.arrival?.terminal && <span className="ml-1 text-[10px]">T{leg.arrival.terminal}</span>}
          </div>
          <div className="text-[11px] text-gray-400 truncate max-w-[90px] ml-auto">{leg.arrival?.cityName || ''}</div>
        </div>
      </div>
    </div>
  );
}

// Per-segment detail rows for one leg (used in the expanded view)
function SegmentList({ segments = [], stopDetails = [], cityMap = {} }) {
  // The wait after flight idx is the idx-th connection. stopDetails also holds
  // each flight's technical stops (the plane lands on the way), ahead of the
  // connection that follows it, so reading it by position put Indore's 35
  // minutes on the ground under "Layover at Mumbai".
  const connections = (stopDetails || []).filter((stop) => !stop?.technical);
  return (
    <div className="space-y-4">
      {segments.map((seg, idx) => (
        <React.Fragment key={idx}>
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 flex items-center justify-center bg-[#F0FAFC] rounded-md overflow-hidden flex-shrink-0">
              <img
                loading="lazy"
                decoding="async"
                src={seg.airline?.logo}
                alt={seg.airline?.name || 'Airline'}
                className="w-6 h-6 object-contain"
                onError={(e) => { e.target.onerror = null; e.target.src = AIRLINE_LOGO_FALLBACK; }}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs text-gray-500 mb-1">
                <span className="font-semibold text-gray-700">{seg.airline?.name || seg.airline?.code}</span>
                <span className="mx-1">·</span>
                <span>{seg.flightNumber}</span>
                {seg.operatingCarrier && seg.operatingCarrier !== seg.airline?.code && (
                  <span className="text-amber-600"> · Operated by {seg.operatingAirlineName || seg.operatingCarrier}</span>
                )}
                {seg.aircraft && seg.aircraft !== 'Unknown Aircraft' && (
                  <>
                    <span className="mx-1">·</span>
                    <span>{seg.aircraft}</span>
                  </>
                )}
              </div>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-sm">
                <div>
                  <div className="font-bold text-gray-900">{seg.departure?.time}</div>
                  <div className="text-xs text-gray-500">
                    {cityMap[seg.departure?.airport] || seg.departure?.cityName || seg.departure?.airport}
                    {seg.departure?.terminal && <span className="ml-1">T{seg.departure.terminal}</span>}
                  </div>
                </div>
                <div className="text-center text-[11px] text-gray-400">
                  <Clock className="h-3 w-3 inline mb-0.5" /> {formatDuration(seg.duration)}
                </div>
                <div className="text-right">
                  <div className="font-bold text-gray-900">{seg.arrival?.time}</div>
                  <div className="text-xs text-gray-500">
                    {cityMap[seg.arrival?.airport] || seg.arrival?.cityName || seg.arrival?.airport}
                    {seg.arrival?.terminal && <span className="ml-1">T{seg.arrival.terminal}</span>}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {idx < segments.length - 1 && (
            <div className="ml-11 py-2 px-3 bg-amber-50 border border-amber-100 rounded-md text-[11px] text-amber-700 font-medium">
              Layover at {cityMap[seg.arrival?.airport] || seg.arrival?.airport}
              {connections[idx]?.duration && (
                <span className="ml-1 text-amber-600">· {connections[idx].duration}</span>
              )}
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// What the price on the card covers. The airline's total is for every traveller
// the search priced; a two-adult total was labelled "per adult", so the
// customer read half the real price per person.
//
// And the price is the airline's fare: the service fee is added on the review
// page, so the card says so rather than sit under "No hidden fees".
const pricedForLabel = (offer) => {
  const travellers = offer?.travelerPricings?.length || 0;
  if (travellers > 1) return `for ${travellers} travellers + service fee`;
  if (travellers === 1) return 'for 1 traveller + service fee';
  return 'fare + service fee';
};

function FlightCard({ flight, onBook, onViewPrices, priceStats, cityMap = {} }) {
  const [expanded, setExpanded] = useState(false);
  const [showBreakup, setShowBreakup] = useState(false);
  const handleCta = () => (onViewPrices ? onViewPrices(flight) : onBook?.(flight));

  // Deal badge derived from the current result-set price distribution
  const myPrice = flight.price?.amount;
  let deal = null;
  if (priceStats && typeof myPrice === 'number') {
    if (myPrice <= priceStats.min * 1.02) deal = { label: 'Cheapest', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
    else if (myPrice <= priceStats.median) deal = { label: 'Good price', cls: 'bg-sky-100 text-sky-700 border-sky-200' };
  }

  const segments = flight.segments || [];
  // Weight OR pieces — reading only `.weight` showed a piece-based fare as
  // "Cabin only" while the review page said "1 Piece" one click later.
  const checkedBag = formatCheckedBag(flight.baggage?.checked);
  // Whether the fare said anything about checked bags at all. "Cabin only"
  // is a claim; with no data the honest answer is "see fare rules".
  const bagKnown = flight.baggage?.checked != null;
  const cabinBag = flight.baggage?.cabin?.weight;
  // No cabin data means no cabin label, not "Economy".
  const cabinClass = flight.cabin
    ? flight.cabin.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
    : null;
  const refundLabel = flight.refundable === true ? 'Refundable' : flight.refundable === false ? 'Non-refundable' : 'Refunds: see fare rules';
  const seatsLeft = seatsLeftLabel(flight.numberOfBookableSeats);

  const amenities = Array.isArray(flight.amenities) ? flight.amenities : [];
  const freeAmenities = amenities.filter(a => a && a.isChargeable === false);

  // Fare breakup figures (in the offer's source currency; <Price> converts for display)
  const currency = flight.price?.currency || 'USD';
  const baseFare = parseFloat(flight.price?.base) || 0;
  const totalFare = parseFloat(flight.price?.total || flight.price?.grandTotal || flight.price?.amount) || 0;
  const taxesAndFees = Math.max(0, totalFare - baseFare);

  return (
    <div className="bg-white border-b border-gray-100 last:border-b-0 hover:bg-[#FAFBFB] transition-colors duration-200">
      {/* ===== Main row ===== */}
      <div className="p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center gap-4">

          {/* Airline */}
          <div className="flex items-center gap-3 lg:w-[200px] lg:flex-shrink-0">
            <div className="w-10 h-10 flex items-center justify-center bg-white rounded-lg overflow-hidden border border-gray-100 flex-shrink-0">
              <img
                loading="lazy"
                decoding="async"
                src={flight.airline?.logo}
                alt={flight.airline?.name || 'Airline'}
                className="w-8 h-8 object-contain"
                onError={(e) => { e.target.onerror = null; e.target.src = AIRLINE_LOGO_FALLBACK; }}
              />
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-gray-900 text-sm leading-tight truncate">
                {flight.airline?.name || 'Unknown Airline'}
              </h3>
              <div className="text-xs text-gray-400 truncate">
                {flight.segments?.[0]?.flightNumber || flight.flightNumber || ''}
              </div>
              {flight.operatingCarrier && flight.operatingCarrier !== flight.airline?.code && (
                <div className="text-[10px] text-amber-600 truncate">
                  Operated by {flight.operatingAirlineName || flight.operatingCarrier}
                </div>
              )}
              {deal && (
                <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${deal.cls}`}>
                  {deal.label}
                </span>
              )}
            </div>
          </div>

          {/* Timeline(s): one leg for one-way, two for round trip */}
          {flight.returnLeg ? (
            <div className="flex-1 space-y-3">
              <Leg
                leg={{ departure: flight.departure, arrival: flight.arrival, duration: flight.duration, stops: flight.stops, stopDetails: flight.stopDetails, segments: flight.segments }}
                label="Onward"
                cityMap={cityMap}
              />
              <div className="border-t border-dashed border-gray-200" />
              <Leg leg={flight.returnLeg} label="Return" operators={operatorsOf(flight.returnLeg.segments)} cityMap={cityMap} />
            </div>
          ) : (
            <div className="flex-1">
              <Leg
                leg={{ departure: flight.departure, arrival: flight.arrival, duration: flight.duration, stops: flight.stops, stopDetails: flight.stopDetails, segments: flight.segments }}
                cityMap={cityMap}
              />
            </div>
          )}

          {/* Price + CTA */}
          <div className="flex flex-row lg:flex-col items-center lg:items-end justify-between lg:justify-center gap-3 lg:gap-2 lg:w-[180px] lg:flex-shrink-0 lg:border-l lg:border-gray-100 lg:pl-5">
            <div className="text-left lg:text-right relative">
              <div className="font-grotesk text-[26px] font-bold text-ink leading-none tracking-tight">
                <Price amount={flight.price} />
              </div>
              <div className="text-[11px] text-gray-400 mt-1">{pricedForLabel(flight.originalOffer)}</div>
              {baseFare > 0 && (
                <button
                  onClick={() => setShowBreakup(v => !v)}
                  className="text-[11px] text-[#055B75] hover:underline inline-flex items-center gap-0.5 mt-0.5"
                >
                  <Info className="h-3 w-3" /> Fare breakup
                </button>
              )}

              {/* Fare breakup popover */}
              {showBreakup && baseFare > 0 && (
                <div className="absolute right-0 bottom-full mb-2 z-30 w-56 bg-white rounded-lg shadow-xl border border-gray-200 p-3 text-left animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-gray-700">Fare Breakup</span>
                    <button onClick={() => setShowBreakup(false)} className="text-gray-400 hover:text-gray-600">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between text-gray-600">
                      <span>Base fare</span>
                      <span className="font-medium text-gray-800"><Price amount={{ amount: baseFare, currency }} /></span>
                    </div>
                    <div className="flex justify-between text-gray-600">
                      <span>Taxes &amp; fees</span>
                      <span className="font-medium text-gray-800"><Price amount={{ amount: taxesAndFees, currency }} /></span>
                    </div>
                    <div className="flex justify-between border-t border-gray-100 pt-1.5 mt-1.5">
                      <span className="font-bold text-gray-800">Total</span>
                      <span className="font-bold text-[#055B75]"><Price amount={{ amount: totalFare, currency }} /></span>
                    </div>
                  </div>
                  {/* The airline's total covers every traveller on the search;
                      it was labelled "Per adult". */}
                  <div className="text-[10px] text-gray-400 mt-2">Total for all travellers{cabinClass ? ` · ${cabinClass}` : ''}</div>
                </div>
              )}
            </div>
            <button
              onClick={handleCta}
              className="px-7 py-3 bg-[#055B75] hover:bg-[#034457] text-white rounded-full text-sm font-bold tracking-wide shadow-sm hover:shadow-md transition-all whitespace-nowrap"
            >
              Select flight
            </button>
          </div>
        </div>

        {/* Included amenities (free perks) */}
        {freeAmenities.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {freeAmenities.slice(0, 4).map((a, i) => {
              const Icon = amenityIcon(a);
              return (
                <span
                  key={i}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-medium border border-emerald-100"
                >
                  <Icon className="h-3 w-3" />
                  {amenityLabel(a)}
                </span>
              );
            })}
            {freeAmenities.length > 4 && (
              <span className="text-[11px] text-gray-400">+{freeAmenities.length - 4} more</span>
            )}
          </div>
        )}
      </div>

      {/* ===== Footer strip ===== */}
      <div className="flex items-center justify-between gap-2 px-4 sm:px-5 py-2.5 border-t border-gray-100 bg-[#FCFBF8]">
        <div className="flex items-center gap-3 sm:gap-4 text-[11px] text-gray-500 flex-wrap min-w-0">
          <span className="inline-flex items-center gap-1">
            <Luggage className="h-3.5 w-3.5 text-gray-400" />
            {checkedBag ? `${checkedBag} check-in` : bagKnown ? 'No checked bag' : 'Baggage: see fare rules'}
          </span>
          {cabinBag ? (
            <span className="inline-flex items-center gap-1">
              <Briefcase className="h-3.5 w-3.5 text-gray-400" />
              {cabinBag}{flight.baggage?.cabin?.weightUnit || 'KG'} cabin
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className={`h-3.5 w-3.5 ${flight.refundable === true ? 'text-emerald-500' : 'text-gray-400'}`} />
            {refundLabel}
          </span>
          {cabinClass && (
            <span className="hidden sm:inline-flex items-center gap-1">
              <Dot className="h-3.5 w-3.5 text-gray-400 -mx-1" />
              {cabinClass}
            </span>
          )}
          {seatsLeft && (
            <span className={seatsLeft.urgent ? 'text-red-600 font-medium' : 'text-gray-500'}>{seatsLeft.text}</span>
          )}
        </div>
        <button
          onClick={() => setExpanded(v => !v)}
          className="inline-flex items-center gap-1 text-xs font-semibold text-[#055B75] hover:text-[#034457] flex-shrink-0"
        >
          {expanded ? 'Hide' : 'Flight'} Details
          <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {/* ===== Expanded details ===== */}
      {expanded && (
        <div className="px-4 sm:px-5 py-4 border-t border-gray-100 bg-white rounded-b-xl">
          {flight.returnLeg && (
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Onward</div>
          )}
          <SegmentList segments={segments} stopDetails={flight.stopDetails} cityMap={cityMap} />

          {flight.returnLeg && (
            <>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mt-4 mb-2 pt-3 border-t border-dashed border-gray-200">Return</div>
              <SegmentList segments={flight.returnLeg.segments} stopDetails={flight.returnLeg.stopDetails} cityMap={cityMap} />
            </>
          )}

          {/* Amenities (full list, free + paid) */}
          {amenities.length > 0 && (
            <div className="mt-4 pt-3 border-t border-gray-100">
              <div className="text-xs font-bold text-gray-700 mb-2">What's included</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
                {amenities.map((a, i) => {
                  const Icon = amenityIcon(a);
                  const free = a.isChargeable === false;
                  return (
                    <div key={i} className="flex items-center gap-1.5 text-xs">
                      <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${free ? 'text-emerald-500' : 'text-gray-400'}`} />
                      <span className={free ? 'text-gray-700' : 'text-gray-400'}>
                        {amenityLabel(a)}
                      </span>
                      <span className={`text-[10px] ${free ? 'text-emerald-600' : 'text-gray-400'}`}>
                        {free ? 'Free' : 'Paid'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Fare / baggage summary */}
          <div className="mt-4 pt-3 border-t border-gray-100 flex flex-wrap gap-x-6 gap-y-2 text-xs text-gray-600">
            {(cabinClass || flight.bookingClass) && (
              <span><span className="text-gray-400">Class:</span> <span className="font-medium">{cabinClass || ''}{flight.bookingClass ? ` (${flight.bookingClass})` : ''}</span></span>
            )}
            <span>
              <span className="text-gray-400">Check-in:</span>{' '}
              <span className="font-medium">{checkedBag || (bagKnown ? 'Not included' : 'See fare rules')}</span>
            </span>
            {cabinBag ? (
              <span>
                <span className="text-gray-400">Cabin:</span>{' '}
                <span className="font-medium">{cabinBag}{flight.baggage?.cabin?.weightUnit || 'KG'}</span>
              </span>
            ) : null}
            {flight.brandedFare && (
              <span><span className="text-gray-400">Fare:</span> <span className="font-medium">{flight.brandedFareLabel || flight.brandedFare}</span></span>
            )}
            {flight.validatingAirlineCodes?.length > 0 && (
              <span><span className="text-gray-400">Issued by:</span> <span className="font-medium">{flight.validatingAirlineCodes.join(', ')}</span></span>
            )}
            {/* A calendar day (LAST TKT DTE "18SEP26" -> "2026-09-18"). Read
                with `new Date(...)` it was UTC midnight, the evening before in
                every American zone: a US customer was told to book a day
                early, and on the deadline day saw a date already past. */}
            {flight.lastTicketingDate && (
              <span>
                <span className="text-gray-400">Book by:</span>{' '}
                <span className="font-medium">{formatCalendarDate(flight.lastTicketingDate, { month: 'short', day: 'numeric' })}</span>
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default React.memo(FlightCard);
