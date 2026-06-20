"use client"

import React, { useState, useEffect, useRef, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import { Calendar, Users, MapPin, Search, ChevronDown, Plane, Ship, Package, Hotel, ArrowLeftRight } from "lucide-react"
import { defaultSearchData, specialFares, sourceCities, allDestinations } from "./data.js"
import { allAirports } from "./airports.js";
import AirportService from "../../../Services/AirportService";
import { getTodayDate, getNextDay, getSafeDate } from "../../../utils/dateUtils";
import { useLocationContext } from '../../../Context/LocationContext';
import CustomFlightCalendar from "./CustomFlightCalendar";
import { format, parseISO, isValid } from 'date-fns';

// Get this from a config or parent component
const USE_AMADEUS_API = true;

export default function FlightSearchForm({ initialData, onSearch }) {
  const { city, loaded, country: userCountry } = useLocationContext();
  const navigate = useNavigate();
  const [formData, setFormData] = useState(initialData || defaultSearchData)
  const [formErrors, setFormErrors] = useState({})
  const [showFromSuggestions, setShowFromSuggestions] = useState(false);
  const [showToSuggestions, setShowToSuggestions] = useState(false);
  const [fromSuggestions, setFromSuggestions] = useState([]);
  const [toSuggestions, setToSuggestions] = useState([]);
  const [selectedFare, setSelectedFare] = useState(null);
  const [isSearching, setIsSearching] = useState(false);
  const [showDepartCalendar, setShowDepartCalendar] = useState(false);
  const [showReturnCalendar, setShowReturnCalendar] = useState(false);
  const [showTravellers, setShowTravellers] = useState(false);
  const [adults, setAdults] = useState(Number(initialData?.adults) || Number(initialData?.travelers) || 1);
  const [children, setChildren] = useState(Number(initialData?.children) || 0);
  const [infants, setInfants] = useState(Number(initialData?.infants) || 0);

  const departCalendarRef = useRef(null);
  const returnCalendarRef = useRef(null);
  const travellersRef = useRef(null);

  // Debounce timer ref
  const searchTimeoutRef = useRef(null);

  // Create a map of city names to their codes
  const cityCodeMap = allAirports.reduce((acc, city) => {
    acc[city.name] = city.code;
    return acc;
  }, {});

  // Create a map of codes to city details
  const cityDetailsMap = allAirports.reduce((acc, city) => {
    acc[city.code] = {
      name: city.name,
      country: city.country,
      type: city.type
    };
    return acc;
  }, {});

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
    }
  }, [initialData]);

  // Geo-location auto-fill disabled - "From" field starts blank
  useEffect(() => {
    const setDefaultFrom = async () => {
      // Keep blank - user must select origin manually
    };

    setDefaultFrom();
  }, [loaded, city, initialData]);

  const handleTripTypeChange = (type) => {
    if (type === "roundTrip") {
      const currentDepart = formData.departDate || getTodayDate();

      // Suggest return date 3 days after departure
      const baseDepart = getSafeDate(currentDepart);
      const suggestedReturn = new Date(baseDepart);
      suggestedReturn.setDate(suggestedReturn.getDate() + 3);

      const year = suggestedReturn.getFullYear();
      const month = String(suggestedReturn.getMonth() + 1).padStart(2, '0');
      const day = String(suggestedReturn.getDate()).padStart(2, '0');
      const suggestedReturnStr = `${year}-${month}-${day}`;

      setFormData(prev => ({
        ...prev,
        tripType: "roundTrip",
        returnDate: prev.returnDate || suggestedReturnStr
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        tripType: "oneWay",
        returnDate: ''
      }));
    }
  }

  // Handle outside click for calendars
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (departCalendarRef.current && !departCalendarRef.current.contains(event.target)) {
        setShowDepartCalendar(false);
      }
      if (returnCalendarRef.current && !returnCalendarRef.current.contains(event.target)) {
        setShowReturnCalendar(false);
      }
      if (travellersRef.current && !travellersRef.current.contains(event.target)) {
        setShowTravellers(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Keep the legacy `travelers` total + breakdown in sync for the search payload
  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      adults,
      children,
      infants,
      travelers: String(adults + children + infants),
    }));
  }, [adults, children, infants]);

  const formatDateDisplay = (dateStr) => {
    if (!dateStr) return "";
    try {
      const date = parseISO(dateStr);
      if (!isValid(date)) return dateStr;
      return format(date, 'dd/MM/yyyy');
    } catch {
      return dateStr;
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    // Update the field
    setFormData((prev) => {
      const next = { ...prev, [name]: value };

      // If departDate changes
      if (name === 'departDate') {
        const today = getTodayDate();
        if (value && value < today) {
          // Don't allow past dates if user manually types? HTML5 min attribute handles this usually but good to be safe
          // next.departDate = today; // Optional: Force reset or let validation handle it
        }

        // In round trip, ensure return date is valid
        if (prev.tripType === 'roundTrip' && value) {
          const minReturn = value; // Can return same day
          if (!next.returnDate || next.returnDate < minReturn) {
            next.returnDate = getNextDay(value); // Suggest next day or same day? Usually airlines allow same day returns. Let's suggest next day for better UX but allow same day via min attribute if needed. The original logic was +1 day.
          }
        }
      }

      // If returnDate changes, ensure it's not before departDate
      if (name === 'returnDate' && prev.tripType === 'roundTrip' && prev.departDate) {
        if (value < prev.departDate) {
          // If user selects a return date before depart date, maybe update depart date? 
          // Or just reset return date. 
          // Better UX: prevent selection via min attribute.
          // But if they type it:
          next.returnDate = getNextDay(prev.departDate);
        }
      }
      return next;
    });

    // Hide suggestions for the other field
    if (name === "from") {
      setShowToSuggestions(false);
    } else if (name === "to") {
      setShowFromSuggestions(false);
    }

    // Show suggestions for the current field with dynamic API search
    if (name === "from" || name === "to") {
      const showSuggestions = name === "from" ? setShowFromSuggestions : setShowToSuggestions;
      const setSuggestions = name === "from" ? setFromSuggestions : setToSuggestions;

      showSuggestions(true);

      // Clear previous timeout
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }

      // Show local results immediately for responsiveness
      const localFiltered = AirportService.searchLocalAirports(value);
      setSuggestions(localFiltered);

      // Debounce API call (300ms)
      if (value.trim().length >= 2) {
        searchTimeoutRef.current = setTimeout(async () => {
          setIsSearching(true);
          try {
            const apiResults = await AirportService.searchAirports(value);
            if (apiResults && apiResults.length > 0) {
              setSuggestions(apiResults);
            }
          } catch (error) {
            console.warn('Airport search API error:', error);
            // Keep local results on API failure
          } finally {
            setIsSearching(false);
          }
        }, 300);
      }
    }

    // Clear validation error when field is changed
    if (formErrors[name]) {
      setFormErrors({
        ...formErrors,
        [name]: null
      });
    }
  }

  const handleSuggestionClick = (name, field) => {
    const selectedCity = field === "from"
      ? fromSuggestions.find(city => city.name === name)
      : toSuggestions.find(city => city.name === name);

    if (selectedCity) {
      setFormData((prev) => ({
        ...prev,
        [field]: `${selectedCity.name} (${selectedCity.code})`,
        [`${field}Code`]: selectedCity.code,
        [`${field}Country`]: selectedCity.country,
        [`${field}Type`]: selectedCity.type
      }));
    }

    // Hide suggestions for both fields after selection
    setShowFromSuggestions(false);
    setShowToSuggestions(false);
  };

  // Add blur handler to hide suggestions when input loses focus
  const handleInputBlur = (field) => {
    // Use setTimeout to allow click events to fire before hiding suggestions
    setTimeout(() => {
      if (field === "from") {
        setShowFromSuggestions(false);
      } else if (field === "to") {
        setShowToSuggestions(false);
      }
    }, 200);
  };

  const validateForm = () => {
    const errors = {};

    if (!formData.from) {
      errors.from = "Please enter departure city";
    }

    if (!formData.to) {
      errors.to = "Please enter destination city";
    }

    if (!formData.departDate) {
      errors.departDate = "Please select departure date";
    }

    if (formData.tripType === "roundTrip" && !formData.returnDate) {
      errors.returnDate = "Please select return date";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  const handleSearch = () => {
    // Validate form before submitting
    if (!validateForm()) {
      return;
    }

    // Helper to extract code from string like "City (CODE)"
    const extractCode = (str) => {
      const match = str && str.match(/\(([A-Z]{3})\)$/);
      return match ? match[1] : null;
    };

    // Ensure we have the city codes
    const searchData = {
      ...formData,
      fromCode: formData.fromCode || extractCode(formData.from) || cityCodeMap[formData.from],
      toCode: formData.toCode || extractCode(formData.to) || cityCodeMap[formData.to]
    };

    if (onSearch) {
      onSearch(searchData);
    } else {
      console.log("Search data:", searchData);
    }
  };

  // Swap From and To
  const handleSwap = () => {
    setFormData((prev) => ({
      ...prev,
      from: prev.to, to: prev.from,
      fromCode: prev.toCode, toCode: prev.fromCode,
      fromCountry: prev.toCountry, toCountry: prev.fromCountry,
      fromType: prev.toType, toType: prev.fromType,
    }));
  };

  // Break a yyyy-mm-dd string into MakeMyTrip-style display parts
  const getDateParts = (dateStr) => {
    if (!dateStr) return null;
    try {
      const d = parseISO(dateStr);
      if (!isValid(d)) return null;
      return { day: format(d, 'dd'), month: format(d, 'MMM'), yy: format(d, 'yy'), weekday: format(d, 'EEEE') };
    } catch {
      return null;
    }
  };

  const departParts = getDateParts(formData.departDate);
  const returnParts = getDateParts(formData.returnDate);
  const fromSubtitle = formData.fromCode ? `${formData.fromCode}${formData.fromCountry ? ', ' + formData.fromCountry : ''}` : '';
  const toSubtitle = formData.toCode ? `${formData.toCode}${formData.toCountry ? ', ' + formData.toCountry : ''}` : '';
  const activeFare = selectedFare || 'regular';
  const anyCalendarOpen = showDepartCalendar || showReturnCalendar || showTravellers;
  // Make custom (non-native) controls operable via keyboard (Enter / Space)
  const onKeyActivate = (fn) => (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fn();
    }
  };

  const totalTravellers = adults + children + infants;
  const adultOptions = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ label: String(n), val: n })).concat([{ label: '>9', val: 10, over: true }]);
  const childOptions = [0, 1, 2, 3, 4, 5, 6].map((n) => ({ label: String(n), val: n })).concat([{ label: '>6', val: 7, over: true }]);
  const classOptions = [
    { value: 'ECONOMY', label: 'Economy/Premium Economy' },
    { value: 'PREMIUM_ECONOMY', label: 'Premium Economy' },
    { value: 'BUSINESS', label: 'Business' },
    { value: 'FIRST', label: 'First Class' },
  ];
  const classLabels = {
    ECONOMY: 'Economy/Premium Economy',
    PREMIUM_ECONOMY: 'Premium Economy',
    BUSINESS: 'Business',
    FIRST: 'First Class',
  };

  // Counter grid (Adults / Children / Infants)
  const renderCounter = (label, sub, value, setValue, options) => (
    <div>
      <div className="text-[13px] font-bold text-gray-800">{label}</div>
      <div className="text-xs text-gray-400 mb-2">{sub}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const active = opt.over ? value >= opt.val : value === opt.val;
          return (
            <button
              key={opt.label}
              type="button"
              onClick={() => setValue(opt.val)}
              className={`h-8 min-w-[32px] px-2 rounded-md border text-sm font-semibold transition-colors ${active ? 'bg-[#055B75] text-white border-[#055B75]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#055B75]'}`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );

  const categoryTabs = [
    { key: 'cruise', label: 'Cruise', Icon: Ship, to: '/cruise' },
    { key: 'flight', label: 'Flight', Icon: Plane, to: '/flights', active: true },
    { key: 'packages', label: 'Packages', Icon: Package, to: '/packages' },
    { key: 'hotels', label: 'Hotels', Icon: Hotel, to: '/hotels' },
  ];

  const fareOptions = [
    { key: 'regular', title: 'Regular', sub: 'Regular fares' },
    { key: 'student', title: 'Student', sub: 'Extra discounts / baggage' },
    { key: 'armed', title: 'Armed Forces', sub: 'Up to ₹600 off' },
    { key: 'gst', title: 'Have a GST number?', sub: 'Up to 10% extra savings' },
    { key: 'senior', title: 'Senior Citizen', sub: 'Up to ₹600 off' },
    { key: 'doctor', title: 'Doctor & Nurses', sub: 'Up to ₹600 off' },
  ];

  return (
    <div className="w-full max-w-5xl mx-auto text-left font-sans">
      {/* ===== Unified booking widget (MakeMyTrip-style) ===== */}
      <div className="relative bg-white rounded-3xl shadow-[0_28px_70px_-16px_rgba(8,40,52,0.45)] ring-1 ring-black/[0.06] pb-14">

        {/* Booking category tabs */}
        <div className="flex items-center justify-center gap-1 px-2 sm:px-4 pt-3 border-b border-gray-100 overflow-x-auto hide-scrollbar">
          {categoryTabs.map(({ key, label, Icon, to, active }) => (
            <button
              key={key}
              type="button"
              onClick={() => navigate(to)}
              aria-current={active ? 'page' : undefined}
              className={`relative flex flex-col items-center gap-1 px-5 sm:px-8 pb-3 pt-1 transition-colors ${active ? 'text-[#055B75]' : 'text-gray-500 hover:text-[#055B75]'}`}
            >
              <Icon className="h-6 w-6" strokeWidth={1.75} />
              <span className="text-[13px] font-semibold whitespace-nowrap">{label}</span>
              {active && <span className="absolute bottom-0 left-1/2 -translate-x-1/2 h-[3px] w-10 rounded-full bg-[#055B75]" />}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className={`px-4 sm:px-6 pt-5 ${anyCalendarOpen ? 'relative z-[60]' : ''}`}>
          {/* Trip type + tagline */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-5">
            {[
              { key: 'oneWay', label: 'One Way' },
              { key: 'roundTrip', label: 'Round Trip' },
            ].map(({ key, label }) => {
              const checked = formData.tripType === key;
              return (
                <button key={key} type="button" onClick={() => handleTripTypeChange(key)} className="flex items-center gap-2">
                  <span className={`flex items-center justify-center h-4 w-4 rounded-full border ${checked ? 'border-[#055B75]' : 'border-gray-300'}`}>
                    {checked && <span className="h-2 w-2 rounded-full bg-[#055B75]" />}
                  </span>
                  <span className={`text-sm ${checked ? 'text-gray-900 font-semibold' : 'text-gray-600'}`}>{label}</span>
                </button>
              );
            })}
            <span className="flex items-center gap-2 opacity-50 cursor-not-allowed" title="Coming soon">
              <span className="h-4 w-4 rounded-full border border-gray-300" />
              <span className="text-sm text-gray-500">Multi City</span>
            </span>
            <p className="ml-auto hidden md:block text-sm text-gray-500">Book International &amp; Domestic Flights</p>
          </div>

          {/* Fields */}
          <div className={`flex flex-col lg:flex-row rounded-xl border border-gray-200 ${anyCalendarOpen ? 'relative z-20' : ''}`}>
            {/* From */}
            <label className="relative flex-[1.4] px-5 py-4 cursor-text hover:bg-[#055B75]/[0.03] focus-within:bg-[#055B75]/[0.04] focus-within:ring-2 focus-within:ring-inset focus-within:ring-[#055B75]/30 transition-colors block">
              <span className="block text-sm text-gray-500 mb-1">From</span>
              <input
                type="text" name="from" value={formData.from || ""}
                onChange={handleInputChange} onBlur={() => handleInputBlur("from")}
                placeholder="City or airport"
                className="w-full border-0 p-0 bg-transparent outline-none focus:ring-0 text-2xl md:text-[27px] leading-tight font-black text-gray-900 placeholder:text-gray-300 placeholder:font-medium placeholder:text-base"
              />
              <span className="block text-xs text-gray-500 mt-1 truncate">{fromSubtitle || ' '}</span>
              {showFromSuggestions && fromSuggestions.length > 0 && (
                <div className="absolute z-30 left-3 top-full w-[280px] max-w-[88vw] bg-white rounded-lg shadow-xl border border-gray-200 max-h-60 overflow-auto">
                  {fromSuggestions.map((c, i) => (
                    <div key={i} className="px-4 py-2.5 hover:bg-gray-50 cursor-pointer border-b last:border-0 border-gray-100"
                      onClick={() => handleSuggestionClick(c.name, "from")}>
                      <div className="font-semibold text-gray-800 text-sm">{c.name}</div>
                      <div className="text-xs text-gray-500 flex justify-between"><span>{c.code}</span><span>{c.country}</span></div>
                    </div>
                  ))}
                </div>
              )}
              {formErrors.from && <span className="block text-red-500 text-xs mt-1">{formErrors.from}</span>}
            </label>

            {/* To — extra left gutter on desktop keeps the input clear of the swap control */}
            <label className="relative flex-[1.4] px-5 lg:pl-10 py-4 cursor-text hover:bg-[#055B75]/[0.03] focus-within:bg-[#055B75]/[0.04] focus-within:ring-2 focus-within:ring-inset focus-within:ring-[#055B75]/30 transition-colors block border-t lg:border-t-0 lg:border-l border-gray-200">
              <span className="block text-sm text-gray-500 mb-1">To</span>
              <input
                type="text" name="to" value={formData.to || ""}
                onChange={handleInputChange} onBlur={() => handleInputBlur("to")}
                placeholder="City or airport"
                className="w-full border-0 p-0 bg-transparent outline-none focus:ring-0 text-2xl md:text-[27px] leading-tight font-black text-gray-900 placeholder:text-gray-300 placeholder:font-medium placeholder:text-base"
              />
              <span className="block text-xs text-gray-500 mt-1 truncate">{toSubtitle || ' '}</span>
              {showToSuggestions && toSuggestions.length > 0 && (
                <div className="absolute z-30 left-3 top-full w-[280px] max-w-[88vw] bg-white rounded-lg shadow-xl border border-gray-200 max-h-60 overflow-auto">
                  {toSuggestions.map((c, i) => (
                    <div key={i} className="px-4 py-2.5 hover:bg-gray-50 cursor-pointer border-b last:border-0 border-gray-100"
                      onClick={() => handleSuggestionClick(c.name, "to")}>
                      <div className="font-semibold text-gray-800 text-sm">{c.name}</div>
                      <div className="text-xs text-gray-500 flex justify-between"><span>{c.code}</span><span>{c.country}</span></div>
                    </div>
                  ))}
                </div>
              )}
              {formErrors.to && <span className="block text-red-500 text-xs mt-1">{formErrors.to}</span>}

              {/* Swap origin / destination — rendered LAST so the To input stays the
                  label's primary control (a label binds to its first labelable child) */}
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleSwap(); }}
                aria-label="Swap origin and destination"
                className="absolute z-20 left-1/2 -translate-x-1/2 -top-4 lg:left-0 lg:top-1/2 lg:-translate-y-1/2 h-8 w-8 rounded-full bg-white border border-gray-300 shadow-md flex items-center justify-center text-[#055B75] hover:bg-[#055B75] hover:text-white transition-colors"
              >
                <ArrowLeftRight className="h-4 w-4" />
              </button>
            </label>

            {/* Departure */}
            <div ref={departCalendarRef}
              role="button" tabIndex={0} aria-haspopup="dialog" aria-expanded={showDepartCalendar} aria-label="Select departure date"
              className={`relative flex-1 px-5 py-4 cursor-pointer hover:bg-[#055B75]/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#055B75]/40 transition-colors border-t lg:border-t-0 lg:border-l border-gray-200 ${showDepartCalendar ? 'z-50' : ''}`}
              onClick={() => { setShowDepartCalendar((v) => !v); setShowReturnCalendar(false); }}
              onKeyDown={onKeyActivate(() => { setShowDepartCalendar((v) => !v); setShowReturnCalendar(false); })}>
              <span className="block text-sm text-gray-500 mb-1">Departure</span>
              {departParts ? (
                <>
                  <p className="leading-none"><span className="text-[27px] font-black text-gray-900">{departParts.day}</span> <span className="text-base text-gray-700 align-top">{departParts.month}'{departParts.yy}</span></p>
                  <span className="block text-xs text-gray-500 mt-1">{departParts.weekday}</span>
                </>
              ) : <p className="text-sm text-gray-400 mt-2">Select date</p>}
              {showDepartCalendar && (
                <div onClick={(e) => e.stopPropagation()}>
                  <CustomFlightCalendar
                    selectedDate={formData.departDate} minDate={new Date()}
                    originCode={formData.fromCode || (formData.from?.match(/\(([A-Z]{3})\)/)?.[1])}
                    destinationCode={formData.toCode || (formData.to?.match(/\(([A-Z]{3})\)/)?.[1])}
                    onSelect={(date) => { handleInputChange({ target: { name: 'departDate', value: date } }); setShowDepartCalendar(false); }}
                    onClose={() => setShowDepartCalendar(false)} />
                </div>
              )}
              {formErrors.departDate && <span className="block text-red-500 text-xs mt-1">{formErrors.departDate}</span>}
            </div>

            {/* Return */}
            <div ref={returnCalendarRef}
              role="button" tabIndex={0} aria-haspopup="dialog" aria-expanded={showReturnCalendar} aria-label="Select return date"
              className={`relative flex-1 px-5 py-4 cursor-pointer hover:bg-[#055B75]/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#055B75]/40 transition-colors border-t lg:border-t-0 lg:border-l border-gray-200 ${showReturnCalendar ? 'z-50' : ''}`}
              onClick={() => {
                if (formData.tripType !== 'roundTrip') handleTripTypeChange('roundTrip');
                setShowReturnCalendar((v) => !v); setShowDepartCalendar(false);
              }}
              onKeyDown={onKeyActivate(() => {
                if (formData.tripType !== 'roundTrip') handleTripTypeChange('roundTrip');
                setShowReturnCalendar((v) => !v); setShowDepartCalendar(false);
              })}>
              <span className="block text-sm text-gray-500 mb-1">Return</span>
              {formData.tripType === 'roundTrip' && returnParts ? (
                <>
                  <p className="leading-none"><span className="text-[27px] font-black text-gray-900">{returnParts.day}</span> <span className="text-base text-gray-700 align-top">{returnParts.month}'{returnParts.yy}</span></p>
                  <span className="block text-xs text-gray-500 mt-1">{returnParts.weekday}</span>
                </>
              ) : <p className="text-xs text-gray-400 mt-1 leading-snug max-w-[150px]">Tap to add a return date for bigger discounts</p>}
              {showReturnCalendar && (
                <div onClick={(e) => e.stopPropagation()}>
                  <CustomFlightCalendar
                    selectedDate={formData.returnDate} minDate={formData.departDate ? parseISO(formData.departDate) : new Date()}
                    originCode={formData.fromCode || (formData.from?.match(/\(([A-Z]{3})\)/)?.[1])}
                    destinationCode={formData.toCode || (formData.to?.match(/\(([A-Z]{3})\)/)?.[1])}
                    onSelect={(date) => { handleInputChange({ target: { name: 'returnDate', value: date } }); setShowReturnCalendar(false); }}
                    onClose={() => setShowReturnCalendar(false)} />
                </div>
              )}
              {formErrors.returnDate && <span className="block text-red-500 text-xs mt-1">{formErrors.returnDate}</span>}
            </div>

            {/* Travellers & Class */}
            <div ref={travellersRef}
              role="button" tabIndex={0} aria-haspopup="dialog" aria-expanded={showTravellers} aria-label="Select travellers and class"
              className={`relative flex-[1.2] px-5 py-4 cursor-pointer hover:bg-[#055B75]/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#055B75]/40 transition-colors border-t lg:border-t-0 lg:border-l border-gray-200 ${showTravellers ? 'z-50' : ''}`}
              onClick={() => { setShowTravellers((v) => !v); setShowDepartCalendar(false); setShowReturnCalendar(false); }}
              onKeyDown={onKeyActivate(() => { setShowTravellers((v) => !v); setShowDepartCalendar(false); setShowReturnCalendar(false); })}>
              <span className="block text-sm text-gray-500 mb-1">Travellers &amp; Class</span>
              <p className="leading-none">
                <span className="text-[27px] font-black text-gray-900">{totalTravellers}</span>{' '}
                <span className="text-base text-gray-700">{totalTravellers > 1 ? 'Travellers' : 'Traveller'}</span>
              </p>
              <span className="block text-xs text-gray-500 mt-1 truncate">{classLabels[formData.travelClass || 'ECONOMY']}</span>

              {showTravellers && (
                <div onClick={(e) => e.stopPropagation()}
                  className="absolute right-0 top-full mt-2 w-[560px] max-w-[88vw] bg-white rounded-xl shadow-2xl border border-gray-200 p-4 z-[100] text-left cursor-default">
                  {renderCounter('ADULTS (12y +)', 'on the day of travel', adults, setAdults, adultOptions)}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 mt-4">
                    {renderCounter('CHILDREN (2y - 12y)', 'on the day of travel', children, setChildren, childOptions)}
                    {renderCounter('INFANTS (below 2y)', 'on the day of travel', infants, setInfants, childOptions)}
                  </div>
                  <div className="mt-4">
                    <div className="text-[13px] font-bold text-gray-800 mb-2 uppercase tracking-wide">Choose Travel Class</div>
                    <div className="flex flex-wrap gap-2">
                      {classOptions.map(({ value, label }) => {
                        const on = (formData.travelClass || 'ECONOMY') === value;
                        return (
                          <button key={value} type="button"
                            onClick={() => setFormData((p) => ({ ...p, travelClass: value }))}
                            className={`px-3 py-2 rounded-md border text-sm font-medium transition-colors ${on ? 'bg-[#055B75] text-white border-[#055B75]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#055B75]'}`}>
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex justify-end mt-4">
                    <button type="button" onClick={() => setShowTravellers(false)}
                      className="px-8 py-2 rounded-full bg-gradient-to-r from-[#055B75] to-[#0890BC] text-white text-sm font-bold tracking-wide shadow-md hover:shadow-lg">
                      APPLY
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Special fares */}
          <div className="mt-5 flex flex-col sm:flex-row sm:items-stretch gap-x-4 gap-y-3">
            <div className="flex items-center shrink-0">
              <span className="text-xs font-extrabold tracking-wide text-gray-800 uppercase leading-tight">Special Fares</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {fareOptions.map(({ key, title, sub }) => {
                const on = activeFare === key;
                return (
                  <button key={key} type="button" onClick={() => setSelectedFare(key)}
                    className={`text-left rounded-md border px-3 py-1.5 min-w-[118px] transition-colors ${on ? 'border-[#055B75] bg-[#055B75]/[0.06]' : 'border-gray-200 hover:border-gray-300 bg-white'}`}>
                    <div className={`text-[13px] font-bold ${on ? 'text-[#055B75]' : 'text-gray-700'}`}>{title}</div>
                    <div className="text-[11px] text-gray-400">{sub}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Search button */}
        <button
          type="button"
          onClick={handleSearch}
          aria-label="Search flights"
          className="absolute left-1/2 -translate-x-1/2 -bottom-6 h-12 px-16 rounded-full bg-gradient-to-r from-[#055B75] to-[#0890BC] text-white text-lg font-bold tracking-[0.15em] shadow-lg hover:shadow-xl hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#055B75]/30 transition-all duration-300 flex items-center justify-center"
        >
          SEARCH
        </button>
      </div>
    </div>
  );
}

