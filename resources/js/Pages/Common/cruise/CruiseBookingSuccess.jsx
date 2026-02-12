import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FaShip, FaCalendarAlt, FaMapMarkerAlt, FaUser, FaCheckCircle, FaClock, FaAnchor, FaPrint, FaDownload, FaCopy } from 'react-icons/fa';
import Navbar from '../Navbar';
import Footer from '../Footer';
import withPageElements from '../PageWrapper';
import Price from '../../../Components/Price';

function CruiseBookingSuccess() {
    const location = useLocation();
    const navigate = useNavigate();
    const [bookingData, setBookingData] = useState(null);
    const [showCopied, setShowCopied] = useState(false);

    useEffect(() => {
        if (location.state) {
            setBookingData(location.state);
        } else {
            // Try to retrieve from localStorage as fallback
            const stored = localStorage.getItem('pendingCruiseBooking');
            if (stored) {
                try {
                    const parsed = JSON.parse(stored);
                    setBookingData({
                        orderId: 'CRUISE-' + Date.now(),
                        bookingData: parsed,
                        paymentVerified: true
                    });
                } catch (e) {
                    console.error('Failed to parse stored cruise booking:', e);
                    navigate('/cruise');
                }
            } else {
                navigate('/cruise');
            }
        }
    }, [location, navigate]);

    const copyOrderId = () => {
        if (bookingData?.orderId) {
            navigator.clipboard.writeText(bookingData.orderId);
            setShowCopied(true);
            setTimeout(() => setShowCopied(false), 2000);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    if (!bookingData) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#055B75]"></div>
            </div>
        );
    }

    const cruise = bookingData.bookingData || {};
    const passengers = cruise.passengerDetails || {};
    const adults = passengers.adults || [];
    const children = passengers.children || [];

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50/30">
            <Navbar />

            <div className="container mx-auto px-4 pt-24 pb-12">
                {/* Success Banner */}
                <div className="bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-2xl p-8 mb-8 shadow-sm">
                    <div className="flex flex-col md:flex-row items-center">
                        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-4 md:mb-0 md:mr-8 shadow-md">
                            <FaCheckCircle className="w-10 h-10 text-green-600" />
                        </div>
                        <div className="text-center md:text-left flex-1">
                            <h1 className="text-3xl font-bold text-gray-800 mb-2">Cruise Booking Confirmed! 🚢</h1>
                            <p className="text-gray-600 mb-3 text-lg">
                                Your cruise adventure has been successfully booked. A confirmation email will be sent shortly.
                            </p>
                            <div className="flex items-center justify-center md:justify-start gap-2 bg-white rounded-lg px-4 py-2 inline-flex border border-green-200">
                                <span className="text-sm text-gray-500">Booking ID:</span>
                                <span className="font-bold text-[#055B75] text-lg">{bookingData.orderId}</span>
                                <button
                                    onClick={copyOrderId}
                                    className="text-[#055B75] hover:bg-[#055B75]/10 p-1.5 rounded-md transition-colors"
                                    title="Copy Booking ID"
                                >
                                    <FaCopy className="w-4 h-4" />
                                </button>
                                {showCopied && (
                                    <span className="text-xs text-green-600 font-medium animate-pulse">Copied!</span>
                                )}
                            </div>
                        </div>
                        <div className="mt-4 md:mt-0 flex gap-3">
                            <button
                                onClick={handlePrint}
                                className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors shadow-sm"
                            >
                                <FaPrint className="w-4 h-4" />
                                <span className="text-sm font-medium">Print</span>
                            </button>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    {/* Left Column - Cruise & Booking Details */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Cruise Details Card */}
                        <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
                            <div className="bg-gradient-to-r from-[#055B75] to-[#034457] px-6 py-4 flex items-center gap-3">
                                <FaShip className="text-white text-xl" />
                                <h2 className="text-xl font-bold text-white">Cruise Details</h2>
                            </div>

                            <div className="p-6">
                                {/* Cruise Image & Name */}
                                {cruise.cruiseImage && (
                                    <div className="relative rounded-xl overflow-hidden mb-6 h-48">
                                        <img
                                            src={cruise.cruiseImage}
                                            alt={cruise.cruiseName}
                                            className="w-full h-full object-cover"
                                            onError={(e) => { e.target.style.display = 'none'; }}
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-6">
                                            <h3 className="text-2xl font-bold text-white">{cruise.cruiseName || 'Cruise Voyage'}</h3>
                                        </div>
                                    </div>
                                )}

                                {!cruise.cruiseImage && cruise.cruiseName && (
                                    <h3 className="text-2xl font-bold text-gray-800 mb-4">{cruise.cruiseName}</h3>
                                )}

                                {/* Cruise Info Grid */}
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                                    {cruise.duration && (
                                        <div className="bg-blue-50 rounded-xl p-4 text-center">
                                            <FaClock className="text-[#055B75] mx-auto mb-2 text-xl" />
                                            <div className="text-xs text-gray-500 uppercase font-medium">Duration</div>
                                            <div className="font-bold text-gray-800 mt-1">{cruise.duration}</div>
                                        </div>
                                    )}
                                    {cruise.departure && (
                                        <div className="bg-green-50 rounded-xl p-4 text-center">
                                            <FaMapMarkerAlt className="text-green-600 mx-auto mb-2 text-xl" />
                                            <div className="text-xs text-gray-500 uppercase font-medium">Departure</div>
                                            <div className="font-bold text-gray-800 mt-1 text-sm">{cruise.departure}</div>
                                        </div>
                                    )}
                                    {cruise.arrival && (
                                        <div className="bg-orange-50 rounded-xl p-4 text-center">
                                            <FaAnchor className="text-orange-600 mx-auto mb-2 text-xl" />
                                            <div className="text-xs text-gray-500 uppercase font-medium">Arrival</div>
                                            <div className="font-bold text-gray-800 mt-1 text-sm">{cruise.arrival}</div>
                                        </div>
                                    )}
                                    {cruise.departureDate && (
                                        <div className="bg-purple-50 rounded-xl p-4 text-center">
                                            <FaCalendarAlt className="text-purple-600 mx-auto mb-2 text-xl" />
                                            <div className="text-xs text-gray-500 uppercase font-medium">Sail Date</div>
                                            <div className="font-bold text-gray-800 mt-1 text-sm">
                                                {new Date(cruise.departureDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Date Details */}
                                {(cruise.departureDate || cruise.returnDate) && (
                                    <div className="flex items-center justify-between bg-gray-50 rounded-xl p-4 border border-gray-200">
                                        <div className="text-center flex-1">
                                            <div className="text-xs text-gray-500 uppercase font-medium mb-1">Departure Date</div>
                                            <div className="font-semibold text-gray-800">
                                                {cruise.departureDate ? new Date(cruise.departureDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : 'N/A'}
                                            </div>
                                        </div>
                                        <div className="h-12 w-px bg-gray-300 mx-4"></div>
                                        <div className="text-center flex-1">
                                            <div className="text-xs text-gray-500 uppercase font-medium mb-1">Return Date</div>
                                            <div className="font-semibold text-gray-800">
                                                {cruise.returnDate ? new Date(cruise.returnDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : 'N/A'}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Passenger Details Card */}
                        {(adults.length > 0 || children.length > 0) && (
                            <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
                                <div className="bg-gradient-to-r from-[#055B75] to-[#034457] px-6 py-4 flex items-center gap-3">
                                    <FaUser className="text-white text-lg" />
                                    <h2 className="text-xl font-bold text-white">Passenger Details</h2>
                                </div>

                                <div className="p-6">
                                    {adults.length > 0 && (
                                        <div className="mb-4">
                                            <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Adults</h4>
                                            <div className="space-y-3">
                                                {adults.map((adult, index) => (
                                                    <div key={index} className="flex items-center gap-4 bg-gray-50 rounded-xl p-4 border border-gray-200">
                                                        <div className="w-10 h-10 bg-[#055B75] rounded-full flex items-center justify-center text-white font-bold">
                                                            {index + 1}
                                                        </div>
                                                        <div>
                                                            <div className="font-semibold text-gray-800">
                                                                {adult.firstName || adult.first_name || ''} {adult.lastName || adult.last_name || ''}
                                                            </div>
                                                            {(adult.age || adult.gender) && (
                                                                <div className="text-sm text-gray-500">
                                                                    {adult.gender && <span className="mr-2">{adult.gender}</span>}
                                                                    {adult.age && <span>Age: {adult.age}</span>}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {children.length > 0 && (
                                        <div>
                                            <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Children</h4>
                                            <div className="space-y-3">
                                                {children.map((child, index) => (
                                                    <div key={index} className="flex items-center gap-4 bg-gray-50 rounded-xl p-4 border border-gray-200">
                                                        <div className="w-10 h-10 bg-orange-500 rounded-full flex items-center justify-center text-white font-bold">
                                                            {index + 1}
                                                        </div>
                                                        <div>
                                                            <div className="font-semibold text-gray-800">
                                                                {child.firstName || child.first_name || ''} {child.lastName || child.last_name || ''}
                                                            </div>
                                                            {child.age && (
                                                                <div className="text-sm text-gray-500">Age: {child.age}</div>
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Right Column - Payment Summary & Info */}
                    <div className="space-y-6">
                        {/* Payment Summary Card */}
                        <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden sticky top-24">
                            <div className="bg-gradient-to-r from-[#055B75] to-[#034457] px-6 py-4">
                                <h2 className="text-lg font-bold text-white">Payment Summary</h2>
                            </div>

                            <div className="p-6">
                                <div className="space-y-3 mb-4">
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-600">Base Fare</span>
                                        <span className="font-medium">
                                            {cruise.basePrice ? <Price amount={cruise.basePrice} /> : 'N/A'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-600">Taxes & Fees</span>
                                        <span className="font-medium">
                                            {cruise.taxesAndFees ? <Price amount={cruise.taxesAndFees} /> : 'N/A'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-600">Port Charges</span>
                                        <span className="font-medium">
                                            {cruise.portCharges ? <Price amount={cruise.portCharges} /> : 'N/A'}
                                        </span>
                                    </div>
                                </div>

                                <div className="border-t border-gray-200 pt-4 mb-6">
                                    <div className="flex justify-between items-center">
                                        <span className="text-lg font-bold text-gray-800">Total Amount</span>
                                        <span className="text-xl font-bold text-[#055B75]">
                                            {cruise.totalAmount ? <Price amount={cruise.totalAmount} /> : 'N/A'}
                                        </span>
                                    </div>
                                </div>

                                <div className="bg-green-50 rounded-xl p-4 border border-green-200 flex items-center gap-3">
                                    <FaCheckCircle className="text-green-600 text-lg flex-shrink-0" />
                                    <div>
                                        <div className="font-semibold text-green-800 text-sm">Payment Verified</div>
                                        <div className="text-xs text-green-600">Processed via ARC Pay Gateway</div>
                                    </div>
                                </div>

                                {cruise.cardHolder && (
                                    <div className="mt-4 text-sm text-gray-500">
                                        <span className="font-medium">Card Holder:</span> {cruise.cardHolder}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Important Info Card */}
                        <div className="bg-white rounded-2xl shadow-md border border-gray-100 overflow-hidden">
                            <div className="px-6 py-4 border-b border-gray-200">
                                <h2 className="text-lg font-semibold text-gray-800">Important Information</h2>
                            </div>

                            <div className="p-6">
                                <ul className="space-y-4">
                                    <li className="flex gap-3">
                                        <div className="text-[#055B75] mt-0.5 flex-shrink-0">
                                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"></path>
                                            </svg>
                                        </div>
                                        <p className="text-sm text-gray-600">Please arrive at the port at least 3 hours before the scheduled departure time.</p>
                                    </li>
                                    <li className="flex gap-3">
                                        <div className="text-[#055B75] mt-0.5 flex-shrink-0">
                                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"></path>
                                            </svg>
                                        </div>
                                        <p className="text-sm text-gray-600">Carry a valid passport and any required travel documents for port calls.</p>
                                    </li>
                                    <li className="flex gap-3">
                                        <div className="text-[#055B75] mt-0.5 flex-shrink-0">
                                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"></path>
                                            </svg>
                                        </div>
                                        <p className="text-sm text-gray-600">For changes or cancellations, please contact support at least 72 hours before departure.</p>
                                    </li>
                                    <li className="flex gap-3">
                                        <div className="text-[#055B75] mt-0.5 flex-shrink-0">
                                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd"></path>
                                            </svg>
                                        </div>
                                        <p className="text-sm text-gray-600">A detailed itinerary and embarkation guide will be sent to your email.</p>
                                    </li>
                                </ul>
                            </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="space-y-3">
                            <button
                                onClick={() => navigate('/my-trips')}
                                className="w-full py-3 px-6 bg-[#055B75] hover:bg-[#034457] text-white font-semibold rounded-xl transition-all shadow-md active:scale-[0.98]"
                            >
                                View My Trips
                            </button>
                            <button
                                onClick={() => navigate('/cruise')}
                                className="w-full py-3 px-6 bg-white hover:bg-gray-50 text-gray-700 font-semibold rounded-xl border border-gray-200 transition-all"
                            >
                                Browse More Cruises
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <Footer />
        </div>
    );
}

export default withPageElements(CruiseBookingSuccess);
