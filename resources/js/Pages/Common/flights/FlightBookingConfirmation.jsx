import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { Check, Printer, Download, Share2, ChevronDown, ChevronUp, CheckCircle, UserCircle, Plus, Edit, Save } from "lucide-react";
import Navbar from "../Navbar";
import Footer from "../Footer";
import withPageElements from "../PageWrapper";
import Price from "../../../Components/Price";
import currencyService from "../../../Services/CurrencyService";
import { flightBookingData } from "./data";
import supabase from "../../../lib/supabase";
import ArcPayService from "../../../Services/ArcPayService";
import { useLocationContext } from '../../../Context/LocationContext';
import { allAirports } from './airports';
import PricingService from '../../../Services/PricingService';
import "./booking-confirmation.css";


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
  const [passengerData, setPassengerData] = useState([]);
  const [selectedAddons, setSelectedAddons] = useState([]);
  const [vipService, setVipService] = useState(false);
  const [priceConfig, setPriceConfig] = useState(null);
  const [calculatedFare, setCalculatedFare] = useState({
    baseFare: 0,
    countryTax: 0,
    platformFee: 0,
    totalTax: 0,
    addonsTotal: 0,
    vipServiceFee: 0,
    totalAmount: 0,
    currency: userCurrency || 'EUR'
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

  // Helper to format baggage info from Amadeus data
  // Amadeus sends either {weight, weightUnit} or {quantity} (pieces)
  const formatBaggage = (bag) => {
    if (!bag) return null;
    if (typeof bag === 'string') return bag;
    if (bag.weight && bag.weightUnit) return `${bag.weight} ${bag.weightUnit}`;
    if (bag.weight) return `${bag.weight} KG`;
    if (bag.quantity) return `${bag.quantity} ${bag.quantity === 1 ? 'Piece' : 'Pieces'}`;
    return null;
  };


  // Check authentication status on component mount
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setIsLoggedIn(!!session);
      } catch (error) {
        console.error('Auth check error:', error);
        // Fallback to localStorage check
        const authStatus = localStorage.getItem('isAuthenticated');
        setIsLoggedIn(authStatus === 'true');
      }
    };
    checkAuth();
  }, []);

  // Fetch booking details from mock data (fallback when no search-page data is passed)
  const fetchBookingFromMockData = (id) => {
    const mockBooking = flightBookingData.bookings.find(b => b.bookingId === id) ||
      flightBookingData.internationalBookings.find(b => b.bookingId === id) ||
      flightBookingData.bookings[0];
    return mockBooking || null;
  };

  // Transform Amadeus API booking data to our format
  const transformBookingData = (apiData, config) => {
    // Check if it's already in our format (has flight.price)
    if (apiData.flight?.price) return apiData;

    // Transform from data.js format to UI format
    const basePrice = apiData.payment?.amount || 0;
    // Use admin price settings instead of hardcoded values
    const fixedFee = config?.flight_taxes_fees || 0;
    const percentageFee = basePrice * ((config?.flight_taxes_fees_percentage || 0) / 100);
    const totalTaxes = fixedFee + percentageFee;

    return {
      bookingId: apiData.bookingId,
      flight: {
        ...apiData.flight,
        departureDate: apiData.flight.departureTime, // Use time string as date base
        arrivalDate: apiData.flight.arrivalTime,
        stops: "0", // Default to direct if not specified
        fareType: "Economy", // Default
        cabin: "Economy",
        departureAirport: `${apiData.flight.departureCity} Airport`,
        arrivalAirport: `${apiData.flight.arrivalCity} Airport`,
        price: {
          base: basePrice,
          fixedFee: fixedFee,
          percentageFee: percentageFee,
          totalTaxes: totalTaxes,
          total: basePrice + totalTaxes,
          currency: apiData.payment?.currency || "USD"
        }
      },
        baggage: {
          checkIn: apiData.flight?.baggage || "23 KG",
          cabin: apiData.flight?.cabinBaggage || null
        },
      passengers: apiData.passengers,
      contact: { email: "", phone: "" },
      addOns: [], // Initialize empty
      vipServiceFee: 30,
      isInternational: false
    };
  };

  // Transform flight data from search page to booking format
  const transformFlightData = (flightData, config) => {
    if (!flightData) return null;

    // Use the same price displayed on the search results page (price.amount = Amadeus grandTotal)
    // This is the total fare shown to the user on the search page, so it must match here as base fare
    const basePrice = parseFloat(
      flightData.price?.amount ||
      flightData.price?.grandTotal ||
      flightData.price?.total ||
      flightData.originalOffer?.price?.grandTotal ||
      flightData.originalOffer?.price?.total ||
      0
    );

    // Use admin-configured price settings
    const fixedFee = config?.flight_taxes_fees || 0;
    const percentageFee = basePrice * ((config?.flight_taxes_fees_percentage || 0) / 100);
    const totalTaxes = fixedFee + percentageFee;

      return {
        bookingId: bookingId || `BOOK-${Date.now()}`,
        flight: {
          airline: flightData.airline.name,
          airlineCode: flightData.airline.code,
          airlineLogo: flightData.airline.logo,
          flightNumber: `${flightData.airline.code} ${flightData.id}`,
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
          brandedFare: flightData.brandedFare || null,
          brandedFareLabel: flightData.brandedFareLabel || null,
          operatingCarrier: flightData.operatingCarrier || null,
          operatingAirlineName: flightData.operatingAirlineName || null,
          numberOfBookableSeats: flightData.numberOfBookableSeats || null,
          lastTicketingDate: flightData.lastTicketingDate || null,
          stops: flightData.stops,
          stopDetails: flightData.stopDetails || [],
          basePrice: basePrice,
          tax: totalTaxes,
          fixedFee: fixedFee,
          percentageFee: percentageFee,
          totalPrice: basePrice + totalTaxes,
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
          base: basePrice,
          fixedFee: fixedFee,
          percentageFee: percentageFee,
          totalTaxes: totalTaxes,
          total: basePrice + totalTaxes, // Base fare + taxes
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
      addOns: [
        {
          id: 1,
          name: "Travel Insurance",
          title: "Travel Insurance",
          description: "Comprehensive coverage for your journey",
          price: 25,
          popular: true,
          selected: false,
          benefits: [
            "Trip cancellation coverage",
            "Medical emergency coverage",
            "Lost baggage protection"
          ]
        },
        {
          id: 2,
          name: "Airport Transfer",
          title: "Airport Transfer",
          description: "Comfortable ride to/from your accommodation",
          price: 35,
          popular: false,
          selected: false,
          benefits: [
            "24/7 service availability",
            "Professional drivers",
            "Free waiting time"
          ]
        }
      ],
      vipServiceFee: 30,
      isInternational: flightData.departure.airport !== flightData.arrival.airport
    };
  };

  // Fetch booking details
  useEffect(() => {
    setLoading(true);

    const getBookingDetails = async () => {
      try {
        let bookingData;

        // Check if flight data was passed from search page
        // Fetch admin price settings first
        let config = priceConfig;
        if (!config) {
          try {
            config = await PricingService.getPriceConfig('all');
            setPriceConfig(config);
          } catch (err) {
            console.warn('Could not fetch price config, using defaults');
            config = PricingService.getDefaultSettings('all');
          }
        }

        if (routerLocation.state?.flightData) {
          console.log("Using flight data from search page", routerLocation.state.flightData);
          bookingData = transformFlightData(routerLocation.state.flightData, config);
        } else {
          // Fallback: Use mock data when no search-page state is available
          const targetId = bookingId || "TEST_BOOKING_123";
          console.log("No state data, using mock data for ID:", targetId);
          const mockData = fetchBookingFromMockData(targetId);
          if (mockData) {
            bookingData = transformBookingData(mockData, config);
          } else {
            setError("No flight data available. Please return to the search page and try again.");
            return;
          }
        }

        if (!bookingData) {
          throw new Error("Failed to process flight data");
        }

        setBookingDetails(bookingData);
        // Initialize with 1 passenger if none exist
        const initialPassengerCount = Math.max(1, passengerData.length);
        updateFareSummary(initialPassengerCount, bookingData);
      } catch (error) {
        console.error("Error getting booking details:", error);
        setError(error.message);
      } finally {
        setLoading(false);
      }
    };

    getBookingDetails();
  }, [routerLocation.state, bookingId]);

  // Add an effect to update fare when passengers, addons, or VIP service changes
  useEffect(() => {
    if (bookingDetails) {
      updateFareSummary(passengerData.length);
    }
  }, [passengerData.length, selectedAddons, vipService]);

  // Ensure there's always at least one passenger
  useEffect(() => {
    if (passengerData.length === 0 && bookingDetails) {
      const defaultPassenger = {
            id: 1,
            type: "Adult",
            title: "Mr",
            firstName: "",
            lastName: "",
            dateOfBirth: "",
            seatNumber: "",
            meal: "Regular",
            baggage: "15 Kg",
            mobile: "",
            email: "",
            gender: "male",
            requiresWheelchair: false,
            nationality: "",
            passportNumber: "",
            passportExpiry: "",
            countryCode: callingCode || '+91'
          };
        setPassengerData([defaultPassenger]);
    }
  }, [bookingDetails, passengerData.length]);

  // Update fare summary when passenger count or booking details change
  const updateFareSummary = (passengerCount, bookingData = bookingDetails) => {
    if (!bookingData || !bookingData.flight || !bookingData.flight.price) return;

    // Get base fare from flight data
    const baseFare = parseFloat(bookingData.flight.price.base) || 0;

    // Get taxes from price data (set by admin settings)
    const totalTaxes = bookingData.flight.price.totalTaxes || 0;

    // Calculate add-ons total
    const addonsTotal = selectedAddons.reduce((sum, addonId) => {
      const addon = bookingData.addOns.find(a => a.id === addonId);
      return sum + (addon ? addon.price : 0);
    }, 0);

    // Calculate VIP service fee if selected
    const vipServiceFee = vipService ? (bookingData.vipServiceFee || 0) : 0;

    // Calculate per passenger costs (minimum 1 passenger)
    const effectivePassengerCount = Math.max(1, passengerCount);
    const totalBaseFare = baseFare * effectivePassengerCount;
    const totalTax = totalTaxes * effectivePassengerCount;
    const totalAmount = totalBaseFare + totalTax + addonsTotal + vipServiceFee;

    setCalculatedFare({
      baseFare: totalBaseFare,
      totalTax: totalTax,
      addonsTotal,
      vipServiceFee,
      totalAmount,
      currency: bookingData.flight.price.currency || 'EUR'
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
    if (!duration) return 'Unknown Duration';
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

  const handleAddPassenger = () => {
    const newPassenger = {
      id: passengerData.length + 1,
          type: "Adult",
          title: "Mr",
          firstName: "",
          lastName: "",
          dateOfBirth: "",
          seatNumber: "",
          meal: "Regular",
          baggage: "15 Kg",
          mobile: "",
          email: "",
          gender: "male",
          requiresWheelchair: false,
          nationality: "",
          passportNumber: "",
          passportExpiry: "",
          countryCode: callingCode || '+91'
        };
    const updatedPassengers = [...passengerData, newPassenger];
    setPassengerData(updatedPassengers);
    updateFareSummary(updatedPassengers.length);
  };

  const handleRemovePassenger = (id) => {
    if (passengerData.length <= 1) {
      alert("Cannot remove the last passenger");
      return;
    }

    const updatedPassengers = passengerData.filter(passenger => passenger.id !== id);
    setPassengerData(updatedPassengers);
    updateFareSummary(updatedPassengers.length);
  };

  const savePassengerDetails = () => {
    // In a real app, this would send the updated data to the server
    setEditMode(false);
    // Update the bookingDetails with the new passenger data
    setBookingDetails({
      ...bookingDetails,
      passengers: passengerData
    });
  };

  // Handle addon selection
  const toggleAddon = (addonId) => {
    const addon = bookingDetails.addOns.find(a => a.id === addonId);
    if (!addon) return;

    let newSelectedAddons;
    if (selectedAddons.includes(addonId)) {
      newSelectedAddons = selectedAddons.filter(id => id !== addonId);
    } else {
      newSelectedAddons = [...selectedAddons, addonId];
    }
    setSelectedAddons(newSelectedAddons);

    // Update fare summary after toggling addon
    const passengerCount = passengerData.length || 1;
    updateFareSummary(passengerCount, bookingDetails);
  };

  // Toggle VIP service
  const toggleVipService = () => {
    setVipService(!vipService);
  };

  // Handle proceeding to payment - DIRECT to ARC Pay (bypass FlightPayment.jsx)
  const handleProceedToPayment = async () => {
    // Validate passenger data
    const isPassengerDataValid = passengerData.every(p =>
      p.firstName && p.lastName && p.mobile && p.dateOfBirth
    );

    if (!isPassengerDataValid) {
      alert("Please fill in all required passenger details before proceeding.");
      return;
    }

    try {
      console.log('🚀 Initiating direct ARC Pay checkout...');

      // Prepare flight data for ARC Pay - use routerLocation.state for raw flight data
      const rawFlightData = routerLocation.state?.flightData;
      const amount = calculatedFare.totalAmount;

      // Get flight details
      const flightNumber = `${rawFlightData?.airline?.code || 'XX'} ${rawFlightData?.id || '000'}`;
      const carrierCode = rawFlightData?.airline?.code || 'XX';
      const departureAirport = rawFlightData?.departure?.airport || 'XXX';
      const arrivalAirport = rawFlightData?.arrival?.airport || 'XXX';
        const departureDate = rawFlightData?.departure?.rawDate || rawFlightData?.departure?.date || new Date().toISOString().split('T')[0];
      const segments = rawFlightData?.segments || [];

      // Build flight data for ARC Pay
      const flightDataForArcPay = {
        flightNumber: flightNumber,
        carrierCode: carrierCode,
        origin: departureAirport,
        destination: arrivalAirport,
        departureDate: departureDate,
        segments: segments.map(seg => ({
          carrierCode: seg.carrier || carrierCode,
          flightNumber: seg.number || flightNumber.split(' ')[1] || '000',
          departure: {
            iataCode: seg.departure?.airport || departureAirport,
            at: seg.departure?.time || departureDate
          },
          arrival: {
            iataCode: seg.arrival?.airport || arrivalAirport,
            at: seg.arrival?.time || ''
          }
        })),
        originalOffer: rawFlightData?.originalOffer || rawFlightData,
        itineraries: rawFlightData?.itineraries || [{
          segments: segments.map(seg => ({
            carrierCode: seg.carrier || carrierCode,
            number: seg.number || flightNumber.split(' ')[1] || '000',
            departure: { iataCode: seg.departure?.airport || departureAirport, at: seg.departure?.time || departureDate },
            arrival: { iataCode: seg.arrival?.airport || arrivalAirport, at: seg.arrival?.time || '' }
          }))
        }]
      };

      // Ensure contact info is populated from first passenger if missing
      const finalContact = {
        email: bookingDetails?.contact?.email || passengerData?.[0]?.email || "",
        phone: bookingDetails?.contact?.phone || passengerData?.[0]?.mobile || ""
      };

      const finalBookingDetails = {
        ...bookingDetails,
        contact: finalContact
      };

      // Store ALL booking data in localStorage before redirect
      const bookingDataForStorage = {
        selectedFlight: rawFlightData,
        originalOffer: rawFlightData?.originalOffer || rawFlightData,
        passengerData: passengerData, // Contains full details: title, meal, seat, etc.
        bookingDetails: finalBookingDetails,
        calculatedFare: calculatedFare,
        amount: amount,
        flightData: flightDataForArcPay
      };

      console.log('💾 Storing booking data in localStorage:', bookingDataForStorage);
      localStorage.setItem('pendingFlightBooking', JSON.stringify(bookingDataForStorage));

      // Generate order ID
      const orderId = `FLT${Date.now().toString(36).toUpperCase()}`;
      const description = `Flight ${flightNumber} - ${departureAirport} to ${arrivalAirport}`;

      // Create ARC Pay checkout session
      console.log('📞 Creating ARC Pay checkout session...');
      const checkoutResponse = await ArcPayService.createHostedCheckout({
        amount: amount,
        currency: calculatedFare.currency || 'USD',
        orderId: orderId,
        bookingType: 'flight',
        customerEmail: passengerData?.[0]?.email || 'customer@jetsetgo.com',
        customerName: passengerData?.[0]
          ? `${passengerData[0].firstName} ${passengerData[0].lastName}`
          : 'Guest User',
        customerPhone: passengerData?.[0]?.phone || passengerData?.[0]?.mobile,
        description: description,
        returnUrl: `${window.location.origin}/payment/callback?orderId=${orderId}&bookingType=flight`,
        cancelUrl: `${window.location.origin}/flights?cancelled=true`,
      });

      if (checkoutResponse.success && checkoutResponse.checkoutUrl) {
        console.log('✅ Checkout session created successfully');
        console.log('🔗 Redirecting to:', checkoutResponse.checkoutUrl);

        // Store payment session info
        localStorage.setItem('pendingPaymentSession', JSON.stringify({
          sessionId: checkoutResponse.sessionId,
          orderId: orderId,
          bookingType: 'flight',
          amount: amount
        }));

        // Direct redirect to ARC Pay
        window.location.href = checkoutResponse.checkoutUrl;
      } else {
        console.error('❌ Checkout creation failed:', checkoutResponse.error);
        alert('Failed to create payment session. Please try again.');
      }
    } catch (error) {
      console.error('❌ Payment initiation error:', error);
      alert('Payment service temporarily unavailable. Please try again.');
    }
  };

  const renderAddon = (addon) => (
    <div key={addon.id} className="flex justify-between items-start p-4 border rounded-lg mb-4">
      <div className="flex-1">
        <h3 className="font-semibold text-gray-800">{addon.name}</h3>
        <p className="text-sm text-gray-600 mt-1">{addon.description}</p>
        <ul className="mt-2 space-y-1">
          {addon.benefits.map((benefit, index) => (
            <li key={index} className="flex items-center text-sm text-gray-600">
              <svg className="w-4 h-4 mr-2 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
              {benefit}
            </li>
          ))}
        </ul>
        <button className="text-sm text-blue-600 hover:text-blue-800 mt-1">
          Know More
        </button>
      </div>
      <div className="text-right">
        <div className="text-gray-600 text-sm">
          {calculatedFare.currency} {addon.price.toFixed(2)}
        </div>
        <button
          onClick={() => toggleAddon(addon.id)}
          className={`mt-2 ${selectedAddons.includes(addon.id) ? 'bg-green-600' : 'bg-blue-600'} text-white px-4 py-1 rounded hover:opacity-90 transition-colors text-sm`}
        >
          {selectedAddons.includes(addon.id) ? 'Added' : 'Add'}
        </button>
      </div>
    </div>
  );



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

  return (
    <div className="booking-confirmation-page">
      <div className="booking-background-decor"></div>
      <Navbar forceScrolled={true} />

      <div className="booking-confirmation-container pt-24">
        {/* Header Banner */}
        {/* Header Banner */}
        <div className="booking-header-banner">
          <h1>Your Journey Begins Here</h1>
          <p>Confirm your details below and get ready for takeoff ✈️</p>
        </div>

        <div className="booking-layout grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Column - Flight & Passenger Details */}
          <div className="lg:col-span-2">

            {/* Flight Details Card (Boarding Pass Style) */}
            <div className="booking-card flight-card">
              <div className="booking-card-header">
                  <h2>
                    <div className="airline-logo-placeholder">
                      {bookingDetails?.flight?.airlineCode || bookingDetails?.flight?.airline?.substring(0, 2).toUpperCase() || "JS"}
                    </div>
                    {bookingDetails?.flight?.airline || 'JetSetters Airlines'}
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
                    <span className="cabin-class-badge">
                      {bookingDetails?.flight?.cabin || 'Economy Class'}
                    </span>
                  </div>
              </div>

              <div className="booking-card-body">
                {/* Route Summary Header */}
                <div className="flex items-center justify-between mb-4 px-2 py-2 bg-gray-50 rounded-lg border border-gray-200">
                  <span className="font-semibold text-[#055B75]">
                    {bookingDetails?.flight?.departureCity} &rarr; {bookingDetails?.flight?.arrivalCity}
                  </span>
                  <div className="flex items-center gap-3 text-sm text-gray-600">
                    <span>{bookingDetails?.flight?.stops === "0" || bookingDetails?.flight?.stops === 0 ? 'Direct' : `${bookingDetails?.flight?.stops} Stop${bookingDetails?.flight?.stops > 1 ? 's' : ''}`}</span>
                    <span className="text-gray-300">|</span>
                    <span>Total: {formatDuration(bookingDetails?.flight?.duration)}</span>
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
                          <div className="flex gap-4 py-4 px-2">
                            {/* Left - Airline Info */}
                            <div className="flex flex-col items-center min-w-[90px] text-center">
                              <img
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
                            <div className="flex-1 flex items-stretch gap-3">
                              {/* Departure */}
                              <div className="flex flex-col items-start min-w-[120px]">
                                <div className="text-xs text-gray-500">{seg.departure.cityName || getCityName(seg.departure.airport)}</div>
                                <div className="text-2xl font-bold text-[#055B75]">{depTime}</div>
                                <div className="text-xs text-gray-500">{depDate}</div>
                                <div className="text-[11px] text-gray-400 mt-0.5">
                                  {getCityName(seg.departure.airport)} Airport{seg.departure.terminal ? `, T${seg.departure.terminal}` : ''}
                                </div>
                              </div>

                              {/* Duration Arrow */}
                              <div className="flex flex-col items-center justify-center flex-1 min-w-[80px]">
                                <div className="text-xs text-gray-500 font-medium">{formatDuration(seg.duration)}</div>
                                <div className="relative w-full flex items-center my-1">
                                  <div className="flex-1 border-t-2 border-dashed border-gray-300"></div>
                                  <div className="mx-1 text-gray-400 text-sm">&#9992;</div>
                                  <div className="flex-1 border-t-2 border-dashed border-gray-300"></div>
                                </div>
                                <div className="text-[10px] font-medium px-2 py-0.5 rounded bg-[#e0f2fe] text-[#0369a1]">
                                  {bookingDetails?.flight?.cabin || 'Economy'}
                                </div>
                              </div>

                              {/* Arrival */}
                              <div className="flex flex-col items-end min-w-[120px] text-right">
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
                      <div className="time">{bookingDetails?.flight?.departureTime}</div>
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
                      <div className="time">{bookingDetails?.flight?.arrivalTime}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{formatFullDate(bookingDetails?.flight?.arrivalDate || bookingDetails?.flight?.departureDate)}</div>
                      <div className="airport" title={bookingDetails?.flight?.arrivalAirport}>
                        {getCityName(bookingDetails?.flight?.arrivalCode)} Airport{bookingDetails?.flight?.arrivalTerminal ? `, T${bookingDetails.flight.arrivalTerminal}` : ''}
                      </div>
                    </div>
                  </div>
                )}

                  <div className="flight-info-grid">
                    <div className="info-box">
                      <span className="label">Date</span>
                      <span className="value">{formatFullDate(bookingDetails?.flight?.departureDate)}</span>
                    </div>
                    <div className="info-box">
                      <span className="label">Flight No</span>
                      <span className="value">{bookingDetails?.flight?.flightNumber}</span>
                    </div>
                      <div className="info-box">
                        <span className="label">Baggage</span>
                        <span className="value">{formatBaggage(bookingDetails?.baggage?.checkIn) || 'Included'}</span>
                      </div>
                    {bookingDetails?.flight?.operatingAirlineName && bookingDetails.flight.operatingAirlineName !== bookingDetails.flight.airline && (
                      <div className="info-box">
                        <span className="label">Operated by</span>
                        <span className="value">{bookingDetails.flight.operatingAirlineName}</span>
                      </div>
                    )}
                    {bookingDetails?.flight?.numberOfBookableSeats && bookingDetails.flight.numberOfBookableSeats <= 9 && (
                      <div className="info-box">
                        <span className="label">Seats Left</span>
                        <span className="value text-red-600">{bookingDetails.flight.numberOfBookableSeats}</span>
                      </div>
                    )}
                    {bookingDetails?.flight?.lastTicketingDate && (
                      <div className="info-box">
                        <span className="label">Book By</span>
                        <span className="value">{formatShortDate(bookingDetails.flight.lastTicketingDate)}</span>
                      </div>
                    )}
                  </div>
              </div>
            </div>

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
                {editMode && (
                  <div className="alert-info">
                    <div className="icon">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    </div>
                    <div className="message">Please fill in all passenger details below. Fields marked with * are required.</div>
                  </div>
                )}

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

                {passengerData.map((passenger, index) => (
                  <div key={passenger.id} className="passenger-item">
                    <div className="passenger-header">
                      <div className="flex items-center gap-3">
                        <span className="passenger-badge">
                          Adult {index + 1}
                        </span>
                        {editMode && passengerData.length > 1 && (
                          <button
                            onClick={() => handleRemovePassenger(passenger.id)}
                            className="text-red-500 hover:text-red-700 text-xs font-semibold px-2 py-1 rounded hover:bg-red-50"
                          >
                            REMOVE
                          </button>
                        )}
                      </div>
                      <div className="flex items-center text-sm font-medium text-[#055B75]">
                        <CheckCircle className="w-4 h-4 mr-1 text-[#10b981]" />
                        {passenger.firstName} {passenger.lastName}
                      </div>
                    </div>

                    <div className="form-grid">
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
                          <label>Mobile No <span className="required">*</span></label>
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
                              required
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
                          {/* Passport / Travel Document Fields */}
                          <div className="form-group" style={{ position: 'relative' }}>
                            <label>Nationality</label>
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
                          <label>Passport Number</label>
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
                          <label>Passport Expiry Date</label>
                          <input
                            type="date"
                            className="form-input"
                            value={passenger.passportExpiry || ''}
                            onChange={(e) => handlePassengerChange(passenger.id, 'passportExpiry', e.target.value)}
                            readOnly={!editMode}
                          />
                        </div>
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
                ))}

                {editMode && (
                  <button
                    onClick={handleAddPassenger}
                    className="btn-add w-full justify-center mt-4"
                  >
                    <Plus className="h-5 w-5" /> Add Another Traveller
                  </button>
                )}
              </div>
            </div>

            {/* Booking Contact Details */}
            <div className="booking-card mb-8">
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
                  Your booking confirmation & ticket will be sent to the contact details below.
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

                <div className="mt-6 flex items-center gap-3 p-4 bg-[#f0fdf4] border border-[#dcfce7] rounded-xl">
                  <div className="bg-[#10b981] p-1 rounded-full">
                    <Check className="h-4 w-4 text-white" />
                  </div>
                  <span className="text-sm font-medium text-[#166534]">
                    {passengerData.length > 0 ?
                      `Booking alerts enabled for ${passengerData[0].firstName} ${passengerData[0].lastName}` :
                      "Add passenger details to enable alerts"
                    }
                  </span>
                </div>
              </div>
            </div>

            {/* Add-ons Section */}
            <div className="booking-card mb-8">
              <div className="booking-card-header">
                <h2>
                  <span className="flex items-center gap-2">
                    <Plus className="h-5 w-5" />
                    Flight Add-ons
                  </span>
                </h2>
              </div>
              <div className="booking-card-body">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {bookingDetails?.addOns && bookingDetails.addOns.length > 0 ? (
                    bookingDetails.addOns.map((addon) => (
                      <div key={addon.id} className={`addon-card ${selectedAddons.includes(addon.id) ? 'selected' : ''}`}>
                        <div className="addon-header">
                          <h3 className="addon-title">{addon.name}</h3>
                          <div className="addon-price">{calculatedFare.currency || '€'}{addon.price}</div>
                        </div>
                        <p className="text-sm text-[#7F8073] mb-3">{addon.description}</p>
                        <ul className="addon-benefits">
                          {addon.benefits.map((benefit, i) => (
                            <li key={i}>{benefit}</li>
                          ))}
                        </ul>
                        <button
                          onClick={() => toggleAddon(addon.id)}
                          className={`w-full mt-4 py-2 rounded-lg font-semibold text-sm transition-colors ${selectedAddons.includes(addon.id)
                            ? 'bg-[#10b981] text-white border-transparent'
                            : 'border-2 border-[#65B3CF] text-[#055B75] hover:bg-[#65B3CF]/10'
                            }`}
                        >
                          {selectedAddons.includes(addon.id) ? (
                            <span className="flex items-center justify-center gap-2"><Check className="h-4 w-4" /> Added</span>
                          ) : '+ Add to Trip'}
                        </button>
                      </div>
                    ))
                  ) : (
                    <p className="text-gray-500 col-span-2 text-center py-4">No add-ons available.</p>
                  )}
                </div>
              </div>
            </div>

            {/* VIP Service */}
            <div className="booking-card mb-8">
              <div className="booking-card-body flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg text-white font-bold text-lg">
                    VIP
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-[#055B75] mb-1">Fly Like a VIP</h3>
                    <p className="text-sm text-[#626363] max-w-md">
                      Get Priority Check-in, Priority Boarding, and Priority Baggage Handling for just <span className="font-bold text-[#055B75]">{calculatedFare.currency} {(bookingDetails?.vipServiceFee || 0).toFixed(2)}</span>.
                    </p>
                  </div>
                </div>
                <button
                  onClick={toggleVipService}
                  className={`px-6 py-3 rounded-xl font-bold transition-all shadow-md flex items-center gap-2 whitespace-nowrap ${vipService
                    ? 'bg-amber-500 text-white'
                    : 'bg-white text-amber-600 border-2 border-amber-500 hover:bg-amber-50'
                    }`}
                >
                  {vipService ? <><CheckCircle className="h-5 w-5" /> VIP Added</> : 'Upgrade to VIP'}
                </button>
              </div>
            </div>

            {/* Visa Requirements (International) */}
            {bookingDetails?.isInternational && bookingDetails?.visaRequirements && (
              <div className="booking-card mb-8">
                <div
                  className="booking-card-header cursor-pointer"
                  onClick={() => toggleSection('visaRequirements')}
                >
                  <h2>Visa & Travel Documents</h2>
                  {expandedSections.visaRequirements ? <ChevronUp /> : <ChevronDown />}
                </div>

                {expandedSections.visaRequirements && (
                  <div className="booking-card-body">
                    <div className="alert-warning bg-amber-50 border-l-4 border-amber-400 p-4 rounded-r mb-6 flex gap-3">
                      <div className="text-amber-500 mt-1">⚠️</div>
                      <div>
                        <h4 className="font-bold text-amber-800 text-sm">International Travel Requirement</h4>
                        <p className="text-sm text-amber-700">Ensure you have valid visas for {bookingDetails?.visaRequirements?.destination}.</p>
                      </div>
                    </div>
                    <div className="grid md:grid-cols-3 gap-6 mb-6">
                      <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                        <div className="text-xs text-[#7F8073] uppercase mb-1">Destination</div>
                        <div className="font-bold text-[#055B75]">{bookingDetails?.visaRequirements?.destination}</div>
                      </div>
                      <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                        <div className="text-xs text-[#7F8073] uppercase mb-1">Visa Type</div>
                        <div className="font-bold text-[#055B75]">{bookingDetails?.visaRequirements?.visaType}</div>
                      </div>
                      <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                        <div className="text-xs text-[#7F8073] uppercase mb-1">Processing</div>
                        <div className="font-bold text-[#055B75]">{bookingDetails?.visaRequirements?.processingTime}</div>
                      </div>
                    </div>
                    <a href={bookingDetails?.visaRequirements?.officialWebsite} target="_blank" rel="noreferrer" className="text-[#055B75] font-semibold hover:underline flex items-center gap-1">
                      Check Official Requirements <Share2 className="h-4 w-4" />
                    </a>
                  </div>
                )}
              </div>
            )}

            <div className="lg:hidden mt-8">
              {/* Mobile Place for Fare Summary if needed, or stick to bottom */}
            </div>

          </div> {/* End of Left Column */}

          {/* Right Column - Fare Summary (Sticky) */}
          <div className="lg:col-span-1">
            <div className="booking-card fare-summary-card">
              <div className="booking-card-header">
                <h2>Receipt Summary</h2>
              </div>
              <div className="booking-card-body">
                <div className="fare-row">
                  <span className="label">Base Fare ({passengerData.length}x)</span>
                  <span className="value"><Price amount={calculatedFare.baseFare} /></span>
                </div>
                <div className="fare-row">
                  <span className="label">Taxes & Fees</span>
                  <span className="value"><Price amount={calculatedFare.totalTax} /></span>
                </div>
                {calculatedFare.addonsTotal > 0 && (
                  <div className="fare-row">
                    <span className="label">Add-ons</span>
                    <span className="value"><Price amount={calculatedFare.addonsTotal} /></span>
                  </div>
                )}
                {vipService && (
                  <div className="fare-row">
                    <span className="label">VIP Services</span>
                    <span className="value"><Price amount={calculatedFare.vipServiceFee} /></span>
                  </div>
                )}

                <div className="fare-row total">
                  <span className="label">Total to Pay</span>
                  <span className="value"><Price amount={calculatedFare.totalAmount} showCode={true} /></span>
                </div>

                <button
                  onClick={handleProceedToPayment}
                  className="btn-primary mt-4"
                >
                  Proceed to Payment <CheckCircle className="h-5 w-5" />
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
    </div >
  );
}

export default withPageElements(FlightBookingConfirmation); 