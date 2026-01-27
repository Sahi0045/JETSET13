import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Search, MapPin, Star, ArrowRight, Heart, X, ChevronDown, Wifi, Coffee, Car, Dumbbell, Bath, Loader2 } from 'lucide-react';
import Navbar from '../Navbar';
import Footer from '../Footer';
import withPageElements from '../PageWrapper';
import hotelService from '../../../Services/HotelService';
import currencyService from '../../../Services/CurrencyService';
import Price from '../../../Components/Price';

// Popular destinations shown when input is empty
const POPULAR_DESTINATIONS = [
    { name: 'Delhi', code: 'DEL', country: 'India' },
    { name: 'Mumbai', code: 'BOM', country: 'India' },
    { name: 'Dubai', code: 'DXB', country: 'UAE' },
    { name: 'Singapore', code: 'SIN', country: 'Singapore' },
    { name: 'London', code: 'LON', country: 'United Kingdom' },
    { name: 'Paris', code: 'PAR', country: 'France' },
];

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
    const [suggestions, setSuggestions] = useState(POPULAR_DESTINATIONS);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);

    // State
    const [hotels, setHotels] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [likedHotels, setLikedHotels] = useState([]);
    const [sortBy, setSortBy] = useState('recommended');
    const [priceRange, setPriceRange] = useState([0, 5000]);
    const [starFilter, setStarFilter] = useState([]);

    const sortOptions = [
        { value: 'recommended', label: 'Recommended' },
        { value: 'price_low', label: 'Price: Low to High' },
        { value: 'price_high', label: 'Price: High to Low' },
        { value: 'rating', label: 'Highest Rated' },
        { value: 'stars', label: 'Star Rating' }
    ];

    // Debounced search for locations
    const searchLocations = useCallback(async (keyword) => {
        if (!keyword || keyword.length < 2) {
            setSuggestions(POPULAR_DESTINATIONS);
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
            setSuggestions(POPULAR_DESTINATIONS);
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

    // Fetch hotels on mount and when search params change
    useEffect(() => {
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
                setHotels(results);
            } catch (err) {
                console.error('Error fetching hotels:', err);
                setError('Failed to load hotels. Please try again.');
                // Still try to get fallback data
                const fallback = hotelService.getAllHotels();
                setHotels(fallback);
            } finally {
                setLoading(false);
            }
        };

        fetchHotels();
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
    }, [searchQuery, checkInDate, checkOutDate, guests]);

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
        return hotels
            .filter(hotel => {
                // Price filter
                const price = parseFloat(hotel.price) || 0;
                if (price < priceRange[0] || price > priceRange[1]) return false;

                // Star filter
                if (starFilter.length > 0 && !starFilter.includes(hotel.stars)) return false;

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
    }, [hotels, sortBy, priceRange, starFilter]);

    // Navigate to hotel details
    const handleHotelClick = (hotel) => {
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
                                        setSuggestions(POPULAR_DESTINATIONS);
                                    }}
                                    className="absolute inset-y-0 right-0 pr-4 flex items-center"
                                >
                                    <X size={18} className="text-gray-400 hover:text-[#055B75]" />
                                </button>
                            )}

                            {/* Suggestions Dropdown */}
                            {showSuggestions && (
                                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
                                    <div className="p-2 border-b border-gray-100 text-xs text-gray-500 font-medium uppercase tracking-wide flex items-center gap-2">
                                        {loadingSuggestions ? (
                                            <>
                                                <Loader2 size={12} className="animate-spin" />
                                                Searching cities...
                                            </>
                                        ) : searchQuery && searchQuery.length >= 2 ? (
                                            `${suggestions.length} Results for "${searchQuery}"`
                                        ) : (
                                            'Popular Destinations'
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

                        {/* Sort Dropdown */}
                        <div className="relative w-full md:w-48">
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value)}
                                className="w-full px-4 py-3 rounded-lg border border-gray-200 bg-white pr-10 cursor-pointer hover:border-[#055B75] focus:ring-2 focus:ring-[#65B3CF] appearance-none"
                            >
                                {sortOptions.map((option) => (
                                    <option key={option.value} value={option.value}>{option.label}</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={20} />
                        </div>

                        <button
                            type="submit"
                            className="bg-[#055B75] text-white px-6 py-3 rounded-lg hover:bg-[#034457] transition-all font-medium w-full md:w-auto"
                        >
                            Search
                        </button>
                    </form>
                </div>
            </div>

            {/* Results Section */}
            <div className="container mx-auto px-4 py-8">
                {/* Results Count */}
                <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-2">
                    <h2 className="text-xl font-semibold text-gray-800">
                        {loading ? (
                            <span className="flex items-center gap-2">
                                <div className="w-5 h-5 border-2 border-[#055B75] border-t-transparent rounded-full animate-spin"></div>
                                Searching hotels...
                            </span>
                        ) : (
                            <span>
                                {filteredHotels.length} hotels found
                                {searchQuery && <span className="text-gray-500 font-normal"> for "{searchQuery}"</span>}
                            </span>
                        )}
                    </h2>

                    {(searchQuery || starFilter.length > 0) && (
                        <button
                            onClick={() => {
                                setSearchQuery('');
                                setStarFilter([]);
                            }}
                            className="text-[#055B75] hover:text-[#034457] flex items-center gap-2 text-sm"
                        >
                            <X size={16} />
                            Clear filters
                        </button>
                    )}
                </div>

                {/* Hotel Grid */}
                {loading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                            <div key={i} className="bg-white rounded-xl overflow-hidden shadow-md animate-pulse">
                                <div className="h-48 bg-gray-200"></div>
                                <div className="p-4">
                                    <div className="h-4 bg-gray-200 rounded mb-2 w-3/4"></div>
                                    <div className="h-3 bg-gray-200 rounded mb-4 w-1/2"></div>
                                    <div className="flex gap-2 mb-3">
                                        <div className="h-6 bg-gray-200 rounded w-16"></div>
                                        <div className="h-6 bg-gray-200 rounded w-16"></div>
                                    </div>
                                    <div className="h-8 bg-gray-200 rounded w-24"></div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : filteredHotels.length === 0 ? (
                    <div className="text-center py-16">
                        <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-6">
                            <MapPin size={40} className="text-gray-400" />
                        </div>
                        <h3 className="text-xl font-semibold text-gray-800 mb-2">No hotels found</h3>
                        <p className="text-gray-600 mb-6">
                            {searchQuery
                                ? `We couldn't find any hotels matching "${searchQuery}". Try a different destination.`
                                : 'Try adjusting your search filters.'}
                        </p>
                        <button
                            onClick={() => {
                                setSearchQuery('');
                                setStarFilter([]);
                            }}
                            className="bg-[#055B75] text-white px-6 py-2 rounded-lg hover:bg-[#034457] transition-all"
                        >
                            Show all hotels
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {filteredHotels.map((hotel) => (
                            <div
                                key={hotel.id}
                                className="group bg-white rounded-xl overflow-hidden shadow-md hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 cursor-pointer"
                                onClick={() => handleHotelClick(hotel)}
                            >
                                {/* Hotel Image */}
                                <div className="relative h-48 overflow-hidden">
                                    <img
                                        src={hotel.image}
                                        alt={hotel.name}
                                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                                        onError={(e) => {
                                            e.target.src = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1600&q=80';
                                        }}
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent"></div>

                                    {/* Like Button */}
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            toggleLike(hotel.id);
                                        }}
                                        className="absolute top-3 right-3 p-2 rounded-full bg-white/20 backdrop-blur-sm hover:bg-white/40 transition-all"
                                    >
                                        <Heart
                                            size={18}
                                            className={`${likedHotels.includes(hotel.id) ? 'fill-red-500 text-red-500' : 'text-white'} transition-colors`}
                                        />
                                    </button>

                                    {/* Discount Badge */}
                                    {hotel.discount > 0 && (
                                        <div className="absolute top-3 left-3 bg-red-500 text-white px-2 py-1 rounded-full text-xs font-medium">
                                            {hotel.discount}% OFF
                                        </div>
                                    )}

                                    {/* Star Rating */}
                                    <div className="absolute bottom-3 left-3 flex items-center gap-1">
                                        {[...Array(hotel.stars || 5)].map((_, i) => (
                                            <Star key={i} size={12} className="fill-yellow-400 text-yellow-400" />
                                        ))}
                                    </div>

                                    {/* Price on Image */}
                                    <div className="absolute bottom-3 right-3 text-white">
                                        <div className="text-sm opacity-80">from</div>
                                        <div className="text-xl font-bold">
                                            <Price amount={hotel.price} />
                                        </div>
                                    </div>
                                </div>

                                {/* Hotel Info */}
                                <div className="p-4">
                                    <h3 className="font-semibold text-gray-900 mb-1 group-hover:text-[#055B75] transition-colors line-clamp-1">
                                        {hotel.name}
                                    </h3>
                                    <div className="flex items-center gap-1 text-gray-500 text-sm mb-3">
                                        <MapPin size={14} className="text-[#65B3CF]" />
                                        <span className="line-clamp-1">{hotel.location || hotel.destinationName}</span>
                                    </div>

                                    {/* Amenities */}
                                    <div className="flex flex-wrap gap-1 mb-3">
                                        {(hotel.amenities || []).slice(0, 3).map((amenity, idx) => (
                                            <span
                                                key={idx}
                                                className="text-xs bg-[#F0FAFC] text-[#055B75] px-2 py-1 rounded-full"
                                            >
                                                {amenity}
                                            </span>
                                        ))}
                                    </div>

                                    {/* Rating */}
                                    <div className="flex items-center justify-between border-t pt-3">
                                        <div className="flex items-center gap-1">
                                            <Star size={14} className="fill-yellow-400 text-yellow-400" />
                                            <span className="font-medium text-sm">{hotel.rating}</span>
                                            {hotel.reviews > 0 && (
                                                <span className="text-gray-500 text-sm">({hotel.reviews} reviews)</span>
                                            )}
                                        </div>
                                        <ArrowRight size={18} className="text-[#055B75] group-hover:translate-x-1 transition-transform" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <Footer />
        </div>
    );
};

export default withPageElements(SearchHotels);
