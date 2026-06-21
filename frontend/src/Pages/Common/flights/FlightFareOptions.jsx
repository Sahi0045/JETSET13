import React, { useState, useEffect } from 'react';
import { X, Check, Luggage, Briefcase, ShieldCheck, ArrowRight, Loader2 } from 'lucide-react';
import Price from '../../../Components/Price';
import apiConfig from '@/config/api';

const prettyFare = (opt) => {
  const raw = opt.brandedFareLabel || opt.brandedFare || opt.cabin || 'Standard';
  return raw
    .toString()
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

const freeAmenityLabels = (opt) => {
  const list = Array.isArray(opt.amenities) ? opt.amenities : [];
  return list
    .filter((a) => a && a.isChargeable === false)
    .map((a) => {
      const d = (a.description || '').toUpperCase();
      if (d.includes('BAG')) return 'Checked baggage';
      if (d.includes('MEAL') || d.includes('SNACK')) return 'Meal';
      if (d.includes('SEAT')) return 'Seat selection';
      if (d.includes('REFUND')) return 'Refundable';
      if (d.includes('CHANGE')) return 'Date change';
      if (d.includes('WIFI')) return 'Wi-Fi';
      return (a.description || '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
    });
};

function FlightFareOptions({ flight, onClose, onSelect }) {
  const [loading, setLoading] = useState(true);
  const [options, setOptions] = useState([]);
  const [error, setError] = useState(null);

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
        // Keep the clicked fare first, then upsell options — minus any duplicate of it
        const upsell = (data.data || []).filter((o) => Math.round(priceNum(o.price)) !== basePrice);
        const opts = [baseOption, ...upsell].sort((a, b) => priceNum(a.price) - priceNum(b.price));
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

  // Merge a chosen fare option onto the base (display) flight, keeping booking data
  const handleSelect = (opt) => {
    if (!opt) { onSelect(flight); return; }
    const merged = {
      ...flight,
      price: opt.price || flight.price,
      cabin: opt.cabin || flight.cabin,
      bookingClass: opt.bookingClass || flight.bookingClass,
      brandedFare: opt.brandedFare || flight.brandedFare,
      brandedFareLabel: opt.brandedFareLabel || flight.brandedFareLabel,
      amenities: opt.amenities || flight.amenities,
      refundable: typeof opt.refundable === 'boolean' ? opt.refundable : flight.refundable,
      baggage: opt.baggageDetails
        ? { checked: opt.baggageDetails.checked || flight.baggage?.checked, cabin: opt.baggageDetails.cabin || flight.baggage?.cabin }
        : flight.baggage,
      originalOffer: opt.originalOffer || flight.originalOffer,
    };
    onSelect(merged);
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full sm:max-w-3xl max-h-[90vh] bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={flight.airline?.logo}
              alt=""
              className="w-9 h-9 object-contain rounded-md border border-gray-100 flex-shrink-0"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
            <div className="min-w-0">
              <div className="font-bold text-gray-900 text-sm truncate">{flight.airline?.name}</div>
              <div className="text-xs text-gray-500 flex items-center gap-1.5 flex-wrap">
                <span className="font-medium text-gray-700">{flight.departure?.airport} {flight.departure?.time}</span>
                <ArrowRight className="h-3 w-3" />
                <span className="font-medium text-gray-700">{flight.arrival?.airport} {flight.arrival?.time}</span>
                <span className="text-gray-400">· {flight.stops === 0 ? 'Non stop' : `${flight.stops} stop`}</span>
              </div>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500 flex-shrink-0">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 overflow-y-auto">
          <h3 className="text-sm font-bold text-gray-800 mb-3">Choose your fare</h3>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-gray-500">
              <Loader2 className="h-7 w-7 animate-spin text-[#055B75] mb-3" />
              <p className="text-sm">Fetching fare options…</p>
            </div>
          ) : options.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {options.map((opt, i) => {
                const perks = freeAmenityLabels(opt);
                const checked = opt.baggageDetails?.checked;
                const cabinBag = opt.baggageDetails?.cabin;
                return (
                  <div
                    key={opt.id ?? i}
                    className={`flex flex-col rounded-xl border p-4 transition-all hover:shadow-md ${i === 0 ? 'border-[#055B75] ring-1 ring-[#055B75]/20' : 'border-gray-200'}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-bold text-gray-900">{prettyFare(opt)}</span>
                      {i === 0 && <span className="text-[10px] font-bold text-white bg-[#055B75] px-2 py-0.5 rounded-full">CHEAPEST</span>}
                    </div>
                    <div className="text-xl font-bold text-[#055B75] mb-3">
                      <Price amount={opt.price} />
                    </div>

                    <div className="space-y-1.5 text-xs text-gray-600 flex-1">
                      <div className="flex items-center gap-1.5">
                        <Luggage className="h-3.5 w-3.5 text-gray-400" />
                        {checked?.weight ? `${checked.weight}${checked.weightUnit || 'KG'} check-in` : (opt.baggage || 'Cabin only')}
                      </div>
                      {cabinBag?.weight ? (
                        <div className="flex items-center gap-1.5">
                          <Briefcase className="h-3.5 w-3.5 text-gray-400" />
                          {cabinBag.weight}{cabinBag.weightUnit || 'KG'} cabin
                        </div>
                      ) : null}
                      <div className="flex items-center gap-1.5">
                        <ShieldCheck className={`h-3.5 w-3.5 ${opt.refundable ? 'text-emerald-500' : 'text-gray-400'}`} />
                        {opt.refundable ? 'Refundable' : 'Non-refundable'}
                      </div>
                      {perks.slice(0, 3).map((p, idx) => (
                        <div key={idx} className="flex items-center gap-1.5 text-emerald-700">
                          <Check className="h-3.5 w-3.5 text-emerald-500" />
                          {p}
                        </div>
                      ))}
                    </div>

                    <button
                      onClick={() => handleSelect(opt)}
                      className="mt-3 w-full py-2 rounded-lg bg-[#055B75] hover:bg-[#034457] text-white text-sm font-bold transition-colors"
                    >
                      BOOK
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-gray-500 mb-4">{error || 'No alternate fares available.'}</p>
              <button
                onClick={() => handleSelect(null)}
                className="px-6 py-2.5 rounded-lg bg-[#055B75] hover:bg-[#034457] text-white text-sm font-bold transition-colors inline-flex items-center gap-2"
              >
                Continue with this fare
                <span className="font-normal"><Price amount={flight.price} /></span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default FlightFareOptions;
