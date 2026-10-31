import React, { useState, useEffect } from 'react';
import { X, ArrowRight, Loader2 } from 'lucide-react';
import Price from '../../../Components/Price';
import apiConfig from '@/config/api';
import { fareCheckFor } from '../../../utils/fareCheckHandoff';
import { fareOf, fareTotalParts, legsOf, tripAirlineNames, tripAirlines } from './flightSort';
import { STATES, alignedFareInclusions } from '../../../../../shared/fareInclusions';
import FareInclusionList, { FareInclusionLegend } from './FareInclusionList';

const prettyFare = (opt) => {
  // "This fare" rather than an invented "Standard" brand.
  const raw = opt.brandedFareLabel || opt.brandedFare || opt.cabin || 'This fare';
  return raw
    .toString()
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

const flightNumberOf = (value) => String(value || '').replace(/^([A-Z0-9]{2})-?\s*(\d+)/, '$1 $2');

const legFlights = (leg) => {
  const numbers = Array.isArray(leg?.segments) && leg.segments.length > 0
    ? leg.segments.map((segment) => segment.flightNumber)
    : [leg?.flightNumber];
  return [...new Set(numbers.filter(Boolean).map(flightNumberOf))].join(', ');
};

const knownAircraft = (leg) => {
  const names = Array.isArray(leg?.segments) && leg.segments.length > 1
    ? leg.segments.map((segment) => segment.aircraft)
    : [leg?.aircraft];
  return [...new Set(names.filter((name) => name && !/^unknown/i.test(name)))].join(', ');
};

const terminalOf = (place) => (place?.terminal ? ` T${place.terminal}` : '');

function FlightFareOptions({ flight, onClose, onSelect }) {
  const [loading, setLoading] = useState(true);
  const [options, setOptions] = useState([]);
  const [error, setError] = useState(null);
  // The fare being checked with the airline, and the ones it would not sell.
  const [checkingKey, setCheckingKey] = useState(null);
  const [withdrawn, setWithdrawn] = useState(() => new Set());

  useEffect(() => {
    if (!flight) return;
    let cancelled = false;
    const controller = new AbortController();

    // Numeric price from either shape: display price ({amount}) or raw Amadeus ({total})
    const priceNum = (p) => parseFloat(p?.amount ?? p?.total ?? p ?? 0) || 0;

    // The fare the user actually clicked. Amadeus' branded-fares upsell often returns
    // ONLY the higher branded families and omits this (usually cheapest) fare, which
    // makes the modal's "cheapest" disagree with the card. So always include it.
    const baseOption = {
      id: 'original',
      price: flight.price,
      cabin: flight.cabin,
      bookingClass: flight.bookingClass,
      brandedFare: flight.brandedFare,
      brandedFareLabel: flight.brandedFareLabel,
      amenities: flight.amenities,
      fareServices: flight.fareServices,
      refundable: flight.refundable,
      baggageDetails: flight.baggage
        ? { checked: flight.baggage.checked, cabin: flight.baggage.cabin }
        : null,
      originalOffer: flight.originalOffer,
      isOriginal: true,
    };

    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(apiConfig.endpoints.flights.upsell, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ flightOffer: flight.originalOffer }),
          signal: controller.signal,
        });
        const data = await res.json();
        if (cancelled) return;
        const basePrice = Math.round(priceNum(flight.price));
        const families = data.data || [];
        // The clicked fare's own family replaces it, named and described by
        // the airline, even when the search priced it differently.
        const clickedIsAFamily = families.some((o) => o.fareBasis && o.fareBasis === flight.fareBasis
          && o.bookingClass === flight.bookingClass);
        const upsell = clickedIsAFamily
          ? families
          : families.filter((o) => Math.round(priceNum(o.price)) !== basePrice);
        const opts = [...(clickedIsAFamily ? [] : [baseOption]), ...upsell]
          .sort((a, b) => priceNum(a.price) - priceNum(b.price));
        setOptions(opts);
      } catch (e) {
        if (cancelled || e.name === 'AbortError') return;
        // Upsell failed — still let the user book the fare they clicked
        setOptions([baseOption]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; controller.abort(); };
  }, [flight]);

  if (!flight) return null;

  /**
   * Ask the airline whether it still sells this fare, before the review page.
   *
   * A fare withdrawn since the search was only found out on the review page,
   * under "The airline can no longer sell this fare", after the customer had
   * chosen it and started on the traveller forms. It is found here instead,
   * and the customer stays on the results. Only that answer stops them: if the
   * check cannot be made, the review page and checkout both check again.
   *
   * It asks for the fare rules too, so the answer is the review page's own
   * arrival check - one Amadeus session that priced the offer and read its
   * rules - and is handed on rather than repeated (utils/fareCheckHandoff.js).
   */
  const stillSold = async (offer) => {
    if (!offer) return { sold: true, fareCheck: null };
    try {
      const res = await fetch(apiConfig.endpoints.flights.price, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flightOffer: offer, withFareRules: true }),
        signal: AbortSignal.timeout(15000),
      });
      const body = await res.json().catch(() => null);
      if (body?.code === 'FARE_UNAVAILABLE') return { sold: false, fareCheck: null };
      return { sold: true, fareCheck: res.ok && body?.success ? fareCheckFor(offer, body) : null };
    } catch {
      return { sold: true, fareCheck: null };
    }
  };

  const keyOf = (opt) => (opt ? String(opt.id ?? opt.originalOffer?.id ?? 'original') : 'original');

  const handleSelect = async (opt) => {
    if (checkingKey) return;
    const key = keyOf(opt);
    setCheckingKey(key);
    const { sold, fareCheck } = await stillSold(opt?.originalOffer || flight.originalOffer);
    setCheckingKey(null);
    if (!sold) {
      setWithdrawn((previous) => new Set(previous).add(key));
      return;
    }
    choose(opt, fareCheck);
  };

  // Merge a chosen fare option onto the base (display) flight, keeping booking data
  const choose = (opt, fareCheck = null) => {
    if (!opt) { onSelect(flight, fareCheck); return; }
    // A fare option is only bookable with its own offer. Falling back to the
    // clicked flight's offer showed one fare's price and booked another fare.
    if (!opt.originalOffer) { onSelect(flight, fareCheck); return; }
    const merged = {
      ...flight,
      price: opt.price || flight.price,
      cabin: opt.cabin || flight.cabin,
      bookingClass: opt.bookingClass || flight.bookingClass,
      brandedFare: opt.brandedFare || flight.brandedFare,
      brandedFareLabel: opt.brandedFareLabel || flight.brandedFareLabel,
      amenities: opt.amenities || flight.amenities,
      fareServices: opt.fareServices || [],
      // Another family's terms are its own: the clicked fare's "non-refundable"
      // sat on Eco Flex, whose airline terms refund it for a fee.
      refundable: typeof opt.refundable === 'boolean' ? opt.refundable : (opt.isOriginal ? flight.refundable : null),
      baggage: opt.baggageDetails
        ? { checked: opt.baggageDetails.checked || flight.baggage?.checked, cabin: opt.baggageDetails.cabin || flight.baggage?.cabin }
        : flight.baggage,
      originalOffer: opt.originalOffer,
    };
    onSelect(merged, fareCheck);
  };

  const flightFare = fareOf(flight);
  const inclusions = alignedFareInclusions(options);
  const cheapest = options.length > 1 ? fareOf(options[0]) : null;
  const statesChange = inclusions.some(({ rows }) => rows.some((row) => row.key === 'change' && row.state !== STATES.UNKNOWN));
  const legs = legsOf(flight);

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div role="dialog" aria-modal="true" aria-labelledby="fare-options-title" className="relative w-full sm:max-w-4xl max-h-[92vh] bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100">
          <div className="flex items-start gap-3 min-w-0">
            <img
              src={flight.airline?.logo}
              alt=""
              className="w-10 h-10 object-contain rounded-md border border-gray-100 flex-shrink-0 mt-0.5"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            <div className="min-w-0 space-y-1.5" data-testid="fare-options-trip">
              <div className="font-bold text-gray-900 text-sm sm:text-base truncate">
                {tripAirlines(flight).length > 1 ? tripAirlineNames(flight) : flight.airline?.name}
              </div>
              {legs.map((leg, index) => (
                <div key={index} className="text-xs text-gray-600 leading-snug">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {legs.length > 1 && (
                      <span className="font-semibold text-gray-400">{flight.returnLeg ? (index === 0 ? 'Onward' : 'Return') : `Flight ${index + 1}`}</span>
                    )}
                    {leg.departure?.date && <span className="font-semibold text-gray-700">{leg.departure.date}</span>}
                    <span className="font-medium text-gray-800">{leg.departure?.airport}{terminalOf(leg.departure)} {leg.departure?.time}</span>
                    <ArrowRight className="h-3 w-3" aria-hidden="true" />
                    <span className="font-medium text-gray-800">{leg.arrival?.airport}{terminalOf(leg.arrival)} {leg.arrival?.time}</span>
                  </div>
                  <div className="text-gray-500">
                    {[
                      leg.duration,
                      leg.stops === 0 ? 'Non stop' : `${leg.stops} stop${leg.stops > 1 ? 's' : ''}`,
                      legFlights(leg),
                      knownAircraft(leg),
                    ].filter(Boolean).join(' · ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 flex-shrink-0">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-5 py-4 overflow-y-auto">
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <h3 id="fare-options-title" className="text-base font-bold text-gray-900">Choose your fare</h3>
            {!loading && options.length > 1 && (
              <span className="text-xs text-gray-500">{options.length} fares · same flight, different rules</span>
            )}
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <Loader2 className="h-7 w-7 animate-spin text-[#055B75] mb-3" />
              <p className="text-sm">Fetching fare options…</p>
            </div>
          ) : options.length > 0 ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {options.map((opt, i) => {
                  const fare = fareOf(opt);
                  const { rows, extras } = inclusions[i];
                  const dearer = cheapest && i > 0 && Number.isFinite(fare.amount) && Number.isFinite(cheapest.amount) && fare.amount > cheapest.amount;
                  return (
                    <div
                      key={opt.id ?? i}
                      data-testid="fare-option"
                      className={`flex flex-col rounded-xl border p-4 transition-all hover:shadow-md ${i === 0 ? 'border-[#055B75] ring-1 ring-[#055B75]/20' : 'border-gray-200'}`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-sm font-bold text-gray-900">{prettyFare(opt)}</span>
                        {/* Cheapest of several. On the one fare there was, the
                            badge compared it with nothing. */}
                        {i === 0 && options.length > 1 && <span className="text-[10px] font-bold text-white bg-[#055B75] px-2 py-0.5 rounded-full">CHEAPEST</span>}
                      </div>
                      <div className="mb-3">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-xl font-bold text-[#055B75] leading-tight"><Price amount={fare} /></span>
                          {dearer && (
                            <span className="text-xs font-semibold text-gray-500">
                              +<Price amount={[{ amount: fare.amount, currency: fare.currency, times: 1 }, { amount: cheapest.amount, currency: cheapest.currency, times: -1 }]} />
                            </span>
                          )}
                        </div>
                        {fare.unit && fare.travellers > 1 && (
                          <div className="text-[11px] text-gray-500">
                            per {fare.unit} · <Price amount={fareTotalParts(opt)} /> for {fare.travellers} travellers
                          </div>
                        )}
                      </div>

                      <div className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1.5">Included in this fare</div>
                      <FareInclusionList rows={rows} extras={extras} className="space-y-1.5 text-xs flex-1" />

                      {withdrawn.has(keyOf(opt)) ? (
                        <p className="mt-3 text-xs font-semibold text-amber-700" role="status">
                          The airline has just stopped selling this fare. Choose another fare or flight.
                        </p>
                      ) : (
                        <button
                          onClick={() => handleSelect(opt)}
                          disabled={Boolean(checkingKey)}
                          className="mt-4 w-full py-2.5 rounded-lg bg-[#055B75] hover:bg-[#034457] disabled:opacity-60 text-white text-sm font-bold transition-colors inline-flex items-center justify-center gap-2"
                        >
                          {checkingKey === keyOf(opt) ? (<><Loader2 className="h-4 w-4 animate-spin" /> CHECKING…</>) : 'BOOK'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-4"><FareInclusionLegend /></div>
              <ul className="mt-2 space-y-0.5 text-[11px] text-gray-500 list-disc pl-4">
                <li>The exact fees for cancelling or changing are in the fare rules on the next page, before you pay.</li>
                {statesChange && <li>On a date change you also pay any difference in fare.</li>}
                <li>Platform fee shown at checkout.</li>
              </ul>
            </>
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-gray-500 mb-4">{error || 'No alternate fares available.'}</p>
              {withdrawn.has(keyOf(null)) ? (
                <p className="text-sm font-semibold text-amber-700" role="status">
                  The airline has just stopped selling this fare. Choose another flight.
                </p>
              ) : (
                <button
                  onClick={() => handleSelect(null)}
                  disabled={Boolean(checkingKey)}
                  className="px-6 py-2.5 rounded-lg bg-[#055B75] hover:bg-[#034457] disabled:opacity-60 text-white text-sm font-bold transition-colors inline-flex items-center gap-2"
                >
                  {checkingKey ? (<><Loader2 className="h-4 w-4 animate-spin" /> Checking…</>) : (<>Continue with this fare <span className="font-normal"><Price amount={flightFare} />{flightFare.unit && flightFare.travellers > 1 ? ` per ${flightFare.unit}` : ''}</span></>)}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default FlightFareOptions;
