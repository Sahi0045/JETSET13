import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, MapPin, Calendar, Users, Star, ArrowRight, Sparkles, Shield, Clock, Award, Loader2, CheckCircle } from 'lucide-react';
import DatePicker from 'react-datepicker';
import "react-datepicker/dist/react-datepicker.css";
import Navbar from '../Navbar';
import Footer from '../Footer';
import withPageElements from '../PageWrapper';
import hotelService from '../../../Services/HotelService';
import supabase from '../../../lib/supabase';
import { formatDateToISO } from '../../../utils/dateUtils';
import { useLocationContext } from '../../../Context/LocationContext';

const HotelsLanding = () => {
    const navigate = useNavigate();
    const { city, loaded } = useLocationContext();
    const destinationInputRef = useRef(null);
    const [destination, setDestination] = useState('');
    const [dateRange, setDateRange] = useState([null, null]);
    const [startDate, endDate] = dateRange;
    const [guests, setGuests] = useState({ rooms: 1, adults: 2, children: 0 });
    const [showGuestDropdown, setShowGuestDropdown] = useState(false);
    const [showDestinationSuggestions, setShowDestinationSuggestions] = useState(false);

    // Newsletter subscription state
    const [subscriptionEmail, setSubscriptionEmail] = useState('');
    const [subscriptionSubmitted, setSubscriptionSubmitted] = useState(false);
    const [subscriptionError, setSubscriptionError] = useState('');
    const [subscriptionLoading, setSubscriptionLoading] = useState(false);

    // API-based suggestions
    const [suggestions, setSuggestions] = useState([]);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);
    const debounceTimer = useRef(null);

    // Debounced search for locations
    const searchLocations = useCallback(async (keyword) => {
        if (!keyword || keyword.length < 2) {
            setSuggestions([]);
            setLoadingSuggestions(false);
            return;
        }

        setLoadingSuggestions(true);
        try {
            const results = await hotelService.searchLocations(keyword);
            if (results && results.length > 0) {
                setSuggestions(results);
            } else {
                setSuggestions([]);
            }
        } catch (error) {
            console.error('Error searching locations:', error);
            setSuggestions([]);
        } finally {
            setLoadingSuggestions(false);
        }
    }, []);

    // Handle destination input change with debounce
    const handleDestinationChange = (value) => {
        setDestination(value);

        // Clear existing timer
        if (debounceTimer.current) {
            clearTimeout(debounceTimer.current);
        }

        // Set new timer for debounced search
        debounceTimer.current = setTimeout(() => {
            searchLocations(value);
        }, 300);
    };

    // Handle destination selection
    const handleSelectDestination = (dest) => {
        setDestination(dest.name);
        setShowDestinationSuggestions(false);
    };

    // Close suggestions when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (destinationInputRef.current && !destinationInputRef.current.contains(e.target)) {
                setShowDestinationSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Cleanup debounce timer
    useEffect(() => {
        return () => {
            if (debounceTimer.current) {
                clearTimeout(debounceTimer.current);
            }
        };
    }, []);

    // Auto-fill destination from user's location
    useEffect(() => {
        if (loaded && city && !destination) {
            setDestination(city);
        }
    }, [loaded, city]);

    // Featured hotels state
    const [featuredHotelsList, setFeaturedHotelsList] = useState([]);
    const [loadingFeatured, setLoadingFeatured] = useState(true);

    // Fetch featured hotels based on location
    useEffect(() => {
        const fetchFeatured = async () => {
            setLoadingFeatured(true);
            try {
                // Use city from context or default to null (which falls back to global featured)
                const locationToUse = loaded ? city : null;
                const hotels = await hotelService.getFeaturedByLocation(locationToUse);
                setFeaturedHotelsList(hotels);
            } catch (error) {
                console.error('Error fetching featured hotels:', error);
                // Fallback to static list if service fails
                setFeaturedHotelsList([]);
            } finally {
                setLoadingFeatured(false);
            }
        };

        fetchFeatured();
    }, [city, loaded]);

    // Handler to navigate to hotel details
    const handleHotelClick = (hotelId) => {
        navigate(`/hotels/details?id=${hotelId}`);
    };

    const handleSearch = (e) => {
        e.preventDefault();

        // Build search parameters
        const params = new URLSearchParams();
        if (destination) params.set('destination', destination);
        if (startDate) params.set('checkIn', formatDateToISO(startDate));
        if (endDate) params.set('checkOut', formatDateToISO(endDate));
        params.set('rooms', guests.rooms);
        params.set('adults', guests.adults);
        params.set('children', guests.children);

        // Navigate to search results
        navigate(`/hotels/search?${params.toString()}`);
    };

    // Handle newsletter subscription
    const handleSubscription = async (e) => {
        e.preventDefault();
        setSubscriptionError('');
        setSubscriptionLoading(true);

        try {
            const { data, error } = await supabase
                .from('subscriptions')
                .insert([
                    { email: subscriptionEmail, status: 'active' }
                ]);

            if (error) {
                if (error.code === '23505') { // Unique violation
                    setSubscriptionError('This email is already subscribed.');
                } else {
                    setSubscriptionError('An error occurred. Please try again.');
                }
                return;
            }

            // Send email notifications via Resend
            try {
                await fetch('/api/email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ type: 'subscription', email: subscriptionEmail, source: 'hotels' })
                });
                console.log('Email notifications sent successfully');
            } catch (emailError) {
                console.error('Email notification error:', emailError);
            }

            setSubscriptionSubmitted(true);
            setSubscriptionEmail('');

            // Reset the success message after 3 seconds
            setTimeout(() => {
                setSubscriptionSubmitted(false);
            }, 3000);
        } catch (error) {
            setSubscriptionError('An unexpected error occurred. Please try again.');
        } finally {
            setSubscriptionLoading(false);
        }
    };

    return (
        <div className="bg-white min-h-screen font-sans text-gray-800">
            <Navbar />

            {/* Hero Section */}
            <div className="relative h-[75vh] flex items-center justify-center">
                {/* Background Image */}
                <div
                    className="absolute inset-0 z-0"
                    style={{
                        backgroundImage: "url('https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?q=80&w=2070&auto=format&fit=crop')",
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                    }}
                >
                    <div className="absolute inset-0 bg-black/40"></div>
                </div>

                <div className="container mx-auto px-4 z-10 relative">
                    <div className="text-center mb-10 text-white">
                        <h1 className="text-4xl md:text-6xl font-bold mb-4 drop-shadow-lg">
                            Find Your Perfect Stay
                        </h1>
                        <p className="text-lg md:text-xl opacity-90 max-w-2xl mx-auto drop-shadow-md">
                            Discover luxury hotels, cozy resorts, and unforgettable experiences around the globe.
                        </p>
                    </div>

                    {/* Search Form Card */}
                    <div className="bg-white/95 backdrop-blur-md rounded-2xl shadow-2xl p-6 md:p-8 max-w-5xl mx-auto transform hover:scale-[1.01] transition-all duration-300">
                        <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4 items-end">
                            {/* Destination */}
                            <div className="flex-1 w-full relative" ref={destinationInputRef}>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Destination</label>
                                <div className="relative group">
                                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 text-[#055B75] group-hover:scale-110 transition-transform" size={20} />
                                    <input
                                        type="text"
                                        placeholder="Search any city worldwide..."
                                        className="w-full pl-10 pr-10 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#65B3CF] focus:border-[#055B75] outline-none transition-all hover:bg-white"
                                        value={destination}
                                        onChange={(e) => handleDestinationChange(e.target.value)}
                                        onFocus={() => setShowDestinationSuggestions(true)}
                                        autoComplete="off"
                                    />
                                    {loadingSuggestions && (
                                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 text-[#055B75] animate-spin" size={18} />
                                    )}

                                    {/* Destination Suggestions Dropdown - only show when typing */}
                                    {showDestinationSuggestions && destination.length >= 2 && (
                                        <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-xl shadow-lg z-50 max-h-64 overflow-y-auto">
                                            <div className="p-2 border-b border-gray-100 text-xs text-gray-500 font-medium uppercase tracking-wide flex items-center gap-2">
                                                {loadingSuggestions ? (
                                                    <>
                                                        <Loader2 size={12} className="animate-spin" />
                                                        Searching Amadeus...
                                                    </>
                                                ) : (
                                                    `${suggestions.length} Results for "${destination}"`
                                                )}
                                            </div>
                                            {suggestions.length > 0 ? (
                                                suggestions.map((dest, index) => (
                                                    <button
                                                        key={dest.code || index}
                                                        type="button"
                                                        onClick={() => handleSelectDestination(dest)}
                                                        className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors text-left"
                                                    >
                                                        <MapPin size={18} className="text-[#055B75] flex-shrink-0" />
                                                        <div className="flex-1">
                                                            <div className="font-medium text-gray-800">{dest.name || dest.cityName}</div>
                                                            <div className="text-sm text-gray-500">{dest.country} • {dest.code}</div>
                                                        </div>
                                                    </button>
                                                ))
                                            ) : !loadingSuggestions ? (
                                                <div className="px-4 py-3 text-gray-500 text-sm">
                                                    No destinations found. Try a different search.
                                                </div>
                                            ) : null}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Dates */}
                            <div className="flex-1 w-full relative">
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Check-in - Check-out</label>
                                <div className="relative group">
                                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-[#055B75] z-10 group-hover:scale-110 transition-transform" size={20} />
                                    <DatePicker
                                        selectsRange={true}
                                        startDate={startDate}
                                        endDate={endDate}
                                        onChange={(update) => {
                                            setDateRange(update);
                                        }}
                                        className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#65B3CF] focus:border-[#055B75] outline-none transition-all hover:bg-white cursor-pointer"
                                        placeholderText="Add dates"
                                        dateFormat="MMM d"
                                        minDate={new Date()}
                                    />
                                </div>
                            </div>

                            {/* Guests */}
                            <div className="flex-1 w-full relative">
                                <label className="block text-sm font-semibold text-gray-700 mb-2">Guests & Rooms</label>
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={() => setShowGuestDropdown(!showGuestDropdown)}
                                        className="w-full pl-10 pr-4 py-3 text-left bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#65B3CF] focus:border-[#055B75] outline-none transition-all hover:bg-white flex items-center justify-between group"
                                    >
                                        <div className="flex items-center">
                                            <Users className="absolute left-3 top-1/2 -translate-y-1/2 text-[#055B75] group-hover:scale-110 transition-transform" size={20} />
                                            <span className="truncate">
                                                {guests.adults + guests.children} Guests, {guests.rooms} Room
                                            </span>
                                        </div>
                                    </button>

                                    {/* Mock Dropdown for Guests */}
                                    {showGuestDropdown && (
                                        <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-100 p-4 z-50 animate-in fade-in slide-in-from-top-2">
                                            <div className="space-y-4">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-sm font-medium">Rooms</span>
                                                    <div className="flex items-center gap-3">
                                                        <button type="button" onClick={() => setGuests({ ...guests, rooms: Math.max(1, guests.rooms - 1) })} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200">-</button>
                                                        <span>{guests.rooms}</span>
                                                        <button type="button" onClick={() => setGuests({ ...guests, rooms: guests.rooms + 1 })} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200">+</button>
                                                    </div>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <span className="text-sm font-medium">Adults</span>
                                                    <div className="flex items-center gap-3">
                                                        <button type="button" onClick={() => setGuests({ ...guests, adults: Math.max(1, guests.adults - 1) })} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200">-</button>
                                                        <span>{guests.adults}</span>
                                                        <button type="button" onClick={() => setGuests({ ...guests, adults: guests.adults + 1 })} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center hover:bg-gray-200">+</button>
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setShowGuestDropdown(false)}
                                                    className="w-full mt-2 bg-[#055B75] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#034457]"
                                                >
                                                    Done
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Search Button */}
                            <div className="w-full md:w-auto">
                                <button type="submit" className="w-full md:w-auto bg-[#055B75] text-white px-8 py-3.5 rounded-xl hover:bg-[#034457] transition-all duration-300 shadow-lg hover:shadow-xl font-bold flex items-center justify-center gap-2 group">
                                    <Search size={20} className="group-hover:scale-110 transition-transform" />
                                    <span>Search</span>
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>

            {/* Why Choose Us - Enhanced */}
            <section className="py-12 bg-[#F0FAFC]">
                <div className="container mx-auto px-4">
                    <div className="text-center mb-16">
                        <span className="text-[#65B3CF] font-semibold tracking-wider text-sm uppercase mb-2 block">Why Choose JetSet</span>
                        <h2 className="text-3xl md:text-4xl font-bold text-[#055B75] mb-4">Experience the Difference</h2>
                        <div className="w-24 h-1.5 bg-[#055B75]/20 mx-auto rounded-full"></div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12 max-w-7xl mx-auto">
                        {[
                            {
                                icon: Shield,
                                title: "Best Price Guarantee",
                                desc: "Find a lower price? We'll match it. Book with confidence knowing you're getting the best deal."
                            },
                            {
                                icon: Award,
                                title: "Handpicked Selection",
                                desc: "Every hotel is verified for quality, comfort, and service standards by our travel experts."
                            },
                            {
                                icon: Clock,
                                title: "24/7 Support",
                                desc: "Our dedicated support team is available around the clock to assist with your booking."
                            }
                        ].map((item, idx) => (
                            <div key={idx} className="bg-white p-10 rounded-3xl shadow-lg border border-gray-100 hover:shadow-2xl hover:-translate-y-2 transition-all duration-300 text-center group cursor-default">
                                <div className="w-20 h-20 bg-[#055B75] rounded-2xl rotate-3 mx-auto mb-6 group-hover:rotate-12 transition-transform duration-300 flex items-center justify-center shadow-lg shadow-[#055B75]/20">
                                    <item.icon className="text-white -rotate-3 group-hover:-rotate-12 transition-transform duration-300" size={36} />
                                </div>
                                <h3 className="text-xl font-bold text-gray-900 mb-3">{item.title}</h3>
                                <p className="text-gray-600 leading-relaxed">{item.desc}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* Featured Hotels - Enhanced */}
            <section className="py-12 bg-white">
                <div className="container mx-auto px-4">
                    <div className="flex flex-col md:flex-row justify-between items-end mb-12 gap-4">
                        <div className="max-w-2xl">
                            <span className="text-[#65B3CF] font-semibold tracking-wider text-sm uppercase mb-2 block">Luxury Stays</span>
                            <h2 className="text-4xl font-bold text-[#055B75] mb-4">
                                {loaded && city ? `Featured Hotels in ${city}` : 'Featured Hotels'}
                            </h2>
                            <p className="text-gray-600 text-lg">Discover our handpicked collection of the world's most stunning luxury hotels and resorts.</p>
                        </div>
                        <button
                            onClick={() => navigate(loaded && city ? `/hotels/search?destination=${encodeURIComponent(city)}` : '/hotels/search')}
                            className="hidden md:flex items-center gap-2 text-[#055B75] font-bold text-lg hover:text-[#034457] transition-colors group bg-[#F0FAFC] px-6 py-3 rounded-xl hover:bg-[#E0F2F7]"
                        >
                            View All Hotels <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
                        </button>
                    </div>

                    {loadingFeatured ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                            {[1, 2, 3, 4].map((i) => (
                                <div key={i} className="bg-white rounded-[2rem] overflow-hidden shadow-lg border border-gray-100 h-[450px] animate-pulse">
                                    <div className="h-72 bg-gray-200"></div>
                                    <div className="p-6 space-y-4">
                                        <div className="h-6 bg-gray-200 rounded w-3/4"></div>
                                        <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                                        <div className="h-10 bg-gray-200 rounded w-full mt-4"></div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                            {featuredHotelsList.map((hotel) => (
                                <div key={hotel.id} className="bg-white rounded-[2rem] overflow-hidden shadow-lg border border-gray-100 hover:shadow-2xl hover:-translate-y-1 transition-all duration-500 group cursor-pointer flex flex-col h-full">
                                    <div className="relative h-72 overflow-hidden">
                                        <img
                                            src={hotel.image}
                                            alt={hotel.name}
                                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                                            onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1600&q=80'; }}
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-60"></div>

                                        <div className="absolute top-4 right-4 bg-white/95 backdrop-blur-sm px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-lg">
                                            <Star className="fill-yellow-400 text-yellow-400" size={14} />
                                            <span className="text-xs font-bold text-gray-900">{hotel.rating || 4.5}</span>
                                        </div>
                                        {hotel.tags && hotel.tags.length > 0 && (
                                            <div className="absolute top-4 left-4">
                                                <span className="bg-[#055B75] text-white text-[10px] font-bold px-3 py-1.5 rounded-full uppercase tracking-wide shadow-lg">
                                                    {hotel.tags[0]}
                                                </span>
                                            </div>
                                        )}

                                        {/* Price Overlay on Image */}
                                        <div className="absolute bottom-4 left-4 text-white">
                                            <div className="flex items-baseline gap-1">
                                                <span className="text-2xl font-bold">
                                                    {hotel.currency === 'EUR' ? '€' : '$'}{hotel.price}
                                                </span>
                                                <span className="text-white/80 text-sm font-medium">/night</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="p-6 flex flex-col flex-grow">
                                        <h3 className="font-bold text-xl text-gray-900 mb-2 group-hover:text-[#055B75] transition-colors line-clamp-1">{hotel.name}</h3>
                                        <div className="flex items-center gap-1.5 text-gray-500 text-sm mb-4">
                                            <MapPin size={16} className="text-[#65B3CF]" />
                                            <span className="line-clamp-1">{hotel.location || hotel.destinationName}</span>
                                        </div>

                                        <div className="flex flex-wrap gap-2 mb-6">
                                            {hotel.tags ? hotel.tags.slice(1, 3).map((tag, i) => (
                                                <span key={i} className="text-xs bg-gray-50 text-gray-600 px-2.5 py-1.5 rounded-lg border border-gray-100 font-medium">
                                                    {tag}
                                                </span>
                                            )) : (
                                                hotel.amenities && hotel.amenities.slice(0, 3).map((amenity, i) => (
                                                    <span key={i} className="text-xs bg-gray-50 text-gray-600 px-2.5 py-1.5 rounded-lg border border-gray-100 font-medium line-clamp-1">
                                                        {amenity}
                                                    </span>
                                                ))
                                            )}
                                        </div>

                                        <div className="mt-auto pt-4 border-t border-gray-100">
                                            <button
                                                onClick={() => handleHotelClick(hotel.hotelId || hotel.id)} // Prefer raw ID for API hotels
                                                className="w-full bg-white border-2 border-[#055B75] text-[#055B75] py-3 rounded-xl font-bold hover:bg-[#055B75] hover:text-white transition-all duration-300 flex items-center justify-center gap-2 group/btn"
                                            >
                                                Check Availability
                                                <ArrowRight size={18} className="group-hover/btn:translate-x-1 transition-transform" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <button
                        onClick={() => navigate(loaded && city ? `/hotels/search?destination=${encodeURIComponent(city)}` : '/hotels/search')}
                        className="md:hidden mt-8 w-full flex items-center justify-center gap-2 bg-white border-2 border-[#055B75] text-[#055B75] font-bold py-4 rounded-xl hover:bg-[#F0FAFC] transition-colors"
                    >
                        View All Hotels <ArrowRight size={20} />
                    </button>
                </div>
            </section>

            {/* Special Offers Banner - Compact & Enhanced */}
            <section className="py-12 bg-gradient-to-r from-[#055B75] to-[#034e63] relative overflow-hidden">
                <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                <div className="container mx-auto px-4 relative z-10">
                    <div className="flex flex-col lg:flex-row items-center justify-between gap-8 max-w-6xl mx-auto bg-white/10 backdrop-blur-md p-8 rounded-3xl border border-white/10 shadow-2xl">
                        <div className="text-left flex-1">
                            <div className="inline-flex items-center gap-2 bg-yellow-400/20 text-yellow-300 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider mb-3">
                                <Sparkles size={12} />
                                <span>Limited Time Offer</span>
                            </div>
                            <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">Get 20% Off Your First Booking</h2>
                            <p className="text-blue-100 text-sm md:text-base max-w-lg">
                                Join our exclusive newsletter and unlock premium discounts on luxury stays worldwide.
                            </p>
                        </div>

                        <div className="w-full lg:w-auto flex-shrink-0">
                            {subscriptionSubmitted ? (
                                <div className="bg-green-500/20 backdrop-blur-sm rounded-xl p-4 text-white">
                                    <div className="flex items-center justify-center gap-2">
                                        <CheckCircle className="text-green-400" size={20} />
                                        <span>Successfully subscribed! Thank you.</span>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <form onSubmit={handleSubscription} className="flex flex-col sm:flex-row gap-3">
                                        <input
                                            type="email"
                                            placeholder="Enter your email address"
                                            value={subscriptionEmail}
                                            onChange={(e) => setSubscriptionEmail(e.target.value)}
                                            className="px-5 py-3 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-yellow-400 bg-white/95 w-full sm:w-72 shadow-inner"
                                            required
                                        />
                                        <button
                                            type="submit"
                                            disabled={subscriptionLoading}
                                            className="bg-yellow-400 text-[#055B75] px-6 py-3 rounded-xl font-bold hover:bg-yellow-300 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 whitespace-nowrap disabled:opacity-50"
                                        >
                                            {subscriptionLoading ? 'Subscribing...' : 'Claim Offer'}
                                        </button>
                                    </form>
                                    {subscriptionError && (
                                        <p className="text-red-300 text-xs mt-2 text-center sm:text-left">
                                            {subscriptionError}
                                        </p>
                                    )}
                                    <p className="text-blue-200 text-xs mt-3 text-center sm:text-left">
                                        No spam, unsubscribe anytime.
                                    </p>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </section>

            <Footer />
        </div>
    );
};

export default withPageElements(HotelsLanding);
