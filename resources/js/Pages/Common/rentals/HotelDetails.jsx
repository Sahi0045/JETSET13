import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Star, MapPin, Check, ChevronLeft, Heart, Share, Calendar,
  Users, X, ChevronRight, ChevronDown, ThumbsUp, MessageCircle,
  Award, Camera, Coffee, ArrowRight, Bookmark, Phone, Mail, Facebook, Twitter, Instagram,
  Clock, Wifi, Tv, Shield, Utensils, Car, Sunset, Sparkles, Info
} from "lucide-react";
import Navbar from "../Navbar";
import Footer from "../Footer";
import "./styles.css";
import supabase from "../../../lib/supabase";
import axios from 'axios';
import { format } from 'date-fns';
import * as amadeusUtils from './amadeusUtils';
import DirectAmadeusService from '../../../Services/DirectAmadeusService';
import LoadingSpinner from '../../../../Components/LoadingSpinner';

export default function HotelDetails() {
  const navigate = useNavigate();
  const location = useLocation();
  const hotelData = location.state?.hotelData || {};
  const searchParams = location.state?.searchParams || {};

  const [selectedHotel, setSelectedHotel] = useState(null);
  const [activeImage, setActiveImage] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [showGalleryModal, setShowGalleryModal] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(0);
  const [guestCount, setGuestCount] = useState({
    adults: searchParams?.adults || 2,
    children: 1
  });
  const [showReviews, setShowReviews] = useState(false);
  const [checkInDate, setCheckInDate] = useState(() => {
    // Ensure checkInDate is a string
    if (searchParams?.checkInDate) {
      return typeof searchParams.checkInDate === 'string'
        ? searchParams.checkInDate
        : searchParams.checkInDate.toString();
    }
    return "Jul 24, 2025";
  });
  const [checkOutDate, setCheckOutDate] = useState(() => {
    // Ensure checkOutDate is a string
    if (searchParams?.checkOutDate) {
      return typeof searchParams.checkOutDate === 'string'
        ? searchParams.checkOutDate
        : searchParams.checkOutDate.toString();
    }
    return "Jul 28, 2025";
  });
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showGuestDropdown, setShowGuestDropdown] = useState(false);
  const [showBookingConfirmation, setShowBookingConfirmation] = useState(false);
  const [showCallbackRequest, setShowCallbackRequest] = useState(false);
  const [callbackForm, setCallbackForm] = useState({
    name: "",
    phone: "",
    preferredTime: "morning",
    message: ""
  });
  const [callbackSubmitted, setCallbackSubmitted] = useState(false);
  const [showVirtualTour, setShowVirtualTour] = useState(false);
  const [scrollPosition, setScrollPosition] = useState(0);
  const [activeTab, setActiveTab] = useState('overview');
  const [showAmenityDetails, setShowAmenityDetails] = useState(null);
  const [isPromoActive, setIsPromoActive] = useState(false);
  const [roomTypes, setRoomTypes] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [enhancedAmenities, setEnhancedAmenities] = useState([]);
  const [hotelOffer, setHotelOffer] = useState(null);
  const [offerLoading, setOfferLoading] = useState(false);
  const [offerError, setOfferError] = useState('');

  const overviewRef = useRef(null);
  const roomsRef = useRef(null);
  const amenitiesRef = useRef(null);
  const locationRef = useRef(null);
  const reviewsRef = useRef(null);
  const [error, setError] = useState('');

  // Calculate the number of nights between check-in and check-out dates
  const calculateNights = useCallback(() => {
    if (!checkInDate || !checkOutDate) return 4; // Default to 4 nights if dates are missing

    const checkIn = new Date(checkInDate);
    const checkOut = new Date(checkOutDate);

    if (isNaN(checkIn.getTime()) || isNaN(checkOut.getTime())) return 4;

    // Calculate difference in days
    const timeDiff = Math.abs(checkOut.getTime() - checkIn.getTime());
    const nights = Math.ceil(timeDiff / (1000 * 3600 * 24));

    return Math.max(1, nights); // At least 1 night
  }, [checkInDate, checkOutDate]);

  const totalNights = calculateNights();

  // Calculate total price based on available data
  const calculateTotalPrice = useCallback(() => {
    // If we have hotel offer data, use that
    if (hotelOffer?.offers && hotelOffer.offers.length > 0) {
      const selectedOffer = hotelOffer.offers[0];
      if (selectedOffer.price) {
        if (typeof selectedOffer.price === 'object' && selectedOffer.price.total) {
          return parseFloat(selectedOffer.price.total);
        } else {
          return parseFloat(selectedOffer.price);
        }
      }
    }

    // Otherwise, calculate based on room price
    if (roomTypes && roomTypes.length > 0 && roomTypes[selectedRoom]) {
      const currentRoomPrice = roomTypes[selectedRoom].price || 0;
      const cleaningFee = 50; // Default cleaning fee
      const serviceFee = 30; // Default service fee
      return (currentRoomPrice * totalNights) + cleaningFee + serviceFee;
    }

    // Default fallback based on hotel data
    const fallbackPrice = parseFloat(hotelData?.price) || 199;
    const cleaningFee = 50;
    const serviceFee = 30;
    return (fallbackPrice * totalNights) + cleaningFee + serviceFee;
  }, [hotelOffer, roomTypes, selectedRoom, totalNights, hotelData]);

  useEffect(() => {
    if (!location.state?.hotelData) {
      navigate('/rental');
      return;
    }
  }, [location.state?.hotelData, navigate]);

  useEffect(() => {
    const fetchHotelDetails = async () => {
      try {
        setIsLoading(true);

        // Default values
        const defaultPrice = 199;
        const defaultRating = 4.5;
        const basePrice = parseFloat(hotelData?.price) || defaultPrice;
        const hotelRating = parseFloat(hotelData?.rating) || defaultRating;

        const mockRoomTypes = [
          {
            id: 0,
            name: "Deluxe Room",
            price: basePrice,
            capacity: 2,
            features: ["Mountain View", "King Bed", "Free WiFi"]
          },
          {
            id: 1,
            name: "Premium Suite",
            price: Math.round(basePrice * 1.5),
            capacity: 3,
            features: ["Lake View", "King Bed + Sofa Bed", "Free WiFi", "Jacuzzi"]
          },
          {
            id: 2,
            name: "Family Suite",
            price: Math.round(basePrice * 2),
            capacity: 4,
            features: ["Mountain View", "2 Queen Beds", "Free WiFi", "Kitchenette"]
          }
        ];

        const mockReviews = [
          {
            id: 1,
            user: "Sarah J.",
            avatar: "https://randomuser.me/api/portraits/women/12.jpg",
            rating: hotelRating,
            date: "June 2023",
            comment: "The hotel exceeded our expectations. Views were breathtaking and staff was very attentive to our needs."
          },
          {
            id: 2,
            user: "Michael T.",
            avatar: "https://randomuser.me/api/portraits/men/32.jpg",
            rating: hotelRating,
            date: "May 2023",
            comment: "Perfect for our family vacation! Great amenities and close to all the local attractions."
          },
          {
            id: 3,
            user: "Emily P.",
            avatar: "https://randomuser.me/api/portraits/women/44.jpg",
            rating: hotelRating,
            date: "April 2023",
            comment: "Beautiful room with amazing views. Only small issue was slow WiFi, but otherwise perfect."
          }
        ];

        const mockAmenities = [
          {
            icon: <Wifi className="h-5 w-5" />,
            name: "High-Speed WiFi",
            description: "Complimentary high-speed internet access throughout the property with speeds up to 100 Mbps."
          },
          {
            icon: <Coffee className="h-5 w-5" />,
            name: "Gourmet Breakfast",
            description: "Daily complimentary breakfast buffet featuring local and international cuisine from 7:00 AM to 10:30 AM."
          },
          {
            icon: <Tv className="h-5 w-5" />,
            name: "Smart Entertainment",
            description: "55-inch smart TV with premium streaming services including Netflix, Amazon Prime, and local channels."
          },
          {
            icon: <Shield className="h-5 w-5" />,
            name: "24/7 Security",
            description: "Round-the-clock security with CCTV surveillance and secure key card access to all areas."
          },
          {
            icon: <Utensils className="h-5 w-5" />,
            name: "Fine Dining",
            description: "On-site restaurant offering authentic local cuisine and international dishes prepared by our award-winning chef."
          },
          {
            icon: <Car className="h-5 w-5" />,
            name: "Free Parking",
            description: "Complimentary valet and self-parking available for all guests throughout their stay."
          },
          {
            icon: <Sunset className="h-5 w-5" />,
            name: "Scenic Views",
            description: "Rooms featuring panoramic views of the surrounding mountains and valleys."
          },
          {
            icon: <Clock className="h-5 w-5" />,
            name: "Flexible Check-in",
            description: "Early check-in and late check-out available upon request, subject to availability."
          }
        ];

        setRoomTypes(mockRoomTypes);
        setReviews(mockReviews);
        setEnhancedAmenities(mockAmenities);

        // Ensure images property always exists with default values if missing
        const defaultImagePlaceholder = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1470&q=80';

        // High-quality hotel images from Unsplash
        const defaultGalleryImages = [
          // Hotel Rooms
          'https://images.unsplash.com/photo-1582719508461-905c673771fd?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1600&q=80',
          'https://images.unsplash.com/photo-1618773928121-c33d57733427?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1470&q=80',

          // Hotel Bathroom
          'https://images.unsplash.com/photo-1590490360182-c33d57733427?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1974&q=80',

          // Hotel Views/Pool
          'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1470&q=80',

          // Additional room views
          'https://images.unsplash.com/photo-1578683010236-d716f9a3f461?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1470&q=80',
          'https://images.unsplash.com/photo-1631049307264-da0ec9d70304?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=1470&q=80'
        ];

        // Create hotel object with guaranteed image properties
        setSelectedHotel({
          ...hotelData,
          longDescription: hotelData.description || 'Experience luxury and comfort at our hotel.',
          address: hotelData.location || 'Address not available',
          reviewCount: hotelData.reviewCount || 128,
          amenities: hotelData.amenities || ['WiFi', 'Room Service', 'Restaurant'],
          images: {
            main: hotelData.image || hotelData.images?.main || defaultImagePlaceholder,
            gallery: hotelData.images?.gallery || defaultGalleryImages
          }
        });

        setIsLoading(false);
      } catch (error) {
        console.error('Error fetching hotel details:', error);
        setIsLoading(false);
      }
    };

    if (location.state?.hotelData) {
      fetchHotelDetails();
    }
  }, [location.state?.hotelData, hotelData]);

  // Fetch hotel offers using multi-layer approach
  useEffect(() => {
    const fetchHotelOffer = async () => {
      if (!selectedHotel) return;

      setOfferLoading(true);
      setOfferError(''); // Clear any previous errors

      // Set a timeout to ensure loading doesn't persist indefinitely
      const loadingTimeout = setTimeout(() => {
        console.log('Loading timeout reached, stopping loading state');
        setOfferLoading(false);
        setOfferError('Unable to load current pricing. Showing estimated rates.');
      }, 10000); // Reduced to 10 seconds for better UX

      try {
        console.log('Fetching hotel offers for:', selectedHotel.name, '(ID:', selectedHotel.id, ')');

        // Force loading to complete after a short delay regardless of API state
        const fallbackTimeout = setTimeout(() => {
          setOfferLoading(false);
        }, 3000); // Force stop loading after 3 seconds max

        // Determine if this is a real Amadeus hotel ID or a placeholder
        const isRealHotelId = selectedHotel.hotelId && selectedHotel.hotelId.indexOf('placeholder') === -1;
        const isPlaceholder = selectedHotel.id.includes('placeholder') || selectedHotel.id.includes('hotel-');

        console.log('Hotel ID details:', {
          id: selectedHotel.id,
          hotelId: selectedHotel.hotelId,
          isRealHotelId,
          isPlaceholder,
          geoCode: selectedHotel.geoCode
        });

        // Layer 1: Try the main production API first, but only for real Amadeus IDs
        if (!isPlaceholder && isRealHotelId) {
          try {
            console.log('First attempt: Using production API with real hotel ID:', selectedHotel.hotelId);

            const response = await fetch('https://prod-r8ncjf76l-shubhams-projects-4a867368.vercel.app/api/hotels', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                hotelId: selectedHotel.hotelId,
                checkInDate: amadeusUtils.formatDate(new Date(checkInDate)),
                checkOutDate: amadeusUtils.formatDate(new Date(checkOutDate)),
                travelers: guestCount.adults
              })
            });

            if (response.ok) {
              const result = await response.json();
              console.log('Production API response:', result);

              if (result.success && result.offers && result.offers.length > 0) {
                setHotelOffer(result);
                clearTimeout(loadingTimeout);
                clearTimeout(fallbackTimeout);
                setOfferLoading(false);
                return; // Exit if successful
              }
            }
          } catch (productionError) {
            console.log('Production API error:', productionError.message);
            // Continue to next layer
          }
        }

        // Layer 2: Direct Amadeus API (for real hotel IDs only)
        if (selectedHotel.hotelId && !selectedHotel.isPlaceholder) {
          try {
            console.log('Second attempt: Using Direct Amadeus API with hotel ID:', selectedHotel.hotelId);

            const formattedCheckInDate = amadeusUtils.formatDate(new Date(checkInDate));
            const formattedCheckOutDate = amadeusUtils.formatDate(new Date(checkOutDate));

            const offers = await DirectAmadeusService.getHotelOffers(
              selectedHotel.hotelId,
              formattedCheckInDate,
              formattedCheckOutDate,
              guestCount.adults
            );

            if (offers && offers.length > 0) {
              console.log('Successfully retrieved offers from Direct Amadeus API');

              // Format offers for our UI
              const offerData = {
                hotelId: selectedHotel.hotelId,
                offers: offers.map(offer => ({
                  id: offer.id,
                  roomType: offer.room?.typeEstimated?.category || 'Standard Room',
                  bedType: offer.room?.typeEstimated?.bedType || 'Queen',
                  price: parseFloat(offer.price?.total || 0),
                  currency: offer.price?.currency || 'USD',
                  cancellationPolicy: offer.policies?.cancellation?.description || 'Non-refundable',
                  mealPlan: offer.boardType || 'Room only'
                }))
              };

              setHotelOffer(offerData);
              clearTimeout(loadingTimeout);
              clearTimeout(fallbackTimeout);
              setOfferLoading(false);
              return; // Exit if successful
            }
          } catch (amadeusError) {
            console.log('Direct Amadeus API error:', amadeusError.message);
            // Continue to final fallback
          }
        }

        // Layer 3: Generate placeholder offers as final fallback (ALWAYS execute this)
        console.log('Using placeholder offers as final fallback');

        // Get city code from the hotel or use a default
        const cityCode = selectedHotel.cityCode || 'DXB';

        // Try to extract city geo coordinates if available from the hotel
        let geoLocation = null;
        if (selectedHotel.geoCode) {
          geoLocation = selectedHotel.geoCode;
          console.log('Using hotel geoCode:', geoLocation);
        } else {
          // City coordinate defaults
          const cityCoordinates = {
            'LON': { latitude: 51.5074, longitude: -0.1278 },
            'PAR': { latitude: 48.8566, longitude: 2.3522 },
            'NYC': { latitude: 40.7128, longitude: -74.0060 },
            'DXB': { latitude: 25.2048, longitude: 55.2708 },
            'SIN': { latitude: 1.3521, longitude: 103.8198 }
          };

          geoLocation = cityCoordinates[cityCode] || { latitude: 0, longitude: 0 };
          console.log('Using default city coordinates:', geoLocation);
        }

        // Create generic placeholder offer data
        const placeholderOffers = [];

        for (let i = 0; i < 3; i++) {
          const roomTypes = ['Deluxe Room', 'Superior Room', 'Standard Room'];
          const bedTypes = ['King Bed', 'Queen Bed', 'Twin Beds'];
          const mealPlans = ['Breakfast Included', 'Half Board', 'Room Only'];

          placeholderOffers.push({
            id: `placeholder-${i}`,
            roomType: roomTypes[i % roomTypes.length],
            bedType: bedTypes[i % bedTypes.length],
            price: (Math.random() * 100 + 100).toFixed(2),
            currency: 'USD',
            cancellationPolicy: i === 0 ? 'Free cancellation' : 'Non-refundable',
            mealPlan: mealPlans[i % mealPlans.length]
          });
        }

        setHotelOffer({
          hotelId: selectedHotel.id,
          offers: placeholderOffers,
          geoCode: geoLocation // Include geo location for map integration
        });

        // Clear all timeouts since we completed successfully
        clearTimeout(loadingTimeout);
        clearTimeout(fallbackTimeout);

      } catch (error) {
        console.error('Error in all offer fetch attempts:', error);
        setOfferError('Could not retrieve availability for this hotel. Please try again later.');
        clearTimeout(loadingTimeout);
      } finally {
        // Ensure loading is always stopped
        setOfferLoading(false);
      }
    };

    // Add a small delay before starting the fetch to avoid rapid re-renders
    const fetchTimeout = setTimeout(() => {
      fetchHotelOffer();
    }, 100);

    return () => {
      clearTimeout(fetchTimeout);
    };
  }, [selectedHotel?.id, checkInDate, checkOutDate, guestCount.adults, guestCount.children]);

  useEffect(() => {
    const handleScroll = () => {
      setScrollPosition(window.scrollY);

      // Determine which section is currently in view
      const scrollPos = window.scrollY + 100;

      if (overviewRef.current && scrollPos >= overviewRef.current.offsetTop &&
        scrollPos < (roomsRef.current?.offsetTop || Infinity)) {
        setActiveTab('overview');
      } else if (roomsRef.current && scrollPos >= roomsRef.current.offsetTop &&
        scrollPos < (amenitiesRef.current?.offsetTop || Infinity)) {
        setActiveTab('rooms');
      } else if (amenitiesRef.current && scrollPos >= amenitiesRef.current.offsetTop &&
        scrollPos < (locationRef.current?.offsetTop || Infinity)) {
        setActiveTab('amenities');
      } else if (locationRef.current && scrollPos >= locationRef.current.offsetTop &&
        scrollPos < (reviewsRef.current?.offsetTop || Infinity)) {
        setActiveTab('location');
      } else if (reviewsRef.current && scrollPos >= reviewsRef.current.offsetTop) {
        setActiveTab('reviews');
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    // 50% chance to show a special promo
    setIsPromoActive(Math.random() > 0.5);

    // Add animation classes to elements when they come into view
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('animate-fadeIn');
        }
      });
    }, { threshold: 0.1 });

    document.querySelectorAll('.animate-on-scroll').forEach(el => {
      observer.observe(el);
    });

    return () => {
      document.querySelectorAll('.animate-on-scroll').forEach(el => {
        observer.unobserve(el);
      });
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showGuestDropdown && !event.target.closest('.guest-dropdown')) {
        setShowGuestDropdown(false);
      }
      if (showDatePicker && !event.target.closest('.date-picker')) {
        setShowDatePicker(false);
      }
      if (showAmenityDetails && !event.target.closest('.amenity-details')) {
        setShowAmenityDetails(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showGuestDropdown, showDatePicker, showAmenityDetails]);

  const handleBack = () => {
    navigate("/rental");
  };

  const toggleFavorite = () => {
    setIsFavorite(!isFavorite);
  };

  const handleShare = () => {
    // Mock share functionality
    alert("Share feature would open native share dialog here");
  };

  const nextImage = () => {
    if (showGalleryModal) {
      setActiveImage((prev) =>
        prev === selectedHotel.images.gallery.length ? 0 : prev + 1
      );
    }
  };

  const prevImage = () => {
    if (showGalleryModal) {
      setActiveImage((prev) =>
        prev === 0 ? selectedHotel.images.gallery.length : prev - 1
      );
    }
  };

  const handleRoomSelect = (id) => {
    setSelectedRoom(id);
  };

  const toggleReviews = () => {
    setShowReviews(!showReviews);
  };

  const handleGuestChange = (type, action) => {
    if (type === 'adults') {
      if (action === 'increase') {
        setGuestCount((prev) => ({ ...prev, adults: prev.adults + 1 }));
      } else if (action === 'decrease' && guestCount.adults > 1) {
        setGuestCount((prev) => ({ ...prev, adults: prev.adults - 1 }));
      }
    } else if (type === 'children') {
      if (action === 'increase') {
        setGuestCount((prev) => ({ ...prev, children: prev.children + 1 }));
      } else if (action === 'decrease' && guestCount.children > 0) {
        setGuestCount((prev) => ({ ...prev, children: prev.children - 1 }));
      }
    }
  };

  const handleReserveNow = async () => {
    try {
      // Format dates properly for the API
      const formattedCheckIn = amadeusUtils.formatDate(new Date(checkInDate));
      const formattedCheckOut = amadeusUtils.formatDate(new Date(checkOutDate));
      const calculatedTotalPrice = calculateTotalPrice();

      setError('');
      console.log('Starting Arc Pay hotel booking process...');

      // Step 1: Create hotel booking
      const bookingData = {
        hotelId: selectedHotel.hotelId || selectedHotel.id,
        offerId: hotelOffer?.offers?.[0]?.id || 'fallback-offer',
        guestDetails: {
          firstName: callbackForm.name?.split(' ')[0] || 'Guest',
          lastName: callbackForm.name?.split(' ').slice(1).join(' ') || 'User',
          email: `${callbackForm.phone?.replace(/\D/g, '') || 'guest'}@example.com`,
          phone: callbackForm.phone || ''
        },
        checkInDate: formattedCheckIn,
        checkOutDate: formattedCheckOut,
        totalPrice: calculatedTotalPrice,
        currency: 'USD'
      };

      const hotelBookingResponse = await axios.post('https://prod-r8ncjf76l-shubhams-projects-4a867368.vercel.app/api/hotels', {
        action: 'bookHotel',
        ...bookingData
      });

      if (hotelBookingResponse.data.success) {
        const booking = hotelBookingResponse.data.booking;
        console.log('Hotel booking created:', booking.bookingReference);

        // Step 2: Create Arc Pay payment order
        const paymentData = {
          bookingReference: booking.bookingReference,
          amount: calculatedTotalPrice,
          currency: 'USD',
          guestDetails: bookingData.guestDetails,
          hotelDetails: {
            name: selectedHotel.name,
            address: selectedHotel.location
          }
        };

        const paymentResponse = await axios.post('https://prod-r8ncjf76l-shubhams-projects-4a867368.vercel.app/api/hotels', {
          action: 'createPayment',
          ...paymentData
        });

        if (paymentResponse.data.success) {
          console.log('Arc Pay order created successfully');

          // Redirect to Arc Pay payment page or show success
          if (paymentResponse.data.paymentUrl) {
            window.location.href = paymentResponse.data.paymentUrl;
          } else {
            // If mock payment, redirect to success page
            window.location.href = `/hotel-booking-success?booking=${booking.bookingReference}&orderId=${paymentResponse.data.orderId}`;
          }
        } else {
          throw new Error('Failed to create payment order');
        }
      } else {
        throw new Error(hotelBookingResponse.data.error || 'Failed to create booking');
      }
    } catch (error) {
      console.error('Error in booking process:', error);
      // Still show the callback request form as fallback
      setShowCallbackRequest(true);
      setError(error.response?.data?.message || error.message || "Error processing booking");
    }
  };

  const handleCallbackFormChange = (e) => {
    const { name, value } = e.target;
    setCallbackForm(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleCallbackSubmit = async (e) => {
    e.preventDefault();

    try {
      // Store the callback request in Supabase
      const { data, error } = await supabase
        .from('hotels_callback')
        .insert([
          {
            name: callbackForm.name,
            phone: callbackForm.phone,
            preferred_time: callbackForm.preferredTime,
            message: callbackForm.message || ''  // Make message optional
          }
        ]);

      if (error) {
        console.error('Error storing callback request:', error);
        alert('There was an error submitting your request. Please try again.');
        return;
      }

      // Send confirmation email
      try {
        // Use direct API URL
        const apiUrl = 'https://prod-r8ncjf76l-shubhams-projects-4a867368.vercel.app/api';

        console.log('Using API URL for email:', apiUrl);

        const baseUrl = apiUrl.includes('/api') ? apiUrl.replace('/api', '') : 'https://jetsetterss.com';

        // Convert any potential Date objects to strings
        const checkInString = typeof checkInDate === 'string' ? checkInDate : String(checkInDate);
        const checkOutString = typeof checkOutDate === 'string' ? checkOutDate : String(checkOutDate);

        // Get the current calculated total price
        const calculatedTotalPrice = calculateTotalPrice();

        const roomTypeName = roomTypes && roomTypes[selectedRoom] ? roomTypes[selectedRoom].name : 'Standard Room';

        const emailResponse = await fetch(`${baseUrl}/api/send-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: callbackForm.name,
            phone: callbackForm.phone,
            email: `${callbackForm.phone.replace(/\D/g, '')}@example.com`, // Generate email from phone
            type: 'rental',
            details: {
              hotelName: selectedHotel.name,
              preferredTime: callbackForm.preferredTime,
              message: callbackForm.message,
              checkIn: checkInString,
              checkOut: checkOutString,
              guests: `${guestCount.adults} adults, ${guestCount.children} children`,
              roomType: roomTypeName,
              totalPrice: calculatedTotalPrice
            }
          })
        });

        if (!emailResponse.ok) {
          console.warn('Email confirmation issue:', await emailResponse.text());
        } else {
          console.log('Email sent successfully:', await emailResponse.json());
        }
      } catch (emailError) {
        console.error('Error sending confirmation email:', emailError);
        // Continue despite email error - we don't want to fail the callback submission
      }

      console.log('Callback request stored successfully:', data);
      setCallbackSubmitted(true);

      // After 3 seconds, show the booking confirmation
      setTimeout(() => {
        setCallbackSubmitted(false);
        setShowCallbackRequest(false);
        setShowBookingConfirmation(true);
      }, 3000);
    } catch (error) {
      console.error('Error in callback submission:', error);
      alert('There was an error submitting your request. Please try again.');
    }
  };

  const toggleVirtualTour = () => {
    setShowVirtualTour(!showVirtualTour);
  };

  const handleAmenityClick = (index) => {
    setShowAmenityDetails(showAmenityDetails === index ? null : index);
  };

  const scrollToSection = (sectionRef) => {
    if (sectionRef.current) {
      sectionRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const getRateCodeDisplay = (code) => {
    const rateCodes = {
      'RAC': 'Rack Rate',
      'BAR': 'Best Available Rate',
      'PRO': 'Promotional',
      'COR': 'Corporate',
      'GOV': 'Government',
      'AAA': 'AAA Member',
      'BNB': 'Bed & Breakfast',
      'PKG': 'Package',
      'WKD': 'Weekend',
      'CON': 'Convention'
    };
    return rateCodes[code] || code;
  };

  if (isLoading) {
    return <LoadingSpinner text="Loading hotel details..." fullScreen={true} />;
  }

  if (!selectedHotel) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-md px-4">
          <div className="text-red-500 text-5xl mb-4">😕</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Hotel Not Found</h2>
          <p className="text-gray-600 mb-6">We couldn't find the hotel you're looking for. It may have been removed or you may have followed an incorrect link.</p>
          <button
            onClick={handleBack}
            className="bg-[#0061ff] hover:bg-blue-700 text-white px-6 py-3 rounded-md transition-colors"
          >
            Back to Rentals
          </button>
        </div>
      </div>
    );
  }

  // Use the calculated total price - ensure currentRoomPrice has a fallback
  const currentRoomPrice = roomTypes[selectedRoom]?.price || parseFloat(hotelData?.price) || 199;
  const totalPrice = calculateTotalPrice();

  return (
    <div className="min-h-screen bg-white">
      <Navbar forceScrolled={true} />
      <div className="min-h-screen bg-white pb-16 pt-16">
        {/* Back button */}
        <div className="px-4 py-3 bg-white shadow-sm">
          <button
            onClick={handleBack}
            className="flex items-center text-gray-600 hover:text-[#0061ff] transition-colors"
          >
            <ChevronLeft size={20} className="mr-1" />
            <span>Back to Rentals</span>
          </button>
        </div>

        {/* Main content */}
        <div className="max-w-6xl mx-auto px-4 mt-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2">{selectedHotel.name}</h1>
              <div className="flex items-center text-gray-600 mb-1">
                <MapPin size={16} className="mr-1" />
                <span>{selectedHotel.location}</span>
              </div>
              <div className="flex items-center">
                <div className="flex items-center">
                  <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
                  <span className="ml-1 text-gray-700 font-medium">{selectedHotel.rating}</span>
                  <span className="ml-1 text-gray-500">({selectedHotel.reviewCount} reviews)</span>
                  <button
                    onClick={toggleReviews}
                    className="ml-2 text-blue-600 text-sm hover:underline"
                  >
                    See reviews
                  </button>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={toggleFavorite}
                className="p-2 rounded-full border border-gray-200 hover:border-gray-300 text-gray-600 hover:text-red-500 transition-colors"
                aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
              >
                <Heart size={20} className={isFavorite ? "text-red-500 fill-red-500" : ""} />
              </button>
              <button
                onClick={handleShare}
                className="p-2 rounded-full border border-gray-200 hover:border-gray-300 text-gray-600 hover:text-gray-800 transition-colors"
              >
                <Share size={20} />
              </button>
            </div>
          </div>

          {/* Photo gallery - clickable */}
          <div className="mb-8">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div
                className="rounded-lg overflow-hidden h-[300px] md:h-[400px] cursor-pointer relative group"
                onClick={() => { setShowGalleryModal(true); setActiveImage(0); }}
              >
                <img
                  src={selectedHotel.images.main}
                  alt={selectedHotel.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <div className="bg-white/80 backdrop-blur-sm rounded-full p-2">
                    <Camera className="h-6 w-6 text-gray-800" />
                  </div>
                </div>

                {/* Featured badge */}
                <div className="absolute top-4 left-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white px-3 py-1 rounded-full text-xs z-10 font-medium shadow-lg flex items-center">
                  <Sparkles className="h-3 w-3 mr-1 text-yellow-300" />
                  <span>Featured</span>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {selectedHotel.images.gallery.map((image, index) => (
                  <div
                    key={index}
                    className="rounded-lg overflow-hidden h-[140px] md:h-[192px] cursor-pointer relative group"
                    onClick={() => { setShowGalleryModal(true); setActiveImage(index + 1); }}
                  >
                    <img
                      src={image}
                      alt={`${selectedHotel.name} ${index + 1}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between mt-4">
              <button
                className="text-blue-600 flex items-center hover:underline"
                onClick={() => setShowGalleryModal(true)}
              >
                <Camera className="h-5 w-5 mr-1" />
                View all photos ({1 + selectedHotel.images.gallery.length})
              </button>

              <button
                className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center hover:bg-blue-700 transition-colors"
                onClick={toggleVirtualTour}
              >
                <Sunset className="h-5 w-5 mr-2" />
                Virtual Tour
              </button>
            </div>
          </div>

          {/* Main details */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="md:col-span-2">
              <div className="mb-8" ref={overviewRef}>
                <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center">
                  <Award className="mr-2 text-blue-600 h-6 w-6" />
                  About this hotel
                </h2>
                <p className="text-gray-600 mb-4">{selectedHotel.description}</p>
                <p className="text-gray-600">{selectedHotel.longDescription}</p>
              </div>

              {/* Room selection section */}
              <div className="mb-8" ref={roomsRef}>
                <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center">
                  <Users className="mr-2 text-blue-600 h-6 w-6" />
                  Select your room
                </h2>
                <div className="space-y-4">
                  {roomTypes.map((room) => (
                    <div
                      key={room.id}
                      className={`border ${selectedRoom === room.id ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200'} rounded-lg p-4 hover:border-blue-300 transition-all duration-300 cursor-pointer transform hover:-translate-y-1 hover:shadow-lg`}
                      onClick={() => handleRoomSelect(room.id)}
                    >
                      <div className="flex justify-between">
                        <div>
                          <h3 className="font-bold text-gray-900">{room.name}</h3>
                          <p className="text-sm text-gray-600">Up to {room.capacity} guests</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-gray-900">${room.price}</p>
                          <p className="text-sm text-gray-600">per night</p>
                        </div>
                      </div>
                      <div className="mt-3">
                        <div className="grid grid-cols-2 gap-2">
                          {room.features.map((feature, i) => (
                            <div key={i} className="flex items-center text-gray-700">
                              <Check size={16} className="text-green-500 mr-1 flex-shrink-0" />
                              <span className="text-sm">{feature}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mb-8" ref={amenitiesRef}>
                <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center">
                  <Coffee className="mr-2 text-blue-600 h-6 w-6" />
                  What this place offers
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  {enhancedAmenities.map((amenity, index) => (
                    <div
                      key={index}
                      className="flex items-center text-gray-700 p-2 hover:bg-blue-50 rounded-md transition-colors amenity-details"
                      onClick={() => handleAmenityClick(index)}
                    >
                      <div className="mr-2">{amenity.icon}</div>
                      <div>
                        <p className="font-medium">{amenity.name}</p>
                        <p className="text-sm text-gray-600">{amenity.description}</p>
                      </div>
                      {showAmenityDetails === index && (
                        <div className="absolute left-0 right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-10 p-4">
                          <p className="font-medium">{amenity.name}</p>
                          <p className="text-sm text-gray-600">{amenity.description}</p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="mb-8" ref={locationRef}>
                <h2 className="text-2xl font-bold text-gray-900 mb-4 flex items-center">
                  <MapPin className="mr-2 text-blue-600 h-6 w-6" />
                  Location
                </h2>
                <p className="text-gray-600 mb-4">{selectedHotel.address || selectedHotel.location}</p>
                <div className="bg-gray-200 rounded-lg h-[300px] flex items-center justify-center relative overflow-hidden group">
                  <img
                    src="https://maps.googleapis.com/maps/api/staticmap?center=Jammu+Kashmir&zoom=12&size=800x300&maptype=roadmap&markers=color:red%7C33.7782,76.5762&key=YOUR_API_KEY"
                    alt="Map location"
                    className="w-full h-full object-cover opacity-60"
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="bg-white/90 backdrop-blur-sm px-6 py-4 rounded-lg shadow-lg transform transition-transform group-hover:scale-105">
                      <p className="text-gray-800 font-medium">Interactive map will be displayed here</p>
                      <p className="text-gray-600 text-sm">Exact location provided after booking</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Reviews section */}
              <div className="mb-8" ref={reviewsRef}>
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">Guest Reviews</h2>
                  <button
                    onClick={toggleReviews}
                    className="text-blue-600 flex items-center text-sm hover:underline"
                  >
                    {showReviews ? "Hide reviews" : "Show all reviews"}
                    <ChevronDown className={`ml-1 h-4 w-4 transform transition-transform ${showReviews ? 'rotate-180' : ''}`} />
                  </button>
                </div>

                <div className="flex items-center mb-6">
                  <div className="bg-blue-600 text-white rounded-lg px-3 py-2 flex items-center mr-4">
                    <span className="text-xl font-bold mr-1">{selectedHotel.rating}</span>
                    <Star className="h-5 w-5 fill-white" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">Excellent</p>
                    <p className="text-sm text-gray-600">Based on {selectedHotel.reviewCount} reviews</p>
                  </div>
                </div>

                {showReviews && (
                  <div className="space-y-6">
                    {reviews.map(review => (
                      <div key={review.id} className="border-b border-gray-200 pb-6">
                        <div className="flex items-center mb-3">
                          <img
                            src={review.avatar}
                            alt={review.user}
                            className="w-10 h-10 rounded-full mr-3"
                          />
                          <div>
                            <p className="font-medium">{review.user}</p>
                            <div className="flex items-center">
                              <div className="flex mr-2">
                                {[...Array(5)].map((_, i) => (
                                  <Star
                                    key={i}
                                    className={`h-4 w-4 ${i < review.rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`}
                                  />
                                ))}
                              </div>
                              <span className="text-sm text-gray-600">{review.date}</span>
                            </div>
                          </div>
                        </div>
                        <p className="text-gray-700">{review.comment}</p>
                        <div className="flex items-center mt-3 text-sm text-gray-600">
                          <button className="flex items-center mr-4 hover:text-blue-600">
                            <ThumbsUp className="h-4 w-4 mr-1" />
                            Helpful
                          </button>
                          <button className="flex items-center hover:text-blue-600">
                            <MessageCircle className="h-4 w-4 mr-1" />
                            Reply
                          </button>
                        </div>
                      </div>
                    ))}
                    <button className="bg-white border border-blue-600 text-blue-600 px-4 py-2 rounded hover:bg-blue-50 transition-colors">
                      Show more reviews
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Booking card */}
            <div>
              <div id="booking-card" className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 sticky top-24 transition-all duration-300 hover:shadow-xl">
                <div className="flex items-baseline justify-between mb-4">
                  <div>
                    {offerLoading ? (
                      <div className="animate-pulse">
                        <div className="h-8 w-32 bg-gray-200 rounded mb-1"></div>
                        <div className="h-4 w-20 bg-gray-200 rounded"></div>
                      </div>
                    ) : hotelOffer?.offers?.[0]?.price ? (
                      <>
                        <span className="text-2xl font-bold text-gray-900">
                          ${typeof hotelOffer.offers[0].price === 'object' ? hotelOffer.offers[0].price.total : hotelOffer.offers[0].price}
                        </span>
                        <span className="text-gray-600 ml-1">per night</span>
                        {hotelOffer.offers[0].rateCode && (
                          <div className="mt-1">
                            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                              {getRateCodeDisplay(hotelOffer.offers[0].rateCode)}
                            </span>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="text-2xl font-bold text-gray-900">${currentRoomPrice}</span>
                        <span className="text-gray-600 ml-1">per night</span>
                        {offerError && (
                          <div className="mt-1">
                            <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full">
                              Estimated Rate
                            </span>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <div className="flex items-center">
                    <Star className="h-4 w-4 text-yellow-400 fill-yellow-400" />
                    <span className="ml-1 text-gray-700">{selectedHotel.rating}</span>
                  </div>
                </div>

                <div className="mb-4">
                  <div className="border border-gray-200 rounded-t-lg overflow-hidden">
                    <div className="grid grid-cols-2">
                      <div
                        className="p-4 border-r border-b border-gray-200 cursor-pointer hover:bg-blue-50 transition-colors date-picker"
                        onClick={() => setShowDatePicker(!showDatePicker)}
                      >
                        <label className="block text-xs text-gray-500 mb-1">CHECK-IN</label>
                        <div className="flex items-center">
                          <Calendar size={16} className="text-gray-400 mr-2" />
                          <span className="text-gray-800">{checkInDate}</span>
                        </div>
                      </div>
                      <div
                        className="p-4 border-b border-gray-200 cursor-pointer hover:bg-blue-50 transition-colors date-picker"
                        onClick={() => setShowDatePicker(!showDatePicker)}
                      >
                        <label className="block text-xs text-gray-500 mb-1">CHECK-OUT</label>
                        <div className="flex items-center">
                          <Calendar size={16} className="text-gray-400 mr-2" />
                          <span className="text-gray-800">{checkOutDate}</span>
                        </div>
                      </div>
                    </div>
                    <div
                      className="p-4 border-b border-gray-200 cursor-pointer hover:bg-blue-50 transition-colors guest-dropdown relative"
                      onClick={() => setShowGuestDropdown(!showGuestDropdown)}
                    >
                      <label className="block text-xs text-gray-500 mb-1">GUESTS</label>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center">
                          <Users size={16} className="text-gray-400 mr-2" />
                          <span className="text-gray-800">{guestCount.adults} adults, {guestCount.children} child</span>
                        </div>
                        <ChevronDown size={16} className={`text-gray-400 transition-transform duration-300 ${showGuestDropdown ? 'rotate-180' : ''}`} />
                      </div>

                      {/* Guest dropdown */}
                      {showGuestDropdown && (
                        <div className="absolute left-0 right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-10 p-4">
                          <div className="mb-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="font-medium">Adults</span>
                              <div className="flex items-center">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleGuestChange('adults', 'decrease');
                                  }}
                                  className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100"
                                  disabled={guestCount.adults <= 1}
                                >
                                  -
                                </button>
                                <span className="mx-3 w-4 text-center">{guestCount.adults}</span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleGuestChange('adults', 'increase');
                                  }}
                                  className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="font-medium">Children</span>
                              <div className="flex items-center">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleGuestChange('children', 'decrease');
                                  }}
                                  className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100"
                                  disabled={guestCount.children <= 0}
                                >
                                  -
                                </button>
                                <span className="mx-3 w-4 text-center">{guestCount.children}</span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleGuestChange('children', 'increase');
                                  }}
                                  className="w-8 h-8 rounded-full border border-gray-300 flex items-center justify-center text-gray-600 hover:bg-gray-100"
                                >
                                  +
                                </button>
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowGuestDropdown(false);
                            }}
                            className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors"
                          >
                            Apply
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-4 mb-6">
                  {offerLoading ? (
                    <div className="animate-pulse space-y-4">
                      <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                      <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                      <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                      <div className="text-xs text-gray-500 mt-2">Loading pricing details...</div>
                    </div>
                  ) : hotelOffer?.offers?.[0]?.price && typeof hotelOffer.offers[0].price === 'object' ? (
                    <>
                      <div className="flex justify-between">
                        <span className="text-gray-700">Base Price</span>
                        <span className="text-gray-700">${hotelOffer.offers[0].price.base || hotelOffer.offers[0].price.total}</span>
                      </div>
                      {hotelOffer.offers[0].price.variations?.changes?.map((change, index) => (
                        <div key={index} className="flex justify-between text-sm text-gray-600">
                          <span>{format(new Date(change.startDate), 'MMM d')} - {format(new Date(change.endDate), 'MMM d')}</span>
                          <span>${change.base} per night</span>
                        </div>
                      ))}
                      <div className="flex justify-between">
                        <span className="text-gray-700">Taxes & Fees</span>
                        <span className="text-gray-700">
                          ${(parseFloat(hotelOffer.offers[0].price.total) - parseFloat(hotelOffer.offers[0].price.base || hotelOffer.offers[0].price.total)).toFixed(2)}
                        </span>
                      </div>
                      <div className="border-t border-gray-200 pt-4 flex justify-between font-bold">
                        <span>Total</span>
                        <span>${hotelOffer.offers[0].price.total}</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between">
                        <span className="text-gray-700">${currentRoomPrice} x {totalNights} nights</span>
                        <span className="text-gray-700">${(currentRoomPrice * totalNights).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-700">Cleaning fee</span>
                        <span className="text-gray-700">$50</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-700">Service fee</span>
                        <span className="text-gray-700">$30</span>
                      </div>
                      <div className="border-t border-gray-200 pt-4 flex justify-between font-bold">
                        <span>Total</span>
                        <span>${totalPrice.toFixed(2)}</span>
                      </div>
                    </>
                  )}
                </div>

                {/* Enhanced Booking Policies */}
                {hotelOffer?.offers?.[0]?.policies && (
                  <div className="mb-6 p-4 bg-gray-50 rounded-lg">
                    <h4 className="font-semibold text-gray-900 mb-3">Booking Policies</h4>
                    <div className="space-y-3">
                      {hotelOffer.offers[0].policies.cancellation && (
                        <div className="flex items-start">
                          <div className="flex-shrink-0">
                            <Info className="h-5 w-5 text-blue-600 mt-0.5" />
                          </div>
                          <div className="ml-2">
                            <p className="text-sm font-medium text-gray-900">Cancellation Policy</p>
                            <p className="text-sm text-gray-600">
                              {hotelOffer.offers[0].policies.cancellation.description.text}
                            </p>
                          </div>
                        </div>
                      )}
                      {hotelOffer.offers[0].policies.checkInOut && (
                        <div className="flex items-start">
                          <div className="flex-shrink-0">
                            <Clock className="h-5 w-5 text-blue-600 mt-0.5" />
                          </div>
                          <div className="ml-2">
                            <p className="text-sm font-medium text-gray-900">Check-in/Check-out</p>
                            <p className="text-sm text-gray-600">
                              Check-in: {hotelOffer.offers[0].policies.checkInOut.checkIn || 'Flexible'}<br />
                              Check-out: {hotelOffer.offers[0].policies.checkInOut.checkOut || 'Flexible'}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={handleReserveNow}
                    className="flex-1 bg-[#0061ff] hover:bg-blue-700 text-white py-3 rounded-lg transition-colors font-medium flex items-center justify-center gap-2 group"
                  >
                    <span>Reserve Now</span>
                    <ArrowRight size={16} className="transform transition-transform group-hover:translate-x-1" />
                  </button>
                  <button
                    onClick={() => navigate('/rental/booking', {
                      state: {
                        hotelData: selectedHotel,
                        hotelId: selectedHotel.id,
                        hotelName: selectedHotel.name,
                        roomType: roomTypes[selectedRoom],
                        checkInDate,
                        checkOutDate,
                        guestCount,
                        totalPrice
                      }
                    })}
                    className="flex-1 bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg transition-colors font-medium flex items-center justify-center gap-2 group"
                  >
                    <span>Book Now</span>
                    <ArrowRight size={16} className="transform transition-transform group-hover:translate-x-1" />
                  </button>
                </div>

                {offerError && (
                  <div className="text-center text-sm mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <p className="text-yellow-700">{offerError}</p>
                    <p className="text-xs text-yellow-600 mt-1">Showing estimated pricing based on similar properties</p>
                  </div>
                )}

                {!offerLoading && !hotelOffer?.offers?.length && !offerError && (
                  <div className="text-center text-sm mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-blue-700">Contact us for current availability and pricing</p>
                  </div>
                )}
              </div>

              {/* Contact host section */}
              <div className="mt-4 bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
                <h4 className="font-semibold text-gray-900 mb-3">Contact Host</h4>
                <div className="flex items-center gap-3 mb-3">
                  <img
                    src="https://randomuser.me/api/portraits/men/85.jpg"
                    alt="Host"
                    className="w-10 h-10 rounded-full object-cover"
                  />
                  <div>
                    <p className="font-medium">Rajesh Kumar</p>
                    <p className="text-sm text-gray-600">Response rate: 98%</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <button className="w-full border border-gray-300 rounded-lg py-2 text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2">
                    <Phone size={16} />
                    <span>Call Host</span>
                  </button>
                  <button className="w-full border border-gray-300 rounded-lg py-2 text-gray-700 hover:bg-gray-50 transition-colors flex items-center justify-center gap-2">
                    <Mail size={16} />
                    <span>Message Host</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Full-screen gallery modal */}
      {showGalleryModal && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center">
          <button
            onClick={() => setShowGalleryModal(false)}
            className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors"
          >
            <X size={24} />
          </button>

          <button
            onClick={prevImage}
            className="absolute left-4 text-white hover:text-gray-300 transition-colors"
          >
            <ChevronLeft size={32} />
          </button>

          <div className="max-w-4xl max-h-screen p-4">
            <img
              src={activeImage === 0 ? selectedHotel.images.main : selectedHotel.images.gallery[activeImage - 1]}
              alt={`${selectedHotel.name} image ${activeImage + 1}`}
              className="max-h-[80vh] mx-auto"
            />
            <p className="text-white text-center mt-4">
              {activeImage + 1} / {1 + selectedHotel.images.gallery.length}
            </p>
          </div>

          <button
            onClick={nextImage}
            className="absolute right-4 text-white hover:text-gray-300 transition-colors"
          >
            <ChevronRight size={32} />
          </button>
        </div>
      )}

      {/* Virtual tour modal */}
      {showVirtualTour && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center">
          <button
            onClick={toggleVirtualTour}
            className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors"
          >
            <X size={24} />
          </button>
          <div className="max-w-4xl max-h-screen p-4">
            <iframe
              src="https://www.youtube.com/embed/VIDEO_ID"
              title="Virtual Tour"
              frameBorder="0"
              allowFullScreen
              className="w-full h-full"
            />
          </div>
        </div>
      )}

      {/* Callback Request Modal */}
      {showCallbackRequest && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 animate-scaleIn relative overflow-hidden">
            {/* Background decorative elements */}
            <div className="absolute -right-16 -top-16 w-32 h-32 bg-blue-100 rounded-full opacity-50"></div>
            <div className="absolute -left-16 -bottom-16 w-32 h-32 bg-blue-100 rounded-full opacity-50"></div>

            {!callbackSubmitted ? (
              <>
                <div className="flex justify-between items-center mb-6 relative z-10">
                  <h3 className="text-xl font-bold text-gray-900 flex items-center">
                    <Phone className="text-blue-600 mr-2 h-5 w-5" />
                    Request a Callback
                  </h3>
                  <button
                    onClick={() => setShowCallbackRequest(false)}
                    className="text-gray-500 hover:text-gray-700 transition-colors"
                  >
                    <X size={20} />
                  </button>
                </div>

                <p className="text-gray-600 mb-4 relative z-10">
                  Leave your contact details and our representative will call you back to confirm your booking at {selectedHotel.name}.
                </p>

                <form onSubmit={handleCallbackSubmit} className="relative z-10">
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
                      <input
                        type="text"
                        id="name"
                        name="name"
                        required
                        value={callbackForm.name}
                        onChange={handleCallbackFormChange}
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                        placeholder="Enter your full name"
                      />
                    </div>

                    <div>
                      <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                      <div className="relative">
                        <input
                          type="tel"
                          id="phone"
                          name="phone"
                          required
                          value={callbackForm.phone}
                          onChange={handleCallbackFormChange}
                          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                          placeholder="Enter your phone number"
                        />
                        <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="preferredTime" className="block text-sm font-medium text-gray-700 mb-1">Preferred Time for Callback</label>
                      <div className="relative">
                        <select
                          id="preferredTime"
                          name="preferredTime"
                          value={callbackForm.preferredTime}
                          onChange={handleCallbackFormChange}
                          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none transition-all"
                        >
                          <option value="morning">Morning (9 AM - 12 PM)</option>
                          <option value="afternoon">Afternoon (12 PM - 5 PM)</option>
                          <option value="evening">Evening (5 PM - 8 PM)</option>
                        </select>
                        <Clock className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                        <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1">Additional Message (optional)</label>
                      <textarea
                        id="message"
                        name="message"
                        rows="3"
                        value={callbackForm.message}
                        onChange={handleCallbackFormChange}
                        className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all"
                        placeholder="Any special requests or questions"
                      ></textarea>
                    </div>
                  </div>

                  <div className="mt-6">
                    <button
                      type="submit"
                      className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white py-3 rounded-lg transition-colors font-medium flex items-center justify-center gap-2 shadow-md"
                    >
                      <Phone size={16} />
                      <span>Request Callback</span>
                    </button>
                  </div>
                </form>

                <div className="flex items-center justify-center mt-4 space-x-4">
                  <img src="https://upload.wikimedia.org/wikipedia/commons/5/5e/Visa_Inc._logo.svg" alt="Visa" className="h-6 opacity-60" />
                  <img src="https://upload.wikimedia.org/wikipedia/commons/2/2a/Mastercard-logo.svg" alt="Mastercard" className="h-6 opacity-60" />
                  <img src="https://upload.wikimedia.org/wikipedia/commons/f/fa/American_Express_logo_%282018%29.svg" alt="American Express" className="h-6 opacity-60" />
                </div>

                <p className="text-xs text-gray-500 mt-4 text-center relative z-10">
                  By submitting this form, you agree to our <a href="#" className="text-blue-600 hover:underline">Terms of Service</a> and <a href="#" className="text-blue-600 hover:underline">Privacy Policy</a>.
                </p>
              </>
            ) : (
              <div className="text-center py-8 relative z-10">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Check className="h-8 w-8 text-green-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">Callback Request Received!</h3>
                <p className="text-gray-600 mb-6">
                  Thank you for your request. Our representative will call you back shortly at the preferred time.
                </p>
                <div className="flex items-center justify-center gap-2 text-blue-600 mb-4">
                  <Clock size={18} />
                  <span>Processing your booking...</span>
                </div>

                <div className="flex justify-center mt-4">
                  <button
                    onClick={() => {
                      setCallbackSubmitted(false);
                      setShowCallbackRequest(false);
                    }}
                    className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-2 rounded-lg transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Booking confirmation modal */}
      {showBookingConfirmation && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 animate-scaleIn">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="h-8 w-8 text-green-600" />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Booking Confirmed!</h3>
              <p className="text-gray-600">Your reservation at {selectedHotel.name} has been successfully confirmed.</p>
              <p className="text-xs text-gray-500 mt-1">Booking ID: {selectedHotel.id}</p>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 mb-1">CHECK-IN</p>
                  <p className="font-medium">{checkInDate}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">CHECK-OUT</p>
                  <p className="font-medium">{checkOutDate}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">GUESTS</p>
                  <p className="font-medium">{guestCount.adults} adults, {guestCount.children} child</p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 mb-1">ROOM TYPE</p>
                  <p className="font-medium">{roomTypes[selectedRoom].name}</p>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-200">
                <div className="flex justify-between font-bold">
                  <span>Total</span>
                  <span>${totalPrice}</span>
                </div>
              </div>
            </div>

            <div className="flex gap-4">
              <button
                onClick={() => setShowBookingConfirmation(false)}
                className="flex-1 bg-white border border-gray-300 text-gray-700 py-3 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Close
              </button>
              <button
                onClick={() => {
                  setShowBookingConfirmation(false);
                  navigate("/my-trips");
                }}
                className="flex-1 bg-[#0061ff] text-white py-3 rounded-lg hover:bg-blue-700 transition-colors"
              >
                View My Trips
              </button>
            </div>

            <div className="mt-6 text-center">
              <p className="text-sm text-gray-500">A confirmation email has been sent to your email address.</p>
              <div className="flex justify-center mt-4 space-x-4">
                <button className="text-gray-500 hover:text-blue-600">
                  <Facebook size={20} />
                </button>
                <button className="text-gray-500 hover:text-blue-400">
                  <Twitter size={20} />
                </button>
                <button className="text-gray-500 hover:text-pink-600">
                  <Instagram size={20} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
} 
