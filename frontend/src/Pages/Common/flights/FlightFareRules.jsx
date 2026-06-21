import React, { useState, useEffect } from 'react';
import { Loader2, Luggage, ChevronDown, FileText, Check } from 'lucide-react';
import Price from '../../../Components/Price';
import apiConfig from '@/config/api';

function FlightFareRules({ flightOffer, onBagsChange }) {
  const [loading, setLoading] = useState(true);
  const [bags, setBags] = useState([]);
  const [fareRules, setFareRules] = useState([]);
  const [openRule, setOpenRule] = useState(null);
  const [selectedBagIdx, setSelectedBagIdx] = useState([]);

  const toggleBag = (idx) => {
    const next = selectedBagIdx.includes(idx)
      ? selectedBagIdx.filter((i) => i !== idx)
      : [...selectedBagIdx, idx];
    setSelectedBagIdx(next);
    const chosen = next.map((i) => bags[i]).filter(Boolean);
    const total = chosen.reduce((sum, b) => sum + (b.price?.amount || 0), 0);
    onBagsChange?.(chosen, total);
  };

  useEffect(() => {
    if (!flightOffer) { setLoading(false); return; }
    let cancelled = false;
    const controller = new AbortController();

    (async () => {
      setLoading(true);
      try {
        const res = await fetch(apiConfig.endpoints.flights.fareRules, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ flightOffer }),
          signal: controller.signal,
        });
        const data = await res.json();
        if (cancelled) return;
        setBags(data.bags || []);
        setFareRules(data.fareRules || []);
      } catch (e) {
        if (!cancelled && e.name !== 'AbortError') { setBags([]); setFareRules([]); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; controller.abort(); };
  }, [flightOffer]);

  if (loading) {
    return (
      <div className="flex items-center py-4 text-gray-500 text-sm">
        <Loader2 className="h-4 w-4 animate-spin text-[#055B75] mr-2" /> Loading fare rules…
      </div>
    );
  }

  if (bags.length === 0 && fareRules.length === 0) {
    return <p className="text-sm text-gray-400 italic py-2">Fare rules unavailable for this fare.</p>;
  }

  const prettyTitle = (t) =>
    (t || 'Information').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="space-y-4">
      {/* Extra baggage options */}
      {bags.length > 0 && (
        <div>
          <div className="text-xs font-bold text-gray-700 mb-2 flex items-center gap-1.5">
            <Luggage className="h-4 w-4 text-[#055B75]" /> Add extra baggage
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {bags.map((b, i) => {
              const on = selectedBagIdx.includes(i);
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => b.price && toggleBag(i)}
                  className={`flex items-center justify-between border rounded-lg px-3 py-2 text-sm text-left transition-colors ${on ? 'border-[#055B75] bg-[#F0FAFC]' : 'border-gray-200 hover:border-[#65B3CF]'}`}
                >
                  <span className="flex items-center gap-2 text-gray-700">
                    {b.price && (
                      <span className={`h-4 w-4 rounded border flex items-center justify-center flex-shrink-0 ${on ? 'bg-[#055B75] border-[#055B75]' : 'border-gray-300'}`}>
                        {on && <Check className="h-3 w-3 text-white" />}
                      </span>
                    )}
                    +{b.quantity} {b.name === 'CHECKED_BAG' ? 'checked bag' : b.name?.toLowerCase().replace(/_/g, ' ')}
                  </span>
                  {b.price && (
                    <span className="font-semibold text-[#055B75]">
                      <Price amount={{ amount: b.price.amount, currency: b.price.currency }} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Cancellation / change rules */}
      {fareRules.length > 0 && (
        <div>
          <div className="text-xs font-bold text-gray-700 mb-2 flex items-center gap-1.5">
            <FileText className="h-4 w-4 text-[#055B75]" /> Cancellation &amp; change policy
          </div>
          <div className="space-y-1.5">
            {fareRules.map((r, i) => (
              <div key={i} className="border border-gray-200 rounded-lg overflow-hidden">
                <button
                  onClick={() => setOpenRule(openRule === i ? null : i)}
                  className="w-full flex items-center justify-between px-3 py-2 text-left text-xs font-semibold text-gray-700 hover:bg-gray-50"
                >
                  {prettyTitle(r.title)}
                  <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${openRule === i ? 'rotate-180' : ''}`} />
                </button>
                {openRule === i && (
                  <pre className="px-3 py-2 text-[11px] text-gray-600 whitespace-pre-wrap font-sans border-t border-gray-100 bg-gray-50/50 max-h-48 overflow-y-auto">
                    {r.text}
                  </pre>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default FlightFareRules;
