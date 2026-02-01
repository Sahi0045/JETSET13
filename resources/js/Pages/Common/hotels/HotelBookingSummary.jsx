import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Calendar, Users, MapPin, CreditCard, User, Mail, Phone, Check, Shield, ChevronLeft, Clock, AlertCircle, Lock } from 'lucide-react';
import axios from 'axios';
import Navbar from '../Navbar';
import Footer from '../Footer';
import withPageElements from '../PageWrapper';
import hotelService from '../../../Services/HotelService';
import currencyService from '../../../Services/CurrencyService';
import Price from '../../../Components/Price';
import ArcPayService from '../../../Services/ArcPayService';

const HotelBookingSummary = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const searchParams = new URLSearchParams(location.search);

    // Get booking details from URL
    const hotelId = searchParams.get('hotelId');
    const roomType = searchParams.get('roomType');
    const checkIn = searchParams.get('checkIn');
    const checkOut = searchParams.get('checkOut');
    const guests = parseInt(searchParams.get('guests')) || 2;
    const pricePerNight = parseFloat(searchParams.get('price')) || 0;
    const nights = parseInt(searchParams.get('nights')) || 1;

    // State
    const [hotel, setHotel] = useState(null);
    const [loading, setLoading] = useState(true);
    const [step, setStep] = useState(1); // 1: Guest Info, 2: Payment, 3: Confirmation
    const [formSubmitting, setFormSubmitting] = useState(false);
    const [bookingComplete, setBookingComplete] = useState(false);
    const [bookingReference, setBookingReference] = useState('');

    const [guestInfo, setGuestInfo] = useState({
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        nationality: '',
        specialRequests: ''
    });

    const [paymentInfo, setPaymentInfo] = useState({
        cardNumber: '',
        cardName: '',
        expiry: '',
        cvv: '',
        billingAddress: ''
    });

    const [errors, setErrors] = useState({});

    // Fetch hotel details
    useEffect(() => {
        const fetchHotel = async () => {
            if (!hotelId) {
                setLoading(false);
                return;
            }

            try {
                const hotelData = await hotelService.getHotelById(hotelId);
                setHotel(hotelData);
            } catch (err) {
                console.error('Error fetching hotel:', err);
            } finally {
                setLoading(false);
            }
        };

        fetchHotel();
    }, [hotelId]);

    // Calculate prices
    const API_BASE_URL = window.location.hostname.includes('jetsetterss.com') || window.location.hostname.includes('vercel.app')
        ? 'https://www.jetsetterss.com/api'
        : '/api';

    const subtotal = pricePerNight * nights;
    const taxes = Math.round(subtotal * 0.12);
    const serviceFee = Math.round(subtotal * 0.05);
    const total = subtotal + taxes + serviceFee;

    // Handle guest info change
    const handleGuestChange = (e) => {
        const { name, value } = e.target;
        setGuestInfo(prev => ({ ...prev, [name]: value }));
        // Clear error when user types
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: null }));
        }
    };

    // Handle payment info change
    const handlePaymentChange = (e) => {
        const { name, value } = e.target;
        setPaymentInfo(prev => ({ ...prev, [name]: value }));
        if (errors[name]) {
            setErrors(prev => ({ ...prev, [name]: null }));
        }
    };

    // Validate guest info
    const validateGuestInfo = () => {
        const newErrors = {};
        if (!guestInfo.firstName.trim()) newErrors.firstName = 'First name is required';
        if (!guestInfo.lastName.trim()) newErrors.lastName = 'Last name is required';
        if (!guestInfo.email.trim()) newErrors.email = 'Email is required';
        else if (!/\S+@\S+\.\S+/.test(guestInfo.email)) newErrors.email = 'Invalid email format';
        if (!guestInfo.phone.trim()) newErrors.phone = 'Phone number is required';

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    // Validate payment info
    const validatePaymentInfo = () => {
        const newErrors = {};
        if (!paymentInfo.cardNumber.trim()) newErrors.cardNumber = 'Card number is required';
        else if (paymentInfo.cardNumber.replace(/\s/g, '').length < 16) newErrors.cardNumber = 'Invalid card number';
        if (!paymentInfo.cardName.trim()) newErrors.cardName = 'Name on card is required';
        if (!paymentInfo.expiry.trim()) newErrors.expiry = 'Expiry date is required';
        if (!paymentInfo.cvv.trim()) newErrors.cvv = 'CVV is required';
        else if (paymentInfo.cvv.length < 3) newErrors.cvv = 'Invalid CVV';

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    // Handle next step
    const handleNextStep = () => {
        if (step === 1 && validateGuestInfo()) {
            setStep(2);
        }
    };

    // Handle booking submission - Redirect to ArcPay gateway
    const handleSubmitBooking = async () => {
        if (!validatePaymentInfo()) return;

        setFormSubmitting(true);

        try {
            console.log('🔍 Checking ArcPay Gateway status...');
            const gatewayStatus = await ArcPayService.checkGatewayStatus();

            if (!gatewayStatus.success || !gatewayStatus.gatewayOperational) {
                console.warn('Gateway status check failed:', gatewayStatus);
                throw new Error('Payment gateway is currently unavailable. Please try again later.');
            }

            // Store booking data in localStorage before redirect
            const bookingData = {
                hotelId,
                roomType,
                checkInDate: checkIn,
                checkOutDate: checkOut,
                nights,
                guests,
                pricePerNight,
                subtotal,
                taxes,
                serviceFee,
                totalPrice: total,
                guestInfo,
                hotel: {
                    name: hotel.name,
                    location: hotel.location || hotel.destinationName,
                    image: hotel.image
                }
            };
            localStorage.setItem('pendingHotelBooking', JSON.stringify(bookingData));

            // Create hosted checkout session
            // ARC Pay requires order IDs: alphanumeric, 11-40 characters
            const orderId = `HTL${Date.now().toString(36).toUpperCase()}`;
            console.log('🚀 Creating ArcPay hosted checkout session...');

            const checkoutResponse = await ArcPayService.createHostedCheckout({
                amount: total,
                currency: 'USD',
                orderId: orderId,
                bookingType: 'hotel',
                customerEmail: guestInfo.email || 'customer@jetsetgo.com',
                customerName: `${guestInfo.firstName} ${guestInfo.lastName}`,
                customerPhone: guestInfo.phone,
                description: `Hotel Booking - ${hotel.name} (${nights} night${nights > 1 ? 's' : ''})`,
                returnUrl: `${window.location.origin}/payment/callback?orderId=${orderId}&bookingType=hotel`,
                cancelUrl: `${window.location.origin}/hotels/booking-summary${location.search}`,
                bookingData: bookingData
            });

            if (!checkoutResponse.success || !checkoutResponse.checkoutUrl) {
                throw new Error(checkoutResponse.error?.error || 'Failed to create checkout session');
            }

            console.log('✅ Hosted checkout session created:', checkoutResponse.sessionId);
            console.log('🔗 Redirecting to ArcPay payment page:', checkoutResponse.checkoutUrl);

            // Store session info for verification after payment
            localStorage.setItem('pendingPaymentSession', JSON.stringify({
                sessionId: checkoutResponse.sessionId,
                orderId: orderId,
                bookingType: 'hotel',
                amount: total
            }));

            // Redirect to ArcPay hosted payment page
            window.location.href = checkoutResponse.checkoutUrl;

        } catch (error) {
            console.error('❌ Payment processing error:', error);
            
            let errorMessage = 'Payment processing failed. Please try again.';
            if (error.message.includes('gateway')) {
                errorMessage = 'Payment gateway is temporarily unavailable. Please try again in a few minutes.';
            } else if (error.message.includes('network') || error.message.includes('timeout')) {
                errorMessage = 'Network connection issue. Please check your internet connection and try again.';
            }

            alert(`Payment failed: ${errorMessage}`);
        } finally {
            setFormSubmitting(false);
        }
    };

    // Format date for display
    const formatDate = (dateStr) => {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    };

    // Loading state
    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50">
                <Navbar forceScrolled={true} />
                <div className="container mx-auto px-4 py-12">
                    <div className="animate-pulse max-w-4xl mx-auto">
                        <div className="h-8 bg-gray-200 rounded w-1/2 mb-8"></div>
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            <div className="lg:col-span-2">
                                <div className="bg-white rounded-xl p-6 h-64"></div>
                            </div>
                            <div className="bg-white rounded-xl p-6 h-96"></div>
                        </div>
                    </div>
                </div>
                <Footer />
            </div>
        );
    }

    // Error state
    if (!hotelId || !hotel) {
        return (
            <div className="min-h-screen bg-gray-50">
                <Navbar forceScrolled={true} />
                <div className="container mx-auto px-4 py-12 text-center">
                    <div className="w-24 h-24 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <AlertCircle size={40} className="text-yellow-500" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-800 mb-2">Booking Information Missing</h2>
                    <p className="text-gray-600 mb-6">Please select a hotel and room before proceeding to booking.</p>
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

    return (
        <div className="min-h-screen bg-gray-50">
            <Navbar forceScrolled={true} />

            <div className="container mx-auto px-4 py-8">
                {/* Back Button */}
                <button
                    onClick={() => step === 1 ? navigate(-1) : setStep(step - 1)}
                    className="flex items-center gap-2 text-[#055B75] hover:text-[#034457] mb-6"
                >
                    <ChevronLeft size={20} />
                    <span>{step === 1 ? 'Back to Hotel' : 'Back'}</span>
                </button>

                {/* Progress Steps */}
                <div className="max-w-2xl mx-auto mb-8">
                    <div className="flex items-center justify-between">
                        {['Guest Details', 'Payment', 'Confirmation'].map((label, idx) => (
                            <div key={idx} className="flex-1 relative">
                                <div className="flex flex-col items-center">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold ${step > idx + 1 ? 'bg-green-500 text-white' :
                                            step === idx + 1 ? 'bg-[#055B75] text-white' :
                                                'bg-gray-200 text-gray-500'
                                        }`}>
                                        {step > idx + 1 ? <Check size={20} /> : idx + 1}
                                    </div>
                                    <span className={`mt-2 text-sm ${step === idx + 1 ? 'text-[#055B75] font-medium' : 'text-gray-500'}`}>
                                        {label}
                                    </span>
                                </div>
                                {idx < 2 && (
                                    <div className={`absolute top-5 left-1/2 w-full h-0.5 ${step > idx + 1 ? 'bg-green-500' : 'bg-gray-200'
                                        }`} />
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 max-w-6xl mx-auto">
                    {/* Main Content */}
                    <div className="lg:col-span-2">
                        {/* Booking Confirmation */}
                        {step === 3 && bookingComplete && (
                            <div className="bg-white rounded-xl p-8 shadow-sm text-center">
                                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                                    <Check size={40} className="text-green-500" />
                                </div>
                                <h2 className="text-2xl font-bold text-gray-900 mb-2">Booking Confirmed!</h2>
                                <p className="text-gray-600 mb-6">Your reservation has been successfully made.</p>

                                <div className="bg-[#F0FAFC] rounded-xl p-6 mb-6">
                                    <div className="text-sm text-gray-500 mb-1">Booking Reference</div>
                                    <div className="text-2xl font-bold text-[#055B75]">{bookingReference}</div>
                                </div>

                                <div className="text-left space-y-4 border-t pt-6">
                                    <h3 className="font-semibold text-gray-900">Booking Details</h3>
                                    <div className="grid grid-cols-2 gap-4 text-sm">
                                        <div>
                                            <div className="text-gray-500">Guest Name</div>
                                            <div className="font-medium">{guestInfo.firstName} {guestInfo.lastName}</div>
                                        </div>
                                        <div>
                                            <div className="text-gray-500">Email</div>
                                            <div className="font-medium">{guestInfo.email}</div>
                                        </div>
                                        <div>
                                            <div className="text-gray-500">Check-in</div>
                                            <div className="font-medium">{formatDate(checkIn)}</div>
                                        </div>
                                        <div>
                                            <div className="text-gray-500">Check-out</div>
                                            <div className="font-medium">{formatDate(checkOut)}</div>
                                        </div>
                                    </div>
                                </div>

                                <p className="text-gray-500 text-sm mt-6">
                                    A confirmation email has been sent to {guestInfo.email}
                                </p>

                                <div className="flex gap-4 mt-8">
                                    <button
                                        onClick={() => navigate('/hotels')}
                                        className="flex-1 border-2 border-[#055B75] text-[#055B75] py-3 rounded-xl font-bold hover:bg-[#F0FAFC]"
                                    >
                                        Browse More Hotels
                                    </button>
                                    <button
                                        onClick={() => window.print()}
                                        className="flex-1 bg-[#055B75] text-white py-3 rounded-xl font-bold hover:bg-[#034457]"
                                    >
                                        Print Confirmation
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Guest Information Form */}
                        {step === 1 && (
                            <div className="bg-white rounded-xl p-6 shadow-sm">
                                <h2 className="text-xl font-bold text-gray-900 mb-6">Guest Information</h2>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">First Name *</label>
                                        <div className="relative">
                                            <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                            <input
                                                type="text"
                                                name="firstName"
                                                value={guestInfo.firstName}
                                                onChange={handleGuestChange}
                                                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-[#65B3CF] ${errors.firstName ? 'border-red-500' : 'border-gray-200'
                                                    }`}
                                                placeholder="John"
                                            />
                                        </div>
                                        {errors.firstName && <p className="text-red-500 text-sm mt-1">{errors.firstName}</p>}
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Last Name *</label>
                                        <div className="relative">
                                            <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                            <input
                                                type="text"
                                                name="lastName"
                                                value={guestInfo.lastName}
                                                onChange={handleGuestChange}
                                                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-[#65B3CF] ${errors.lastName ? 'border-red-500' : 'border-gray-200'
                                                    }`}
                                                placeholder="Smith"
                                            />
                                        </div>
                                        {errors.lastName && <p className="text-red-500 text-sm mt-1">{errors.lastName}</p>}
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                                        <div className="relative">
                                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                            <input
                                                type="email"
                                                name="email"
                                                value={guestInfo.email}
                                                onChange={handleGuestChange}
                                                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-[#65B3CF] ${errors.email ? 'border-red-500' : 'border-gray-200'
                                                    }`}
                                                placeholder="john@example.com"
                                            />
                                        </div>
                                        {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email}</p>}
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Phone *</label>
                                        <div className="relative">
                                            <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                            <input
                                                type="tel"
                                                name="phone"
                                                value={guestInfo.phone}
                                                onChange={handleGuestChange}
                                                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-[#65B3CF] ${errors.phone ? 'border-red-500' : 'border-gray-200'
                                                    }`}
                                                placeholder="+1 234 567 8900"
                                            />
                                        </div>
                                        {errors.phone && <p className="text-red-500 text-sm mt-1">{errors.phone}</p>}
                                    </div>

                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Nationality</label>
                                        <select
                                            name="nationality"
                                            value={guestInfo.nationality}
                                            onChange={handleGuestChange}
                                            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#65B3CF]"
                                        >
                                            <option value="">Select nationality</option>
                                            <option value="US">United States</option>
                                            <option value="UK">United Kingdom</option>
                                            <option value="IN">India</option>
                                            <option value="AE">UAE</option>
                                            <option value="OTHER">Other</option>
                                        </select>
                                    </div>

                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Special Requests</label>
                                        <textarea
                                            name="specialRequests"
                                            value={guestInfo.specialRequests}
                                            onChange={handleGuestChange}
                                            rows={3}
                                            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#65B3CF] resize-none"
                                            placeholder="Any special requirements or preferences..."
                                        />
                                    </div>
                                </div>

                                <button
                                    onClick={handleNextStep}
                                    className="w-full mt-6 bg-[#055B75] text-white py-3 rounded-xl font-bold hover:bg-[#034457] transition-all"
                                >
                                    Continue to Payment
                                </button>
                            </div>
                        )}

                        {/* Payment Form */}
                        {step === 2 && (
                            <div className="bg-white rounded-xl p-6 shadow-sm">
                                <h2 className="text-xl font-bold text-gray-900 mb-6">Payment Details</h2>

                                {/* Payment Methods */}
                                <div className="flex gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
                                    {['Visa', 'Mastercard', 'Amex', 'PayPal'].map((method) => (
                                        <div key={method} className="text-sm font-medium text-gray-600">{method}</div>
                                    ))}
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Card Number *</label>
                                        <div className="relative">
                                            <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                                            <input
                                                type="text"
                                                name="cardNumber"
                                                value={paymentInfo.cardNumber}
                                                onChange={(e) => {
                                                    const value = e.target.value.replace(/\D/g, '').replace(/(.{4})/g, '$1 ').trim();
                                                    handlePaymentChange({ target: { name: 'cardNumber', value: value.substring(0, 19) } });
                                                }}
                                                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-[#65B3CF] ${errors.cardNumber ? 'border-red-500' : 'border-gray-200'
                                                    }`}
                                                placeholder="1234 5678 9012 3456"
                                            />
                                        </div>
                                        {errors.cardNumber && <p className="text-red-500 text-sm mt-1">{errors.cardNumber}</p>}
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Name on Card *</label>
                                        <input
                                            type="text"
                                            name="cardName"
                                            value={paymentInfo.cardName}
                                            onChange={handlePaymentChange}
                                            className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-[#65B3CF] ${errors.cardName ? 'border-red-500' : 'border-gray-200'
                                                }`}
                                            placeholder="JOHN SMITH"
                                        />
                                        {errors.cardName && <p className="text-red-500 text-sm mt-1">{errors.cardName}</p>}
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date *</label>
                                            <input
                                                type="text"
                                                name="expiry"
                                                value={paymentInfo.expiry}
                                                onChange={(e) => {
                                                    let value = e.target.value.replace(/\D/g, '');
                                                    if (value.length >= 2) value = value.substring(0, 2) + '/' + value.substring(2, 4);
                                                    handlePaymentChange({ target: { name: 'expiry', value } });
                                                }}
                                                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-[#65B3CF] ${errors.expiry ? 'border-red-500' : 'border-gray-200'
                                                    }`}
                                                placeholder="MM/YY"
                                                maxLength={5}
                                            />
                                            {errors.expiry && <p className="text-red-500 text-sm mt-1">{errors.expiry}</p>}
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium text-gray-700 mb-1">CVV *</label>
                                            <input
                                                type="password"
                                                name="cvv"
                                                value={paymentInfo.cvv}
                                                onChange={(e) => {
                                                    const value = e.target.value.replace(/\D/g, '').substring(0, 4);
                                                    handlePaymentChange({ target: { name: 'cvv', value } });
                                                }}
                                                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-[#65B3CF] ${errors.cvv ? 'border-red-500' : 'border-gray-200'
                                                    }`}
                                                placeholder="•••"
                                            />
                                            {errors.cvv && <p className="text-red-500 text-sm mt-1">{errors.cvv}</p>}
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">Billing Address</label>
                                        <input
                                            type="text"
                                            name="billingAddress"
                                            value={paymentInfo.billingAddress}
                                            onChange={handlePaymentChange}
                                            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#65B3CF]"
                                            placeholder="123 Main Street, City, Country"
                                        />
                                    </div>
                                </div>

                                {/* Security Notice */}
                                <div className="flex items-center gap-2 mt-6 p-4 bg-green-50 rounded-lg text-green-700">
                                    <Shield size={20} />
                                    <span className="text-sm">Your payment information is encrypted and secure</span>
                                </div>

                                <button
                                    onClick={handleSubmitBooking}
                                    disabled={formSubmitting}
                                    className="w-full mt-6 bg-[#055B75] text-white py-3 rounded-xl font-bold hover:bg-[#034457] transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {formSubmitting ? (
                                        <span className="flex items-center justify-center gap-2">
                                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                            Redirecting to Payment...
                                        </span>
                                    ) : (
                                        <>
                                            <Lock size={20} />
                                            Proceed to Secure Payment - ${total.toLocaleString()}
                                        </>
                                    )}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Booking Summary Sidebar */}
                    <div className="lg:col-span-1">
                        <div className="sticky top-24 bg-white rounded-xl p-6 shadow-sm border border-gray-100">
                            {/* Hotel Image */}
                            <div className="relative h-40 rounded-lg overflow-hidden mb-4">
                                <img
                                    src={hotel.image}
                                    alt={hotel.name}
                                    className="w-full h-full object-cover"
                                    onError={(e) => {
                                        e.target.src = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1600&q=80';
                                    }}
                                />
                            </div>

                            {/* Hotel Info */}
                            <h3 className="font-bold text-gray-900 mb-1">{hotel.name}</h3>
                            <div className="flex items-center gap-1 text-gray-500 text-sm mb-4">
                                <MapPin size={14} />
                                <span>{hotel.location || hotel.destinationName}</span>
                            </div>

                            {/* Room Type */}
                            <div className="bg-[#F0FAFC] rounded-lg p-3 mb-4">
                                <div className="text-sm text-gray-500">Room Type</div>
                                <div className="font-medium text-gray-900">{roomType}</div>
                            </div>

                            {/* Dates */}
                            <div className="grid grid-cols-2 gap-3 mb-4">
                                <div className="bg-gray-50 rounded-lg p-3">
                                    <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                                        <Calendar size={12} />
                                        Check-in
                                    </div>
                                    <div className="font-medium text-sm">{formatDate(checkIn)}</div>
                                    <div className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                                        <Clock size={10} />
                                        After 2:00 PM
                                    </div>
                                </div>
                                <div className="bg-gray-50 rounded-lg p-3">
                                    <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                                        <Calendar size={12} />
                                        Check-out
                                    </div>
                                    <div className="font-medium text-sm">{formatDate(checkOut)}</div>
                                    <div className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                                        <Clock size={10} />
                                        Before 11:00 AM
                                    </div>
                                </div>
                            </div>

                            {/* Guests */}
                            <div className="flex items-center gap-2 text-gray-600 text-sm mb-6">
                                <Users size={16} />
                                <span>{guests} Guest{guests > 1 ? 's' : ''}</span>
                                <span>•</span>
                                <span>{nights} Night{nights > 1 ? 's' : ''}</span>
                            </div>

                            {/* Price Breakdown */}
                            <div className="border-t pt-4 space-y-2">
                                <div className="flex justify-between text-gray-600">
                                    <span><Price amount={pricePerNight} /> × {nights} night{nights > 1 ? 's' : ''}</span>
                                    <span><Price amount={subtotal} /></span>
                                </div>
                                <div className="flex justify-between text-gray-600">
                                    <span>Taxes (12%)</span>
                                    <span><Price amount={taxes} /></span>
                                </div>
                                <div className="flex justify-between text-gray-600">
                                    <span>Service fee</span>
                                    <span><Price amount={serviceFee} /></span>
                                </div>
                                <div className="flex justify-between font-bold text-lg pt-2 border-t mt-2">
                                    <span>Total</span>
                                    <span className="text-[#055B75]"><Price amount={total} /></span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <Footer />
        </div>
    );
};

export default withPageElements(HotelBookingSummary);
