import React, { useState, useEffect } from 'react';
import { Plane, ChevronDown, Loader2 } from 'lucide-react';
import apiConfig from '@/config/api';

const fmtTime = (d) => {
  if (!d || isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};
const fmtDay = (d) => {
  if (!d || isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};
const cur = (code) => (code === 'INR' ? '₹' : (code === 'USD' ? '$' : (code === 'EUR' ? '€' : code + ' ')));

function FlightCancellationPolicy({ flightOffer, fromCode, toCode, departureAt }) {
  const [loading, setLoading] = useState(true);
  const [c, setC] = useState(null);
  const [rules, setRules] = useState([]);
  const [showPolicy, setShowPolicy] = useState(false);

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
        setC(data.cancellation || null);
        setRules((data.fareRules || []).filter(r => /PENALT|CANCEL|CHANGE|REISSUE|REFUND/i.test((r.title || '') + (r.text || ''))));
      } catch (e) {
        if (!cancelled && e.name !== 'AbortError') setC(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; controller.abort(); };
  }, [flightOffer]);

  if (!flightOffer) return null;

  const dep = departureAt ? new Date(departureAt) : null;
  const cutoffHours = c?.cutoffHours || 4;
  const cutoff = dep ? new Date(dep.getTime() - cutoffHours * 3600000) : null;
  const sym = cur(c?.currency || 'INR');
  const tier1 = c?.cancelFee != null ? `${sym}${c.cancelFee.toLocaleString('en-IN')}` : (c?.changeFee != null ? `${sym}${c.changeFee.toLocaleString('en-IN')}` : '—');
  const tier2 = c?.refundable
    ? `${sym}${Math.round((c.cancelFee || c.changeFee || 0) * 1.6).toLocaleString('en-IN')}`
    : 'Non-Refundable';

  return (
    <div className="booking-card mb-8">
      <div className="booking-card-header" style={{ padding: '1.1rem 1.5rem', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ color: '#055B75' }}>Cancellation &amp; Date Change Policy</h2>
        {rules.length > 0 && (
          <button
            onClick={() => setShowPolicy(v => !v)}
            className="text-sm font-semibold text-[#055B75] hover:underline inline-flex items-center gap-1"
          >
            View Policy <ChevronDown className={`h-4 w-4 transition-transform ${showPolicy ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>

      <div className="booking-card-body">
        {loading ? (
          <div className="flex items-center py-4 text-gray-500 text-sm">
            <Loader2 className="h-4 w-4 animate-spin text-[#055B75] mr-2" /> Loading airline cancellation rules…
          </div>
        ) : !c || !c.hasData ? (
          <p className="text-sm text-gray-500">
            Cancellation and date-change charges apply as per the airline's fare rules.
            {c && c.refundable === false && <span className="font-semibold text-gray-700"> This is a non-refundable fare.</span>}
          </p>
        ) : (
          <>
            {/* Route badge */}
            <div className="flex items-center gap-2 mb-5">
              <span className="w-8 h-8 rounded-md bg-[#055B75] flex items-center justify-center">
                <Plane className="h-4 w-4 text-white rotate-45" />
              </span>
              <span className="font-bold text-gray-800">{fromCode} – {toCode}</span>
            </div>

            {/* Penalty timeline */}
            <div className="max-w-2xl">
              {/* Amounts over the two tiers */}
              <div className="flex items-center mb-1.5">
                <span className="text-xs text-gray-500 w-[150px] flex-shrink-0">Cancellation Penalty :</span>
                <div className="relative flex-1 h-5">
                  <span className="absolute text-sm font-bold text-gray-800 -translate-x-1/2 whitespace-nowrap" style={{ left: '32%' }}>{tier1}</span>
                  <span className={`absolute right-0 text-sm font-bold whitespace-nowrap ${c.refundable ? 'text-gray-800' : 'text-red-500'}`}>{tier2}</span>
                </div>
              </div>

              {/* Gradient bar with cutoff divider */}
              <div className="flex items-center">
                <span className="w-[150px] flex-shrink-0" />
                <div className="relative flex-1 h-2 rounded-full" style={{ background: 'linear-gradient(90deg, #16a34a 0%, #84cc16 45%, #eab308 65%, #ef4444 100%)' }}>
                  <span className="absolute top-1/2 -translate-y-1/2 h-4 w-0 border-l-2 border-dashed border-gray-500" style={{ left: '64%' }} />
                </div>
              </div>

              {/* Time tiers */}
              <div className="flex items-start mt-1.5">
                <span className="text-xs text-gray-500 w-[150px] flex-shrink-0">Cancel Between (IST) :</span>
                <div className="relative flex-1 h-9 text-xs">
                  <span className="absolute left-0 font-semibold text-gray-700">Now</span>
                  {cutoff && (
                    <span className="absolute -translate-x-1/2 text-center" style={{ left: '64%' }}>
                      <span className="block font-semibold text-gray-700">{fmtDay(cutoff)}</span>
                      <span className="block text-gray-400">{fmtTime(cutoff)}</span>
                    </span>
                  )}
                  {dep && (
                    <span className="absolute right-0 text-right">
                      <span className="block font-semibold text-gray-700">{fmtDay(dep)}</span>
                      <span className="block text-gray-400">{fmtTime(dep)}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Summary chips */}
            <div className="flex flex-wrap gap-x-6 gap-y-2 mt-5 pt-4 border-t border-gray-100 text-xs text-gray-600">
              {c.cancelFee != null && (
                <span><span className="text-gray-400">Cancellation fee:</span> <span className="font-semibold text-gray-800">{sym}{c.cancelFee.toLocaleString('en-IN')}</span></span>
              )}
              {c.changeFee != null && (
                <span><span className="text-gray-400">Date change fee:</span> <span className="font-semibold text-gray-800">{sym}{c.changeFee.toLocaleString('en-IN')}</span></span>
              )}
              <span>
                <span className="text-gray-400">Refundable:</span>{' '}
                <span className={`font-semibold ${c.refundable ? 'text-emerald-600' : 'text-red-500'}`}>{c.refundable ? 'Yes' : 'No'}</span>
              </span>
              <span className="text-gray-400">Charges per the airline fare rules; taxes/GST may apply.</span>
            </div>

            {/* Full policy text */}
            {showPolicy && rules.length > 0 && (
              <div className="mt-4 space-y-2">
                {rules.map((r, i) => (
                  <div key={i} className="border border-gray-200 rounded-lg p-3">
                    <div className="text-xs font-bold text-gray-700 mb-1">
                      {(r.title || 'Information').replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase())}
                    </div>
                    <pre className="text-[11px] text-gray-600 whitespace-pre-wrap font-sans max-h-40 overflow-y-auto">{r.text}</pre>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default FlightCancellationPolicy;
