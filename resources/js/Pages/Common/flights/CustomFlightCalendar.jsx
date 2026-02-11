"use client"

import React, { useState, useEffect, useMemo } from "react"
import { format, addMonths, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, startOfWeek, endOfWeek, isBefore, isToday, addDays } from "date-fns"
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react"
import FlightAnalyticsService from "../../../Services/FlightAnalyticsService"
import apiConfig from '../../../../../src/config/api.js'

export default function CustomFlightCalendar({
    selectedDate,
    onSelect,
    originCode,
    destinationCode,
    onClose,
    minDate = new Date()
}) {
    const [currentMonth, setCurrentMonth] = useState(new Date())
    const [prices, setPrices] = useState({})
    const [loading, setLoading] = useState(false)

    // Draggable state
    const [position, setPosition] = useState({ x: 0, y: 0 })
    const [isDragging, setIsDragging] = useState(false)
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

    const nextMonth = addMonths(currentMonth, 1)

    // Find the minimum price to highlight in green
    const minPrice = useMemo(() => {
        const values = Object.values(prices).filter(p => p > 0);
        return values.length > 0 ? Math.min(...values) : null;
    }, [prices]);

    // Fetch prices for visibility range
    useEffect(() => {
        const fetchPrices = async () => {
            if (!originCode || !destinationCode) return;

            setLoading(true);
            console.log(`[Calendar] Fetching prices for ${originCode} -> ${destinationCode}...`);
            try {
                // Try cheapest-dates API first
                const data = await FlightAnalyticsService.getCheapestFlightDates(
                    originCode,
                    destinationCode,
                    { viewBy: 'DATE' }
                );

                if (data && data.length > 0) {
                    console.log(`[Calendar] Received ${data.length} price points from cheapest-dates API`);
                    const newPrices = {};
                    data.forEach(item => {
                        newPrices[item.departureDate] = parseFloat(item.price.total);
                    });
                    setPrices(newPrices);
                    return;
                }

                // Fallback: use server-side calendar-prices endpoint (handles caching & rate limiting)
                console.log(`[Calendar] cheapest-dates returned no data, using calendar-prices fallback`);
                const baseUrl = apiConfig?.baseUrl || '';
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const m1Start = startOfMonth(currentMonth);
                const m2End = endOfMonth(nextMonth);

                // Sample ~4 dates spread across both months
                const sampleDates = [];
                let d = isBefore(m1Start, today) ? today : m1Start;
                while (isBefore(d, m2End) || format(d, 'yyyy-MM-dd') === format(m2End, 'yyyy-MM-dd')) {
                    sampleDates.push(format(d, 'yyyy-MM-dd'));
                    d = addDays(d, 7); // Every 7 days = ~8 samples for 2 months
                }
                const datesToFetch = sampleDates.slice(0, 5); // Limit to 5 samples

                const response = await fetch(`${baseUrl}/flights/calendar-prices`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        origin: originCode,
                        destination: destinationCode,
                        dates: datesToFetch
                    })
                });

                if (response.ok) {
                    const result = await response.json();
                    if (result.success && result.prices && Object.keys(result.prices).length > 0) {
                        // Interpolate prices for dates between samples
                        const fetchedPrices = result.prices;
                        const sortedDates = Object.keys(fetchedPrices).sort();
                        if (sortedDates.length >= 2) {
                            for (let i = 0; i < sortedDates.length - 1; i++) {
                                const startDate = new Date(sortedDates[i]);
                                const endDate = new Date(sortedDates[i + 1]);
                                const startPrice = fetchedPrices[sortedDates[i]];
                                const endPrice = fetchedPrices[sortedDates[i + 1]];
                                const daysBetween = Math.round((endDate - startDate) / (1000 * 60 * 60 * 24));
                                for (let j = 1; j < daysBetween; j++) {
                                    const interpDate = format(addDays(startDate, j), 'yyyy-MM-dd');
                                    if (!fetchedPrices[interpDate]) {
                                        fetchedPrices[interpDate] = Math.round(startPrice + (endPrice - startPrice) * (j / daysBetween));
                                    }
                                }
                            }
                        }
                        console.log(`[Calendar] Got ${Object.keys(fetchedPrices).length} price points from calendar-prices`);
                        setPrices(fetchedPrices);
                    }
                }
            } catch (err) {
                console.warn('Failed to fetch calendar prices:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchPrices();
    }, [originCode, destinationCode, currentMonth]);

    // Drag handlers
    const handleMouseDown = (e) => {
        if (e.button !== 0) return; // Only left click
        setIsDragging(true);
        setDragStart({
            x: e.clientX - position.x,
            y: e.clientY - position.y
        });
        e.preventDefault();
    };

    useEffect(() => {
        const handleMouseMove = (e) => {
            if (!isDragging) return;
            setPosition({
                x: e.clientX - dragStart.x,
                y: e.clientY - dragStart.y
            });
        };

        const handleMouseUp = () => {
            setIsDragging(false);
        };

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, dragStart]);

    const renderMonth = (month) => {
        const monthStart = startOfMonth(month);
        const monthEnd = endOfMonth(monthStart);
        const startDate = startOfWeek(monthStart, { weekStartsOn: 1 }); // Monday start
        const endDate = endOfWeek(monthEnd, { weekStartsOn: 1 });

        const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

        const rows = [];
        let days = [];
        calendarDays.forEach((day, i) => {
            const dateKey = format(day, 'yyyy-MM-dd');
            const price = prices[dateKey];
            const isCurrentMonth = isSameMonth(day, monthStart);
            const isPast = isBefore(day, minDate) && !isToday(day);
            const isSelected = selectedDate && isSameDay(day, new Date(selectedDate));
            const isMinPrice = price && price === minPrice;

            days.push(
                <div
                    key={day.toString()}
                    onClick={() => !isPast && isCurrentMonth && onSelect(dateKey)}
                    className={`relative h-11 w-full flex flex-col items-center justify-center cursor-pointer transition-all border border-gray-50
            ${!isCurrentMonth ? 'invisible' : ''}
            ${isPast ? 'text-gray-300 cursor-not-allowed bg-gray-50/20' : 'hover:bg-blue-50/50'}
            ${isSelected ? 'bg-red-600 text-white hover:bg-red-700 z-10 scale-[1.02] shadow-md border-red-700' : ''}
          `}
                >
                    <span className={`text-[13px] font-semibold ${isSelected ? 'text-white' : (isPast ? 'text-gray-300' : 'text-gray-700')}`}>
                        {format(day, 'dd')}
                    </span>
                    {isCurrentMonth && !isPast && price && (
                        <span className={`text-[9px] mt-0 leading-none ${isSelected ? 'text-white' : (isMinPrice ? 'text-green-600 font-bold' : 'text-gray-500')}`}>
                            ₹{Math.round(price).toLocaleString()}
                        </span>
                    )}
                </div>
            );

            if ((i + 1) % 7 === 0) {
                rows.push(<div key={i} className="grid grid-cols-7 gap-0 border-l border-b border-gray-100 last:border-b-0">{days}</div>);
                days = [];
            }
        });

        return (
            <div className="flex-1">
                <div className="text-center py-3 font-bold text-gray-800 text-sm border-b border-gray-100">
                    {format(month, 'MMMM yyyy')}
                </div>
                <div className="grid grid-cols-7 text-center bg-gray-50/50 border-b border-gray-100">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                        <div key={d} className="text-[10px] font-bold text-gray-400 py-2 uppercase tracking-wider">{d}</div>
                    ))}
                </div>
                <div className="flex flex-col gap-0 select-none">
                    {rows}
                </div>
            </div>
        );
    };

    return (
        <div
            className={`absolute top-full left-0 mt-3 z-[100] bg-white shadow-[0_10px_40px_rgba(0,0,0,0.15)] rounded-xl border border-gray-200 w-[640px] overflow-hidden animate-in fade-in zoom-in-95 duration-200 ${isDragging ? 'cursor-grabbing select-none' : ''}`}
            style={{
                transform: `translate(${position.x}px, ${position.y}px)`,
            }}
        >
            <div
                onMouseDown={handleMouseDown}
                className="flex items-center justify-between p-2 bg-gray-50/80 border-b border-gray-200 cursor-grab"
            >
                <button
                    onClick={() => setCurrentMonth(addMonths(currentMonth, -1))}
                    className="p-1.5 hover:bg-white hover:shadow-sm rounded-full transition-all border border-transparent hover:border-gray-200"
                >
                    <ChevronLeft className="h-4 w-4 text-[#055B75]" />
                </button>
                <div className="flex items-center gap-3">
                    {loading && <Loader2 className="h-4 w-4 animate-spin text-[#055B75]" />}
                    <span className="text-[10px] font-bold text-[#055B75] uppercase tracking-widest bg-white px-3 py-1 rounded-full border border-gray-200 shadow-sm">
                        Drag to Move • Select Date
                    </span>
                </div>
                <button
                    onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                    className="p-1.5 hover:bg-white hover:shadow-sm rounded-full transition-all border border-transparent hover:border-gray-200"
                >
                    <ChevronRight className="h-4 w-4 text-[#055B75]" />
                </button>
            </div>

            <div className="flex divide-x divide-gray-100">
                {renderMonth(currentMonth)}
                {renderMonth(nextMonth)}
            </div>

            <div className="bg-gray-50 p-2 px-4 flex justify-between items-center border-t border-gray-200">
                <div className="flex gap-4 items-center">
                    <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 bg-red-600 rounded-sm"></div>
                        <span className="text-[10px] font-medium text-gray-600">Selected</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 bg-green-100 border border-green-200 rounded-sm"></div>
                        <span className="text-[10px] font-medium text-gray-600">Cheapest</span>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="px-5 py-1.5 text-xs font-bold text-white bg-[#055B75] hover:bg-[#034457] rounded-lg transition-all shadow-md active:scale-95"
                >
                    Done
                </button>
            </div>
        </div>
    )
}
