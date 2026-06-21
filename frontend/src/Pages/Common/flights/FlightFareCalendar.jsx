import React, { useState, useEffect, useMemo } from 'react';
import { X, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import Price from '../../../Components/Price';
import apiConfig from '@/config/api';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const iso = (y, m, d) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const todayISO = () => {
  const t = new Date();
  return iso(t.getFullYear(), t.getMonth(), t.getDate());
};

const extractCode = (str) => {
  if (!str) return '';
  const m = String(str).match(/\(([A-Z]{3})\)$/);
  if (m) return m[1];
  if (/^[A-Z]{3}$/.test(String(str).trim())) return String(str).trim();
  return str;
};

function FlightFareCalendar({ searchParams = {}, initialDate, selectedDate, onSelectDate, onClose }) {
  const start = initialDate ? new Date(initialDate) : new Date();
  const [viewYear, setViewYear] = useState(start.getFullYear());
  const [viewMonth, setViewMonth] = useState(start.getMonth());
  const [prices, setPrices] = useState({});
  const [lowestPrice, setLowestPrice] = useState(null);
  const [loading, setLoading] = useState(true);

  const today = todayISO();

  // Build the grid for the current month
  const { weeks, monthDates } = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    const monthDates = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = iso(viewYear, viewMonth, d);
      cells.push({ day: d, isoDate: dateStr, isPast: dateStr < today });
      if (dateStr >= today) monthDates.push(dateStr);
    }
    while (cells.length % 7 !== 0) cells.push(null);
    const weeks = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return { weeks, monthDates };
  }, [viewYear, viewMonth, today]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const fromCode = searchParams.fromCode || extractCode(searchParams.from);
    const toCode = searchParams.toCode || extractCode(searchParams.to);
    if (!fromCode || !toCode || monthDates.length === 0) { setLoading(false); return; }

    (async () => {
      setLoading(true);
      try {
        const res = await fetch(apiConfig.endpoints.flights.datePrices, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: fromCode,
            to: toCode,
            dates: monthDates,
            adults: parseInt(searchParams.adults) || parseInt(searchParams.travelers) || 1,
            children: parseInt(searchParams.children) || 0,
            infants: parseInt(searchParams.infants) || 0,
            travelClass: searchParams.travelClass || 'ECONOMY',
          }),
          signal: controller.signal,
        });
        const data = await res.json();
        if (cancelled) return;
        setPrices(data.dateWisePrices || {});
        setLowestPrice(data.lowestPrice ?? null);
      } catch (e) {
        if (!cancelled && e.name !== 'AbortError') { setPrices({}); setLowestPrice(null); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; controller.abort(); };
  }, [viewYear, viewMonth, monthDates, searchParams]);

  const goMonth = (delta) => {
    let m = viewMonth + delta;
    let y = viewYear;
    if (m < 0) { m = 11; y -= 1; }
    if (m > 11) { m = 0; y += 1; }
    // Don't navigate before the current month
    const firstOfTarget = iso(y, m, new Date(y, m + 1, 0).getDate());
    if (firstOfTarget < today) return;
    setViewYear(y);
    setViewMonth(m);
  };

  const canGoPrev = iso(viewYear, viewMonth, new Date(viewYear, viewMonth + 1, 0).getDate()) > today;

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full sm:max-w-2xl bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-gray-900 text-sm">Fare Calendar</h3>
            <p className="text-xs text-gray-500">Lowest one-way fares per day</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-500">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Month nav */}
        <div className="flex items-center justify-between px-5 py-3">
          <button
            onClick={() => goMonth(-1)}
            disabled={!canGoPrev}
            className="p-1.5 rounded-full hover:bg-gray-100 text-gray-600 disabled:opacity-30 disabled:hover:bg-transparent"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="font-bold text-gray-800">{MONTHS[viewMonth]} {viewYear}</span>
          <button onClick={() => goMonth(1)} className="p-1.5 rounded-full hover:bg-gray-100 text-gray-600">
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* Grid */}
        <div className="px-3 sm:px-5 pb-5 overflow-y-auto relative">
          {loading && (
            <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-10">
              <Loader2 className="h-6 w-6 animate-spin text-[#055B75]" />
            </div>
          )}
          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAYS.map((w) => (
              <div key={w} className="text-center text-[11px] font-semibold text-gray-400 py-1">{w}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {weeks.flat().map((cell, i) => {
              if (!cell) return <div key={i} />;
              const price = prices[cell.isoDate];
              const isSelected = cell.isoDate === selectedDate;
              const isLowest = price != null && lowestPrice != null && price === lowestPrice;
              return (
                <button
                  key={i}
                  disabled={cell.isPast}
                  onClick={() => { onSelectDate(cell.isoDate); onClose(); }}
                  className={`flex flex-col items-center justify-center h-14 rounded-lg border text-center transition-colors ${
                    isSelected
                      ? 'bg-[#055B75] text-white border-[#055B75]'
                      : cell.isPast
                        ? 'opacity-30 cursor-not-allowed border-transparent'
                        : isLowest
                          ? 'border-emerald-300 bg-emerald-50 hover:border-emerald-500'
                          : 'border-gray-200 hover:border-[#65B3CF]'
                  }`}
                >
                  <span className={`text-sm font-semibold ${isSelected ? 'text-white' : 'text-gray-700'}`}>{cell.day}</span>
                  {price != null ? (
                    <span className={`text-[10px] font-medium ${isSelected ? 'text-blue-100' : isLowest ? 'text-emerald-600' : 'text-gray-500'}`}>
                      <Price amount={price} />
                    </span>
                  ) : (
                    <span className="text-[10px] text-gray-300">—</span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-4 text-[11px] text-gray-500">
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-emerald-50 border border-emerald-300" /> Lowest fare</span>
            <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-[#055B75]" /> Selected</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default FlightFareCalendar;
