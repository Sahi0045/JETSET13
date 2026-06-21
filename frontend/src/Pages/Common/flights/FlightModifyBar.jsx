import React, { useState } from 'react';
import { ArrowRight, Pencil, ChevronUp } from 'lucide-react';
import { parseISO, isValid, format } from 'date-fns';
import FlightSearchForm from './flight-search-form';

const extractCode = (str) => {
  if (!str) return '';
  const match = str.match(/\(([A-Z]{3})\)$/);
  if (match) return match[1];
  // already a bare code like "DEL"
  if (/^[A-Z]{3}$/.test(str.trim())) return str.trim();
  return str;
};

const fmtDate = (dateStr) => {
  if (!dateStr) return '';
  try {
    const d = parseISO(dateStr);
    if (!isValid(d)) return dateStr;
    return format(d, 'EEE, dd MMM');
  } catch {
    return dateStr;
  }
};

const CLASS_LABELS = {
  ECONOMY: 'Economy',
  PREMIUM_ECONOMY: 'Premium Economy',
  BUSINESS: 'Business',
  FIRST: 'First Class',
};

function FlightModifyBar({ searchParams = {}, cityMap = {}, onSearch }) {
  const [expanded, setExpanded] = useState(false);

  const fromCode = searchParams.fromCode || extractCode(searchParams.from);
  const toCode = searchParams.toCode || extractCode(searchParams.to);
  const fromCity = cityMap[fromCode] || (searchParams.from || '').replace(/\s*\([A-Z]{3}\)$/, '') || fromCode;
  const toCity = cityMap[toCode] || (searchParams.to || '').replace(/\s*\([A-Z]{3}\)$/, '') || toCode;

  const travellers =
    (parseInt(searchParams.adults, 10) || parseInt(searchParams.travelers, 10) || 1) +
    (parseInt(searchParams.children, 10) || 0) +
    (parseInt(searchParams.infants, 10) || 0);
  const classLabel = CLASS_LABELS[searchParams.travelClass || 'ECONOMY'] || 'Economy';
  const isRoundTrip = (searchParams.tripType === 'roundTrip' || searchParams.tripType === 'round-trip') && searchParams.returnDate;

  const handleSearch = (formData) => {
    setExpanded(false);
    onSearch?.(formData);
  };

  return (
    <div className="bg-gradient-to-r from-[#055B75] to-[#034457] text-white shadow-md relative z-30">
      <div className="container mx-auto max-w-6xl px-4">
        {/* ===== Summary row ===== */}
        <div className="flex items-center gap-3 py-3">
          <div className="flex-1 flex items-center gap-2 sm:gap-4 min-w-0 overflow-x-auto hide-scrollbar">
            {/* Route */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="text-left">
                <div className="text-base sm:text-lg font-bold leading-none">{fromCode || '—'}</div>
                <div className="text-[11px] text-white/70 truncate max-w-[110px]">{fromCity}</div>
              </div>
              <ArrowRight className="h-4 w-4 text-white/60 flex-shrink-0" />
              <div className="text-left">
                <div className="text-base sm:text-lg font-bold leading-none">{toCode || '—'}</div>
                <div className="text-[11px] text-white/70 truncate max-w-[110px]">{toCity}</div>
              </div>
            </div>

            <span className="h-8 w-px bg-white/20 flex-shrink-0" />

            {/* Dates */}
            <div className="flex items-center gap-2 text-sm flex-shrink-0">
              <span className="font-medium whitespace-nowrap">{fmtDate(searchParams.departDate) || 'Date'}</span>
              {isRoundTrip && (
                <>
                  <span className="text-white/50">–</span>
                  <span className="font-medium whitespace-nowrap">{fmtDate(searchParams.returnDate)}</span>
                </>
              )}
            </div>

            <span className="hidden sm:block h-8 w-px bg-white/20 flex-shrink-0" />

            {/* Travellers */}
            <div className="hidden sm:block text-sm text-white/90 whitespace-nowrap flex-shrink-0">
              {travellers} {travellers > 1 ? 'Travellers' : 'Traveller'} · {classLabel}
            </div>
          </div>

          {/* Modify button */}
          <button
            onClick={() => setExpanded(v => !v)}
            className="flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2 bg-white text-[#055B75] rounded-lg text-sm font-bold shadow-sm hover:bg-[#F0FAFC] transition-colors"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <Pencil className="h-3.5 w-3.5" />}
            {expanded ? 'Close' : 'Modify'}
          </button>
        </div>
      </div>

      {/* ===== Expanded full search form ===== */}
      {expanded && (
        <div className="border-t border-white/10 bg-gradient-to-r from-[#055B75] to-[#034457]">
          <div className="container mx-auto max-w-6xl px-4 pt-6 pb-12" style={{ overflow: 'visible' }}>
            <FlightSearchForm initialData={searchParams} onSearch={handleSearch} />
          </div>
        </div>
      )}
    </div>
  );
}

export default FlightModifyBar;
