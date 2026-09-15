"use client"

import React, { useState, useEffect, useMemo } from "react"
import { format, addMonths, startOfMonth, isSameDay, isBefore, isToday } from "date-fns"
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react"
import apiConfig from '@/config/api'
import Price from '../../../Components/Price'
import { getTodayDate } from '../../../utils/dateUtils'
import { stripDates } from './searchResults'
import { moveDayFocus } from './calendarKeys'

/**
 * The search form's date picker.
 *
 * A fare shown here is a real fare or nothing. This calendar used to invent
 * them: whenever fewer than two real prices were known it drew an "estimated"
 * curve around ₹3,500 with a green "Cheapest" day, filled the gaps between
 * sampled dates by interpolation, and printed real USD totals behind a
 * hard-coded "₹". Real prices almost never arrived anyway, because it called
 * /cheapest-dates without the departure date the provider needs.
 *
 * It now asks /date-prices - what the results page's date strip uses - for the
 * seven days around the chosen date, for the passengers and cabin being
 * searched, and shows each fare through <Price> in the currency it came in.
 * Asking for the strip's exact dates also means the results page finds those
 * fares already cached. A day with no fare shows no price.
 *
 * `showPrices` is off for the return date: these are one-way fares from the
 * origin, and printing them on return days would price the wrong journey.
 */
export default function CustomFlightCalendar({
    selectedDate,
    onSelect,
    originCode,
    destinationCode,
    onClose,
    minDate = new Date(),
    adults = 1,
    children = 0,
    infants = 0,
    travelClass = 'ECONOMY',
    showPrices = true,
}) {
    const [currentMonth, setCurrentMonth] = useState(new Date())
    const [prices, setPrices] = useState({})
    const [currency, setCurrency] = useState('USD')
    const [loading, setLoading] = useState(false)

    // Draggable state
    const [position, setPosition] = useState({ x: 0, y: 0 })
    const [isDragging, setIsDragging] = useState(false)
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 })

    const nextMonth = addMonths(currentMonth, 1)

    const today = getTodayDate()
    const centerDate = selectedDate && selectedDate >= today ? selectedDate : today

    // One day in the grid is reached with Tab - the chosen day when it is on
    // screen, else the first day that can be chosen - and the arrow keys move
    // from there (calendarKeys.js).
    const inView = (key) => [format(currentMonth, 'yyyy-MM'), format(nextMonth, 'yyyy-MM')].includes(key.slice(0, 7))
    const firstChoosable = [format(startOfMonth(currentMonth), 'yyyy-MM-dd'), format(minDate, 'yyyy-MM-dd'), today].sort().at(-1)
    const tabbableDate = inView(centerDate) ? centerDate : firstChoosable

    // The lowest fare is marked only when there are at least two to compare.
    const lowestPrice = useMemo(() => {
        const values = Object.values(prices)
        return values.length >= 2 ? Math.min(...values) : null
    }, [prices])

    useEffect(() => {
        if (!showPrices || !originCode || !destinationCode) {
            setPrices({})
            return undefined
        }

        const controller = new AbortController()
        let cancelled = false

        const fetchPrices = async () => {
            setLoading(true)
            try {
                const response = await fetch(apiConfig.endpoints.flights.datePrices, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        from: originCode,
                        to: destinationCode,
                        dates: stripDates(centerDate),
                        adults: Number(adults) || 1,
                        children: Number(children) || 0,
                        infants: Number(infants) || 0,
                        travelClass: travelClass || 'ECONOMY',
                    }),
                    signal: controller.signal,
                })
                const data = await response.json()
                if (cancelled) return

                const real = {}
                if (data?.success && data.dateWisePrices) {
                    for (const [date, value] of Object.entries(data.dateWisePrices)) {
                        const amount = Number(value)
                        if (Number.isFinite(amount) && amount > 0) real[date] = amount
                    }
                }
                setPrices(real)
                setCurrency(data?.currency || 'USD')
            } catch (err) {
                if (cancelled || err.name === 'AbortError') return
                setPrices({})
            } finally {
                if (!cancelled) setLoading(false)
            }
        }

        fetchPrices()

        return () => {
            cancelled = true
            controller.abort()
        }
    }, [showPrices, originCode, destinationCode, centerDate, adults, children, infants, travelClass])

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
        const startDay = (monthStart.getDay() + 6) % 7; // Mon=0, Tue=1, ... Sun=6
        const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();

        const cells = [];

        // 1. Empty slots before start of month
        for (let i = 0; i < startDay; i++) {
            cells.push(<div key={`empty-start-${i}`} className="h-11"></div>);
        }

        // 2. Actual day cells
        for (let i = 1; i <= daysInMonth; i++) {
            const day = new Date(month.getFullYear(), month.getMonth(), i);
            const dateKey = format(day, 'yyyy-MM-dd');
            const price = prices[dateKey];
            const isPast = isBefore(day, minDate) && !isToday(day);
            const isSelected = selectedDate && isSameDay(day, new Date(selectedDate));
            const isLowest = lowestPrice !== null && price === lowestPrice;

            // A button: Enter and Space choose it, the arrow keys move between
            // days. It was a div only a mouse could press.
            cells.push(
                <button
                    type="button"
                    key={dateKey}
                    data-date={dateKey}
                    disabled={isPast}
                    aria-pressed={Boolean(isSelected)}
                    tabIndex={dateKey === tabbableDate ? 0 : -1}
                    onClick={() => onSelect(dateKey)}
                    onKeyDown={moveDayFocus}
                    className={`relative h-11 w-full flex flex-col items-center justify-center transition-all rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#055B75]/50
                        ${isPast ? 'text-gray-300 cursor-not-allowed bg-gray-50/30' : ''}
                        ${!isPast && !isSelected ? 'cursor-pointer hover:bg-[#055B75]/5' : ''}
                        ${isSelected ? 'bg-[#055B75] text-white rounded-lg shadow-md cursor-pointer' : ''}
                    `}
                >
                    <span className="sr-only">{format(day, 'EEEE d MMMM yyyy')}</span>
                    <span aria-hidden="true" className={`text-[13px] font-semibold leading-tight ${isSelected ? 'text-white' : (isPast ? 'text-gray-300' : 'text-gray-700')}`}>
                        {i}
                    </span>
                    {!isPast && price !== undefined && (
                        <span data-testid="calendar-fare" className={`text-[8px] leading-none mt-0.5 ${isSelected ? 'text-white/80' : (isLowest ? 'text-green-600 font-bold' : 'text-gray-400')}`}>
                            <Price amount={{ amount: price, currency }} />
                        </span>
                    )}
                </button>
            );
        }

        // 3. Fill remaining slots to complete 6 rows (42 total)
        const totalSlots = 42;
        while (cells.length < totalSlots) {
            cells.push(<div key={`empty-end-${cells.length}`} className="h-11"></div>);
        }

        // 4. Chunk into rows of 7
        const rows = [];
        for (let i = 0; i < cells.length; i += 7) {
            rows.push(
                <div key={`row-${i / 7}`} className="grid grid-cols-7">
                    {cells.slice(i, i + 7)}
                </div>
            );
        }

        return (
            <div className="flex-1 min-w-0">
                <div className="text-center py-2.5 font-bold text-gray-800 text-sm border-b border-gray-100 bg-gray-50/30">
                    {format(month, 'MMMM yyyy')}
                </div>
                <div className="grid grid-cols-7 text-center border-b border-gray-200 bg-gray-50/50">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                        <div key={d} className="text-[9px] sm:text-[10px] font-semibold text-gray-500 py-2 uppercase tracking-wider">{d}</div>
                    ))}
                </div>
                <div className="select-none p-1">
                    {rows}
                </div>
            </div>
        );
    };

    return (
        <div
            data-calendar-grid=""
            role="dialog"
            aria-label="Choose a date"
            className={`absolute top-full left-0 mt-4 z-[100] bg-white shadow-2xl rounded-xl border border-gray-200 w-[calc(100vw-2rem)] max-w-[360px] sm:max-w-none sm:w-[640px] overflow-hidden animate-in fade-in zoom-in-95 duration-200 ${isDragging ? 'cursor-grabbing select-none' : ''}`}
            style={{
                transform: `translate(${position.x}px, ${position.y}px)`,
            }}
        >
            <div
                onMouseDown={handleMouseDown}
                className="flex items-center justify-between p-3 bg-gray-50 border-b border-gray-200 cursor-grab"
            >
                <button
                    type="button"
                    aria-label="Previous month"
                    onClick={() => setCurrentMonth(addMonths(currentMonth, -1))}
                    className="p-1.5 hover:bg-white hover:shadow-sm rounded-full transition-all border border-transparent hover:border-gray-200"
                >
                    <ChevronLeft className="h-4 w-4 text-[#055B75]" />
                </button>
                <div className="flex items-center gap-3">
                    {loading && <Loader2 className="h-4 w-4 animate-spin text-[#055B75]" />}
                    <span className="text-[10px] font-bold text-[#055B75] uppercase tracking-widest bg-white px-3 py-1 rounded-full border border-gray-200 shadow-sm whitespace-nowrap">
                        <span className="hidden sm:inline">Drag to Move • </span>Select Date
                    </span>
                </div>
                <button
                    type="button"
                    aria-label="Next month"
                    onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                    className="p-1.5 hover:bg-white hover:shadow-sm rounded-full transition-all border border-transparent hover:border-gray-200"
                >
                    <ChevronRight className="h-4 w-4 text-[#055B75]" />
                </button>
            </div>

            <div className="flex divide-x divide-gray-200">
                {renderMonth(currentMonth)}
                <div className="hidden sm:flex flex-1 min-w-0">
                    {renderMonth(nextMonth)}
                </div>
            </div>

            <div className="bg-gray-50 px-4 py-3 flex justify-between items-center border-t border-gray-200">
                <div className="flex gap-5 items-center">
                    <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 bg-[#055B75] rounded-sm"></div>
                        <span className="text-[10px] font-medium text-gray-500">Selected</span>
                    </div>
                    {lowestPrice !== null && (
                        <div className="flex items-center gap-1.5">
                            <div className="w-3 h-3 bg-green-100 border border-green-300 rounded-sm"></div>
                            <span className="text-[10px] font-medium text-gray-500">Lowest fare shown</span>
                        </div>
                    )}
                </div>
                <button
                    type="button"
                    onClick={onClose}
                    className="px-5 py-1.5 text-xs font-bold text-white bg-[#055B75] hover:bg-[#034457] rounded-lg transition-all shadow-md active:scale-95"
                >
                    Done
                </button>
            </div>
        </div>
    );
}
