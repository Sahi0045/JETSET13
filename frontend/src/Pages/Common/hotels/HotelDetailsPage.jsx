import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { MapPin, Star, Calendar, Users, ChevronLeft, ChevronRight, X, Wifi, Coffee, Car, Dumbbell, Bath, Check, Phone, Mail, Clock, Shield, Award, Heart, Share2 } from 'lucide-react';
import { FaSwimmingPool, FaConciergeBell, FaUtensils, FaSpa, FaParking, FaWifi, FaPlane } from 'react-icons/fa';
import Navbar from '../Navbar';
import Footer from '../Footer';
import withPageElements from '../PageWrapper';
import hotelService from '../../../Services/HotelService';
import currencyService from '../../../Services/CurrencyService';
import pricingService from '../../../Services/PricingService';
import Price from '../../../Components/Price';
import { useSupabaseAuth } from '../../../contexts/SupabaseAuthContext';

// Map a 0-5 rating to a MakeMyTrip-style word label
const ratingWord = (r) => {
    if (r == null) return 'New';
    if (r >= 4.5) return 'Excellent';
    if (r >= 4) return 'Very Good';
    if (r >= 3.5) return 'Good';
    return 'Pleasant';
};

const HotelDetailsPage = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const searchParams = new URLSearchParams(location.search);

    // Get params from URL
    const hotelId = searchParams.get('id');
    const checkInDate = searchParams.get('checkIn') || '';
    const checkOutDate = searchParams.get('checkOut') || '';
    const adultsParam = parseInt(searchParams.get('adults')) || 2;

    // State
    const [hotel, setHotel] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [currentImageIndex, setCurrentImageIndex] = useState(0);
    const [selectedRoom, setSelectedRoom] = useState(null);
    const [showQuoteModal, setShowQuoteModal] = useState(false);
    const [isLiked, setIsLiked] = useState(false);
    const [rates, setRates] = useState({ taxPercent: 12, serviceFeePercent: 5, fixedFeePerNight: 0 });
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        checkIn: checkInDate,
        checkOut: checkOutDate,
        guests: adultsParam.toString(),
        specialRequests: ''
    });
    const [formSubmitting, setFormSubmitting] = useState(false);
    const [formSuccess, setFormSuccess] = useState(false);

    // Auth state (Supabase)
    const { isAuthenticated: supabaseAuth } = useSupabaseAuth();

    // Helpers for default dates (e.g., tomorrow and day after)
    const getDefaultCheckIn = () => {
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        return tomorrow.toISOString().split('T')[0];
    };

    const getDefaultCheckOut = () => {
        const checkIn = formData.checkIn || getDefaultCheckIn();
        const inDate = new Date(checkIn);
        const outDate = new Date(inDate);
        outDate.setDate(inDate.getDate() + 1);
        return outDate.toISOString().split('T')[0];
    };

    // Fetch hotel details. Guard against navigating between hotels mid-fetch:
    // the previous request's setHotel/setSelectedRoom must not overwrite the
    // newer hotel's data.
    useEffect(() => {
        let cancelled = false;
        const fetchHotel = async () => {
            if (!hotelId) {
                setError('No hotel ID provided');
                setLoading(false);
                return;
            }

            setLoading(true);
            try {
                const effectiveCheckIn = checkInDate || getDefaultCheckIn();
                const effectiveCheckOut = checkOutDate || getDefaultCheckOut();

                const hotelData = await hotelService.getHotelById(
                    hotelId,
                    effectiveCheckIn,
                    effectiveCheckOut,
                    adultsParam
                );
                if (cancelled) return;
                if (hotelData) {
                    setHotel(hotelData);
                    if (hotelData.rooms && hotelData.rooms.length > 0) {
                        setSelectedRoom(hotelData.rooms[0]);
                    }
                } else {
                    setError('Hotel not found');
                }
            } catch (err) {
                if (cancelled) return;
                console.error('Error fetching hotel:', err);
                setError('Failed to load hotel details');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        fetchHotel();
        return () => { cancelled = true; };
    }, [hotelId]);

    // Image navigation
    const nextImage = () => {
        if (hotel?.images) {
            setCurrentImageIndex((prev) => (prev + 1) % hotel.images.length);
        }
    };

    const prevImage = () => {
        if (hotel?.images) {
            setCurrentImageIndex((prev) => (prev - 1 + hotel.images.length) % hotel.images.length);
        }
    };

    // Load admin-configurable hotel tax & service-fee rates
    useEffect(() => {
        let active = true;
        pricingService.getHotelRates().then((r) => { if (active) setRates(r); }).catch(() => {});
        return () => { active = false; };
    }, []);

    // Calculate nights
    const calculateNights = () => {
        if (!formData.checkIn || !formData.checkOut) return 1;
        const start = new Date(formData.checkIn);
        const end = new Date(formData.checkOut);
        const diff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
        return diff > 0 ? diff : 1;
    };

    // Handle form input change
    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    // Handle quote form submit
    const handleQuoteSubmit = async (e) => {
        e.preventDefault();
        setFormSubmitting(true);

        try {
            // Import supabase dynamically to avoid issues
            const supabaseModule = await import('../../../lib/supabase');
            const supabase = supabaseModule.default;

            // Save quote request to Supabase
            const { error } = await supabase.from('hotel_quotes').insert([{
                hotel_id: hotelId,
                hotel_name: hotel?.name || 'Unknown Hotel',
                name: formData.name,
                email: formData.email,
                phone: formData.phone || null,
                check_in: formData.checkIn || null,
                check_out: formData.checkOut || null,
                guests: parseInt(formData.guests) || 2,
                special_requests: formData.specialRequests || null,
                room_type: selectedRoom?.type || null,
                price_estimate: selectedRoom?.price || hotel?.price || null,
                status: 'pending'
            }]);

            if (error) {
                console.error('Error saving quote:', error);
                throw error;
            }

            console.log('✅ Hotel quote saved to Supabase');

            // Send email notifications via Resend
            try {
                await fetch('/api/email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'quote',
                        name: formData.name,
                        email: formData.email,
                        phone: formData.phone,
                        hotel_name: hotel?.name,
                        check_in: formData.checkIn,
                        check_out: formData.checkOut,
                        guests: formData.guests,
                        special_requests: formData.specialRequests
                    })
                });
                console.log('Quote email notifications sent');
            } catch (emailError) {
                console.error('Email notification error:', emailError);
            }

            setFormSubmitting(false);
            setFormSuccess(true);

            setTimeout(() => {
                setFormSuccess(false);
                setShowQuoteModal(false);
            }, 3000);
        } catch (err) {
            console.error('Quote submission error:', err);
            setFormSubmitting(false);
            alert('Failed to submit quote request. Please try again.');
        }
    };

    // Navigate to booking
    const handleBookNow = () => {
        // Require login before proceeding to booking
        const isLoggedIn = supabaseAuth || localStorage.getItem('isAuthenticated') === 'true';

        if (!isLoggedIn) {
            // Redirect to Supabase login, preserving return URL
            const returnTo = `${location.pathname}${location.search}`;
            navigate(`/supabase-login?redirect=${encodeURIComponent(returnTo)}`);
            return;
        }

        if (!selectedRoom) {
            alert('Please select a room first');
            return;
        }

        const params = new URLSearchParams();
        params.set('hotelId', hotelId);
        params.set('roomType', selectedRoom.type);
        params.set('checkIn', formData.checkIn || checkInDate);
        params.set('checkOut', formData.checkOut || checkOutDate);
        params.set('guests', formData.guests || adultsParam);
        params.set('price', selectedRoom.price);
        params.set('nights', calculateNights());

        navigate(`/hotels/booking-summary?${params.toString()}`);
    };

    // Get amenity icon
    const getAmenityIcon = (amenity) => {
        const lower = amenity.toLowerCase();
        if (lower.includes('wifi')) return <FaWifi />;
        if (lower.includes('pool') || lower.includes('swimming')) return <FaSwimmingPool />;
        if (lower.includes('spa')) return <FaSpa />;
        if (lower.includes('parking') || lower.includes('valet')) return <FaParking />;
        if (lower.includes('dining') || lower.includes('restaurant') || lower.includes('breakfast')) return <FaUtensils />;
        if (lower.includes('concierge') || lower.includes('butler')) return <FaConciergeBell />;
        if (lower.includes('airport') || lower.includes('transfer')) return <FaPlane />;
        return <Check />;
    };

    // Loading state
    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50">
                <Navbar forceScrolled={true} />
                <div className="container mx-auto px-4 py-12">
                    <div className="animate-pulse">
                        <div className="h-[400px] bg-gray-200 rounded-2xl mb-8"></div>
                        <div className="h-8 bg-gray-200 rounded w-1/2 mb-4"></div>
                        <div className="h-4 bg-gray-200 rounded w-1/3 mb-8"></div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="h-24 bg-gray-200 rounded"></div>
                            <div className="h-24 bg-gray-200 rounded"></div>
                        </div>
                    </div>
                </div>
                <Footer />
            </div>
        );
    }

    // Error state
    if (error || !hotel) {
        return (
            <div className="min-h-screen bg-gray-50">
                <Navbar forceScrolled={true} />
                <div className="container mx-auto px-4 py-12 text-center">
                    <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <X size={40} className="text-red-500" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-800 mb-2">Hotel Not Found</h2>
                    <p className="text-gray-600 mb-6">{error || 'The hotel you are looking for could not be found.'}</p>
                    <button
                        onClick={() => navigate('/hotels/search')}
                        className="bg-[#055B75] text-white px-6 py-3 rounded-lg hover:bg-[#034457] transition-all"
                    >
                        Browse Hotels
                    </button>
                </div>
                <Footer />
            </div>
        );
    }

    const images = hotel.images || [hotel.image];
    const nights = calculateNights();
    // Total for the mobile sticky bottom bar (matches the sidebar breakdown)
    const mobileSubtotal = (selectedRoom?.price || hotel.price || 0) * nights;
    const mobileTotal = Math.round(
        mobileSubtotal
        + mobileSubtotal * ((rates.taxPercent + rates.serviceFeePercent) / 100)
        + (rates.fixedFeePerNight || 0) * nights
    );

    return (
        <div className="min-h-screen bg-gray-50 pb-24 md:pb-0">
            <Navbar forceScrolled={true} />

            {/* Header: title + location */}
            <div className="container mx-auto px-4 pt-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                        <div className="flex items-center gap-2 mb-1.5">
                            <span className="flex items-center gap-0.5">
                                {[...Array(hotel.stars || 4)].map((_, i) => (
                                    <Star key={i} size={16} className="fill-[#0890BC] text-[#0890BC]" />
                                ))}
                            </span>
                            <span className="text-sm text-gray-500 ml-1">
                                {(hotel.stars || 4) >= 5 ? 'Luxury Resort' : (hotel.stars || 4) >= 4 ? 'Premium Hotel' : 'Hotel'}
                            </span>
                        </div>
                        <h1 className="text-3xl md:text-4xl font-bold text-[#034457] tracking-tight">{hotel.name}</h1>
                        <div className="flex items-center gap-1.5 text-gray-500 text-sm mt-2">
                            <MapPin size={16} className="text-[#0890BC]" />
                            <span>{hotel.location || `${hotel.destinationName}${hotel.country ? ', ' + hotel.country : ''}`}</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                        {hotel.rating != null && (
                            <div className="hidden sm:flex items-center gap-2 mr-1">
                                <div className="text-right">
                                    <div className="text-sm font-semibold text-gray-700">{ratingWord(hotel.rating)}</div>
                                    {hotel.reviews > 0 && <div className="text-xs text-gray-400">{hotel.reviews} ratings</div>}
                                </div>
                                <span className="bg-[#055B75] text-white font-bold px-2.5 py-1 rounded-lg">{hotel.rating}</span>
                            </div>
                        )}
                        <button
                            onClick={() => setIsLiked(!isLiked)}
                            className="p-2.5 rounded-full border border-gray-200 hover:border-[#65B3CF] transition-colors"
                            aria-label="Save"
                        >
                            <Heart size={18} className={isLiked ? 'fill-red-500 text-red-500' : 'text-gray-500'} />
                        </button>
                        <button
                            onClick={() => {
                                if (navigator.share) {
                                    navigator.share({ title: hotel.name, url: window.location.href }).catch(() => {});
                                } else {
                                    navigator.clipboard?.writeText(window.location.href);
                                }
                            }}
                            className="p-2.5 rounded-full border border-gray-200 hover:border-[#65B3CF] transition-colors"
                            aria-label="Share"
                        >
                            <Share2 size={18} className="text-gray-500" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Photo gallery: large image + thumbnail grid */}
            <div className="container mx-auto px-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 rounded-2xl overflow-hidden h-[260px] md:h-[420px]">
                    {/* Large image */}
                    <div className="relative h-full group">
                        <img loading="lazy" decoding="async"
                            src={images[currentImageIndex]}
                            alt={hotel.name}
                            className="w-full h-full object-cover"
                            onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1600&q=80'; }}
                        />
                        {images.length > 1 && (
                            <>
                                <button onClick={prevImage} className="absolute left-3 top-1/2 -translate-y-1/2 bg-white/40 hover:bg-white/70 w-10 h-10 rounded-full flex items-center justify-center text-gray-800 transition-all opacity-0 group-hover:opacity-100">
                                    <ChevronLeft size={22} />
                                </button>
                                <button onClick={nextImage} className="absolute right-3 top-1/2 -translate-y-1/2 bg-white/40 hover:bg-white/70 w-10 h-10 rounded-full flex items-center justify-center text-gray-800 transition-all opacity-0 group-hover:opacity-100">
                                    <ChevronRight size={22} />
                                </button>
                            </>
                        )}
                        <div className="absolute bottom-3 left-3 bg-black/60 text-white text-xs px-2.5 py-1 rounded-full">
                            {images.length} Photos
                        </div>
                    </div>

                    {/* Thumbnail grid (2x2) — hidden on small screens */}
                    <div className="hidden md:grid grid-cols-2 gap-2 h-full">
                        {images.slice(0, 4).map((img, idx) => (
                            <button
                                key={idx}
                                onClick={() => setCurrentImageIndex(idx)}
                                className={`relative h-full overflow-hidden ${idx === currentImageIndex ? 'ring-2 ring-[#055B75]' : ''}`}
                            >
                                <img loading="lazy" decoding="async" src={img} alt="" className="w-full h-full object-cover hover:scale-105 transition-transform duration-500"
                                    onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=1200&q=80'; }} />
                                {idx === 3 && images.length > 4 && (
                                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white font-semibold">
                                        +{images.length - 4} more
                                    </div>
                                )}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Mobile: horizontal thumbnail carousel + view-all button */}
                <div className="md:hidden mt-3">
                    <div className="flex gap-3 overflow-x-auto hide-scrollbar pb-1 snap-x">
                        {images.map((img, idx) => (
                            <button
                                key={idx}
                                onClick={() => setCurrentImageIndex(idx)}
                                className={`w-40 h-28 flex-shrink-0 rounded-xl overflow-hidden snap-start ${idx === currentImageIndex ? 'ring-2 ring-[#055B75]' : 'border border-gray-100'}`}
                            >
                                <img loading="lazy" decoding="async" src={img} alt="" className="w-full h-full object-cover"
                                    onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&w=800&q=70'; }} />
                            </button>
                        ))}
                    </div>
                    <button className="w-full mt-2 bg-white border border-gray-200 px-4 py-2 rounded-lg text-sm font-semibold text-[#055B75] shadow-sm flex items-center justify-center gap-2">
                        View {images.length} Photos
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <div className="container mx-auto px-4 py-8">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left Column - Hotel Details */}
                    <div className="lg:col-span-2 space-y-8">
                        {/* Rating & Reviews */}
                        <div className="bg-white rounded-xl p-6 shadow-sm">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                    <div className="bg-[#055B75] text-white px-4 py-2 rounded-lg font-bold text-xl">
                                        {hotel.rating != null ? hotel.rating : '—'}
                                    </div>
                                    <div>
                                        <div className="font-semibold text-gray-900">{ratingWord(hotel.rating)}</div>
                                        <div className="text-gray-500 text-sm">
                                            {hotel.reviews > 0 ? `${hotel.reviews} reviews` : 'No reviews yet'}
                                        </div>
                                    </div>
                                </div>
                                {hotel.tags && (
                                    <div className="flex gap-2">
                                        {hotel.tags.slice(0, 3).map((tag, idx) => (
                                            <span key={idx} className="bg-[#F0FAFC] text-[#055B75] px-3 py-1 rounded-full text-sm font-medium">
                                                {tag}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Description */}
                        <div className="bg-white rounded-xl p-6 shadow-sm">
                            <h2 className="text-xl font-bold text-gray-900 mb-4">About This Hotel</h2>
                            <p className="text-gray-600 leading-relaxed">{hotel.description}</p>
                        </div>

                        {/* Amenities */}
                        <div className="bg-white rounded-xl p-6 shadow-sm">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-xl font-bold text-gray-900">Amenities</h2>
                                {(hotel.amenities || []).length > 6 && (
                                    <span className="text-sm text-[#0890BC] font-semibold cursor-pointer hover:underline">View All</span>
                                )}
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {(hotel.amenities || []).map((amenity, idx) => (
                                    <div key={idx} className="flex items-center gap-3 text-gray-700">
                                        <div className="w-10 h-10 bg-[#0890BC]/10 rounded-full flex items-center justify-center text-[#0890BC]">
                                            {getAmenityIcon(amenity)}
                                        </div>
                                        <span>{amenity}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Room Types */}
                        <div className="bg-white rounded-xl p-6 shadow-sm">
                            <h2 className="text-xl font-bold text-gray-900 mb-4">Available Rooms</h2>
                            <div className="space-y-4">
                                {(hotel.rooms || []).map((room, idx) => {
                                    const isSelected = selectedRoom?.type === room.type;
                                    const roomImg = (hotel.images && hotel.images[(idx + 1) % hotel.images.length]) || hotel.image;
                                    return (
                                        <div
                                            key={idx}
                                            className={`relative border rounded-xl overflow-hidden transition-all ${isSelected ? 'border-[#055B75] ring-1 ring-[#055B75]' : 'border-gray-200'}`}
                                        >
                                            {idx === 1 && (
                                                <span className="absolute top-3 right-3 z-10 bg-amber-400 text-amber-900 text-[10px] font-bold px-2 py-1 rounded-full tracking-wide">POPULAR</span>
                                            )}
                                            <div className="flex flex-col sm:flex-row">
                                                {/* Room image */}
                                                <div className="sm:w-44 h-40 sm:h-auto flex-shrink-0">
                                                    <img loading="lazy" decoding="async" src={roomImg} alt={room.type}
                                                        className="w-full h-full object-cover"
                                                        onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1618773928121-c32242e63f39?auto=format&fit=crop&w=800&q=70'; }} />
                                                </div>
                                                {/* Room details */}
                                                <div className="flex-1 p-4">
                                                    <h3 className="font-semibold text-gray-900 mb-1">{room.type}</h3>
                                                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 mb-3">
                                                        {room.beds && <span>{room.beds}</span>}
                                                        {room.size && <span>• {room.size}</span>}
                                                        {room.view && <span>• {room.view}</span>}
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 mb-3">
                                                        {(room.amenities || []).slice(0, 4).map((a, i) => (
                                                            <div key={i} className="flex items-center gap-1.5 text-xs text-gray-600">
                                                                <Check size={13} className="text-green-500 flex-shrink-0" /> {a}
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <div className="flex items-end justify-between">
                                                        <div>
                                                            <span className="text-xl font-bold text-gray-900"><Price amount={room.price} /></span>
                                                            <span className="text-gray-500 text-sm"> /night</span>
                                                        </div>
                                                        <button
                                                            onClick={() => setSelectedRoom(room)}
                                                            className={`px-5 py-2 rounded-lg font-semibold text-sm transition-all ${isSelected ? 'bg-[#034457] text-white' : 'bg-[#055B75] text-white hover:bg-[#034457]'}`}
                                                        >
                                                            {isSelected ? (<span className="flex items-center gap-1"><Check size={15} /> Selected</span>) : 'Select'}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Right Column - Booking Card */}
                    <div className="lg:col-span-1">
                        <div className="sticky top-24 space-y-4">
                        <div className="bg-white rounded-xl p-6 shadow-lg border border-gray-100">
                            {/* Price */}
                            <div className="text-center mb-6 pb-6 border-b">
                                <div className="text-gray-500 mb-1">Starting from</div>
                                <div className="text-3xl md:text-4xl font-bold text-gray-900">
                                    <Price amount={selectedRoom?.price || hotel.price} />
                                </div>
                                <div className="text-gray-500">per night</div>
                                {hotel.discount > 0 && (
                                    <div className="mt-2 inline-block bg-red-100 text-red-600 px-3 py-1 rounded-full text-sm font-medium">
                                        {hotel.discount}% OFF
                                    </div>
                                )}
                            </div>

                            {/* Date Selection */}
                            <div className="space-y-4 mb-6">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Check-in</label>
                                    <div className="relative">
                                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                        <input
                                            type="date"
                                            name="checkIn"
                                            value={formData.checkIn}
                                            onChange={handleInputChange}
                                            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#65B3CF] focus:border-[#055B75]"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Check-out</label>
                                    <div className="relative">
                                        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                        <input
                                            type="date"
                                            name="checkOut"
                                            value={formData.checkOut}
                                            onChange={handleInputChange}
                                            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#65B3CF] focus:border-[#055B75]"
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Guests</label>
                                    <div className="relative">
                                        <Users className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                        <select
                                            name="guests"
                                            value={formData.guests}
                                            onChange={handleInputChange}
                                            className="w-full pl-10 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#65B3CF] focus:border-[#055B75] appearance-none"
                                        >
                                            {[1, 2, 3, 4, 5, 6].map(n => (
                                                <option key={n} value={n}>{n} Guest{n > 1 ? 's' : ''}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Price Breakdown — itemized to match checkout exactly */}
                            {selectedRoom && formData.checkIn && formData.checkOut && (() => {
                                const subtotal = selectedRoom.price * nights;
                                const taxes = Math.round(subtotal * (rates.taxPercent / 100));
                                const serviceFee = Math.round(subtotal * (rates.serviceFeePercent / 100));
                                const fixedFees = Math.round((rates.fixedFeePerNight || 0) * nights);
                                const total = subtotal + taxes + serviceFee + fixedFees;
                                return (
                                    <div className="bg-gray-50 rounded-lg p-4 mb-6">
                                        <div className="flex justify-between mb-2">
                                            <span className="text-gray-600">
                                                <Price amount={selectedRoom.price} /> × {nights} night{nights > 1 ? 's' : ''}
                                            </span>
                                            <span className="font-medium">
                                                <Price amount={subtotal} />
                                            </span>
                                        </div>
                                        <div className="flex justify-between mb-2">
                                            <span className="text-gray-600">Taxes ({rates.taxPercent}%)</span>
                                            <span className="font-medium">
                                                <Price amount={taxes} />
                                            </span>
                                        </div>
                                        <div className="flex justify-between mb-2">
                                            <span className="text-gray-600">Service fee ({rates.serviceFeePercent}%)</span>
                                            <span className="font-medium">
                                                <Price amount={serviceFee} />
                                            </span>
                                        </div>
                                        {fixedFees > 0 && (
                                            <div className="flex justify-between mb-2">
                                                <span className="text-gray-600">Resort &amp; city fees</span>
                                                <span className="font-medium">
                                                    <Price amount={fixedFees} />
                                                </span>
                                            </div>
                                        )}
                                        <div className="border-t pt-2 mt-2 flex justify-between">
                                            <span className="font-bold text-gray-900">Total</span>
                                            <span className="font-bold text-[#055B75]">
                                                <Price amount={total} />
                                            </span>
                                        </div>
                                        <p className="text-xs text-gray-400 mt-2">
                                            Final price confirmed at checkout. Taxes &amp; fees are estimates.
                                        </p>
                                    </div>
                                );
                            })()}

                            {/* Action Buttons */}
                            <div className="space-y-3">
                                <button
                                    onClick={handleBookNow}
                                    className="w-full bg-[#055B75] text-white py-3 rounded-xl font-bold hover:bg-[#034457] transition-all"
                                >
                                    Book Now
                                </button>
                                <button
                                    onClick={() => setShowQuoteModal(true)}
                                    className="w-full border-2 border-[#055B75] text-[#055B75] py-3 rounded-xl font-bold hover:bg-[#F0FAFC] transition-all"
                                >
                                    Request Quote
                                </button>
                            </div>
                            <p className="text-center text-[11px] text-gray-400 mt-4 px-2">
                                You won't be charged yet. Flexible cancellation available up to 48 hours before check-in.
                            </p>
                        </div>

                        {/* Rating card */}
                        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex items-center gap-3">
                            <span className="bg-[#055B75] text-white font-bold px-3 py-2 rounded-lg text-lg">
                                {hotel.rating != null ? hotel.rating : '—'}
                            </span>
                            <div className="flex-1">
                                <div className="font-semibold text-gray-900">{ratingWord(hotel.rating)}</div>
                                <div className="text-xs text-gray-400">
                                    {hotel.reviews > 0 ? `${hotel.reviews} verified ratings` : 'No ratings yet'}
                                </div>
                            </div>
                            <span className="text-sm text-[#0890BC] font-semibold cursor-pointer hover:text-[#034457]">All reviews</span>
                        </div>

                        {/* Location / map card */}
                        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                            <div
                                className="relative h-32 flex items-center justify-center"
                                style={{
                                    background:
                                        'linear-gradient(135deg, #E3F1F6 0%, #D1E9F0 100%)',
                                    backgroundImage:
                                        "url('https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=600&q=60')",
                                    backgroundSize: 'cover',
                                    backgroundPosition: 'center',
                                }}
                            >
                                <div className="absolute inset-0 bg-white/30" />
                                <a
                                    href={
                                        hotel.geoCode?.latitude && hotel.geoCode?.longitude
                                            ? `https://www.google.com/maps/search/?api=1&query=${hotel.geoCode.latitude},${hotel.geoCode.longitude}`
                                            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((hotel.name || '') + ' ' + (hotel.location || ''))}`
                                    }
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="relative bg-white shadow px-4 py-2 rounded-full text-sm font-semibold text-[#055B75] hover:bg-[#F0FAFC] inline-flex items-center gap-2"
                                >
                                    <MapPin size={16} /> Show on map
                                </a>
                            </div>
                            <div className="p-3 flex items-center gap-1.5 text-sm text-gray-700">
                                <MapPin size={14} className="text-[#65B3CF]" />
                                <span className="line-clamp-1">{hotel.location || hotel.destinationName || 'Location available on map'}</span>
                            </div>
                        </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Mobile sticky bottom bar */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-[0_-4px_20px_rgba(3,68,87,0.08)] p-4 z-40">
                <div className="flex justify-between items-center">
                    <div className="flex flex-col">
                        <span className="text-xs text-gray-400">Total</span>
                        <span className="text-lg font-bold text-[#034457]"><Price amount={mobileTotal} /></span>
                    </div>
                    <button
                        onClick={handleBookNow}
                        className="bg-[#055B75] text-white px-8 py-3 rounded-xl font-bold hover:bg-[#034457] transition-all"
                    >
                        Book Now
                    </button>
                </div>
            </div>

            {/* Quote Modal */}
            {showQuoteModal && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl max-w-md w-full overflow-hidden shadow-2xl">
                        <div className="bg-gradient-to-r from-[#055B75] to-[#034457] p-6 relative">
                            <button
                                onClick={() => setShowQuoteModal(false)}
                                className="absolute top-4 right-4 text-white/80 hover:text-white"
                            >
                                <X size={24} />
                            </button>
                            <h3 className="text-xl font-bold text-white">Get a Quote</h3>
                            <p className="text-white/80 text-sm mt-1">{hotel.name}</p>
                        </div>

                        {formSuccess ? (
                            <div className="p-8 text-center">
                                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <Check size={32} className="text-green-500" />
                                </div>
                                <h4 className="text-xl font-bold text-gray-900 mb-2">Quote Requested!</h4>
                                <p className="text-gray-600">We'll get back to you within 24 hours.</p>
                            </div>
                        ) : (
                            <form onSubmit={handleQuoteSubmit} className="p-6 space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                                    <input
                                        type="text"
                                        name="name"
                                        value={formData.name}
                                        onChange={handleInputChange}
                                        required
                                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#65B3CF]"
                                        placeholder="John Smith"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                                    <input
                                        type="email"
                                        name="email"
                                        value={formData.email}
                                        onChange={handleInputChange}
                                        required
                                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#65B3CF]"
                                        placeholder="john@example.com"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                                    <input
                                        type="tel"
                                        name="phone"
                                        value={formData.phone}
                                        onChange={handleInputChange}
                                        required
                                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#65B3CF]"
                                        placeholder="+1 234 567 8900"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">Special Requests</label>
                                    <textarea
                                        name="specialRequests"
                                        value={formData.specialRequests}
                                        onChange={handleInputChange}
                                        rows={3}
                                        className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#65B3CF] resize-none"
                                        placeholder="Any special requirements..."
                                    />
                                </div>
                                <button
                                    type="submit"
                                    disabled={formSubmitting}
                                    className="w-full bg-[#055B75] text-white py-3 rounded-xl font-bold hover:bg-[#034457] transition-all disabled:opacity-50"
                                >
                                    {formSubmitting ? 'Submitting...' : 'Submit Request'}
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            )}

            <Footer />
        </div>
    );
};

export default withPageElements(HotelDetailsPage);
