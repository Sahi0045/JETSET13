import React, { useState, useEffect, useMemo } from 'react';
import { Loader2, Armchair } from 'lucide-react';
import Price from '../../../Components/Price';
import apiConfig from '@/config/api';

// Parse "12A" -> { row: 12, col: 'A' }
const parseSeat = (num) => {
  const m = /^(\d+)([A-Z])$/.exec(num || '');
  return m ? { row: parseInt(m[1], 10), col: m[2] } : null;
};

function FlightSeatMap({ flightOffer, passengerCount = 1, selectedSeats = [], onSeatsChange, feeWaived = false }) {
  const [loading, setLoading] = useState(true);
  const [seats, setSeats] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!flightOffer) { setLoading(false); return; }
    let cancelled = false;
    const controller = new AbortController();

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(apiConfig.endpoints.flights.seatmaps, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ flightOffer }),
          signal: controller.signal,
        });
        const data = await res.json();
        if (cancelled) return;
        const deck = data.data?.[0]?.decks?.[0];
        const list = (deck?.seats || []).map((s) => {
          const tp = s.travelerPricing?.[0];
          return {
            number: s.number,
            status: tp?.seatAvailabilityStatus || 'BLOCKED',
            price: tp?.price ? parseFloat(tp.price.total) : 0,
            currency: tp?.price?.currency || 'USD',
          };
        });
        setSeats(list);
        if (!list.length) setError('Seat map not available for this flight.');
      } catch (e) {
        if (cancelled || e.name === 'AbortError') return;
        setError('Seat map could not be loaded.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; controller.abort(); };
  }, [flightOffer]);

  // Group seats by row, collect column order
  const { rows, columns } = useMemo(() => {
    const byRow = new Map();
    const colSet = new Set();
    seats.forEach((s) => {
      const p = parseSeat(s.number);
      if (!p) return;
      colSet.add(p.col);
      if (!byRow.has(p.row)) byRow.set(p.row, {});
      byRow.get(p.row)[p.col] = s;
    });
    const columns = Array.from(colSet).sort();
    const rows = Array.from(byRow.entries()).sort((a, b) => a[0] - b[0]).map(([row, map]) => ({ row, map }));
    return { rows, columns };
  }, [seats]);

  const aisleAfter = columns[Math.ceil(columns.length / 2) - 1]; // visual aisle in the middle

  const toggleSeat = (seat) => {
    if (seat.status !== 'AVAILABLE') return;
    const already = selectedSeats.includes(seat.number);
    let next;
    if (already) {
      next = selectedSeats.filter((n) => n !== seat.number);
    } else {
      if (selectedSeats.length >= passengerCount) {
        // replace the oldest selection when at capacity
        next = [...selectedSeats.slice(1), seat.number];
      } else {
        next = [...selectedSeats, seat.number];
      }
    }
    onSeatsChange?.(next, seats.filter((s) => next.includes(s.number)));
  };

  const seatFeeTotal = useMemo(
    () => seats.filter((s) => selectedSeats.includes(s.number)).reduce((sum, s) => sum + (s.price || 0), 0),
    [seats, selectedSeats]
  );
  const feeCurrency = seats[0]?.currency || 'USD';

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin text-[#055B75] mr-2" /> Loading seat map…
      </div>
    );
  }
  if (error || rows.length === 0) {
    return <p className="text-sm text-gray-400 italic py-2">{error || 'Seat map unavailable for this flight.'}</p>;
  }

  return (
    <div>
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mb-4 text-xs text-gray-600">
        <span className="flex items-center gap-1.5"><span className="h-4 w-4 rounded bg-white border border-gray-300" /> Available</span>
        <span className="flex items-center gap-1.5"><span className="h-4 w-4 rounded bg-[#055B75]" /> Selected</span>
        <span className="flex items-center gap-1.5"><span className="h-4 w-4 rounded bg-gray-200 border border-gray-300" /> Occupied</span>
        <span className="ml-auto text-gray-500">Pick up to <span className="font-semibold">{passengerCount}</span> seat{passengerCount > 1 ? 's' : ''}</span>
      </div>

      {/* Cabin */}
      <div className="border border-gray-200 rounded-xl p-3 overflow-x-auto bg-gradient-to-b from-gray-50 to-white">
        {/* Column header */}
        <div className="flex items-center gap-1.5 mb-2 pl-7">
          {columns.map((c) => (
            <React.Fragment key={c}>
              <span className="w-8 text-center text-[11px] font-semibold text-gray-400">{c}</span>
              {c === aisleAfter && <span className="w-5" />}
            </React.Fragment>
          ))}
        </div>

        {rows.map(({ row, map }) => (
          <div key={row} className="flex items-center gap-1.5 mb-1.5">
            <span className="w-5 text-[11px] text-gray-400 text-right">{row}</span>
            {columns.map((c) => {
              const seat = map[c];
              const isSel = seat && selectedSeats.includes(seat.number);
              const avail = seat && seat.status === 'AVAILABLE';
              return (
                <React.Fragment key={c}>
                  {seat ? (
                    <button
                      type="button"
                      title={`${seat.number}${seat.price ? ` · ${seat.currency} ${seat.price}` : ''}${avail ? '' : ' · occupied'}`}
                      onClick={() => toggleSeat(seat)}
                      disabled={!avail}
                      className={`w-8 h-8 rounded-md border flex items-center justify-center transition-colors ${
                        isSel
                          ? 'bg-[#055B75] border-[#055B75] text-white'
                          : avail
                            ? 'bg-white border-gray-300 text-gray-400 hover:border-[#055B75] hover:text-[#055B75]'
                            : 'bg-gray-200 border-gray-300 text-gray-300 cursor-not-allowed'
                      }`}
                    >
                      <Armchair className="h-4 w-4" />
                    </button>
                  ) : (
                    <span className="w-8 h-8" />
                  )}
                  {c === aisleAfter && <span className="w-5 text-center text-[10px] text-gray-300">‖</span>}
                </React.Fragment>
              );
            })}
          </div>
        ))}
      </div>

      {/* Selection summary */}
      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-gray-600">
          {selectedSeats.length > 0
            ? <>Selected: <span className="font-semibold text-[#055B75]">{selectedSeats.join(', ')}</span></>
            : <span className="text-gray-400">No seats selected (optional)</span>}
        </span>
        {seatFeeTotal > 0 && (
          feeWaived ? (
            <span className="font-semibold text-[#055B75] flex items-center gap-1">
              <span className="text-gray-400 line-through font-normal">
                <Price amount={{ amount: seatFeeTotal, currency: feeCurrency }} />
              </span>
              Free with Premium
            </span>
          ) : (
            <span className="font-semibold text-gray-800">
              Seat fee: <Price amount={{ amount: seatFeeTotal, currency: feeCurrency }} />
            </span>
          )
        )}
      </div>
    </div>
  );
}

export default FlightSeatMap;
