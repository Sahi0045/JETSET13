import React, { useState, useEffect } from "react";
import { makeOrderRef } from '../../../utils/orderRef';
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { Check, Printer, Download, Share2, ChevronDown, ChevronUp, CheckCircle, UserCircle, Plus, Edit, Save, Briefcase, Luggage, Info, ShieldCheck, Clock, PlusCircle } from "lucide-react";
import Navbar from "../Navbar";
import Footer from "../Footer";
import withPageElements from "../PageWrapper";
import Price from "../../../Components/Price";
import currencyService from "../../../Services/CurrencyService";
import supabase from "../../../lib/supabase";
import ArcPayService from "../../../Services/ArcPayService";
import { useLocationContext } from '../../../Context/LocationContext';
import { allAirports } from './airports';
import PricingService from '../../../Services/PricingService';
import { usePriceConfig } from '../../../hooks/queries';
import CouponInput from '../../../components/CouponInput';
import FlightFareRules from './FlightFareRules';
import { formatCheckedBag } from '../../../utils/baggage';
import FlightCancellationPolicy from './FlightCancellationPolicy';
import apiConfig from '@/config/api';
// The same formula checkout verifies the charge with, so this page can never
// quote a total the server will not accept.
import { computeFlightCharge, passengerAgeProblem, PASSENGER_TYPES } from '../../../../../shared/flightCharge';
import "./booking-confirmation.css";

// Passport / travel-document fields only matter on international routes. Map each
// IATA code to its country; an UNKNOWN airport defaults to "international" so we
// never hide the passport field on a real international ticket (which would fail
// issuance) — we only hide it when both ends are confidently the same country.
const IATA_TO_COUNTRY = new Map(allAirports.map((a) => [a.code, a.country]));
const isInternationalRoute = (depCode, arrCode) => {
  const dep = IATA_TO_COUNTRY.get((depCode || '').toUpperCase());
  const arr = IATA_TO_COUNTRY.get((arrCode || '').toUpperCase());
  if (!dep || !arr) return true;
  return dep !== arr;
};


function FlightBookingConfirmation() {
  const routerLocation = useLocation();
  const { country, callingCode, currency: userCurrency } = useLocationContext();
  const navigate = useNavigate();
  const { bookingId } = useParams();
  const [bookingDetails, setBookingDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [editMode, setEditMode] = useState(true); // Start in edit mode for new bookings
  // Collapsible passenger cards: null → first card open by default; '' → all
  // collapsed; otherwise the id of the one open card. Keeps a long multi-pax
  // form short — one card expanded at a time.
  const [expandedPassengerId, setExpandedPassengerId] = useState(null);
  const [showImportantInfo, setShowImportantInfo] = useState(false); // collapsed by default to shorten the page
  const [passengerData, setPassengerData] = useState([]);
  // Seats, extra bags, "travel insurance", "airport transfer" and a "VIP
  // service" used to be offered here and added to the charge. None of them was
  // ever sent to the airline or to any supplier: the customer paid for a seat
  // nobody requested, a bag never added to the booking, and insurance that did
  // not exist. They stay off the page until each is a real, fulfilled product.
  const { data: priceConfig, error: priceConfigError } = usePriceConfig('all');
  const [appliedCoupon, setAppliedCoupon] = useState(null); // { couponId, code, discountAmount, finalTotal }
  // The total a coupon's discount was computed on, so a changed total drops it.
  const couponBase = React.useRef(null);
  // The airline's price for this offer, checked on arrival and again by the
  // server at checkout. Null until the check answers; the search price stands.
  const [pricedFare, setPricedFare] = useState(null);
  const [fareNotice, setFareNotice] = useState(null);
  const [checkingOut, setCheckingOut] = useState(false);
  const [calculatedFare, setCalculatedFare] = useState({
    baseFare: 0,
    totalTax: 0,
    serviceFee: 0,
    totalAmount: 0,
    passengers: 1,
    currency: 'USD'
  });
  const [expandedSections, setExpandedSections] = useState({
    flightDetails: true,
    passengerDetails: true,
    paymentDetails: true,
    contactDetails: true,
    refundDetails: true,
    visaRequirements: true
  });

  // Country code state
  const [selectedCountryCode, setSelectedCountryCode] = useState(callingCode || '+91');
  const [availableCountryCodes] = useState([
    { code: '+91', country: 'India' },
    { code: '+1', country: 'USA/Canada' },
    { code: '+44', country: 'UK' },
    { code: '+61', country: 'Australia' },
    { code: '+81', country: 'Japan' },
    { code: '+49', country: 'Germany' },
    { code: '+33', country: 'France' },
    { code: '+971', country: 'UAE' },
    { code: '+65', country: 'Singapore' },
    { code: '+60', country: 'Malaysia' },
    { code: '+66', country: 'Thailand' },
    { code: '+84', country: 'Vietnam' },
    { code: '+62', country: 'Indonesia' },
    // Add more as needed
  ]);

  // Nationality countries list
  const countries = [
    { code: 'IN', name: 'India', dial: '+91' }, { code: 'US', name: 'United States', dial: '+1' },
    { code: 'GB', name: 'United Kingdom', dial: '+44' }, { code: 'CA', name: 'Canada', dial: '+1' },
    { code: 'AU', name: 'Australia', dial: '+61' }, { code: 'DE', name: 'Germany', dial: '+49' },
    { code: 'FR', name: 'France', dial: '+33' }, { code: 'JP', name: 'Japan', dial: '+81' },
    { code: 'AE', name: 'UAE', dial: '+971' }, { code: 'SG', name: 'Singapore', dial: '+65' },
    { code: 'MY', name: 'Malaysia', dial: '+60' }, { code: 'TH', name: 'Thailand', dial: '+66' },
    { code: 'VN', name: 'Vietnam', dial: '+84' }, { code: 'ID', name: 'Indonesia', dial: '+62' },
    { code: 'CN', name: 'China', dial: '+86' }, { code: 'KR', name: 'South Korea', dial: '+82' },
    { code: 'IT', name: 'Italy', dial: '+39' }, { code: 'ES', name: 'Spain', dial: '+34' },
    { code: 'BR', name: 'Brazil', dial: '+55' }, { code: 'MX', name: 'Mexico', dial: '+52' },
    { code: 'RU', name: 'Russia', dial: '+7' }, { code: 'ZA', name: 'South Africa', dial: '+27' },
    { code: 'NZ', name: 'New Zealand', dial: '+64' }, { code: 'PH', name: 'Philippines', dial: '+63' },
    { code: 'PK', name: 'Pakistan', dial: '+92' }, { code: 'BD', name: 'Bangladesh', dial: '+880' },
    { code: 'LK', name: 'Sri Lanka', dial: '+94' }, { code: 'NP', name: 'Nepal', dial: '+977' },
    { code: 'SA', name: 'Saudi Arabia', dial: '+966' }, { code: 'QA', name: 'Qatar', dial: '+974' },
    { code: 'KW', name: 'Kuwait', dial: '+965' }, { code: 'BH', name: 'Bahrain', dial: '+973' },
    { code: 'OM', name: 'Oman', dial: '+968' }, { code: 'EG', name: 'Egypt', dial: '+20' },
    { code: 'KE', name: 'Kenya', dial: '+254' }, { code: 'NG', name: 'Nigeria', dial: '+234' },
    { code: 'TR', name: 'Turkey', dial: '+90' }, { code: 'PT', name: 'Portugal', dial: '+351' },
    { code: 'NL', name: 'Netherlands', dial: '+31' }, { code: 'SE', name: 'Sweden', dial: '+46' },
    { code: 'CH', name: 'Switzerland', dial: '+41' }, { code: 'AT', name: 'Austria', dial: '+43' },
    { code: 'BE', name: 'Belgium', dial: '+32' }, { code: 'IE', name: 'Ireland', dial: '+353' },
    { code: 'FI', name: 'Finland', dial: '+358' }, { code: 'NO', name: 'Norway', dial: '+47' },
    { code: 'DK', name: 'Denmark', dial: '+45' }, { code: 'PL', name: 'Poland', dial: '+48' },
    { code: 'HK', name: 'Hong Kong', dial: '+852' }, { code: 'TW', name: 'Taiwan', dial: '+886' },
  ];

  const [nationalityDropdown, setNationalityDropdown] = useState({ open: false, passengerId: null });
  const [nationalitySearch, setNationalitySearch] = useState({});

  // Date restrictions for DOB
  const today = new Date().toISOString().split('T')[0];
  const minDOB = '1920-01-01';

  // Update selected country code when context changes
  useEffect(() => {
    if (callingCode) {
      setSelectedCountryCode(callingCode);
    }
  }, [callingCode]);

  // Helper to get city name from airport code
  const getCityName = (code) => {
    if (!code) return '';
    const airport = allAirports.find(a => a.code === code);
    return airport ? airport.name : code;
  };

  // Shared with the search card and the fare selector, which each grew their
  // own half-right copy of this and disagreed on screen.
  const formatBaggage = formatCheckedBag;


  // Check authentication status on component mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        // getSession() can return null before the session is restored from the
        // refresh cookie, which wrongly showed the "log in" banner to a
        // signed-in user. Fall back to the client-side auth markers the rest of
        // the app sets, and keep listening for the session to arrive.
        let loggedIn = !!session;
        if (!loggedIn) {
          try {
            loggedIn = localStorage.getItem('isAuthenticated') === 'true'
              || !!localStorage.getItem('user')
              || !!localStorage.getItem('adminUser');
          } catch { /* storage blocked */ }
        }
        setIsLoggedIn(loggedIn);
      } catch (error) {
        console.error('Auth check error:', error);
        setIsLoggedIn(false);
      }
    };
    checkAuth();
    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setIsLoggedIn(true);
    });
    return () => authSub?.subscription?.unsubscribe();
  }, []);

  // A mock-booking fallback used to live here (a bundled fixture, now deleted). Any
  // load without router state - a refresh, back-navigation, a bookmark, a
  // restored tab - silently rendered a hardcoded Air India booking under two
  // strangers' names, unlabelled, and let the customer pay for it. There is
  // no honest fallback: the offer exists only in the search page's state.

  // The mock-booking transformer that lived here is gone with its only caller.
  // It was where "Economy", "23 KG", "<city> Airport" and a $30 VIP fee were
  // invented for a data shape nothing produces.

  // Transform flight data from search page to booking format
  const transformFlightData = (flightData, config) => {
    if (!flightData) return null;

    // Real Amadeus fare components:
    //  - fareTotal  = grandTotal (what the airline charges, incl. its taxes)
    //  - amaBase    = price.base (true base fare, before airline taxes)
    //  - airlineTaxes = fareTotal - amaBase (true airline taxes & surcharges)
    const fareTotal = parseFloat(
      flightData.price?.amount ||
      flightData.price?.grandTotal ||
      flightData.price?.total ||
      flightData.originalOffer?.price?.grandTotal ||
      flightData.originalOffer?.price?.total ||
      0
    );
    const amaBase = parseFloat(flightData.price?.base || flightData.originalOffer?.price?.base || 0);
    const baseFareReal = (amaBase > 0 && amaBase <= fareTotal) ? amaBase : fareTotal;
    const airlineTaxes = Math.max(0, fareTotal - baseFareReal);

    // The platform fee, from the formula checkout verifies. `fareTotal` is the
    // offer's all-passenger total, priced for exactly these travellers.
    const pricedTravellers = flightData.originalOffer?.travelerPricings?.length || 1;
    const fee = computeFlightCharge({ fareTotal, passengers: pricedTravellers, config });
    const fixedFee = fee.fixedFee;
    const percentageFee = fee.percentageFee;
    const serviceFee = fee.serviceFee;

    return {
      bookingId: bookingId || null,
      flight: {
        airline: flightData.airline.name,
        airlineCode: flightData.airline.code,
        airlineLogo: flightData.airline.logo,
        // flightData.id is the OFFER id ("1"), not the flight number - this
        // rendered "AI 1" on the page the customer confirms, while the search
        // results correctly showed AI-9486.
        flightNumber: flightData.flightNumber
          || `${flightData.airline.code} ${flightData.airline.flightNumber ?? ''}`.trim(),
        departureCode: flightData.departure.airport,
        arrivalCode: flightData.arrival.airport,
        departureCity: flightData.departure.cityName || flightData.departure.airport,
        arrivalCity: flightData.arrival.cityName || flightData.arrival.airport,
        departureTime: flightData.departure.time,
        arrivalTime: flightData.arrival.time,
        duration: flightData.duration,
        departureDate: flightData.departure.rawDate || flightData.departure.date,
        arrivalDate: flightData.arrival.rawDate || flightData.arrival.date,
        cabin: flightData.cabin,
        fareType: flightData.class,
        // Carried through so the summary can say what the fare says. It was
        // never passed, so this page read every fare as "Non-Refundable".
        refundable: flightData.refundable ?? null,
        brandedFare: flightData.brandedFare || null,
        brandedFareLabel: flightData.brandedFareLabel || null,
        operatingCarrier: flightData.operatingCarrier || null,
        operatingAirlineName: flightData.operatingAirlineName || null,
        numberOfBookableSeats: flightData.numberOfBookableSeats || null,
        lastTicketingDate: flightData.lastTicketingDate || null,
        stops: flightData.stops,
        stopDetails: flightData.stopDetails || [],
        basePrice: baseFareReal,
        tax: airlineTaxes,
        serviceFee: serviceFee,
        fixedFee: fixedFee,
        percentageFee: percentageFee,
        totalPrice: baseFareReal + airlineTaxes + serviceFee,
        departureAirport: flightData.departure.terminal
          ? `${flightData.departure.airport} Terminal ${flightData.departure.terminal}`
          : flightData.departure.airport,
        arrivalAirport: flightData.arrival.terminal
          ? `${flightData.arrival.airport} Terminal ${flightData.arrival.terminal}`
          : flightData.arrival.airport,
        departureTerminal: flightData.departure.terminal || '',
        arrivalTerminal: flightData.arrival.terminal || '',
        segments: flightData.segments.map(segment => ({
          departure: {
            airport: segment.departure.airport,
            terminal: segment.departure.terminal,
            time: segment.departure.time,
            at: segment.departure.at || null,
            cityName: segment.departure.cityName || getCityName(segment.departure.airport) || segment.departure.airport
          },
          arrival: {
            airport: segment.arrival.airport,
            terminal: segment.arrival.terminal,
            time: segment.arrival.time,
            at: segment.arrival.at || null,
            cityName: segment.arrival.cityName || getCityName(segment.arrival.airport) || segment.arrival.airport
          },
          duration: segment.duration,
          aircraft: segment.aircraft || 'Unknown',
          carrier: segment.airline?.code || flightData.airline.code,
          carrierName: segment.airline?.name || flightData.airline.name,
          carrierLogo: segment.airline?.logo || flightData.airline.logo,
          operatingCarrier: segment.operatingCarrier || null,
          operatingAirlineName: segment.operatingAirlineName || null,
          number: segment.flightNumber
        })),
        price: {
          base: baseFareReal,           // real Amadeus base fare
          airlineTaxes: airlineTaxes,   // real airline taxes & surcharges (total - base)
          serviceFee: serviceFee,       // platform convenience fee (admin markup)
          fixedFee: fixedFee,
          percentageFee: percentageFee,
          totalTaxes: airlineTaxes,     // backward-compat alias = real airline taxes
          total: baseFareReal + airlineTaxes + serviceFee,
          currency: flightData.price?.currency || flightData.originalOffer?.price?.currency || 'USD'
        }
      },
      baggage: {
        cabin: flightData.baggage.cabin,
        checkIn: flightData.baggage.checked
      },
      passengers: [],
      contact: {
        email: "",
        phone: ""
      },
      // International if any leg crosses a border, not only the two ends: a
      // connection abroad needs a passport too. This compared the two airport
      // codes, so every flight with different ends - all of them - counted.
      isInternational: (flightData.segments || []).some((seg) =>
        isInternationalRoute(seg.departure?.airport, seg.arrival?.airport))
        || isInternationalRoute(flightData.departure.airport, flightData.arrival.airport)
    };
  };

  // Fetch booking details.
  // The cancelled flag prevents a stale fetch from clobbering state after the
  // user navigates away or the booking id changes.
  useEffect(() => {
    let cancelled = false;

    // Nothing on this page can be quoted before the real pricing configuration
    // arrives. The hardcoded defaults are $25 + 5% against a configured $1 + 0%,
    // and this figure is what gets charged - quoting from them bills a fee
    // nobody set.
    //
    // The gate lives OUTSIDE the try below on purpose: returning from inside it
    // ran the `finally`, which cleared `loading` on the very first render and
    // left the page showing an empty shell - Rs 0 fare, "undefined Stop",
    // no flight number - for as long as the config took to load, or forever if
    // it failed. Stay in the loading state while it is pending, and say so
    // plainly when it cannot be loaded at all.
    if (priceConfigError) {
      setError("We couldn't load current pricing, so we can't show your fare. Please refresh, or call (877) 538-7380 and we'll complete the booking for you.");
      setLoading(false);
      return;
    }
    if (!priceConfig) {
      setLoading(true);
      return;
    }

    setLoading(true);

    const getBookingDetails = async () => {
      try {
        const hasSearchState = !!routerLocation.state?.flightData;
        const config = priceConfig;
        if (cancelled) return;

        let bookingData;
        if (hasSearchState) {
          console.log("Using flight data from search page", routerLocation.state.flightData);
          bookingData = transformFlightData(routerLocation.state.flightData, config);
        } else {
          setError("No flight data available. Please return to the search page and try again.");
          return;
        }

        if (!bookingData) {
          throw new Error("Failed to process flight data");
        }

        setBookingDetails(bookingData);
        updateFareSummary(bookingData);
      } catch (error) {
        if (cancelled) return;
        console.error("Error getting booking details:", error);
        setError(error.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    getBookingDetails();
    return () => { cancelled = true; };
  }, [routerLocation.state, bookingId, priceConfig, priceConfigError]);

  // Recompute when the airline's checked price arrives or the fee config changes.
  useEffect(() => {
    if (bookingDetails) updateFareSummary();
  }, [pricedFare, priceConfig]);

  // Check the fare with the airline on arrival. Search results can be minutes
  // old, and a fare that had moved or expired used to be found only after the
  // card was charged. Checkout checks again, server-side, before any payment.
  useEffect(() => {
    const offer = routerLocation.state?.flightData?.originalOffer;
    if (!bookingDetails || !offer) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(apiConfig.endpoints.flights.price, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ flightOffer: offer }),
        });
        const body = await res.json();
        const price = body?.data?.flightOffers?.[0]?.price;
        const total = Number(price?.grandTotal ?? price?.total);
        if (cancelled || !body?.success || !Number.isFinite(total) || total <= 0) return;
        const searched = Number(bookingDetails.flight.price.base || 0) + Number(bookingDetails.flight.price.airlineTaxes || 0);
        setPricedFare({ total, base: Number(price.base) || null, currency: price.currency || null });
        if (Math.abs(total - searched) > 0.01) {
          setFareNotice(`The airline's current fare for this flight is ${price.currency || ''} ${total.toFixed(2)}, not the ${searched.toFixed(2)} shown in search. The total below uses the current fare.`);
        }
      } catch {
        // Not fatal: checkout verifies the fare with the airline regardless.
      }
    })();
    return () => { cancelled = true; };
  }, [Boolean(bookingDetails), routerLocation.state]);

  // A coupon's discount was computed on the total at the moment it was applied.
  // If the total changes, the coupon has to be applied again - the page used to
  // go on charging the old, frozen figure.
  useEffect(() => {
    if (appliedCoupon && couponBase.current !== null && couponBase.current !== calculatedFare.totalAmount) {
      setAppliedCoupon(null);
      couponBase.current = null;
      setFareNotice((notice) => notice || 'The total changed, so your coupon was removed. Please apply it again.');
    }
  }, [calculatedFare.totalAmount]);

  // One traveller per passenger the fare was priced for, each locked to the
  // type the airline priced. The form used to start with one "Adult" and let
  // the customer add more "Adults": a one adult + one child search booked the
  // child on an adult fare, whoever was typed second became the child in the
  // airline's system, and every added traveller was charged the whole fare.
  useEffect(() => {
    if (passengerData.length === 0 && bookingDetails) {
      const pricings = routerLocation.state?.flightData?.originalOffer?.travelerPricings;
      const types = Array.isArray(pricings) && pricings.length
        ? pricings.map((p) => p.travelerType || 'ADULT')
        : ['ADULT'];
      setPassengerData(types.map((type, index) => ({
        id: index + 1,
        type,
        title: "",
        firstName: "",
        lastName: "",
        dateOfBirth: "",
        meal: "Regular",
        mobile: "",
        email: "",
        // No default gender: a preselected one went onto the ticket unchecked.
        gender: "",
        requiresWheelchair: false,
        nationality: "",
        passportNumber: "",
        passportExpiry: "",
        countryCode: callingCode || '+91'
      })));
    }
  }, [bookingDetails, passengerData.length]);

  // The fare summary, from the shared formula checkout verifies. The airline's
  // total covers every traveller already; it used to be multiplied by the
  // passenger count again, so two adults were charged four fares.
  const updateFareSummary = (bookingData = bookingDetails) => {
    if (!bookingData?.flight?.price || !priceConfig) return;
    const searched = bookingData.flight.price;
    const fareTotal = pricedFare?.total ?? (Number(searched.base || 0) + Number(searched.airlineTaxes || 0));
    const base = pricedFare?.base ?? Number(searched.base || 0);
    const passengers = routerLocation.state?.flightData?.originalOffer?.travelerPricings?.length || 1;
    const charge = computeFlightCharge({ fareTotal, passengers, config: priceConfig });

    setCalculatedFare({
      baseFare: base,
      totalTax: Math.max(0, Math.round((fareTotal - base) * 100) / 100),
      serviceFee: charge.serviceFee,
      totalAmount: charge.total,
      passengers,
      currency: pricedFare?.currency || searched.currency || 'USD'
    });
  };

  const toggleSection = (section) => {
    setExpandedSections({
      ...expandedSections,
      [section]: !expandedSections[section]
    });
  };

  // Update the formatDate function to handle invalid dates
  const formatDate = (dateString) => {
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) {
        return 'Invalid Date';
      }
      const options = { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' };
      return date.toLocaleDateString('en-US', options);
    } catch (error) {
      return 'Invalid Date';
    }
  };

  // Add a function to format duration
  const formatDuration = (duration) => {
    if (!duration) return '';
    // Handle PT20H20M format
    if (duration.startsWith('PT')) {
      const hours = duration.match(/(\d+)H/)?.[1] || '0';
      const minutes = duration.match(/(\d+)M/)?.[1] || '0';
      return `${hours}h ${minutes}m`;
    }
    return duration;
  };

  // Format just month and day
  const formatShortDate = (dateString) => {
    const date = new Date(dateString);
    const options = { day: 'numeric', month: 'short' };
    return date.toLocaleDateString('en-US', options);
  };

  // Format full date with day of week: "Fri, 13 Feb 2026"
  const formatFullDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  };

  // Format time from ISO datetime: "11:20"
  const formatTimeFromISO = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  };

  // A time value may be an ISO string ("2024-08-10T10:00:00Z") or already
  // "HH:MM". Format the former to a clean time; pass a plain time through.
  // Never render a raw ISO string as the departure/arrival time.
  const displayTime = (v) => {
    const f = formatTimeFromISO(v);
    if (f) return f;
    return String(v || '').includes('T') ? '' : (v || '');
  };

  // Calculate layover duration between two ISO datetimes
  const calcLayover = (arrivalAt, departureAt) => {
    if (!arrivalAt || !departureAt) return '';
    const arr = new Date(arrivalAt);
    const dep = new Date(departureAt);
    const diffMs = dep - arr;
    if (diffMs <= 0) return '';
    const hours = Math.floor(diffMs / 3600000);
    const minutes = Math.floor((diffMs % 3600000) / 60000);
    return `${hours}h ${minutes}m`;
  };

  const handleLogin = () => {
    // In a real app, this would trigger a login flow
    setIsLoggedIn(true);
  };

  const toggleEditMode = () => {
    setEditMode(!editMode);
  };

  const handlePassengerChange = (id, field, value) => {
    const updatedPassengers = passengerData.map((passenger) => {
      if (passenger.id === id) {
        return { ...passenger, [field]: value };
      }
      return passenger;
    });
    setPassengerData(updatedPassengers);

    // Auto-sync contact info with first passenger
    if (passengerData.length > 0 && id === passengerData[0].id) {
      if (field === 'email' || field === 'mobile') {
        setBookingDetails(prev => ({
          ...prev,
          contact: {
            ...prev?.contact,
            [field === 'mobile' ? 'phone' : 'email']: value
          }
        }));
      }
    }
  };

  // No adding or removing travellers here: the fare was priced for the
  // travellers the search asked for. A different party is a new search.

  const savePassengerDetails = () => {
    // In a real app, this would send the updated data to the server
    setEditMode(false);
    // Update the bookingDetails with the new passenger data
    setBookingDetails({
      ...bookingDetails,
      passengers: passengerData
    });
  };

  // Handle proceeding to payment - DIRECT to ARC Pay (bypass FlightPayment.jsx)
  const handleProceedToPayment = async () => {
    if (checkingOut) return;
    const travelDate = bookingDetails?.flight?.departureDate;
    const lastDate = bookingDetails?.flight?.segments?.at?.(-1)?.arrival?.at
      || bookingDetails?.flight?.arrivalDate
      || travelDate;
    const international = Boolean(bookingDetails?.isInternational);

    // Everything the airline needs, checked before payment. The server refuses
    // an incomplete traveller too - but only after the charge, and then has to
    // reverse it. Stopping here costs the customer nothing.
    const problems = [];
    passengerData.forEach((p, index) => {
      const who = `${PASSENGER_TYPES[p.type]?.label || 'Traveller'} ${index + 1}`;
      if (!p.firstName?.trim() || !p.lastName?.trim()) problems.push(`${who}: enter the first and last name exactly as on the ID.`);
      if (!p.dateOfBirth) {
        problems.push(`${who}: enter the date of birth.`);
      } else {
        const ageProblem = passengerAgeProblem(p.type, p.dateOfBirth, travelDate);
        if (ageProblem) problems.push(`${who}: ${ageProblem}`);
      }
      if (!p.gender) problems.push(`${who}: select a gender.`);
      if (index === 0 && !p.mobile) problems.push(`${who}: enter a mobile number for booking updates.`);
      // A passport was optional on international routes, and an international
      // ticket without one cannot be issued.
      if (international) {
        if (!p.nationality) problems.push(`${who}: select a nationality.`);
        if (!p.passportNumber?.trim()) problems.push(`${who}: enter the passport number.`);
        if (!p.passportExpiry) {
          problems.push(`${who}: enter the passport expiry date.`);
        } else if (lastDate && new Date(p.passportExpiry) <= new Date(String(lastDate).slice(0, 10))) {
          problems.push(`${who}: the passport expires before the trip ends.`);
        }
      }
    });
    if (problems.length) {
      alert(`Please check the traveller details:\n\n${problems.join('\n')}`);
      return;
    }

    setCheckingOut(true);
    try {
      const rawFlightData = routerLocation.state?.flightData;
      const amount = appliedCoupon ? appliedCoupon.finalTotal : calculatedFare.totalAmount;

      // The real flight numbers. This used to send the offer id - "AI 1" - as
      // the flight number to the card network, on every segment.
      const carrierCode = rawFlightData?.airline?.code || '';
      const departureAirport = rawFlightData?.departure?.airport || '';
      const arrivalAirport = rawFlightData?.arrival?.airport || '';
      const departureDate = rawFlightData?.departure?.rawDate || rawFlightData?.departure?.date || '';
      const segments = rawFlightData?.segments || [];
      const flightNumber = bookingDetails?.flight?.flightNumber || '';
      const segmentNumber = (seg) => seg.number || seg.flightNumber || '';
      const segmentCarrier = (seg) => seg.carrier || seg.airline?.code || carrierCode;

      const flightDataForArcPay = {
        flightNumber,
        carrierCode,
        origin: departureAirport,
        destination: arrivalAirport,
        departureDate,
        segments: segments.map(seg => ({
          carrierCode: segmentCarrier(seg),
          flightNumber: segmentNumber(seg),
          departure: { iataCode: seg.departure?.airport || departureAirport, at: seg.departure?.at || seg.departure?.time || departureDate },
          arrival: { iataCode: seg.arrival?.airport || arrivalAirport, at: seg.arrival?.at || seg.arrival?.time || '' }
        })),
        originalOffer: rawFlightData?.originalOffer || rawFlightData,
        itineraries: rawFlightData?.itineraries || [{
          segments: segments.map(seg => ({
            carrierCode: segmentCarrier(seg),
            number: segmentNumber(seg),
            departure: { iataCode: seg.departure?.airport || departureAirport, at: seg.departure?.at || seg.departure?.time || departureDate },
            arrival: { iataCode: seg.arrival?.airport || arrivalAirport, at: seg.arrival?.at || seg.arrival?.time || '' }
          }))
        }]
      };

      const finalContact = {
        email: bookingDetails?.contact?.email || passengerData?.[0]?.email || "",
        phone: bookingDetails?.contact?.phone || passengerData?.[0]?.mobile || ""
      };

      const bookingDataForStorage = {
        selectedFlight: rawFlightData,
        originalOffer: rawFlightData?.originalOffer || rawFlightData,
        passengerData,
        bookingDetails: { ...bookingDetails, contact: finalContact },
        calculatedFare,
        amount,
        couponCode: appliedCoupon?.code || null,
        flightData: flightDataForArcPay
      };

      // Not logged: it carries names, dates of birth and passport numbers.
      localStorage.setItem('pendingFlightBooking', JSON.stringify(bookingDataForStorage));

      const orderId = makeOrderRef('FLT');
      const description = `Flight ${flightNumber || carrierCode} - ${departureAirport} to ${arrivalAirport}`;

      const checkoutResponse = await ArcPayService.createHostedCheckout({
        amount,
        // The merchant settles only in USD; the server pins it regardless.
        currency: 'USD',
        orderId,
        bookingType: 'flight',
        // The server evaluates the coupon itself on the total it computes.
        couponCode: appliedCoupon?.code || undefined,
        // No placeholder address: the email step is optional, and a made-up
        // one is where ARC would send the receipt.
        customerEmail: finalContact.email || undefined,
        customerName: passengerData?.[0]
          ? `${passengerData[0].firstName} ${passengerData[0].lastName}`.trim()
          : undefined,
        customerPhone: passengerData?.[0]?.mobile,
        description,
        returnUrl: `${window.location.origin}/payment/callback?orderId=${orderId}&bookingType=flight`,
        cancelUrl: `${window.location.origin}/flights?cancelled=true`,
        flightData: flightDataForArcPay,
        bookingData: bookingDataForStorage,
      });

      if (checkoutResponse.success && checkoutResponse.checkoutUrl) {
        localStorage.setItem('pendingPaymentSession', JSON.stringify({
          sessionId: checkoutResponse.sessionId,
          orderId,
          bookingType: 'flight',
          amount
        }));
        window.location.href = checkoutResponse.checkoutUrl;
        return;
      }

      // The server prices the fare with the airline and computes the total
      // itself. When the figure on this page is out of date it says so, with
      // the current fare, and nothing is charged.
      const refusal = checkoutResponse.error || {};
      if (refusal.code === 'PRICE_CHANGED' && refusal.pricedFare?.total) {
        setPricedFare(refusal.pricedFare);
        setAppliedCoupon(null);
        couponBase.current = null;
        setFareNotice(`${refusal.error} The total has been updated. Nothing has been charged.`);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      alert(refusal.error || 'We could not start the payment. Nothing has been charged. Please try again.');
    } catch (error) {
      console.error('❌ Payment initiation error:', error?.message);
      alert('Payment service temporarily unavailable. Nothing has been charged. Please try again.');
    } finally {
      setCheckingOut(false);
    }
  };



  if (loading) {
    return (
      <div className="booking-confirmation-page">
        <Navbar forceScrolled={true} />
        <div className="booking-confirmation-container flex justify-center items-center h-[60vh]">
          <div className="flex flex-col items-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#055B75] mb-4"></div>
            <p className="text-[#626363]">Loading your booking details...</p>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  // Without a booking there is nothing to review, and the page below would
  // render its placeholders as if there were: "Jetsetters Airlines", "undefined
  // Stop", a Rs 0 total and a live Proceed to Payment button. Say what went
  // wrong and offer a way out instead.
  if (error || !bookingDetails) {
    return (
      <div className="booking-confirmation-page">
        <Navbar forceScrolled={true} />
        <div className="booking-confirmation-container flex justify-center items-center min-h-[60vh] pt-24">
          <div className="max-w-md text-center">
            <h2 className="text-xl font-semibold text-[#0d3d56] mb-2">We can't show this booking</h2>
            <p className="text-[#626363] mb-6">
              {error || "No flight data available. Please return to the search page and try again."}
            </p>
            <div className="flex gap-3 justify-center">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-5 py-2 rounded-md border border-[#055B75] text-[#055B75]"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={() => navigate('/flights')}
                className="px-5 py-2 rounded-md bg-[#055B75] text-white"
              >
                Back to search
              </button>
            </div>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="booking-confirmation-page">
      <div className="booking-background-decor"></div>
      <Navbar forceScrolled={true} />

      <div className="booking-confirmation-container pt-24">
        {/* Header + progress stepper (MakeMyTrip-style) */}
        <div className="booking-header-banner">
          <h1>Review your Booking</h1>
          <div className="booking-stepper">
            <span className="step done"><span className="step-num">✓</span> Flight Selected</span>
            <span className="step-divider" />
            <span className="step active"><span className="step-num">2</span> Review &amp; Travellers</span>
            <span className="step-divider" />
            <span className="step"><span className="step-num">3</span> Payment</span>
            <span className="step-divider" />
            <span className="step"><span className="step-num">4</span> Confirmation</span>
          </div>
        </div>

        <div className="booking-layout grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Left Column - Flight & Passenger Details */}
          <div className="lg:col-span-2">

            {/* Flight Details Card (Boarding Pass Style) */}
            <div className="booking-card flight-card">
              <div className="booking-card-header">
                <h2>
                  <div className="airline-logo-placeholder">
                    {bookingDetails?.flight?.airlineCode || bookingDetails?.flight?.airline?.substring(0, 2).toUpperCase() || "JS"}
                  </div>
                  {bookingDetails?.flight?.airline || 'Jetsetters Airlines'}
                  <span className="opacity-70 font-normal ml-2 text-sm">
                    #{bookingDetails?.flight?.flightNumber}
                  </span>
                </h2>
                <div className="flex items-center gap-2 flex-wrap">
                  {bookingDetails?.flight?.brandedFareLabel && (
                    <span className="text-xs px-2 py-1 bg-white/20 rounded font-medium">
                      {bookingDetails.flight.brandedFareLabel}
                    </span>
                  )}
                  {bookingDetails?.flight?.cabin && (
                    <span className="cabin-class-badge">
                      {bookingDetails.flight.cabin}
                    </span>
                  )}
                </div>
              </div>

              <div className="booking-card-body">
                {/* Route Summary Header */}
                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between mb-4 px-3 py-2.5 bg-gray-50 rounded-lg border border-gray-200">
                  <span className="font-semibold text-[#055B75]">
                    {bookingDetails?.flight?.departureCity} &rarr; {bookingDetails?.flight?.arrivalCity}
                  </span>
                  <div className="flex items-center gap-3 text-sm text-gray-600 whitespace-nowrap flex-shrink-0">
                    <span>{bookingDetails?.flight?.stops === "0" || bookingDetails?.flight?.stops === 0 ? 'Direct' : `${bookingDetails?.flight?.stops} Stop${bookingDetails?.flight?.stops > 1 ? 's' : ''}`}</span>
                    <span className="text-gray-300">|</span>
                    <span className="whitespace-nowrap">Total: {formatDuration(bookingDetails?.flight?.duration)}</span>
                  </div>
                </div>

                {/* Segment-by-segment breakdown */}
                {bookingDetails?.flight?.segments && bookingDetails.flight.segments.length > 1 ? (
                  <div className="space-y-0">
                    {bookingDetails.flight.segments.map((seg, idx) => {
                      const depDate = seg.departure.at ? formatFullDate(seg.departure.at) : formatShortDate(bookingDetails?.flight?.departureDate);
                      const arrDate = seg.arrival.at ? formatFullDate(seg.arrival.at) : '';
                      const depTime = seg.departure.at ? formatTimeFromISO(seg.departure.at) : seg.departure.time;
                      const arrTime = seg.arrival.at ? formatTimeFromISO(seg.arrival.at) : seg.arrival.time;
                      const nextSeg = bookingDetails.flight.segments[idx + 1];
                      const layover = nextSeg ? calcLayover(seg.arrival.at, nextSeg.departure.at) : '';

                      return (
                        <React.Fragment key={idx}>
                          {/* Segment Card */}
                          <div className="itinerary-segment flex gap-4 py-4 px-2 border-b border-gray-100 last:border-b-0">
                            {/* Left - Airline Info */}
                            <div className="segment-airline flex flex-col items-center min-w-[90px] text-center">
                              <img loading="lazy" decoding="async"
                                src={seg.carrierLogo || `https://pics.avs.io/200/200/${(seg.carrier || 'XX').toUpperCase()}.png`}
                                alt={seg.carrierName || seg.carrier}
                                className="w-10 h-10 rounded-full object-contain border border-gray-200 mb-1"
                                onError={(e) => { e.target.style.display = 'none'; }}
                              />
                              <div className="text-xs font-semibold text-gray-700">{seg.carrierName || seg.carrier}</div>
                              <div className="text-[10px] text-gray-500">{seg.number}</div>
                              <div className="text-[10px] text-gray-400">{seg.aircraft !== 'Unknown' ? seg.aircraft : ''}</div>
                            </div>

                            {/* Center - Route */}
                            <div className="segment-route flex-1 flex items-stretch gap-3">
                              {/* Departure */}
                              <div className="route-endpoint departure flex flex-col items-start min-w-[100px] md:min-w-[120px]">
                                <div className="text-xs text-gray-500">{seg.departure.cityName || getCityName(seg.departure.airport)}</div>
                                <div className="text-2xl font-bold text-[#055B75]">{depTime}</div>
                                <div className="text-xs text-gray-500">{depDate}</div>
                                <div className="text-[11px] text-gray-400 mt-0.5">
                                  {getCityName(seg.departure.airport)} Airport{seg.departure.terminal ? `, T${seg.departure.terminal}` : ''}
                                </div>
                              </div>

                              {/* Duration Arrow */}
                              <div className="route-connector flex flex-col items-center justify-center flex-1 min-w-[60px] md:min-w-[80px]">
                                {/* Per-segment elapsed time is deliberately not
                                    carried on the offer: MasterPricer gives
                                    LOCAL airport times with no timezone, so
                                    subtracting them is wrong for any flight
                                    crossing zones. Rendering it anyway printed
                                    "Unknown Duration" on every leg of every
                                    connection. Show nothing rather than a
                                    placeholder or, worse, a computed wrong
                                    number — the itinerary total above is
                                    Amadeus's own elapsed time and is correct. */}
                                {seg.duration ? (
                                  <div className="text-xs text-gray-500 font-medium">{formatDuration(seg.duration)}</div>
                                ) : null}
                                <div className="relative w-full flex items-center my-1">
                                  <div className="flex-1 border-t-2 border-dashed border-gray-300"></div>
                                  <div className="mx-1 text-gray-400 text-sm">&#9992;</div>
                                  <div className="flex-1 border-t-2 border-dashed border-gray-300"></div>
                                </div>
                                {bookingDetails?.flight?.cabin && (
                                  <div className="text-[10px] font-medium px-2 py-0.5 rounded bg-[#e0f2fe] text-[#0369a1]">
                                    {bookingDetails.flight.cabin}
                                  </div>
                                )}
                              </div>

                              {/* Arrival */}
                              <div className="route-endpoint arrival flex flex-col items-end min-w-[100px] md:min-w-[120px] text-right">
                                <div className="text-xs text-gray-500">{seg.arrival.cityName || getCityName(seg.arrival.airport)}</div>
                                <div className="text-2xl font-bold text-[#055B75]">{arrTime}</div>
                                <div className="text-xs text-gray-500">{arrDate}</div>
                                <div className="text-[11px] text-gray-400 mt-0.5">
                                  {getCityName(seg.arrival.airport)} Airport{seg.arrival.terminal ? `, T${seg.arrival.terminal}` : ''}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Layover Banner between segments */}
                          {nextSeg && (
                            <div className="flex items-center justify-center gap-2 py-2.5 px-4 mx-2 my-1 bg-amber-50 border border-amber-200 rounded-lg">
                              <span className="text-amber-600 text-sm">&#9201;</span>
                              <span className="text-sm font-medium text-amber-800">
                                Change planes at <strong>{getCityName(seg.arrival.airport)} ({seg.arrival.airport})</strong>
                              </span>
                              {layover && (
                                <>
                                  <span className="text-amber-400 mx-1">|</span>
                                  <span className="text-sm text-amber-700">Connecting Time: <strong>{layover}</strong></span>
                                </>
                              )}
                            </div>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                ) : (
                  /* Single segment / direct flight - original layout with dates */
                  <div className="flight-route">
                    <div className="flight-endpoint">
                      <div className="city-code">{bookingDetails?.flight?.departureCode || bookingDetails?.flight?.departureCity?.substring(0, 3).toUpperCase()}</div>
                      <div className="city-name">{bookingDetails?.flight?.departureCity}</div>
                      <div className="time">{displayTime(bookingDetails?.flight?.departureTime)}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{formatFullDate(bookingDetails?.flight?.departureDate)}</div>
                      <div className="airport" title={bookingDetails?.flight?.departureAirport}>
                        {getCityName(bookingDetails?.flight?.departureCode)} Airport{bookingDetails?.flight?.departureTerminal ? `, T${bookingDetails.flight.departureTerminal}` : ''}
                      </div>
                    </div>

                    <div className="flight-path">
                      <div className="duration">
                        {formatDuration(bookingDetails?.flight?.duration)}
                      </div>
                      <div className="path-line">
                        <div className="plane-icon">&#9992;</div>
                      </div>
                      <div className="stops-label">
                        Direct Flight
                      </div>
                    </div>

                    <div className="flight-endpoint">
                      <div className="city-code">{bookingDetails?.flight?.arrivalCode || bookingDetails?.flight?.arrivalCity?.substring(0, 3).toUpperCase()}</div>
                      <div className="city-name">{bookingDetails?.flight?.arrivalCity}</div>
                      <div className="time">{displayTime(bookingDetails?.flight?.arrivalTime)}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{formatFullDate(bookingDetails?.flight?.arrivalDate || bookingDetails?.flight?.departureDate)}</div>
                      <div className="airport" title={bookingDetails?.flight?.arrivalAirport}>
                        {getCityName(bookingDetails?.flight?.arrivalCode)} Airport{bookingDetails?.flight?.arrivalTerminal ? `, T${bookingDetails.flight.arrivalTerminal}` : ''}
                      </div>
                    </div>
                  </div>
                )}

                {/* One-line summary strip — the grey DATE/FLIGHT NO/BAGGAGE grid is
                    folded in here (density pass); values are unchanged bindings. */}
                <div className="flex flex-wrap items-center justify-between gap-2 mt-4 px-4 py-3 rounded-lg bg-[#F0FAFC] border border-[#B9D0DC]/60 text-sm">
                  <div className="flex items-center gap-3 sm:gap-4 text-gray-700 flex-wrap">
                    <span className="inline-flex items-center gap-1.5">
                      <Briefcase className="h-4 w-4 text-[#055B75]" /> Cabin: <strong className="text-gray-900">{formatBaggage(bookingDetails?.baggage?.cabin) || 'see fare rules'}</strong>
                    </span>
                    <span className="text-gray-300">|</span>
                    <span className="inline-flex items-center gap-1.5">
                      {/* Never invent an allowance. This read `|| '15 Kg'`,
                          so a fare whose baggage Amadeus did not return told
                          the customer they had 15 kg — a number nobody
                          verified, on the page they check before flying. The
                          tile above said "Included" for the same fare. */}
                      <Luggage className="h-4 w-4 text-[#055B75]" /> Check-in:{' '}
                      <strong className="text-gray-900">
                        {formatBaggage(bookingDetails?.baggage?.checkIn) || 'see fare rules'}
                      </strong>
                      {formatBaggage(bookingDetails?.baggage?.checkIn) ? ' / adult' : ''}
                    </span>
                  </div>
                  <span className="inline-flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-semibold text-[#055B75]">
                    <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" />{bookingDetails?.flight?.refundable === true ? 'Refundable (fees may apply)' : bookingDetails?.flight?.refundable === false ? 'Non-refundable' : 'Refunds: see fare rules'}</span>
                    {bookingDetails?.flight?.numberOfBookableSeats && bookingDetails.flight.numberOfBookableSeats <= 9 && (
                      <span className="text-red-600">· {bookingDetails.flight.numberOfBookableSeats} seats left</span>
                    )}
                    {bookingDetails?.flight?.lastTicketingDate && (
                      <span className="text-gray-500 font-normal">· Book by {formatShortDate(bookingDetails.flight.lastTicketingDate)}</span>
                    )}
                    {bookingDetails?.flight?.operatingAirlineName && bookingDetails.flight.operatingAirlineName !== bookingDetails.flight.airline && (
                      <span className="text-gray-500 font-normal">· Operated by {bookingDetails.flight.operatingAirlineName}</span>
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Cancellation & Date Change Policy (Amadeus fare rules) */}
            {routerLocation.state?.flightData?.originalOffer && (
              <FlightCancellationPolicy
                flightOffer={routerLocation.state.flightData.originalOffer}
                fromCode={bookingDetails?.flight?.departureCode}
                toCode={bookingDetails?.flight?.arrivalCode}
                departureAt={routerLocation.state.flightData.originalOffer?.itineraries?.[0]?.segments?.[0]?.departure?.at}
              />
            )}

            {/* Traveller Details Section */}
            <div className="booking-card passenger-form-card mb-8">
              <div className="booking-card-header">
                <h2>
                  <UserCircle className="h-5 w-5" />
                  Traveller Details
                </h2>
                <button
                  onClick={editMode ? savePassengerDetails : toggleEditMode}
                  className="bg-white/20 hover:bg-white/30 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors flex items-center backdrop-blur-sm"
                >
                  {editMode ? (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Save Details
                    </>
                  ) : (
                    <>
                      <Edit className="h-4 w-4 mr-2" />
                      Edit Details
                    </>
                  )}
                </button>
              </div>

              <div className="booking-card-body">
                {!isLoggedIn && (
                  <div className="bg-[#f0f9ff] border border-[#bae6fd] p-4 mb-6 rounded-xl flex justify-between items-center">
                    <div className="flex items-center text-sm text-[#0369a1]">
                      <UserCircle className="w-5 h-5 mr-3" />
                      Log in to view your saved traveller list and unlock exclusive deals!
                    </div>
                    <button
                      onClick={handleLogin}
                      className="text-[#0284c7] font-bold text-sm hover:underline"
                    >
                      LOGIN NOW
                    </button>
                  </div>
                )}

                {passengerData.map((passenger, index) => {
                  const isExpanded = expandedPassengerId === null ? index === 0 : expandedPassengerId === passenger.id;
                  return (
                  <div key={passenger.id} className="passenger-item">
                    <div className="passenger-header" role="button" tabIndex={0} aria-expanded={isExpanded} onClick={() => setExpandedPassengerId(isExpanded ? '' : passenger.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpandedPassengerId(isExpanded ? '' : passenger.id); } }} style={{ cursor: 'pointer' }}>
                      <div className="flex items-center gap-3">
                        <span className="passenger-badge">
                          {PASSENGER_TYPES[passenger.type]?.label || 'Traveller'} {index + 1}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm font-medium text-[#055B75]">
                        {(passenger.firstName || passenger.lastName) ? (
                          <span className="flex items-center"><CheckCircle className="w-4 h-4 mr-1 text-[#10b981]" />{passenger.firstName} {passenger.lastName}</span>
                        ) : (
                          <span className="text-gray-400">Tap to {isExpanded ? 'collapse' : 'add details'}</span>
                        )}
                        <svg className="w-4 h-4 text-gray-500 transition-transform" style={{ transform: isExpanded ? 'rotate(180deg)' : 'none' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"/></svg>
                      </div>
                    </div>

                    <div className="form-grid" style={{ display: isExpanded ? undefined : 'none' }}>
                      <div className="form-group">
                        <label>First Name <span className="required">*</span></label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="Given Name"
                          value={passenger.firstName}
                          onChange={(e) => handlePassengerChange(passenger.id, 'firstName', e.target.value)}
                          readOnly={!editMode}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>Last Name <span className="required">*</span></label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="Surname"
                          value={passenger.lastName}
                          onChange={(e) => handlePassengerChange(passenger.id, 'lastName', e.target.value)}
                          readOnly={!editMode}
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>Date of Birth <span className="required">*</span></label>
                        <input
                          type="date"
                          className="form-input"
                          value={passenger.dateOfBirth}
                          onChange={(e) => handlePassengerChange(passenger.id, 'dateOfBirth', e.target.value)}
                          readOnly={!editMode}
                          required
                          max={today}
                          min={minDOB}
                        />
                      </div>
                      <div className="form-group">
                        <label>Gender <span className="required">*</span></label>
                        <div className="gender-toggle">
                          <button
                            onClick={() => handlePassengerChange(passenger.id, 'gender', 'male')}
                            className={`gender-btn ${passenger.gender === 'male' ? 'active' : ''}`}
                            disabled={!editMode}
                          >
                            Male
                          </button>
                          <button
                            onClick={() => handlePassengerChange(passenger.id, 'gender', 'female')}
                            className={`gender-btn ${passenger.gender === 'female' ? 'active' : ''}`}
                            disabled={!editMode}
                          >
                            Female
                          </button>
                        </div>
                      </div>

                      {/* New Row */}
                      <div className="form-group">
                        <label>Mobile No {index === 0 ? <span className="required">*</span> : <span className="text-xs font-normal text-gray-400">(optional)</span>}</label>
                        <div style={{ display: 'flex', gap: '0' }}>
                          <select
                            className="form-input"
                            style={{ width: '90px', minWidth: '90px', borderRadius: '6px 0 0 6px', borderRight: 'none', padding: '10px 4px', fontSize: '14px', appearance: 'none', backgroundImage: 'url("data:image/svg+xml,%3csvg xmlns=%27http://www.w3.org/2000/svg%27 fill=%27none%27 viewBox=%270 0 20 20%27%3e%3cpath stroke=%27%236b7280%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27 stroke-width=%271.5%27 d=%27M6 8l4 4 4-4%27/%3e%3c/svg%3e")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 2px center', backgroundSize: '16px' }}
                            value={passenger.countryCode || selectedCountryCode}
                            onChange={(e) => handlePassengerChange(passenger.id, 'countryCode', e.target.value)}
                            disabled={!editMode}
                          >
                            {countries.map(c => (
                              <option key={c.code + c.dial} value={c.dial}>{c.dial} {c.code}</option>
                            ))}
                          </select>
                          <input
                            type="tel"
                            className="form-input"
                            style={{ borderRadius: '0 6px 6px 0', flex: 1 }}
                            placeholder="9876543210"
                            value={passenger.mobile}
                            onChange={(e) => handlePassengerChange(passenger.id, 'mobile', e.target.value.replace(/[^0-9]/g, ''))}
                            readOnly={!editMode}
                            required={index === 0}
                          />
                        </div>
                      </div>
                      <div className="form-group">
                        <label>Email (Optional)</label>
                        <input
                          type="email"
                          className="form-input"
                          placeholder="email@example.com"
                          value={passenger.email}
                          onChange={(e) => handlePassengerChange(passenger.id, 'email', e.target.value)}
                          readOnly={!editMode}
                        />
                      </div>
                      {/* Passport / Travel Document Fields — required on international itineraries */}
                      {bookingDetails?.isInternational && (<>
                      <div className="form-group" style={{ position: 'relative' }}>
                        <label>Nationality <span className="required">*</span></label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="Search country..."
                          value={nationalitySearch[passenger.id] !== undefined ? nationalitySearch[passenger.id] : (
                            countries.find(c => c.code === passenger.nationality)?.name || passenger.nationality || ''
                          )}
                          onChange={(e) => {
                            const val = e.target.value;
                            setNationalitySearch(prev => ({ ...prev, [passenger.id]: val }));
                            setNationalityDropdown({ open: true, passengerId: passenger.id });
                            if (!val) handlePassengerChange(passenger.id, 'nationality', '');
                          }}
                          onFocus={() => setNationalityDropdown({ open: true, passengerId: passenger.id })}
                          onBlur={() => setTimeout(() => setNationalityDropdown({ open: false, passengerId: null }), 200)}
                          readOnly={!editMode}
                        />
                        {nationalityDropdown.open && nationalityDropdown.passengerId === passenger.id && (
                          <div style={{
                            position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                            background: '#fff', border: '1px solid #ddd', borderRadius: '6px',
                            maxHeight: '180px', overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                          }}>
                            {countries
                              .filter(c => {
                                const search = (nationalitySearch[passenger.id] || '').toLowerCase();
                                return !search || c.name.toLowerCase().includes(search) || c.code.toLowerCase().includes(search);
                              })
                              .map(c => (
                                <div
                                  key={c.code}
                                  style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '14px', borderBottom: '1px solid #f0f0f0' }}
                                  onMouseDown={() => {
                                    handlePassengerChange(passenger.id, 'nationality', c.code);
                                    setNationalitySearch(prev => ({ ...prev, [passenger.id]: c.name }));
                                    setNationalityDropdown({ open: false, passengerId: null });
                                  }}
                                  onMouseEnter={(e) => e.target.style.background = '#f0f9ff'}
                                  onMouseLeave={(e) => e.target.style.background = '#fff'}
                                >
                                  <span style={{ fontWeight: 500 }}>{c.name}</span>{' '}
                                  <span style={{ color: '#888', fontSize: '12px' }}>({c.code})</span>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                      <div className="form-group">
                        <label>Passport Number <span className="required">*</span></label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="e.g. P12345678"
                          value={passenger.passportNumber || ''}
                          onChange={(e) => handlePassengerChange(passenger.id, 'passportNumber', e.target.value.toUpperCase())}
                          readOnly={!editMode}
                        />
                      </div>
                      <div className="form-group">
                        <label>Passport Expiry Date <span className="required">*</span></label>
                        <input
                          type="date"
                          className="form-input"
                          value={passenger.passportExpiry || ''}
                          onChange={(e) => handlePassengerChange(passenger.id, 'passportExpiry', e.target.value)}
                          readOnly={!editMode}
                        />
                      </div>
                      </>)}
                      <div style={{ gridColumn: '1 / -1', marginTop: '8px' }}>
                        <label className="flex items-center cursor-pointer select-none gap-2">
                          <input
                            type="checkbox"
                            style={{ width: '18px', height: '18px', minWidth: '18px', accentColor: '#055B75', borderRadius: '4px', cursor: 'pointer' }}
                            checked={passenger.requiresWheelchair}
                            onChange={(e) => handlePassengerChange(passenger.id, 'requiresWheelchair', e.target.checked)}
                            disabled={!editMode}
                          />
                          <span className="text-sm font-medium text-[#626363]">Request Wheelchair Assistance</span>
                        </label>
                      </div>
                    </div>
                  </div>
                  );
                })}

                <p className="text-xs text-gray-500 mt-3">
                  This fare is priced for {passengerData.length} traveller{passengerData.length === 1 ? '' : 's'}. To change who is travelling, please search again.
                </p>
              </div>
            </div>

            {/* Booking Contact Details */}
            <div className="booking-card mb-4">
              <div className="booking-card-header">
                <h2>
                  <div className="bg-white/20 p-1.5 rounded-lg backdrop-blur-sm">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path></svg>
                  </div>
                  Contact Information
                </h2>
              </div>
              <div className="booking-card-body">
                <p className="text-[#626363] text-sm mb-4 bg-gray-50 p-3 rounded-lg border border-gray-100 flex items-center">
                  <span className="bg-[#65B3CF] text-white text-xs px-2 py-0.5 rounded mr-2">INFO</span>
                  Your booking reference is sent to these contact details after payment, and your e-ticket once it is issued.
                </p>
                <div className="form-grid">
                  <div className="form-group">
                    <label>Country Code</label>
                    <div className="relative">
                      <select
                        className="form-input appearance-none bg-white pr-8"
                        value={selectedCountryCode}
                        onChange={(e) => setSelectedCountryCode(e.target.value)}
                      >
                        {availableCountryCodes.map((cc) => (
                          <option key={cc.code} value={cc.code}>
                            {cc.country} ({cc.code})
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-3 top-3.5 h-4 w-4 text-gray-500 pointer-events-none" />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Mobile Number</label>
                    <input
                      type="text"
                      className="form-input bg-gray-50"
                      value={bookingDetails?.contact?.phone || ""}
                      readOnly
                    />
                  </div>
                  <div className="form-group">
                    <label>Email Address</label>
                    <input
                      type="text"
                      className="form-input bg-gray-50"
                      value={bookingDetails?.contact?.email || ""}
                      readOnly
                    />
                  </div>
                </div>

                {bookingDetails?.contact?.phone && (
                  <div className="mt-3 flex items-center gap-3 p-3 bg-[#f0fdf4] border border-[#dcfce7] rounded-xl">
                    <div className="bg-[#10b981] p-1 rounded-full">
                      <Check className="h-4 w-4 text-white" />
                    </div>
                    <span className="text-sm font-medium text-[#166534]">
                      Booking alerts will be sent to {selectedCountryCode} {bookingDetails.contact.phone}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Fare rules & baggage */}
            {routerLocation.state?.flightData?.originalOffer && (
              <div className="booking-card mb-4">
                <div className="booking-card-header">
                  <h2>
                    <span className="flex items-center gap-2">
                      <Check className="h-5 w-5" />
                      Baggage &amp; Fare Rules
                    </span>
                  </h2>
                </div>
                <div className="booking-card-body">
                  <FlightFareRules
                    flightOffer={routerLocation.state.flightData.originalOffer}
                  />
                </div>
              </div>
            )}

            {/* Important Information */}
            <div className="booking-card mb-4">
              <div className="booking-card-header" role="button" tabIndex={0} aria-expanded={showImportantInfo} onClick={() => setShowImportantInfo((v) => !v)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setShowImportantInfo((v) => !v); } }} style={{ padding: '1.1rem 1.5rem', borderBottom: showImportantInfo ? '1px solid #E2E8F0' : 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
                <h2 style={{ color: '#055B75', margin: 0 }}>
                  <span className="flex items-center gap-2"><Info className="h-5 w-5" /> Important Information</span>
                </h2>
                <svg className="w-4 h-4 text-gray-500 transition-transform" style={{ transform: showImportantInfo ? 'rotate(180deg)' : 'none' }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"/></svg>
              </div>
              <div className="booking-card-body" style={{ display: showImportantInfo ? undefined : 'none' }}>
                <ul className="space-y-3 text-sm text-gray-600">
                  {[
                    'Carry a valid government photo ID and a printed or digital copy of your e-ticket for check-in.',
                    'Check-in counters usually close 45–60 minutes before domestic departure. Reach the airport at least 2 hours prior.',
                    'Web check-in opens 48 hours before departure — complete it to save time at the airport.',
                    'Cancellation and date-change charges apply as per the fare rules shown above.',
                    'Traveller names must exactly match the government ID; corrections after booking may attract airline fees.',
                  ].map((t, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                      <span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Trust strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
              {[
                { Icon: ShieldCheck, label: 'Secure Payment' },
                { Icon: CheckCircle, label: 'Fare checked with the airline' },
                { Icon: Clock, label: '24x7 Support' },
                { Icon: Briefcase, label: 'Best Fares' },
              ].map(({ Icon, label }, i) => (
                <div key={i} className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-xs font-medium text-gray-600">
                  <Icon className="h-4 w-4 text-[#055B75] flex-shrink-0" /> {label}
                </div>
              ))}
            </div>

          </div> {/* End of Left Column */}

          {/* Right Column - Fare Summary (sticky on desktop so the total + Proceed
              button stay in view without scrolling to the bottom) */}
          <div className="lg:col-span-1 lg:sticky lg:top-6 lg:self-start">
            <div className="booking-card fare-summary-card">
              <div className="booking-card-header">
                <h2>Fare Summary</h2>
              </div>
              <div className="booking-card-body">
                {fareNotice && (
                  <div className="mb-3 p-3 rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-800" role="status">
                    {fareNotice}
                  </div>
                )}
                {/* Base Fare */}
                <div className="flex items-start gap-3 py-3 border-b border-gray-100">
                  <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[#65B3CF] flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold text-gray-800">Base Fare</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      For {calculatedFare.passengers} traveller{calculatedFare.passengers === 1 ? '' : 's'}
                    </div>
                  </div>
                  <div className="text-sm font-semibold text-gray-800 whitespace-nowrap"><Price amount={calculatedFare.baseFare} /></div>
                </div>

                {/* Taxes and Surcharges (real Amadeus airline taxes = grandTotal − base) */}
                {calculatedFare.totalTax > 0 && (
                  <div className="flex items-start gap-3 py-3 border-b border-gray-100">
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[#65B3CF] flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-gray-800">Taxes and Surcharges</div>
                      <div className="text-xs text-gray-400 mt-0.5">Airline taxes &amp; surcharges</div>
                    </div>
                    <div className="text-sm font-semibold text-gray-800 whitespace-nowrap"><Price amount={calculatedFare.totalTax} /></div>
                  </div>
                )}

                {/* Service Fee (Jetsetters convenience fee) */}
                {calculatedFare.serviceFee > 0 && (
                  <div className="flex items-start gap-3 py-3 border-b border-gray-100">
                    <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[#65B3CF] flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-gray-800">Service Fee</div>
                      <div className="text-xs text-gray-400 mt-0.5">Jetsetters convenience fee</div>
                    </div>
                    <div className="text-sm font-semibold text-gray-800 whitespace-nowrap"><Price amount={calculatedFare.serviceFee} /></div>
                  </div>
                )}

                {/* Discounts */}
                {appliedCoupon && (
                  <div className="flex items-start gap-3 py-3 border-b border-gray-100">
                    <PlusCircle className="h-5 w-5 text-emerald-400 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-gray-800">Discounts</div>
                      <div className="text-xs text-gray-400 mt-0.5">Coupon {appliedCoupon.code}</div>
                    </div>
                    <div className="text-sm font-semibold text-emerald-600 whitespace-nowrap">- <Price amount={appliedCoupon.discountAmount} /></div>
                  </div>
                )}

                {/* Coupon Input */}
                <div className="mt-4 mb-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Have a coupon?</p>
                  {/* Keyed on the total, so a changed total also resets the
                      input's own "applied" display along with the coupon. */}
                  <CouponInput
                    key={calculatedFare.totalAmount}
                    orderTotal={calculatedFare.totalAmount}
                    bookingType="flights"
                    onApply={(coupon) => { couponBase.current = calculatedFare.totalAmount; setAppliedCoupon(coupon); }}
                    onRemove={() => { couponBase.current = null; setAppliedCoupon(null); }}
                  />
                </div>

                <div className="fare-row total">
                  <span className="label">Total Amount</span>
                  <span className="value"><Price amount={appliedCoupon ? appliedCoupon.finalTotal : calculatedFare.totalAmount} /></span>
                </div>

                <button
                  onClick={handleProceedToPayment}
                  disabled={checkingOut}
                  className="btn-primary mt-4"
                >
                  {checkingOut ? 'Checking the fare…' : 'Proceed to Payment'} <CheckCircle className="h-5 w-5" />
                </button>

                <div className="secure-payment-badge">
                  <span className="flex items-center gap-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path></svg>
                    Secure Payment via ARC Pay
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Footer />

      {/* Sticky CTA — keeps the total + Proceed button in view so the user never
          has to scroll to the bottom to pay. Mobile/tablet only; desktop keeps
          its sidebar summary+button. */}
      <div aria-hidden="true" className="lg:hidden" style={{ height: '84px' }} />
      <div
        className="lg:hidden"
        style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 60,
          background: '#fff', borderTop: '1px solid #e5e7eb',
          boxShadow: '0 -6px 24px rgba(0,0,0,0.10)', padding: '10px 16px',
        }}
      >
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
            <span style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Total</span>
            <span style={{ fontSize: 20, fontWeight: 800, color: '#055B75' }}>
              <Price amount={appliedCoupon ? appliedCoupon.finalTotal : calculatedFare?.totalAmount} />
            </span>
          </div>
          <button
            onClick={handleProceedToPayment}
            disabled={checkingOut}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, background: '#055B75', color: '#fff',
              fontWeight: 700, fontSize: 15, padding: '13px 26px', borderRadius: 10, border: 'none',
              cursor: 'pointer', boxShadow: '0 6px 16px rgba(5,91,117,0.3)', whiteSpace: 'nowrap',
            }}
          >
            {checkingOut ? 'Checking the fare…' : 'Proceed to Payment'} <CheckCircle className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div >
  );
}

export default withPageElements(FlightBookingConfirmation); 