import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Search, MapPin, Star, ArrowRight, Heart, X, ChevronDown, Wifi, Coffee, Car, Dumbbell, Bath, Loader2 } from 'lucide-react';
import Navbar from '../Navbar';
import Footer from '../Footer';
import withPageElements from '../PageWrapper';
import hotelService from '../../../Services/HotelService';
import currencyService from '../../../Services/CurrencyService';
import pricingService from '../../../Services/PricingService';
import Price from '../../../Components/Price';

// USD price-per-night buckets (hotel prices are USD base; Price renders in user currency)
const PRICE_BUCKETS = [
    { id: 'b1', label: 'Under', min: 0, max: 75 },
    { id: 'b2', label: '', min: 75, max: 150 },
    { id: 'b3', label: '', min: 150, max: 250 },
    { id: 'b4', label: '', min: 250, max: 400 },
    { id: 'b5', label: 'Above', min: 400, max: Infinity },
];

// Map a 0-5 rating to a MakeMyTrip-style word label
const ratingLabel = (r) => {
    if (r == null) return null;
    if (r >= 4.5) return 'Excellent';
    if (r >= 4) return 'Very Good';
    if (r >= 3.5) return 'Good';
    return 'Pleasant';
};

const SearchHotels = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const searchParams = new URLSearchParams(location.search);
    const searchInputRef = useRef(null);
    const debounceTimer = useRef(null);

    // Extract search parameters from URL
    const [searchQuery, setSearchQuery] = useState(searchParams.get('destination') || '');
    const [checkInDate, setCheckInDate] = useState(searchParams.get('checkIn') || '');
    const [checkOutDate, setCheckOutDate] = useState(searchParams.get('checkOut') || '');
    const [guests, setGuests] = useState({
        rooms: parseInt(searchParams.get('rooms')) || 1,
        adults: parseInt(searchParams.get('adults')) || 2,
        children: parseInt(searchParams.get('children')) || 0
    });

    // Autocomplete state
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [selectedDestination, setSelectedDestination] = useState(null);
    const [suggestions, setSuggestions] = useState([]);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);

    // State
    const [hotels, setHotels] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [likedHotels, setLikedHotels] = useState([]);
    const [sortBy, setSortBy] = useState('recommended');
    const [priceBuckets, setPriceBuckets] = useState([]); // selected bucket ids
    const [starFilter, setStarFilter] = useState([]);
    const [ratingFilter, setRatingFilter] = useState(0);
    const [rates, setRates] = useState({ taxPercent: 12, serviceFeePercent: 5, fixedFeePerNight: 0 });

    // Admin-configured tax/fee rates (for the "+ taxes & fees" line)
    useEffect(() => {
        let active = true;
        pricingService.getHotelRates().then((r) => { if (active) setRates(r); }).catch(() => {});
        return () => { active = false; };
    }, []);

    const perNightTaxes = (price) => {
        const p = parseFloat(price) || 0;
        return Math.round(p * ((rates.taxPercent + rates.serviceFeePercent) / 100) + (rates.fixedFeePerNight || 0));
    };

    const toggleBucket = (id) => setPriceBuckets((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
    const toggleStar = (s) => setStarFilter((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);

    const sortTabs = [
        { value: 'recommended', label: 'Popularity' },
        { value: 'price_low', label: 'Price: Low to High' },
        { value: 'price_high', label: 'Price: High to Low' },
        { value: 'rating', label: 'User Rating' },
    ];

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

    // Handle search query change with debounce
    const handleSearchQueryChange = (value) => {
        setSearchQuery(value);
        setSelectedDestination(null);
        
        if (debounceTimer.current) {
            clearTimeout(debounceTimer.current);
        }
        
        debounceTimer.current = setTimeout(() => {
            searchLocations(value);
        }, 300);
    };

    // Cleanup debounce timer
    useEffect(() => {
        return () => {
            if (debounceTimer.current) {
                clearTimeout(debounceTimer.current);
            }
        };
    }, []);

    // Fetch hotels on mount and when search params change.
    // The cancelled flag prevents an in-flight response from overwriting
    // newer state when filters change rapidly.
    useEffect(() => {
        let cancelled = false;
        const fetchHotels = async () => {
            setLoading(true);
            setError(null);

            try {
                const results = await hotelService.searchHotels(
                    searchQuery,
                    checkInDate,
                    checkOutDate,
                    guests.adults
                );
                if (cancelled) return;
                setHotels(results);
            } catch (err) {
                if (cancelled) return;
                console.error('Error fetching hotels:', err);
                setError('Failed to load hotels. Please try again.');
                const fallback = await hotelService.getAllHotels();
                if (cancelled) return;
                setHotels(fallback);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        fetchHotels();
        return () => { cancelled = true; };
    }, [searchQuery, checkInDate, checkOutDate, guests.adults]);

    // Update URL when search params change
    useEffect(() => {
        const params = new URLSearchParams();
        if (searchQuery) params.set('destination', searchQuery);
        if (checkInDate) params.set('checkIn', checkInDate);
        if (checkOutDate) params.set('checkOut', checkOutDate);
        params.set('rooms', guests.rooms);
        params.set('adults', guests.adults);
        params.set('children', guests.children);
        navigate({ search: params.toString() }, { replace: true });
    }, [searchQuery, checkInDate, checkOutDate, guests.rooms, guests.adults, guests.children, navigate]);

    // Toggle like
    const toggleLike = (hotelId) => {
        setLikedHotels(prev =>
            prev.includes(hotelId)
                ? prev.filter(id => id !== hotelId)
                : [...prev, hotelId]
        );
    };

    // Filter and sort hotels
    const filteredHotels = useMemo(() => {
        const selectedRanges = PRICE_BUCKETS.filter((b) => priceBuckets.includes(b.id));
        return hotels
            .filter(hotel => {
                const price = parseFloat(hotel.price) || 0;
                // Price buckets (OR across selected); none selected = all
                if (selectedRanges.length > 0 && !selectedRanges.some((b) => price >= b.min && price < b.max)) return false;
                // Star filter
                if (starFilter.length > 0 && !starFilter.includes(hotel.stars)) return false;
                // Guest rating filter
                if (ratingFilter > 0 && (parseFloat(hotel.rating) || 0) < ratingFilter) return false;
                return true;
            })
            .sort((a, b) => {
                switch (sortBy) {
                    case 'price_low':
                        return (parseFloat(a.price) || 0) - (parseFloat(b.price) || 0);
                    case 'price_high':
                        return (parseFloat(b.price) || 0) - (parseFloat(a.price) || 0);
                    case 'rating':
                        return (parseFloat(b.rating) || 0) - (parseFloat(a.rating) || 0);
                    case 'stars':
                        return (b.stars || 0) - (a.stars || 0);
                    default:
                        // Recommended: prioritize rating * reviews
                        const aScore = (parseFloat(a.rating) || 0) * Math.log((a.reviews || 1) + 1);
                        const bScore = (parseFloat(b.rating) || 0) * Math.log((b.reviews || 1) + 1);
                        return bScore - aScore;
                }
            });
    }, [hotels, sortBy, priceBuckets, starFilter, ratingFilter]);

    // Navigate to hotel details
    const handleHotelClick = (hotel) => {
        // Store hotel data in sessionStorage so details page can use it as fallback
        sessionStorage.setItem(`hotel-${hotel.id}`, JSON.stringify(hotel));
        
        const params = new URLSearchParams();
        params.set('id', hotel.id);
        if (checkInDate) params.set('checkIn', checkInDate);
        if (checkOutDate) params.set('checkOut', checkOutDate);
        params.set('adults', guests.adults);
        navigate(`/hotels/details?${params.toString()}`);
    };

    // Handle search form submit
    const handleSearchSubmit = (e) => {
        e.preventDefault();
        setShowSuggestions(false);
        // Just updating state will trigger the useEffect
    };

    // Handle destination selection from suggestions
    const handleSelectDestination = (destination) => {
        setSearchQuery(destination.name || destination.cityName);
        setSelectedDestination(destination);
        setShowSuggestions(false);
    };

    // Close suggestions when clicking outside
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (searchInputRef.current && !searchInputRef.current.contains(e.target)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Get amenity icon
    const getAmenityIcon = (amenity) => {
        const iconMap = {
            'free wifi': Wifi,
            'wifi': Wifi,
            'breakfast': Coffee,
            'parking': Car,
            'valet parking': Car,
            'fitness': Dumbbell,
            'gym': Dumbbell,
            'spa': Bath,
            'pool': Bath
        };
        const key = Object.keys(iconMap).find(k => amenity.toLowerCase().includes(k));
        return key ? iconMap[key] : null;
    };

    return (
        <div className="min-h-screen bg-gray-50">
            <Navbar forceScrolled={true} />

            {/* Search Header */}
            <div className="bg-white shadow-md sticky top-0 z-40">
                <div className="container mx-auto px-4 py-4">
                    <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row gap-4 items-center">
                        {/* Search Input with Autocomplete */}
                        <div className="relative flex-1 w-full group" ref={searchInputRef}>
                            <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                <Search className="text-gray-400 group-hover:text-[#055B75] transition-colors" size={20} />
                            </div>
                            <input
                                type="text"
                                placeholder="Search any city worldwide..."
                                value={searchQuery}
                                onChange={(e) => handleSearchQueryChange(e.target.value)}
                                onFocus={() => setShowSuggestions(true)}
                                className="w-full pl-12 pr-10 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-[#65B3CF] focus:border-[#055B75] transition-all"
                                autoComplete="off"
                            />
                            {loadingSuggestions && (
                                <div className="absolute inset-y-0 right-10 flex items-center">
                                    <Loader2 size={16} className="text-[#055B75] animate-spin" />
                                </div>
                            )}
                            {searchQuery && (
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSearchQuery('');
                                        setSelectedDestination(null);
                                        setSuggestions([]);
                                    }}
                                    className="absolute inset-y-0 right-0 pr-4 flex items-center"
                                >
                                    <X size={18} className="text-gray-400 hover:text-[#055B75]" />
                                </button>
                            )}

                            {/* Suggestions Dropdown */}
                            {showSuggestions && searchQuery.length >= 2 && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
                                    <div className="p-2 border-b border-gray-100 text-xs text-gray-500 font-medium uppercase tracking-wide flex items-center gap-2">
                                        {loadingSuggestions ? (
                                            <>
                                                <Loader2 size={12} className="animate-spin" />
                                                Searching cities...
                                            </>
                                        ) : (
                                            `${suggestions.length} Results for "${searchQuery}"`
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
                                    ) : !loadingSuggestions && searchQuery.length >= 2 ? (
                                        <div className="px-4 py-3 text-gray-500 text-sm">
                                            No destinations found. Try a different search.
                                        </div>
                                    ) : null}
                                </div>
                            )}
                        </div>

                        {/* Date Inputs */}
                        <div className="flex gap-2 w-full md:w-auto">
                            <input
                                type="date"
                                value={checkInDate}
                                onChange={(e) => setCheckInDate(e.target.value)}
                                className="px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-[#65B3CF] w-full md:w-40"
                                placeholder="Check-in"
                            />
                            <input
                                type="date"
                                value={checkOutDate}
                                onChange={(e) => setCheckOutDate(e.target.value)}
                                className="px-4 py-3 rounded-lg border border-gray-200 focus:ring-2 focus:ring-[#65B3CF] w-full md:w-40"
                                placeholder="Check-out"
                            />
                        </div>

                        {/* Sort moved to tabs below */}

                        <button
                            type="submit"
                            className="bg-[#055B75] text-white px-6 py-3 rounded-lg hover:bg-[#034457] transition-all font-medium w-full md:w-auto"
                        >
                            Search
                        </button>
                    </form>
                </div>
            </div>

            {/* Header + sort tabs */}
            <div className="container mx-auto px-4 pt-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
                    <h2 className="text-xl font-bold text-gray-900">
                        {loading ? (
                            <span className="flex items-center gap-2">
                                <div className="w-5 h-5 border-2 border-[#055B75] border-t-transparent rounded-full animate-spin"></div>
                                Searching hotels…
                            </span>
                        ) : (
                            <span>
                                {filteredHotels.length} {filteredHotels.length === 1 ? 'Property' : 'Properties'}
                                {searchQuery && <span className="text-gray-500 font-normal"> in {searchQuery}</span>}
                            </span>
                        )}
                    </h2>
                    <div className="flex items-center gap-1 overflow-x-auto hide-scrollbar text-sm">
                        {sortTabs.map((tab) => (
                            <button
                                key={tab.value}
                                onClick={() => setSortBy(tab.value)}
                                className={`px-3 py-1.5 rounded-full whitespace-nowrap transition-colors ${sortBy === tab.value ? 'bg-[#055B75] text-white font-semibold' : 'text-gray-600 hover:bg-[#F0FAFC]'}`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Two-column: filters + list */}
            <div className="container mx-auto px-4 pb-12 flex gap-6 items-start">
                {/* Filter sidebar */}
                <aside className="hidden lg:block w-72 flex-shrink-0 sticky top-24">
                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                            <span className="font-bold text-gray-900">Filters</span>
                            {(priceBuckets.length > 0 || starFilter.length > 0 || ratingFilter > 0) && (
                                <button
                                    onClick={() => { setPriceBuckets([]); setStarFilter([]); setRatingFilter(0); }}
                                    className="text-xs text-[#0890BC] font-semibold hover:text-[#034457]"
                                >
                                    Clear all
                                </button>
                            )}
                        </div>

                        {/* Price per night */}
                        <div className="px-4 py-4 border-b border-gray-100">
                            <h4 className="text-sm font-bold text-gray-800 mb-3">Price per night</h4>
                            <div className="space-y-2">
                                {PRICE_BUCKETS.map((b) => (
                                    <label key={b.id} className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                                        <input type="checkbox" checked={priceBuckets.includes(b.id)} onChange={() => toggleBucket(b.id)}
                                            className="w-4 h-4 rounded accent-[#055B75]" />
                                        <span>
                                            {b.label === 'Under' && <>Under <Price amount={b.max} /></>}
                                            {b.label === 'Above' && <>Above <Price amount={b.min} /></>}
                                            {!b.label && <><Price amount={b.min} /> – <Price amount={b.max} /></>}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Star category */}
                        <div className="px-4 py-4 border-b border-gray-100">
                            <h4 className="text-sm font-bold text-gray-800 mb-3">Star category</h4>
                            <div className="space-y-2">
                                {[5, 4, 3].map((s) => (
                                    <label key={s} className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                                        <input type="checkbox" checked={starFilter.includes(s)} onChange={() => toggleStar(s)}
                                            className="w-4 h-4 rounded accent-[#055B75]" />
                                        <span className="flex items-center gap-0.5">
                                            {[...Array(s)].map((_, i) => <Star key={i} size={13} className="fill-yellow-400 text-yellow-400" />)}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        {/* Guest rating */}
                        <div className="px-4 py-4">
                            <h4 className="text-sm font-bold text-gray-800 mb-3">Guest rating</h4>
                            <div className="space-y-2">
                                {[{ v: 4.5, l: 'Excellent 4.5+' }, { v: 4, l: 'Very Good 4+' }, { v: 3.5, l: 'Good 3.5+' }].map((r) => (
                                    <label key={r.v} className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                                        <input type="radio" name="rating" checked={ratingFilter === r.v} onChange={() => setRatingFilter(r.v)}
                                            className="w-4 h-4 accent-[#055B75]" />
                                        {r.l}
                                    </label>
                                ))}
                                {ratingFilter > 0 && (
                                    <button onClick={() => setRatingFilter(0)} className="text-xs text-[#0890BC] font-semibold mt-1">Any rating</button>
                                )}
                            </div>
                        </div>
                    </div>
                </aside>

                {/* Results list */}
                <div className="flex-1 min-w-0">
                    {loading ? (
                        <div className="space-y-4">
                            {[1, 2, 3, 4].map((i) => (
                                <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden animate-pulse flex">
                                    <div className="w-64 h-48 bg-gray-200 flex-shrink-0"></div>
                                    <div className="p-4 flex-1">
                                        <div className="h-5 bg-gray-200 rounded w-2/3 mb-3"></div>
                                        <div className="h-3 bg-gray-200 rounded w-1/2 mb-4"></div>
                                        <div className="flex gap-2"><div className="h-6 bg-gray-200 rounded w-20"></div><div className="h-6 bg-gray-200 rounded w-24"></div></div>
                                    </div>
                                    <div className="w-44 border-l border-gray-100 p-4"><div className="h-8 bg-gray-200 rounded mb-3"></div><div className="h-6 bg-gray-200 rounded w-24 ml-auto"></div></div>
                                </div>
                            ))}
                        </div>
                    ) : filteredHotels.length === 0 ? (
                        <div className="text-center py-16 bg-white rounded-xl border border-gray-100">
                            <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                                <MapPin size={40} className="text-gray-400" />
                            </div>
                            <h3 className="text-xl font-semibold text-gray-800 mb-2">No properties found</h3>
                            <p className="text-gray-600 mb-6">
                                {searchQuery ? `We couldn't find hotels matching your filters in "${searchQuery}".` : 'Try adjusting your filters.'}
                            </p>
                            <button
                                onClick={() => { setPriceBuckets([]); setStarFilter([]); setRatingFilter(0); }}
                                className="bg-[#055B75] text-white px-6 py-2 rounded-lg hover:bg-[#034457] transition-all"
                            >
                                Clear filters
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {filteredHotels.map((hotel) => {
                                const label = ratingLabel(hotel.rating);
                                return (
                                    <div
                                        key={hotel.id}
                                        onClick={() => handleHotelClick(hotel)}
                                        className="group bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-lg transition-all cursor-pointer flex flex-col sm:flex-row overflow-hidden"
                                    >
                                        {/* Image */}
                                        <div className="relative sm:w-64 h-52 sm:h-auto flex-shrink-0 overflow-hidden">
                                            <img loading="lazy" decoding="async"
                                                src={hotel.image}
                                                alt={hotel.name}
                                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                                onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1600&q=80'; }}
                                            />
                                            <button
                                                onClick={(e) => { e.stopPropagation(); toggleLike(hotel.id); }}
                                                className="absolute top-3 right-3 p-2 rounded-full bg-white/30 backdrop-blur-sm hover:bg-white/50 transition-all"
                                            >
                                                <Heart size={16} className={likedHotels.includes(hotel.id) ? 'fill-red-500 text-red-500' : 'text-white'} />
                                            </button>
                                            {(hotel.images?.length > 1) && (
                                                <div className="absolute bottom-3 left-3 bg-black/60 text-white text-xs px-2 py-1 rounded">
                                                    {hotel.images.length} Photos
                                                </div>
                                            )}
                                        </div>

                                        {/* Middle: details */}
                                        <div className="flex-1 p-4 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <h3 className="font-bold text-gray-900 text-lg group-hover:text-[#055B75] transition-colors line-clamp-1">{hotel.name}</h3>
                                                <span className="flex items-center gap-0.5 flex-shrink-0">
                                                    {[...Array(hotel.stars || 4)].map((_, i) => <Star key={i} size={12} className="fill-yellow-400 text-yellow-400" />)}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-1 text-gray-500 text-sm mb-3">
                                                <MapPin size={14} className="text-[#65B3CF]" />
                                                <span className="line-clamp-1">{hotel.location || hotel.destinationName}</span>
                                            </div>
                                            <div className="flex flex-wrap gap-1.5 mb-3">
                                                {(hotel.amenities || []).slice(0, 4).map((a, idx) => (
                                                    <span key={idx} className="text-xs bg-[#F0FAFC] text-[#055B75] px-2 py-1 rounded-full">{a}</span>
                                                ))}
                                            </div>
                                            {hotel.estimated && (
                                                <p className="text-xs text-amber-600">Estimated rate — confirmed at checkout</p>
                                            )}
                                        </div>

                                        {/* Right: rating + price */}
                                        <div className="sm:w-48 flex-shrink-0 sm:border-l border-gray-100 p-4 flex sm:flex-col items-center sm:items-end justify-between sm:justify-start gap-2 sm:text-right">
                                            {label ? (
                                                <div className="flex items-center gap-2 sm:flex-col sm:items-end">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-semibold text-gray-700">{label}</span>
                                                        <span className="bg-[#055B75] text-white text-sm font-bold px-2 py-0.5 rounded">{hotel.rating}</span>
                                                    </div>
                                                    {hotel.reviews > 0 && <span className="text-xs text-gray-400">({hotel.reviews} ratings)</span>}
                                                </div>
                                            ) : (
                                                <span className="text-xs text-gray-400">New property</span>
                                            )}
                                            <div className="sm:mt-auto">
                                                <div className="text-2xl font-bold text-gray-900"><Price amount={hotel.price} /></div>
                                                <div className="text-xs text-gray-400">+ <Price amount={perNightTaxes(hotel.price)} /> taxes &amp; fees</div>
                                                <div className="text-xs text-gray-400 mb-2">per night</div>
                                                <span className="inline-flex items-center gap-1 text-[#055B75] font-semibold text-sm group-hover:translate-x-0.5 transition-transform">
                                                    View <ArrowRight size={15} />
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            <Footer />
        </div>
    );
};

export default withPageElements(SearchHotels);
