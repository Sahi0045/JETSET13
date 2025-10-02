import { Link, useNavigate } from "react-router-dom"
import Navbar from "../Navbar"
import Footer from "../Footer"
import { 
  Search, 
  Globe, 
  Users, 
  Calendar, 
  Star, 
  Mail, 
  Check, 
  Heart, 
  ArrowRight, 
  ChevronLeft, 
  ChevronRight, 
  Coffee, 
  Wifi, 
  Tv, 
  Shield, 
  Clock, 
  MapPin,
  Award,
  Sparkles,
  X,
  Loader,
  ChevronDown,
  Minus,
  Plus
} from "lucide-react"
import { popularDestinations } from "./hotel"
import { useState, useEffect, useRef } from "react"
import axios from 'axios';
import * as amadeusUtils from './amadeusUtils';
import DirectAmadeusService from '../../../Services/DirectAmadeusService';
// Import API_BASE_URL from centralized API configuration
import { API_BASE_URL } from '../../../../../src/config/api.js';

export default function LandingPage() {
  const navigate = useNavigate();
  const [activeIndex, setActiveIndex] = useState(0);
  const [isVisible, setIsVisible] = useState({});
  const [isFavorite, setIsFavorite] = useState({});
  const [isHovered, setIsHovered] = useState(null);
  const carouselRef = useRef(null);
  
  // Search states
  const [searchDestination, setSearchDestination] = useState("");
  const [searchPackageType, setSearchPackageType] = useState("All Inclusive");
  const [searchDates, setSearchDates] = useState("Select dates");
  const [searchTravelers, setSearchTravelers] = useState(2);
  const [filteredHotels, setFilteredHotels] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [cityCode, setCityCode] = useState("");
  
  // Date picker states
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth());
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [selectedStartDate, setSelectedStartDate] = useState(null);
  const [selectedEndDate, setSelectedEndDate] = useState(null);
  const [hoverDate, setHoverDate] = useState(null);
  const datePickerRef = useRef(null);
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  
  // Destination search suggestion states
  const [destinationSuggestions, setDestinationSuggestions] = useState([]);
  const [showDestinationSuggestions, setShowDestinationSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState([]);
  const destinationRef = useRef(null);

  // Mobile search toggle
  const [showMobileSearch, setShowMobileSearch] = useState(false);

  // Mobile search modal state
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  // Mobile view detection
  const [isMobileView, setIsMobileView] = useState(false);

  // Fetch destinations from backend
  useEffect(() => {
    const fetchDestinations = async () => {
      try {
        // Use API_BASE_URL from centralized config
        console.log('Using API URL from config:', API_BASE_URL);
        const response = await axios.get(`${API_BASE_URL}/hotels/destinations`);
        if (response.data.success) {
          setDestinationSuggestions(response.data.data);
        } else {
          // Fallback to popular destinations if API doesn't return success
          setDestinationSuggestions(popularDestinations);
        }
      } catch (error) {
        console.error('Error fetching destinations:', error);
        // Fallback to popular destinations if API fails
        setDestinationSuggestions(popularDestinations);
      }
    };
    fetchDestinations();
  }, []);

  // Handle search submission
  const handleSearch = async () => {
    if (!searchDestination || !cityCode) {
      setSearchError("Please select a destination");
      return;
    }

    if (!selectedStartDate || !selectedEndDate) {
      setSearchError("Please select both check-in and check-out dates");
      return;
    }

    // Validate date range
    if (selectedEndDate <= selectedStartDate) {
      setSearchError("Check-out date must be after check-in date");
      return;
    }

    setIsSearching(true);
    setSearchError(null);

    try {
      const formattedCheckInDate = selectedStartDate ? amadeusUtils.formatDate(selectedStartDate) : undefined;
      const formattedCheckOutDate = selectedEndDate ? amadeusUtils.formatDate(selectedEndDate) : undefined;
      
      console.log('Search Parameters:', {
        destination: cityCode,
        checkInDate: formattedCheckInDate,
        checkOutDate: formattedCheckOutDate,
        travelers: searchTravelers
      });

      // Use API_BASE_URL from centralized config
      console.log('Using API URL from config:', API_BASE_URL);
      
      try {
        // First try the regular search endpoint
        const response = await axios.get(`${API_BASE_URL}/hotels/search`, {
          params: {
            destination: cityCode,
            checkInDate: formattedCheckInDate,
            checkOutDate: formattedCheckOutDate,
            travelers: searchTravelers
          }
        });
        
        console.log('API Response:', response.data);
        console.log('API Response structure:', JSON.stringify(response.data, null, 2));

        // Check if API returned empty results
        let emptyResults = false;
        
        // Check all possible data structures
        if (response.data.data?.hotels && Array.isArray(response.data.data.hotels) && response.data.data.hotels.length === 0) {
          emptyResults = true;
        } else if (response.data.data?.data && Array.isArray(response.data.data.data) && response.data.data.data.length === 0) {
          emptyResults = true;
        } else if (response.data.data && Array.isArray(response.data.data) && response.data.data.length === 0) {
          emptyResults = true;
        }
        
        // If empty results, try Direct Amadeus API before falling back to placeholders
        if (emptyResults) {
          console.log('Production API returned empty results, attempting Direct Amadeus API...');
          try {
            const amadeusHotels = await DirectAmadeusService.searchHotels(
              cityCode,
              formattedCheckInDate,
              formattedCheckOutDate,
              searchTravelers
            );
            
            if (amadeusHotels && amadeusHotels.length > 0) {
              console.log('Direct Amadeus API returned', amadeusHotels.length, 'hotels');
              // Create a modified response with real hotel data from Amadeus
              const enhancedResponse = {
                data: {
                  success: true,
                  data: {
                    data: amadeusHotels
                  }
                }
              };
              processSearchResponse(enhancedResponse);
              return;
            } else {
              console.log('Direct Amadeus API also returned no hotels, using placeholder hotels');
            }
          } catch (amadeusError) {
            console.error('Error calling Direct Amadeus API:', amadeusError);
          }
        }

        // Continue with normal response processing (which includes placeholder generation)
        processSearchResponse(response);
      } catch (error) {
        console.error('Search API error, falling back to mock endpoint:', error);
        
        try {
          // If the regular search fails, try the mock search endpoint
          const mockResponse = await axios.get(`${API_BASE_URL}/hotels/mock-search`, {
            params: {
              destination: cityCode,
              checkInDate: formattedCheckInDate,
              checkOutDate: formattedCheckOutDate,
              travelers: searchTravelers
            }
          });
          
          console.log('Mock API Response:', mockResponse.data);
          processSearchResponse(mockResponse);
        } catch (mockError) {
          console.error('Mock search error:', mockError);
          console.error('Error response:', mockError.response);
          setSearchError(mockError.response?.data?.message || "Error searching hotels");
          setIsSearching(false);
        }
      }
    } catch (error) {
      console.error('Unexpected error:', error);
      setSearchError("An unexpected error occurred");
      setIsSearching(false);
    }
  };

  // Process search API response
  const processSearchResponse = (response) => {
    if (response.data.success) {
      // Store search params in session storage for persistence
      sessionStorage.setItem('lastHotelSearch', JSON.stringify({
        cityCode,
        checkInDate: amadeusUtils.formatDate(selectedStartDate),
        checkOutDate: amadeusUtils.formatDate(selectedEndDate),
        adults: searchTravelers,
        timestamp: new Date().toISOString()
      }));

      // Extract hotels data from response - handle different possible response structures
      let hotelsData = [];
      
      // Case 1: response.data.data.hotels exists
      if (response.data.data?.hotels && Array.isArray(response.data.data.hotels)) {
        hotelsData = response.data.data.hotels;
        console.log('Found hotels in response.data.data.hotels:', hotelsData.length);
      } 
      // Case 2: response.data.data exists and is an array
      else if (response.data.data?.data && Array.isArray(response.data.data.data)) {
        hotelsData = response.data.data.data;
        console.log('Found hotels in response.data.data.data:', hotelsData.length);
      }
      // Case 3: response.data.data exists directly
      else if (response.data.data && Array.isArray(response.data.data)) {
        hotelsData = response.data.data;
        console.log('Found hotels in response.data.data:', hotelsData.length);
      } else {
        console.log('No hotels array found in response, creating placeholder hotels');
        // Generate placeholder hotels
        hotelsData = generatePlaceholderHotels(cityCode, 5);
      }
      
      // If we found an array structure but it's empty, generate placeholder hotels
      if (hotelsData.length === 0) {
        console.log('Found empty hotels array, creating placeholder hotels instead');
        hotelsData = generatePlaceholderHotels(cityCode, 5);
      }
      
      // Process hotels to ensure all required fields are present
      hotelsData = hotelsData.map((hotel, index) => {
        // Add unique ID if missing
        if (!hotel.id) {
          hotel.id = `hotel-${cityCode}-${index}-${Date.now()}`;
        }
        
        // Add hotel name if missing
        if (!hotel.name) {
          const cityInfo = popularDestinations.find(dest => dest.code === cityCode) || {
            name: cityCode,
            country: 'Unknown'
          };
          hotel.name = `${cityInfo.name} ${['Grand Hotel', 'Plaza Resort', 'Luxury Suites', 'Executive Inn', 'Palace Hotel'][index % 5]}`;
        }
        
        return hotel;
      });

      if (hotelsData.length > 0) {
        // Format hotels to ensure they have all required fields
        const formattedHotels = hotelsData.map(hotel => {
          // Ensure location field is set
          if (!hotel.location) {
            const cityName = hotel.address?.cityName || searchDestination || cityCode;
            const countryCode = hotel.address?.countryCode || '';
            hotel.location = countryCode ? `${cityName}, ${countryCode}` : cityName;
          }
          
          // Ensure image is an array
          if (!hotel.images && hotel.image) {
            hotel.images = [hotel.image];
          } else if (!hotel.images && !hotel.image) {
            hotel.images = [`https://source.unsplash.com/random/300x200/?hotel,${hotel.id || Math.random()}`];
          }
          
          // Ensure amenities is an array
          if (!hotel.amenities || !Array.isArray(hotel.amenities)) {
            hotel.amenities = ['Free WiFi', 'Air Conditioning', 'Pool'].slice(0, 3);
          }

          return hotel;
        });

        // Navigate to the HotelSearchResults component using the correct route path
      navigate('/hotel-search-results', {
          state: {
            searchResults: formattedHotels,
            searchParams: {
              cityCode,
              checkInDate: amadeusUtils.formatDate(selectedStartDate),
              checkOutDate: amadeusUtils.formatDate(selectedEndDate),
              adults: searchTravelers
            }
          }
        });
      } else {
        setSearchError('No hotels found for your search criteria. Try different dates or destination.');
      }
    } else {
      console.error('API Error:', response.data.message);
      setSearchError(response.data.message || "No hotels found");
    }
    
    setIsSearching(false);
  };

  // Generate placeholder hotels when API returns no results
  const generatePlaceholderHotels = (cityCode, count = 5) => {
    const cityInfo = popularDestinations.find(dest => dest.code === cityCode) || {
      name: cityCode,
      country: 'Unknown'
    };
    
    const hotelNames = [
      `${cityInfo.name} Grand Hotel`,
      `${cityInfo.name} Plaza Resort`,
      `Royal ${cityInfo.name} Hotel`,
      `${cityInfo.name} Luxury Suites`,
      `${cityInfo.name} Executive Inn`,
      `${cityInfo.name} Palace Hotel`,
      `${cityInfo.name} Continental`,
      `${cityInfo.name} International`
    ];
    
    const images = [
      'https://images.unsplash.com/photo-1566073771259-6a8506099945?ixlib=rb-4.0.3&auto=format&fit=crop&w=1470&q=80',
      'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=1470&q=80',
      'https://images.unsplash.com/photo-1590490360182-c33d57733427?auto=format&fit=crop&w=1470&q=80',
      'https://images.unsplash.com/photo-1582719508461-905c673771fd?auto=format&fit=crop&w=1600&q=80',
      'https://images.unsplash.com/photo-1564501049412-61c2a3083791?auto=format&fit=crop&w=1470&q=80'
    ];
    
    const amenities = [
      ['WiFi', 'Room Service', 'Restaurant'],
      ['WiFi', 'Pool', 'Fitness Center'],
      ['WiFi', 'Breakfast', 'Parking'],
      ['WiFi', 'Spa', 'Bar'],
      ['WiFi', 'Airport Shuttle', 'Conference Room']
    ];
    
    return Array.from({length: Math.min(count, hotelNames.length)}, (_, i) => ({
      id: `placeholder-${i}`,
      name: hotelNames[i],
      location: `${cityInfo.name}, ${cityInfo.country}`,
      price: (Math.random() * 300 + 100).toFixed(2),
      currency: 'USD',
      rating: (Math.random() * 1 + 4).toFixed(1),
      image: images[i % images.length],
      amenities: amenities[i % amenities.length],
      isPlaceholder: true
    }));
  };

  // Handle destination selection
  const handleDestinationSelect = (destination) => {
    setSearchDestination(destination.name);
    setCityCode(destination.code);
    setShowDestinationSuggestions(false);
  };

  // Filter destinations as user types
  const handleDestinationInput = (value) => {
    setSearchDestination(value);
    if (!destinationSuggestions || !Array.isArray(destinationSuggestions)) {
      setFilteredSuggestions([]);
      return;
    }
    const filtered = destinationSuggestions.filter(dest => 
      dest && dest.name && dest.name.toLowerCase().includes(value.toLowerCase())
    );
    setFilteredSuggestions(filtered);
    setShowDestinationSuggestions(true);
  };

  // Extract unique destinations from hotels
  useEffect(() => {
    // Populate destination suggestions from hotels data
    const uniqueDestinations = [...new Set(popularDestinations.map(hotel => hotel.location))];
    setDestinationSuggestions(uniqueDestinations);
  }, []);
  
  // Handle clicks outside dropdowns
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showDatePicker && datePickerRef.current && !datePickerRef.current.contains(event.target)) {
        setShowDatePicker(false);
      }
      
      if (showDestinationSuggestions && destinationRef.current && !destinationRef.current.contains(event.target)) {
        setShowDestinationSuggestions(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDatePicker, showDestinationSuggestions]);
  
  // Generate calendar days for the date picker
  const generateCalendarDays = () => {
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
    let days = Array(firstDayOfMonth).fill(null);
    
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }
    
    return days;
  };
  
  // Handle manual date input
  const handleManualDateInput = (value, type) => {
    const date = new Date(value);
    if (isNaN(date.getTime())) return; // Invalid date

    if (type === 'start') {
      setSelectedStartDate(date);
      // If end date exists and is before new start date, clear it
      if (selectedEndDate && selectedEndDate < date) {
        setSelectedEndDate(null);
      }
    } else {
      if (!selectedStartDate) {
        setSearchError('Please select a check-in date first');
        return;
      }
      if (date <= selectedStartDate) {
        setSearchError('Check-out date must be after check-in date');
        return;
      }
      setSelectedEndDate(date);
    }

    updateDateRange(type === 'start' ? date : selectedStartDate, type === 'end' ? date : selectedEndDate);
  };

  // Handle calendar date selection
  const handleDateSelect = (day) => {
    if (!day) return;
    
    const selectedDate = new Date(currentYear, currentMonth, day);
    
    if (!selectedStartDate || (selectedStartDate && selectedEndDate)) {
      setSelectedStartDate(selectedDate);
      setSelectedEndDate(null);
      setHoverDate(null);
      updateDateRange(selectedDate, null);
    } else {
      if (selectedDate < selectedStartDate) {
        setSelectedStartDate(selectedDate);
        setSelectedEndDate(null);
        updateDateRange(selectedDate, null);
      } else {
        setSelectedEndDate(selectedDate);
        updateDateRange(selectedStartDate, selectedDate);
        setShowDatePicker(false);
      }
    }
  };

  // Update the date range display
  const updateDateRange = (startDate, endDate) => {
    if (!startDate) {
      setSearchDates('Select dates');
      return;
    }

    setSearchDates(amadeusUtils.formatDateRange(startDate, endDate));
  };
  
  // Handle date hover for range selection
  const handleDateHover = (day) => {
    if (!day || !selectedStartDate || selectedEndDate) return;
    setHoverDate(new Date(currentYear, currentMonth, day));
  };
  
  // Check if a date is in range
  const isInRange = (day) => {
    if (!day || !selectedStartDate) return false;
    
    const date = new Date(currentYear, currentMonth, day);
    const end = selectedEndDate || hoverDate;
    
    return end && date > selectedStartDate && date < end;
  };
  
  // Filter destination suggestions based on input
  const filterDestinations = (input) => {
    setSearchDestination(input);
    if (input.length > 0) {
      const filtered = destinationSuggestions.filter(dest => 
        dest.toLowerCase().includes(input.toLowerCase())
      );
      setFilteredSuggestions(filtered);
      setShowDestinationSuggestions(filtered.length > 0);
    } else {
      setShowDestinationSuggestions(false);
    }
  };
  
  // Reset date selection
  const resetDateSelection = () => {
    setSelectedStartDate(null);
    setSelectedEndDate(null);
    setHoverDate(null);
    setSearchDates("Select dates");
    setShowDatePicker(false);
  };

  // Handle scroll animations
  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY;
      const sections = document.querySelectorAll('.animate-on-scroll');
      
      sections.forEach((section) => {
        const sectionTop = section.getBoundingClientRect().top;
        const sectionId = section.id;
        
        if (sectionTop < window.innerHeight * 0.75) {
          setIsVisible(prev => ({ ...prev, [sectionId]: true }));
        }
      });
    };
    
    window.addEventListener('scroll', handleScroll);
    handleScroll(); // Check on initial load
    
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Auto-rotate carousel
  useEffect(() => {
    const interval = setInterval(() => {
      nextSlide();
    }, 5000);
    
    return () => clearInterval(interval);
  }, [activeIndex]);

  const nextSlide = () => {
    setActiveIndex((current) => (current === popularDestinations.length - 1 ? 0 : current + 1));
  };

  const prevSlide = () => {
    setActiveIndex((current) => (current === 0 ? popularDestinations.length - 1 : current - 1));
  };
  
  const toggleFavorite = (id, e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsFavorite(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Features list for accommodations
  const features = [
    { icon: <Wifi size={20} />, text: "Free High-Speed WiFi" },
    { icon: <Coffee size={20} />, text: "Complimentary Breakfast" },
    { icon: <Tv size={20} />, text: "Smart TV & Entertainment" },
    { icon: <Shield size={20} />, text: "24/7 Security" },
    { icon: <Clock size={20} />, text: "Flexible Check-in" }
  ];
  
  // Amenities list with icons
  const amenities = [
    { icon: <Wifi size={18} />, text: "Free WiFi" },
    { icon: <Coffee size={18} />, text: "Breakfast" },
    { icon: <Shield size={18} />, text: "Security" }
  ];

  const handleCardClick = (destination) => {
    // Set the search parameters
    setSearchDestination(destination.name);
    setCityCode(destination.code);
    
    // Set default dates (next 2 days)
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayAfterTomorrow = new Date(tomorrow);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);
    
    setSelectedStartDate(tomorrow);
    setSelectedEndDate(dayAfterTomorrow);
    
    // Format dates using the utility function
    setSearchDates(amadeusUtils.formatDateRange(tomorrow, dayAfterTomorrow));
    
    // Trigger the search
    handleSearch();
  };

  // Mobile view detection
  useEffect(() => {
    const handleResize = () => {
      setIsMobileView(window.innerWidth < 768);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Mobile search handlers
  const openMobileSearch = () => {
    setMobileSearchOpen(true);
  };

  const handleMobileSearchClose = () => {
    setMobileSearchOpen(false);
  };

  // Submit mobile search
  const handleMobileSearchSubmit = () => {
    if (!searchDestination || !cityCode) {
      setSearchError("Please select a destination");
      return;
    }

    if (!selectedStartDate || !selectedEndDate) {
      setSearchError("Please select both check-in and check-out dates");
      return;
    }

    handleSearch();
    setMobileSearchOpen(false);
  };

  return (
    <main className="min-h-screen bg-white font-poppins overflow-x-hidden">
      {/* Navbar */}
      <Navbar />
      
      {/* Hero Section */}
      <div className="relative h-[650px] md:h-[750px] overflow-hidden">
        {/* Hero Background with Overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-blue-900/30 to-black/40 z-10"></div>
        <img
          src="https://images.unsplash.com/photo-1742943892619-501567da0c62?q=80&w=2938&auto=format&fit=crop&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
          alt="Luxury Accommodation"
          className="absolute inset-0 w-full h-full object-cover scale-105 animate-slow-zoom"
        />

        {/* Animated Shapes - Hide on mobile */}
        {!isMobileView && (
          <>
            <div className="absolute top-1/4 right-1/5 w-32 h-32 rounded-full bg-blue-500/10 animate-float-slow z-10"></div>
            <div className="absolute bottom-1/3 left-1/4 w-24 h-24 rounded-full bg-teal-500/10 animate-float-medium z-10"></div>
          </>
        )}

        {/* Mobile-optimized Special Offer Banner */}
        <div className={`w-full text-center bg-gradient-to-r from-blue-900/90 via-blue-800/90 to-blue-900/90 py-3 backdrop-blur-sm z-20 border-y border-blue-500/30 ${isMobileView ? 'px-3' : ''}`} style={{ marginTop: '71px' }}>
          <div className="container mx-auto px-2 flex justify-center items-center">
            <Sparkles className="h-5 w-5 text-yellow-300 mr-2 flex-shrink-0" />
            <p className={`text-white ${isMobileView ? 'text-sm' : 'text-base'} font-medium tracking-wide`}>
              <span className="font-bold">Self-Service Portal will be available very soon...</span> Meanwhile please Call <span className="text-yellow-300 font-bold">((877) 538-7380)</span> or Email <a href="mailto:support@jetsetterss.com" className="underline text-yellow-300 font-bold">support@jetsetterss.com</a>
            </p>
          </div>
        </div>

        {/* Mobile Search Button - Fixed at Bottom */}
        {isMobileView && (
          <div className="fixed bottom-0 left-0 right-0 p-4 bg-white shadow-lg z-50 border-t border-gray-100">
            <button
              onClick={openMobileSearch}
              className="w-full bg-gradient-to-r from-blue-500 to-blue-700 text-white py-4 rounded-xl flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-transform"
            >
              <Search size={20} />
              <span>Search Hotels</span>
            </button>
          </div>
        )}

        {/* Mobile Hero Content */}
        {isMobileView && (
          <div className="absolute top-1/4 left-0 w-full px-6 z-20">
            <div className="max-w-7xl mx-auto">
              <div className="animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
                <h1 className="text-3xl font-bold text-white mb-2 tracking-tight leading-tight">Experience Luxury <span className="text-yellow-300">&</span></h1>
                <h1 className="text-3xl font-bold text-white mb-3 tracking-tight leading-tight">Exceptional Comfort</h1>
                <p className="text-base text-white mb-6 tracking-wide max-w-xs">Your perfect getaway with premium amenities and service</p>
                
                {/* Mobile Quick Stats */}
                <div className="flex overflow-x-auto pb-4 gap-3 snap-x snap-mandatory hide-scrollbar mt-4">
                  <div className="bg-white/10 backdrop-blur-md rounded-xl p-3 flex-shrink-0 w-36 snap-start flex flex-col items-center">
                    <div className="bg-blue-500/20 rounded-full p-2 mb-2">
                      <Award className="h-5 w-5 text-white" />
                    </div>
                    <p className="text-sm text-white font-medium">500+ Properties</p>
                  </div>
                  <div className="bg-white/10 backdrop-blur-md rounded-xl p-3 flex-shrink-0 w-36 snap-start flex flex-col items-center">
                    <div className="bg-blue-500/20 rounded-full p-2 mb-2">
                      <Star className="h-5 w-5 text-white" />
                    </div>
                    <p className="text-sm text-white font-medium">4.9/5 Rating</p>
                  </div>
                  <div className="bg-white/10 backdrop-blur-md rounded-xl p-3 flex-shrink-0 w-36 snap-start flex flex-col items-center">
                    <div className="bg-blue-500/20 rounded-full p-2 mb-2">
                      <Users className="h-5 w-5 text-white" />
                    </div>
                    <p className="text-sm text-white font-medium">10,000+ Guests</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Regular Hero Content - Only show on desktop */}
        {!isMobileView && (
          <div className="absolute top-1/4 left-0 w-full px-8 md:px-12 z-20">
            <div className="max-w-7xl mx-auto">
              <div className="animate-fade-in-up" style={{ animationDelay: '0.2s' }}>
                <h1 className="text-5xl md:text-6xl font-bold text-white mb-2 tracking-tight leading-tight">Experience Luxury <span className="text-yellow-300">&</span></h1>
                <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 tracking-tight leading-tight">Exceptional Comfort</h1>
                <p className="text-xl text-white mb-8 tracking-wide max-w-2xl">— Your Perfect Getaway Awaits with Premium Amenities and World-Class Service</p>
              </div>

              {/* Search Form */}
              <div className="bg-white/95 backdrop-blur-md rounded-3xl shadow-2xl p-4 md:p-6 max-w-6xl mx-auto animate-fade-in-up overflow-visible" style={{ animationDelay: '0.4s' }}>
                <div className="relative">
                  {/* Mobile Search Toggle */}
                  <div className="block md:hidden mb-4">
                    <button 
                      onClick={() => setShowMobileSearch(prev => !prev)} 
                      className="w-full bg-blue-50 text-blue-600 px-4 py-3 rounded-xl flex items-center justify-between"
                    >
                      <span className="font-medium">Search Properties</span>
                      <ChevronDown className={`transform transition-transform ${showMobileSearch ? 'rotate-180' : ''}`} />
                    </button>
                  </div>

                  <div className={`${showMobileSearch ? 'block' : 'hidden'} md:block`}>
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 md:gap-4 items-start relative z-10">
                      {/* Destination */}
                      <div className="flex flex-col space-y-2 p-3 md:p-4 bg-white rounded-xl shadow-sm border border-gray-100 hover:border-blue-200 transition-colors">
                        <label className="text-sm text-gray-700 font-medium flex items-center gap-2">
                          <MapPin className="h-4 w-4 text-blue-500" />
                          Destination
                        </label>
                        <div className="relative group" ref={destinationRef}>
                          <input
                            type="text"
                            value={searchDestination}
                            onChange={(e) => handleDestinationInput(e.target.value)}
                            onFocus={() => {
                              if (searchDestination.length > 0) {
                                setShowDestinationSuggestions(true);
                              }
                            }}
                            placeholder="Where do you want to go?"
                            className="w-full py-2.5 pl-8 pr-10 bg-gray-50/80 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-300"
                          />
                          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                            <Globe className="h-4 w-4 text-blue-500" />
                          </div>
                          
                          {/* Enhanced Mobile-Friendly Destination Suggestions Dropdown */}
                          {showDestinationSuggestions && (
                            <div className="absolute left-0 right-0 top-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-[60vh] md:max-h-60 overflow-y-auto">
                              <div className="sticky top-0 bg-white p-2 border-b border-gray-100">
                                <div className="flex items-center gap-2 text-sm text-gray-500">
                                  <Search className="h-4 w-4" />
                                  <span>Search results</span>
                                </div>
                              </div>
                              <ul className="py-1">
                                {filteredSuggestions.map((destination, index) => (
                                  <li 
                                    key={index}
                                    className="px-4 py-3 hover:bg-blue-50 cursor-pointer flex items-center gap-3 transition-colors"
                                    onClick={() => handleDestinationSelect(destination)}
                                  >
                                    <div className="p-2 rounded-full bg-blue-50">
                                      <MapPin className="h-4 w-4 text-blue-500" />
                                    </div>
                                    <div>
                                      <span className="block font-medium text-gray-900">{destination.name}</span>
                                      <span className="text-sm text-gray-500">{destination.country}</span>
                                    </div>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Package Type - Enhanced Mobile Version */}
                      <div className="flex flex-col space-y-2 p-3 md:p-4 bg-white rounded-xl shadow-sm border border-gray-100 hover:border-blue-200 transition-colors">
                        <label className="text-sm text-gray-700 font-medium flex items-center gap-2">
                          <svg className="h-4 w-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 10h16M4 14h16M4 18h16"></path>
                          </svg>
                          Package Type
                        </label>
                        <div className="relative group">
                          <select 
                            value={searchPackageType}
                            onChange={(e) => setSearchPackageType(e.target.value)}
                            className="w-full py-2.5 pl-4 pr-10 bg-gray-50/80 rounded-lg appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-300"
                          >
                            <option>All Inclusive</option>
                            <option>Premium</option>
                            <option>Standard</option>
                            <option>Budget</option>
                          </select>
                          <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                            <ChevronDown className="w-4 h-4 text-blue-500" />
                          </div>
                        </div>
                      </div>

                      {/* Enhanced Date Picker */}
                      <div className="flex flex-col space-y-2 p-3 md:p-4 bg-white rounded-xl shadow-sm border border-gray-100 hover:border-blue-200 transition-colors">
                        <label className="text-sm text-gray-700 font-medium flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-blue-500" />
                          Travel Dates
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="relative">
                            <input
                              type="date"
                              value={selectedStartDate ? selectedStartDate.toISOString().split('T')[0] : ''}
                              min={new Date().toISOString().split('T')[0]}
                              onChange={(e) => handleManualDateInput(e.target.value, 'start')}
                              className="w-full px-3 py-2.5 bg-gray-50/80 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 border-0"
                            />
                          </div>
                          <div className="relative">
                            <input
                              type="date"
                              value={selectedEndDate ? selectedEndDate.toISOString().split('T')[0] : ''}
                              min={selectedStartDate ? new Date(selectedStartDate.getTime() + 86400000).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]}
                              onChange={(e) => handleManualDateInput(e.target.value, 'end')}
                              className="w-full px-3 py-2.5 bg-gray-50/80 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 border-0"
                              disabled={!selectedStartDate}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Enhanced Travelers Selector */}
                      <div className="flex flex-col space-y-2 p-3 md:p-4 bg-white rounded-xl shadow-sm border border-gray-100 hover:border-blue-200 transition-colors">
                        <label className="text-sm text-gray-700 font-medium flex items-center gap-2">
                          <Users className="h-4 w-4 text-blue-500" />
                          Travelers
                        </label>
                        <div className="relative group">
                          <div className="flex items-center justify-between bg-gray-50/80 rounded-lg py-2.5 px-4">
                            <span className="text-gray-700">{searchTravelers} Travelers</span>
                            <div className="flex items-center gap-2">
                              <button 
                                onClick={() => setSearchTravelers(prev => Math.max(1, prev - 1))}
                                className="p-1 rounded-full hover:bg-gray-200 transition-colors"
                              >
                                <Minus className="h-4 w-4 text-blue-500" />
                              </button>
                              <span className="w-8 text-center">{searchTravelers}</span>
                              <button 
                                onClick={() => setSearchTravelers(prev => Math.min(10, prev + 1))}
                                className="p-1 rounded-full hover:bg-gray-200 transition-colors"
                              >
                                <Plus className="h-4 w-4 text-blue-500" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Enhanced Search Button */}
                    <div className="flex justify-center mt-4 md:mt-6">
                      <button 
                        onClick={handleSearch}
                        className="w-full md:w-auto bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white py-4 px-12 rounded-xl transition-all duration-300 font-medium flex items-center justify-center gap-3 shadow-lg hover:shadow-blue-500/30 relative overflow-hidden group"
                        disabled={isSearching}
                      >
                        <div className="absolute inset-0 bg-gradient-to-r from-blue-400 to-blue-500 transform translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
                        <div className="relative flex items-center gap-2">
                          {isSearching ? (
                            <>
                              <Loader className="animate-spin h-5 w-5" />
                              <span>Searching...</span>
                            </>
                          ) : (
                            <>
                              <Search size={20} />
                              <span>Search Hotels</span>
                            </>
                          )}
                        </div>
                      </button>
                    </div>
                    
                    {searchError && (
                      <div className="mt-4 text-center">
                        <div className="inline-flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-lg text-sm">
                          <X className="h-4 w-4" />
                          {searchError}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Mobile Search Modal */}
        {isMobileView && mobileSearchOpen && (
          <div className="fixed inset-0 bg-black/60 z-50 flex items-end">
            <div className="bg-white w-full rounded-t-3xl p-6 animate-slide-up max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-semibold">Search Hotels</h3>
                <button 
                  onClick={handleMobileSearchClose}
                  className="p-2 hover:bg-gray-100 rounded-full"
                >
                  <X size={24} />
                </button>
              </div>
              
              {/* Visual indicator for drag to close */}
              <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto mb-6 -mt-2"></div>

              {/* Mobile Search Form */}
              <div className="space-y-5">
                {/* Destination */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                  <label className="block px-4 pt-3 text-sm font-medium text-gray-700">
                    Destination
                  </label>
                  <div className="relative px-4 pb-3">
                    <input
                      type="text"
                      value={searchDestination}
                      onChange={(e) => handleDestinationInput(e.target.value)}
                      onFocus={() => setShowDestinationSuggestions(true)}
                      placeholder="Where do you want to go?"
                      className="w-full py-2.5 pl-8 pr-4 bg-gray-50 rounded-lg text-base border-0 focus:ring-2 focus:ring-blue-500"
                    />
                    <MapPin className="absolute left-6 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500" />
                    
                    {/* Mobile destination suggestions */}
                    {showDestinationSuggestions && filteredSuggestions.length > 0 && (
                      <div className="absolute left-0 right-0 top-full mt-2 bg-white rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto border border-gray-200">
                        <div className="sticky top-0 bg-gray-50 py-2 px-4 border-b border-gray-200">
                          <p className="text-sm text-gray-500">Suggested destinations</p>
                        </div>
                        <ul>
                          {filteredSuggestions.map((destination, index) => (
                            <li 
                              key={index}
                              className="px-4 py-3 hover:bg-blue-50 active:bg-blue-100 cursor-pointer border-b border-gray-100 last:border-0"
                              onClick={() => handleDestinationSelect(destination)}
                            >
                              <div className="flex items-center">
                                <MapPin className="h-4 w-4 text-blue-500 mr-2 flex-shrink-0" />
                                <div>
                                  <p className="font-medium text-gray-900">{destination.name}</p>
                                  <p className="text-xs text-gray-500">{destination.country || 'Popular destination'}</p>
                                </div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>

                {/* Dates */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                  <label className="block px-4 pt-3 text-sm font-medium text-gray-700">
                    Check-in & Check-out
                  </label>
                  <div className="grid grid-cols-2 gap-3 p-4">
                    <div className="relative">
                      <label className="text-xs text-gray-500 mb-1 block">Check-in</label>
                      <input
                        type="date"
                        value={selectedStartDate ? selectedStartDate.toISOString().split('T')[0] : ''}
                        min={new Date().toISOString().split('T')[0]}
                        onChange={(e) => handleManualDateInput(e.target.value, 'start')}
                        className="w-full p-2.5 bg-gray-50 rounded-lg border-0 focus:ring-2 focus:ring-blue-500"
                      />
                      <Calendar className="absolute right-2 top-[30px] h-4 w-4 text-gray-400 pointer-events-none" />
                    </div>
                    <div className="relative">
                      <label className="text-xs text-gray-500 mb-1 block">Check-out</label>
                      <input
                        type="date"
                        value={selectedEndDate ? selectedEndDate.toISOString().split('T')[0] : ''}
                        min={selectedStartDate ? new Date(selectedStartDate.getTime() + 86400000).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]}
                        onChange={(e) => handleManualDateInput(e.target.value, 'end')}
                        className={`w-full p-2.5 bg-gray-50 rounded-lg border-0 focus:ring-2 focus:ring-blue-500 ${!selectedStartDate ? 'opacity-50' : ''}`}
                        disabled={!selectedStartDate}
                      />
                      <Calendar className="absolute right-2 top-[30px] h-4 w-4 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                </div>

                {/* Travelers */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                  <label className="block px-4 pt-3 text-sm font-medium text-gray-700">
                    Travelers
                  </label>
                  <div className="p-4">
                    <div className="flex items-center justify-between bg-gray-50 rounded-lg p-3">
                      <div>
                        <p className="text-gray-700">Number of travelers</p>
                        <p className="text-xs text-gray-500">Ages 13 or above</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <button 
                          onClick={() => setSearchTravelers(prev => Math.max(1, prev - 1))}
                          className="w-9 h-9 flex items-center justify-center bg-white rounded-full shadow border border-gray-200 active:bg-gray-100"
                          aria-label="Decrease travelers"
                        >
                          <Minus size={16} className="text-blue-600" />
                        </button>
                        <span className="w-8 text-center font-medium text-lg">{searchTravelers}</span>
                        <button 
                          onClick={() => setSearchTravelers(prev => Math.min(10, prev + 1))}
                          className="w-9 h-9 flex items-center justify-center bg-white rounded-full shadow border border-gray-200 active:bg-gray-100"
                          aria-label="Increase travelers"
                        >
                          <Plus size={16} className="text-blue-600" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Package Type */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                  <label className="block px-4 pt-3 text-sm font-medium text-gray-700">
                    Package Type
                  </label>
                  <div className="p-4">
                    <div className="relative">
                      <select 
                        value={searchPackageType}
                        onChange={(e) => setSearchPackageType(e.target.value)}
                        className="w-full p-3 bg-gray-50 rounded-lg border-0 appearance-none focus:ring-2 focus:ring-blue-500 pr-10"
                      >
                        <option>All Inclusive</option>
                        <option>Premium</option>
                        <option>Standard</option>
                        <option>Budget</option>
                      </select>
                      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                </div>

                {/* Search Button */}
                <button
                  onClick={handleMobileSearchSubmit}
                  className="w-full bg-gradient-to-r from-blue-500 to-blue-700 text-white py-4 rounded-xl flex items-center justify-center gap-2 mt-4 shadow-lg transition-transform active:scale-[0.98]"
                  disabled={isSearching}
                >
                  {isSearching ? (
                    <>
                      <Loader className="animate-spin h-5 w-5" />
                      <span>Searching...</span>
                    </>
                  ) : (
                    <>
                      <Search size={20} />
                      <span>Search Hotels</span>
                    </>
                  )}
                </button>

                {/* Error message */}
                {searchError && (
                  <div className="mt-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm flex items-center gap-2">
                    <X className="h-5 w-5 flex-shrink-0" />
                    <span>{searchError}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Trust Badges - Optimized for mobile */}
        <div className={`absolute bottom-8 left-0 w-full z-20 animate-fade-in-up ${isMobileView ? 'pb-16' : ''}`} style={{ animationDelay: '0.6s' }}>
          <div className="container mx-auto px-4">
            <div className={`flex flex-wrap justify-center gap-3 ${isMobileView ? 'gap-2' : 'gap-4 md:gap-8'}`}>
              <div className="bg-white/90 backdrop-blur-sm px-4 py-2 rounded-lg flex items-center gap-2 shadow-lg">
                <Shield className={`${isMobileView ? 'h-4 w-4' : 'h-5 w-5'} text-blue-600`} />
                <span className={`${isMobileView ? 'text-xs' : 'text-sm'} font-medium text-gray-800`}>Secure Booking</span>
              </div>
              {!isMobileView && (
                <div className="bg-white/90 backdrop-blur-sm px-4 py-2 rounded-lg flex items-center gap-2 shadow-lg">
                  <Check className="h-5 w-5 text-blue-600" />
                  <span className="text-sm font-medium text-gray-800">Best Price Guarantee</span>
                </div>
              )}
              <div className="bg-white/90 backdrop-blur-sm px-4 py-2 rounded-lg flex items-center gap-2 shadow-lg">
                <Clock className={`${isMobileView ? 'h-4 w-4' : 'h-5 w-5'} text-blue-600`} />
                <span className={`${isMobileView ? 'text-xs' : 'text-sm'} font-medium text-gray-800`}>24/7 Support</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile CSS utilities */}
      <style>{`
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        @keyframes slide-up {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out forwards;
        }
      `}</style>
      
      {/* Most Popular Section - Enhanced with Interactive Carousel */}
      <div className="py-20 bg-gradient-to-b from-[#f0f7fa] to-white" id="popular-section">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12 animate-on-scroll" id="popular-heading">
            <span className="inline-block px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold tracking-wider mb-3">TOP-RATED ACCOMMODATIONS</span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Most Popular Stays</h2>
            <div className="w-24 h-1 bg-gradient-to-r from-blue-500 to-teal-400 mx-auto"></div>
            <p className="text-gray-600 mt-4 max-w-2xl mx-auto">Discover our most booked accommodations with exceptional amenities and stunning views</p>
          </div>

          <div className="relative max-w-6xl mx-auto animate-on-scroll" id="carousel" ref={carouselRef}>
            <button 
              onClick={prevSlide}
              className="absolute left-0 top-1/2 -translate-y-1/2 z-10 bg-white p-3 rounded-full shadow-lg hover:bg-blue-50 transition-colors -ml-5 md:-ml-6 focus:outline-none focus:ring-2 focus:ring-blue-400"
              aria-label="Previous slide"
            >
              <ChevronLeft className="text-blue-600" size={24} />
            </button>
            
            <div className="overflow-hidden rounded-2xl shadow-xl">
              <div 
                className="flex transition-transform duration-700 ease-out"
                style={{ transform: `translateX(-${activeIndex * 100}%)` }}
              >
                {popularDestinations.map((destination, index) => (
                  <div key={destination.id} className="min-w-full">
                    <div className="grid grid-cols-1 md:grid-cols-2 bg-white overflow-hidden">
                      <div className="relative h-80 md:h-auto overflow-hidden">
                        <img
                          src={destination.image || "/placeholder.svg"}
                          alt={destination.name}
                          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 hover:scale-110"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent"></div>
                        
                        {/* Rating Badge */}
                        <div className="absolute top-4 left-4 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full flex items-center shadow-md">
                          <Star className="h-4 w-4 fill-yellow-400 text-yellow-400 mr-1" />
                          <span className="text-sm font-semibold">5.0</span>
                          <span className="text-xs text-gray-500 ml-1">(128 reviews)</span>
                        </div>
                        
                        {/* Favorite Button */}
                        <button 
                          className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm p-2 rounded-full text-gray-600 hover:text-red-500 transition-colors shadow-md focus:outline-none"
                          onClick={(e) => toggleFavorite(destination.id, e)}
                          aria-label="Add to favorites"
                        >
                          <Heart size={20} className={isFavorite[destination.id] ? "text-red-500 fill-red-500" : ""} />
                        </button>
                        
                        {/* Price Badge */}
                        <div className="absolute bottom-4 left-4 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow-lg">
                          ${destination.price} <span className="text-xs font-normal">per night</span>
                        </div>
                      </div>
                      
                      <div className="p-8 flex flex-col justify-between">
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="text-2xl font-bold text-gray-800">{destination.name}</h3>
                          </div>
                          
                          <div className="flex items-center gap-2 mb-4 text-gray-600">
                            <MapPin size={18} className="text-blue-500" />
                            <span className="text-sm">{destination.location}</span>
                          </div>
                          
                          <p className="text-gray-600 mb-6 leading-relaxed">
                            Experience luxury in the heart of nature with stunning views and premium amenities. Perfect for both relaxation and adventure seekers.
                          </p>
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                            {features.slice(0, 4).map((feature, idx) => (
                              <div key={idx} className="flex items-center text-gray-700">
                                <div className="mr-2 text-blue-500">{feature.icon}</div>
                                <span className="text-sm">{feature.text}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                        
                        <div className="mt-auto">
                          <div className="flex flex-wrap items-center justify-between gap-4">
                            <Link
                              to={`/hotel-details?id=${destination.id}`}
                              className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-6 py-3 rounded-lg transition-all duration-300 font-medium inline-flex items-center gap-2 shadow-md hover:shadow-blue-500/30 group"
                            >
                              View Details
                              <ArrowRight size={16} className="transform transition-transform group-hover:translate-x-1" />
                            </Link>
                            
                            <div className="flex items-center gap-1">
                              <span className="text-sm text-gray-500">Available:</span>
                              <span className="text-sm font-semibold text-green-600">Today</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <button 
              onClick={nextSlide}
              className="absolute right-0 top-1/2 -translate-y-1/2 z-10 bg-white p-3 rounded-full shadow-lg hover:bg-blue-50 transition-colors -mr-5 md:-mr-6 focus:outline-none focus:ring-2 focus:ring-blue-400"
              aria-label="Next slide"
            >
              <ChevronRight className="text-blue-600" size={24} />
            </button>
            
            <div className="flex justify-center gap-2 mt-8">
              {popularDestinations.slice(0, 5).map((_, idx) => (
                <button 
                  key={idx} 
                  onClick={() => setActiveIndex(idx)}
                  className={`w-3 h-3 rounded-full transition-all duration-300 focus:outline-none ${idx === activeIndex ? 'bg-blue-600 scale-125' : 'bg-gray-300 hover:bg-gray-400'}`}
                  aria-label={`Go to slide ${idx + 1}`}
                />
              ))}
            </div>
          </div>
          
          {/* Quick Stats */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto mt-16 animate-on-scroll" id="stats">
            <div className="bg-white rounded-xl shadow-md p-6 text-center transform transition-transform hover:-translate-y-1 hover:shadow-lg">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Award className="h-8 w-8 text-blue-600" />
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-1">500+</h3>
              <p className="text-gray-600">Premium Properties</p>
            </div>
            
            <div className="bg-white rounded-xl shadow-md p-6 text-center transform transition-transform hover:-translate-y-1 hover:shadow-lg">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="h-8 w-8 text-blue-600" />
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-1">100+</h3>
              <p className="text-gray-600">Happy Guests</p>
            </div>
            
            <div className="bg-white rounded-xl shadow-md p-6 text-center transform transition-transform hover:-translate-y-1 hover:shadow-lg">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Star className="h-8 w-8 text-blue-600" />
              </div>
              <h3 className="text-2xl font-bold text-gray-800 mb-1">4.9/5</h3>
              <p className="text-gray-600">Average Rating</p>
            </div>
          </div>
        </div>
      </div>

      {/* Popular Destinations */}
      <div className="py-20 bg-white" id="destinations-section">
        <div className="container mx-auto px-4">
          <div className="text-center mb-12 animate-on-scroll" id="destinations-heading">
            <span className="inline-block px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold tracking-wider mb-3">DREAM DESTINATIONS</span>
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">Explore Stays in Popular Destinations</h2>
            <div className="w-24 h-1 bg-gradient-to-r from-blue-500 to-teal-400 mx-auto"></div>
            <p className="text-gray-600 mt-4 max-w-2xl mx-auto">Discover beautiful locations with premium accommodations for your perfect getaway</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto animate-on-scroll" id="destinations-grid">
            {popularDestinations.slice(0, 8).map((destination) => (
              <div 
                key={destination.id} 
                className="group cursor-pointer"
                onClick={() => handleCardClick(destination)}
                onMouseEnter={() => setIsHovered(destination.id)}
                onMouseLeave={() => setIsHovered(null)}
              >
                <div className="relative rounded-xl overflow-hidden shadow-lg h-72 group transform transition-transform hover:-translate-y-2 hover:shadow-xl">
                  {destination.popular && (
                    <div className="absolute top-3 left-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white px-3 py-1 rounded-full text-xs z-10 font-medium shadow-lg">
                      Popular Choice
                    </div>
                  )}
                  <img
                    src={destination.image || "/placeholder.svg"}
                    alt={destination.name}
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent"></div>
                  
                  <div className="absolute bottom-0 left-0 p-6 text-white w-full">
                    <h3 className="text-xl font-bold mb-1 group-hover:text-blue-300 transition-colors">{destination.name}</h3>
                    <div className="flex items-center mb-3">
                      <MapPin size={16} className="mr-1 text-blue-300" />
                      <p className="text-sm text-gray-200">{destination.location}</p>
                    </div>
                    
                    <div className="flex items-center mb-3">
                      <div className="bg-white/20 backdrop-blur-sm px-3 py-1 rounded-full flex items-center">
                        <Star className="h-3 w-3 mr-1 text-yellow-400" />
                        <span className="text-xs">{destination.hotelCount} properties available</span>
                      </div>
                    </div>
                    
                    <div className="transform transition-all duration-300 translate-y-8 opacity-0 group-hover:translate-y-0 group-hover:opacity-100">
                      <button className="bg-white/20 backdrop-blur-sm hover:bg-white/30 text-white px-4 py-2 rounded-md text-sm font-medium flex items-center gap-1 w-full justify-center">
                        Explore Properties <ArrowRight size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          
          {/* Featured Destination Highlight */}
          <div className="mt-16 max-w-6xl mx-auto animate-on-scroll" id="featured-destination">
            <div className="bg-gradient-to-r from-blue-50 to-blue-100 rounded-2xl shadow-lg overflow-hidden">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
                <div className="p-8 md:p-12 flex flex-col justify-center">
                  <span className="inline-block px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold tracking-wider mb-3">FEATURED DESTINATION</span>
                  <h3 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">Discover Jammu & Kashmir</h3>
                  <p className="text-gray-600 mb-6 leading-relaxed">
                    Experience the breathtaking beauty of Jammu & Kashmir with its stunning landscapes, serene lakes, and majestic mountains. Our handpicked accommodations offer the perfect blend of luxury and authentic local experiences.
                  </p>
                  <ul className="mb-8 space-y-2">
                    <li className="flex items-center text-gray-700">
                      <Check size={18} className="text-green-500 mr-2" />
                      <span>Luxury accommodations with mountain views</span>
                    </li>
                    <li className="flex items-center text-gray-700">
                      <Check size={18} className="text-green-500 mr-2" />
                      <span>Guided tours to scenic locations</span>
                    </li>
                    <li className="flex items-center text-gray-700">
                      <Check size={18} className="text-green-500 mr-2" />
                      <span>Authentic local cuisine experiences</span>
                    </li>
                  </ul>
                  <div>
                    <Link 
                      to="/destinations/kashmir" 
                      className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white px-6 py-3 rounded-lg transition-all duration-300 font-medium inline-flex items-center gap-2 shadow-md hover:shadow-blue-500/30 group"
                    >
                      Explore Kashmir
                      <ArrowRight size={16} className="transform transition-transform group-hover:translate-x-1" />
                    </Link>
                  </div>
                </div>
                <div className="relative h-64 md:h-auto">
                  <img 
                    src="https://images.unsplash.com/photo-1566837497312-7be7830ae9b1?q=80&w=2070&auto=format&fit=crop" 
                    alt="Jammu & Kashmir" 
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-l from-transparent to-blue-900/20"></div>
                  
                  {/* Price Badge */}
                  <div className="absolute bottom-6 right-6 bg-white/90 backdrop-blur-sm px-4 py-2 rounded-lg shadow-lg">
                    <p className="text-sm font-semibold text-gray-900">Starting from</p>
                    <p className="text-2xl font-bold text-blue-600">$199<span className="text-sm font-normal text-gray-600">/night</span></p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Newsletter Signup */}
      <div className="py-12 bg-[#f0f7fa]">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="bg-white rounded-xl shadow-md p-8 text-center">
            <div className="flex justify-center mb-4">
              <Mail className="h-10 w-10 text-[#0061ff]" />
            </div>
            <h3 className="text-2xl font-bold text-gray-800 mb-2">Subscribe to Our Newsletter</h3>
            <p className="text-gray-600 mb-6 max-w-lg mx-auto">
              Be the first to know about special offers, new properties, and travel tips. Get exclusive deals directly to your inbox!
            </p>
            <div className="flex flex-col sm:flex-row gap-2 max-w-lg mx-auto">
              <input
                type="email"
                placeholder="Your email address"
                className="flex-1 px-4 py-3 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button className="bg-[#0061ff] text-white px-6 py-3 rounded-md font-medium hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 group">
                Subscribe
                <ArrowRight size={16} className="transform transition-transform group-hover:translate-x-1" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Trust Badges */}
      <div className="py-12 bg-white border-t border-gray-100">
        <div className="container mx-auto px-4">
          <div className="text-center mb-8">
            <h3 className="text-lg font-bold text-gray-800">Trusted By Travelers Worldwide</h3>
          </div>
          
          <div className="flex justify-center gap-8 mt-8 max-w-xl mx-auto">
            <div className="flex items-center">
              <Check className="text-green-500 mr-2" />
              <span className="text-sm text-gray-600">Secure Booking</span>
            </div>
            <div className="flex items-center">
              <Check className="text-green-500 mr-2" />
              <span className="text-sm text-gray-600">24/7 Support</span>
            </div>
            <div className="flex items-center">
              <Check className="text-green-500 mr-2" />
              <span className="text-sm text-gray-600">Best Price Guarantee</span>
            </div>
          </div>
        </div>
      </div>
      <Footer />
    </main>
  )
}
