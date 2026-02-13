import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { MapPin, Star, Calendar, Users, ChevronLeft, ChevronRight, X, Wifi, Coffee, Car, Dumbbell, Bath, Check, Phone, Mail, Clock, Shield, Award, Heart } from 'lucide-react';
import { FaSwimmingPool, FaConciergeBell, FaUtensils, FaSpa, FaParking, FaWifi, FaPlane } from 'react-icons/fa';
import Navbar from '../Navbar';
import Footer from '../Footer';
import withPageElements from '../PageWrapper';
import hotelService from '../../../Services/HotelService';
import currencyService from '../../../Services/CurrencyService';
import Price from '../../../Components/Price';
import { useSupabaseAuth } from '../../../contexts/SupabaseAuthContext';

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

    // Fetch hotel details
    useEffect(() => {
        const fetchHotel = async () => {
            if (!hotelId) {
                setError('No hotel ID provided');
                setLoading(false);
                return;
            }

            setLoading(true);
            try {
                // For Amadeus hotels, pass dates and adults so backend can fetch real offers
                const effectiveCheckIn = checkInDate || getDefaultCheckIn();
                const effectiveCheckOut = checkOutDate || getDefaultCheckOut();

                const hotelData = await hotelService.getHotelById(
                    hotelId,
                    effectiveCheckIn,
                    effectiveCheckOut,
                    adultsParam
                );
                if (hotelData) {
                    setHotel(hotelData);
                    // If there are rooms, select the first one by default
                    if (hotelData.rooms && hotelData.rooms.length > 0) {
                        setSelectedRoom(hotelData.rooms[0]);
                    }
                } else {
                    setError('Hotel not found');
                }
            } catch (err) {
                console.error('Error fetching hotel:', err);
                setError('Failed to load hotel details');
            } finally {
                setLoading(false);
            }
        };

        fetchHotel();
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

    return (
        <div className="min-h-screen bg-gray-50">
            <Navbar forceScrolled={true} />

            {/* Hero Image Gallery */}
            <div className="relative h-[300px] md:h-[450px] overflow-hidden group">
                <img
                    src={images[currentImageIndex]}
                    alt={hotel.name}
                    className="w-full h-full object-cover transition-transform duration-700"
                    onError={(e) => {
                        e.target.src = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1600&q=80';
                    }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent"></div>

                {/* Navigation Arrows */}
                {images.length > 1 && (
                    <>
                        <button
                            onClick={prevImage}
                            className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/30 hover:bg-white/50 w-12 h-12 rounded-full flex items-center justify-center text-white transition-all opacity-0 group-hover:opacity-100"
                        >
                            <ChevronLeft size={28} />
                        </button>
                        <button
                            onClick={nextImage}
                            className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/30 hover:bg-white/50 w-12 h-12 rounded-full flex items-center justify-center text-white transition-all opacity-0 group-hover:opacity-100"
                        >
                            <ChevronRight size={28} />
                        </button>
                    </>
                )}

                {/* Like Button */}
                <button
                    onClick={() => setIsLiked(!isLiked)}
                    className="absolute top-4 right-4 p-3 rounded-full bg-white/20 backdrop-blur-sm hover:bg-white/40 transition-all"
                >
                    <Heart size={24} className={`${isLiked ? 'fill-red-500 text-red-500' : 'text-white'}`} />
                </button>

                {/* Image Indicators */}
                {images.length > 1 && (
                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
                        {images.map((_, idx) => (
                            <button
                                key={idx}
                                onClick={() => setCurrentImageIndex(idx)}
                                className={`w-2 h-2 rounded-full transition-all ${idx === currentImageIndex ? 'bg-white w-8' : 'bg-white/50'
                                    }`}
                            />
                        ))}
                    </div>
                )}

                {/* Hotel Title Overlay */}
                <div className="absolute bottom-0 left-0 right-0 p-6 md:p-8">
                    <div className="container mx-auto">
                        <div className="flex items-center gap-2 mb-2">
                            {[...Array(hotel.stars || 5)].map((_, i) => (
                                <Star key={i} size={16} className="fill-yellow-400 text-yellow-400" />
                            ))}
                        </div>
                        <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">{hotel.name}</h1>
                        <div className="flex items-center gap-2 text-white/90">
                            <MapPin size={18} />
                            <span>{hotel.location || `${hotel.destinationName}, ${hotel.country}`}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Thumbnail Gallery */}
            {images.length > 1 && (
                <div className="container mx-auto px-4 py-4">
                    <div className="flex gap-2 overflow-x-auto pb-2">
                        {images.map((img, idx) => (
                            <button
                                key={idx}
                                onClick={() => setCurrentImageIndex(idx)}
                                className={`flex-shrink-0 w-20 h-16 rounded-lg overflow-hidden ${idx === currentImageIndex ? 'ring-2 ring-[#055B75]' : ''
                                    }`}
                            >
                                <img src={img} alt="" className="w-full h-full object-cover" />
                            </button>
                        ))}
                    </div>
                </div>
            )}

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
                                        {hotel.rating}
                                    </div>
                                    <div>
                                        <div className="font-semibold text-gray-900">Excellent</div>
                                        <div className="text-gray-500 text-sm">{hotel.reviews} reviews</div>
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
                            <h2 className="text-xl font-bold text-gray-900 mb-4">Amenities</h2>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                                {(hotel.amenities || []).map((amenity, idx) => (
                                    <div key={idx} className="flex items-center gap-3 text-gray-700">
                                        <div className="w-10 h-10 bg-[#F0FAFC] rounded-lg flex items-center justify-center text-[#055B75]">
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
                                {(hotel.rooms || []).map((room, idx) => (
                                    <div
                                        key={idx}
                                        onClick={() => setSelectedRoom(room)}
                                        className={`border rounded-xl p-4 cursor-pointer transition-all ${selectedRoom?.type === room.type
                                            ? 'border-[#055B75] bg-[#F0FAFC]'
                                            : 'border-gray-200 hover:border-[#65B3CF]'
                                            }`}
                                    >
                                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                            <div className="flex-1">
                                                <h3 className="font-semibold text-gray-900 mb-1">{room.type}</h3>
                                                <div className="flex flex-wrap gap-3 text-sm text-gray-500">
                                                    <span>{room.beds}</span>
                                                    <span>•</span>
                                                    <span>{room.size}</span>
                                                    <span>•</span>
                                                    <span>{room.view}</span>
                                                </div>
                                                <div className="flex flex-wrap gap-2 mt-2">
                                                    {(room.amenities || []).map((a, i) => (
                                                        <span key={i} className="text-xs bg-gray-100 px-2 py-1 rounded">
                                                            {a}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-2xl font-bold text-gray-900">
                                                    <Price amount={room.price} />
                                                </div>
                                                <div className="text-gray-500 text-sm">per night</div>
                                                {selectedRoom?.type === room.type && (
                                                    <div className="mt-2 text-[#055B75] font-medium flex items-center gap-1 justify-end">
                                                        <Check size={16} /> Selected
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Why Book With Us */}
                        <div className="bg-white rounded-xl p-6 shadow-sm">
                            <h2 className="text-xl font-bold text-gray-900 mb-4">Why Book With Us</h2>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {[
                                    { icon: Shield, title: 'Secure Booking', desc: 'Safe & encrypted payments' },
                                    { icon: Award, title: 'Best Price', desc: 'Price match guarantee' },
                                    { icon: Clock, title: '24/7 Support', desc: 'Always here to help' }
                                ].map((item, idx) => (
                                    <div key={idx} className="text-center p-4">
                                        <div className="w-12 h-12 bg-[#055B75] rounded-xl mx-auto mb-3 flex items-center justify-center">
                                            <item.icon className="text-white" size={24} />
                                        </div>
                                        <h3 className="font-semibold text-gray-900">{item.title}</h3>
                                        <p className="text-gray-500 text-sm">{item.desc}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Right Column - Booking Card */}
                    <div className="lg:col-span-1">
                        <div className="sticky top-24 bg-white rounded-xl p-6 shadow-lg border border-gray-100">
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

                            {/* Price Breakdown */}
                            {selectedRoom && formData.checkIn && formData.checkOut && (
                                <div className="bg-gray-50 rounded-lg p-4 mb-6">
                                    <div className="flex justify-between mb-2">
                                        <span className="text-gray-600">
                                            <Price amount={selectedRoom.price} /> × {nights} night{nights > 1 ? 's' : ''}
                                        </span>
                                        <span className="font-medium">
                                            <Price amount={selectedRoom.price * nights} />
                                        </span>
                                    </div>
                                    <div className="flex justify-between mb-2">
                                        <span className="text-gray-600">Taxes & fees</span>
                                        <span className="font-medium">
                                            <Price amount={Math.round(selectedRoom.price * nights * 0.12)} />
                                        </span>
                                    </div>
                                    <div className="border-t pt-2 mt-2 flex justify-between">
                                        <span className="font-bold text-gray-900">Total</span>
                                        <span className="font-bold text-gray-900">
                                            <Price amount={Math.round(selectedRoom.price * nights * 1.12)} />
                                        </span>
                                    </div>
                                </div>
                            )}

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
                        </div>
                    </div>
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
