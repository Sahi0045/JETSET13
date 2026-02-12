import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FaShip, FaCalendarAlt, FaMapMarkerAlt, FaUser, FaCheckCircle, FaClock, FaAnchor, FaPrint, FaCopy, FaWater, FaCompass, FaPhoneAlt, FaEnvelope, FaSuitcaseRolling, FaDownload } from 'react-icons/fa';
import Navbar from '../Navbar';
import Footer from '../Footer';
import withPageElements from '../PageWrapper';
import Price from '../../../Components/Price';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

function CruiseBookingSuccess() {
    const location = useLocation();
    const navigate = useNavigate();
    const [bookingData, setBookingData] = useState(null);
    const [showCopied, setShowCopied] = useState(false);
    const [isDownloading, setIsDownloading] = useState(false);
    const ticketRef = React.useRef(null);

    useEffect(() => {
        if (location.state) {
            setBookingData(location.state);
        } else {
            const stored = localStorage.getItem('completedBooking');
            if (stored) {
                try {
                    const parsed = JSON.parse(stored);
                    setBookingData({
                        orderId: parsed.orderId || parsed.bookingReference || 'CRUISE-' + Date.now(),
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

    const handleDownload = async () => {
        if (!ticketRef.current) return;

        try {
            setIsDownloading(true);
            const canvas = await html2canvas(ticketRef.current, {
                scale: 2, // Higher quality
                useCORS: true, // Allow cross-origin images
                logging: false,
                backgroundColor: '#ffffff'
            });

            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            const imgWidth = 210; // A4 width in mm
            const imgHeight = (canvas.height * imgWidth) / canvas.width;

            pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
            pdf.save(`Cruise-Ticket-${bookingData.orderId || 'booking'}.pdf`);
        } catch (error) {
            console.error('Error generating ticket PDF:', error);
            alert('Failed to download ticket. Please try printing instead.');
        } finally {
            setIsDownloading(false);
        }
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
    const totalPassengers = adults.length + children.length;
    const primaryPassenger = adults[0] || {};
    const primaryName = `${primaryPassenger.firstName || primaryPassenger.first_name || ''} ${primaryPassenger.lastName || primaryPassenger.last_name || ''}`.trim() || 'Guest';

    return (
        <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #0c1e30 0%, #0a3d5c 30%, #055B75 60%, #0a3d5c 100%)' }}>
            <Navbar />

            <div className="container mx-auto px-4 pt-24 pb-16 max-w-5xl">

                {/* ── Animated Success Header ── */}
                <div className="text-center mb-10">
                    <div className="inline-flex items-center justify-center w-24 h-24 rounded-full mb-6"
                        style={{
                            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                            boxShadow: '0 0 0 8px rgba(16, 185, 129, 0.15), 0 0 0 16px rgba(16, 185, 129, 0.08), 0 8px 32px rgba(0,0,0,0.3)'
                        }}>
                        <FaCheckCircle className="text-white text-5xl" />
                    </div>
                    <h1 className="text-4xl md:text-5xl font-extrabold text-white mb-3 tracking-tight">
                        Booking Confirmed! <span className="inline-block animate-bounce">🎉</span>
                    </h1>
                    <p className="text-blue-200 text-lg">Your cruise has been successfully booked.</p>
                </div>

                {/* ══════════════════════════════════════════════
                     CRUISE BOARDING PASS / TICKET
                    ══════════════════════════════════════════════ */}
                <div className="relative mx-auto" style={{ maxWidth: '900px' }}>

                    {/* ── Ticket Card ── */}
                    <div ref={ticketRef} className="bg-white rounded-3xl overflow-hidden"
                        style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.1)' }}>

                        {/* ── Top Banner with Gradient ── */}
                        <div className="relative overflow-hidden"
                            style={{
                                background: 'linear-gradient(135deg, #055B75 0%, #0a3d5c 40%, #1e3a5f 70%, #2563eb 100%)',
                                minHeight: '200px'
                            }}>

                            {/* Decorative wave patterns */}
                            <div className="absolute inset-0 opacity-10">
                                <svg className="absolute bottom-0 left-0 w-full" viewBox="0 0 1440 120" fill="none">
                                    <path d="M0,64 C360,120 720,0 1080,64 C1260,96 1440,48 1440,48 L1440,120 L0,120 Z" fill="white" />
                                </svg>
                                <svg className="absolute bottom-4 left-0 w-full" viewBox="0 0 1440 120" fill="none">
                                    <path d="M0,80 C240,20 480,100 720,60 C960,20 1200,80 1440,40 L1440,120 L0,120 Z" fill="white" opacity="0.5" />
                                </svg>
                            </div>

                            {/* Ship silhouette decoration */}
                            <div className="absolute right-6 top-6 opacity-15">
                                <FaShip className="text-white" style={{ fontSize: '120px' }} />
                            </div>

                            <div className="relative z-10 p-8 pb-12">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                                                style={{ background: 'rgba(255,255,255,0.2)', backdropFilter: 'blur(8px)' }}>
                                                <FaShip className="text-white text-2xl" />
                                            </div>
                                            <div>
                                                <p className="text-blue-200 text-xs uppercase tracking-[3px] font-semibold">Cruise Booking</p>
                                                <p className="text-white text-sm font-medium opacity-80">#{bookingData.orderId}</p>
                                            </div>
                                        </div>
                                        <h2 className="text-3xl md:text-4xl font-extrabold text-white leading-tight">
                                            {cruise.cruiseName || 'Cruise Voyage'}
                                        </h2>
                                        {cruise.duration && (
                                            <p className="text-blue-200 mt-2 text-lg font-medium flex items-center gap-2">
                                                <FaClock className="text-blue-300" />
                                                {cruise.duration}
                                            </p>
                                        )}
                                    </div>
                                    <div className="hidden md:flex flex-col items-end gap-2">
                                        <span className="px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2"
                                            style={{ background: 'rgba(16, 185, 129, 0.25)', color: '#6ee7b7', border: '1px solid rgba(16, 185, 129, 0.4)' }}>
                                            <FaCheckCircle /> Confirmed
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ── Route Section (Boarding Pass Style) ── */}
                        {(cruise.departure || cruise.arrival) && (
                            <div className="px-8 py-8 border-b-2 border-dashed border-gray-200" style={{ background: 'linear-gradient(to right, #f0f9ff, #f8fafc, #f0f9ff)' }}>
                                <div className="flex items-center justify-between gap-4">
                                    {/* Departure */}
                                    <div className="flex-1 text-center">
                                        <div className="w-14 h-14 mx-auto rounded-full flex items-center justify-center mb-3"
                                            style={{ background: 'linear-gradient(135deg, #055B75, #0a3d5c)' }}>
                                            <FaMapMarkerAlt className="text-white text-xl" />
                                        </div>
                                        <p className="text-[10px] text-gray-400 uppercase tracking-[2px] font-bold mb-1">Departure Port</p>
                                        <p className="text-xl font-extrabold text-gray-900">{cruise.departure || 'TBD'}</p>
                                        {cruise.departureDate && (
                                            <p className="text-sm text-gray-500 mt-1 font-medium">
                                                {new Date(cruise.departureDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                                            </p>
                                        )}
                                    </div>

                                    {/* Route Line with Ship */}
                                    <div className="flex-1 flex flex-col items-center px-4">
                                        <div className="relative w-full flex items-center justify-center">
                                            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-0.5 bg-gradient-to-r from-[#055B75] via-blue-400 to-[#055B75] opacity-30"></div>
                                            {/* Animated dots */}
                                            <div className="absolute inset-x-0 top-1/2 -translate-y-1/2">
                                                <div className="flex justify-between px-2">
                                                    {[...Array(7)].map((_, i) => (
                                                        <div key={i} className="w-1.5 h-1.5 rounded-full bg-[#055B75]" style={{ opacity: 0.2 + (i * 0.1) }}></div>
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="relative z-10 w-14 h-14 rounded-full flex items-center justify-center"
                                                style={{ background: 'linear-gradient(135deg, #055B75 0%, #2563eb 100%)', boxShadow: '0 4px 15px rgba(5, 91, 117, 0.4)' }}>
                                                <FaShip className="text-white text-xl" />
                                            </div>
                                        </div>
                                        {cruise.duration && (
                                            <p className="text-xs text-gray-400 mt-3 font-semibold uppercase tracking-wider">{cruise.duration}</p>
                                        )}
                                    </div>

                                    {/* Arrival */}
                                    <div className="flex-1 text-center">
                                        <div className="w-14 h-14 mx-auto rounded-full flex items-center justify-center mb-3"
                                            style={{ background: 'linear-gradient(135deg, #059669, #10b981)' }}>
                                            <FaAnchor className="text-white text-xl" />
                                        </div>
                                        <p className="text-[10px] text-gray-400 uppercase tracking-[2px] font-bold mb-1">Arrival Port</p>
                                        <p className="text-xl font-extrabold text-gray-900">{cruise.arrival || 'TBD'}</p>
                                        {cruise.returnDate && (
                                            <p className="text-sm text-gray-500 mt-1 font-medium">
                                                {new Date(cruise.returnDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ── Ticket Tear-off Effect ── */}
                        <div className="relative">
                            <div className="absolute -left-4 top-0 w-8 h-8 bg-[#0c1e30] rounded-full" style={{ boxShadow: 'inset 0 0 0 4px #0c1e30' }}></div>
                            <div className="absolute -right-4 top-0 w-8 h-8 bg-[#0c1e30] rounded-full" style={{ boxShadow: 'inset 0 0 0 4px #0c1e30' }}></div>
                        </div>

                        {/* ── Booking Info Grid ── */}
                        <div className="px-8 py-8">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                {/* Booking Reference */}
                                <div className="space-y-1">
                                    <p className="text-[10px] text-gray-400 uppercase tracking-[2px] font-bold">Booking Ref</p>
                                    <div className="flex items-center gap-2">
                                        <p className="text-lg font-extrabold text-gray-900 tracking-wide font-mono">{bookingData.orderId}</p>
                                        <button onClick={copyOrderId} className="text-gray-400 hover:text-[#055B75] transition-colors p-1">
                                            <FaCopy className="text-xs" />
                                        </button>
                                    </div>
                                    {showCopied && <span className="text-xs text-green-500 font-medium">Copied!</span>}
                                </div>

                                {/* Transaction ID */}
                                <div className="space-y-1">
                                    <p className="text-[10px] text-gray-400 uppercase tracking-[2px] font-bold">Transaction ID</p>
                                    <p className="text-sm font-bold text-gray-700 font-mono break-all">{cruise.transactionId || bookingData.transactionId || 'N/A'}</p>
                                </div>

                                {/* Status */}
                                <div className="space-y-1">
                                    <p className="text-[10px] text-gray-400 uppercase tracking-[2px] font-bold">Status</p>
                                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
                                        style={{ background: 'linear-gradient(135deg, #d1fae5, #ecfdf5)', color: '#059669', border: '1px solid #a7f3d0' }}>
                                        <FaCheckCircle className="text-green-500" />
                                        CONFIRMED
                                    </span>
                                </div>

                                {/* Passengers */}
                                <div className="space-y-1">
                                    <p className="text-[10px] text-gray-400 uppercase tracking-[2px] font-bold">Passengers</p>
                                    <p className="text-lg font-extrabold text-gray-900">
                                        {totalPassengers} {totalPassengers === 1 ? 'Guest' : 'Guests'}
                                    </p>
                                    <p className="text-xs text-gray-500">
                                        {adults.length > 0 && `${adults.length} Adult${adults.length > 1 ? 's' : ''}`}
                                        {children.length > 0 && `, ${children.length} Child${children.length > 1 ? 'ren' : ''}`}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* ── Passenger Cards ── */}
                        {(adults.length > 0 || children.length > 0) && (
                            <div className="px-8 pb-8">
                                <div className="flex items-center gap-3 mb-5">
                                    <div className="w-8 h-8 rounded-lg flex items-center justify-center"
                                        style={{ background: 'linear-gradient(135deg, #055B75, #0a3d5c)' }}>
                                        <FaUser className="text-white text-sm" />
                                    </div>
                                    <h3 className="text-lg font-bold text-gray-800">Passenger Details</h3>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    {adults.map((adult, index) => (
                                        <div key={`adult-${index}`}
                                            className="flex items-center gap-4 p-4 rounded-2xl border-2 border-gray-100 hover:border-[#055B75]/30 transition-colors"
                                            style={{ background: 'linear-gradient(135deg, #fafafa, #f5f5f5)' }}>
                                            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg"
                                                style={{ background: 'linear-gradient(135deg, #055B75, #0a3d5c)' }}>
                                                {(adult.firstName || adult.first_name || 'G').charAt(0).toUpperCase()}
                                            </div>
                                            <div className="flex-1">
                                                <p className="font-bold text-gray-900">
                                                    {adult.firstName || adult.first_name || ''} {adult.lastName || adult.last_name || ''}
                                                </p>
                                                <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                                                    <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold">Adult</span>
                                                    {adult.gender && <span>{adult.gender}</span>}
                                                    {adult.age && <span>Age {adult.age}</span>}
                                                    {adult.nationality && <span>🌍 {adult.nationality}</span>}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {children.map((child, index) => (
                                        <div key={`child-${index}`}
                                            className="flex items-center gap-4 p-4 rounded-2xl border-2 border-gray-100 hover:border-orange-200 transition-colors"
                                            style={{ background: 'linear-gradient(135deg, #fffbeb, #fef3c7)' }}>
                                            <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg"
                                                style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
                                                {(child.firstName || child.first_name || 'C').charAt(0).toUpperCase()}
                                            </div>
                                            <div className="flex-1">
                                                <p className="font-bold text-gray-900">
                                                    {child.firstName || child.first_name || ''} {child.lastName || child.last_name || ''}
                                                </p>
                                                <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                                                    <span className="px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 font-semibold">Child</span>
                                                    {child.age && <span>Age {child.age}</span>}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* ── Payment Summary Section ── */}
                        <div className="px-8 pb-8">
                            <div className="rounded-2xl overflow-hidden border-2 border-gray-100"
                                style={{ background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)' }}>

                                <div className="px-6 py-4 flex items-center gap-3" style={{ background: 'linear-gradient(135deg, #055B75, #0a3d5c)' }}>
                                    <FaWater className="text-white text-lg" />
                                    <h3 className="text-lg font-bold text-white">Payment Summary</h3>
                                </div>

                                <div className="p-6">
                                    <div className="space-y-3 mb-5">
                                        {cruise.basePrice !== undefined && cruise.basePrice !== null && (
                                            <div className="flex justify-between items-center">
                                                <span className="text-gray-600">Base Fare</span>
                                                <span className="font-semibold text-gray-800"><Price amount={cruise.basePrice} /></span>
                                            </div>
                                        )}
                                        {cruise.taxesAndFees !== undefined && cruise.taxesAndFees !== null && (
                                            <div className="flex justify-between items-center">
                                                <span className="text-gray-600">Taxes & Fees</span>
                                                <span className="font-semibold text-gray-800"><Price amount={cruise.taxesAndFees} /></span>
                                            </div>
                                        )}
                                        {cruise.portCharges !== undefined && cruise.portCharges !== null && (
                                            <div className="flex justify-between items-center">
                                                <span className="text-gray-600">Port Charges</span>
                                                <span className="font-semibold text-gray-800"><Price amount={cruise.portCharges} /></span>
                                            </div>
                                        )}
                                    </div>

                                    <div className="border-t-2 border-dashed border-gray-300 pt-5">
                                        <div className="flex justify-between items-center">
                                            <span className="text-xl font-extrabold text-gray-900">Total Paid</span>
                                            <span className="text-2xl font-extrabold text-[#055B75]">
                                                <Price amount={cruise.totalAmount || 0} />
                                            </span>
                                        </div>
                                    </div>

                                    <div className="mt-5 flex items-center gap-3 p-4 rounded-xl"
                                        style={{ background: 'linear-gradient(135deg, #d1fae5 0%, #ecfdf5 100%)', border: '1px solid #a7f3d0' }}>
                                        <FaCheckCircle className="text-green-600 text-xl flex-shrink-0" />
                                        <div>
                                            <p className="font-bold text-green-800 text-sm">Payment Successful</p>
                                            <p className="text-xs text-green-600">Processed securely via ARC Pay Gateway</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ── Important Information ── */}
                        <div className="px-8 pb-8">
                            <div className="rounded-2xl overflow-hidden border-2 border-amber-100"
                                style={{ background: 'linear-gradient(135deg, #fffbeb, #fefce8)' }}>
                                <div className="p-6">
                                    <div className="flex items-center gap-3 mb-4">
                                        <FaCompass className="text-amber-600 text-lg" />
                                        <h3 className="text-lg font-bold text-gray-800">Important Travel Information</h3>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="flex gap-3">
                                            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-100 flex-shrink-0 mt-0.5">
                                                <FaClock className="text-amber-600 text-sm" />
                                            </div>
                                            <div>
                                                <p className="font-semibold text-gray-800 text-sm">Arrive Early</p>
                                                <p className="text-xs text-gray-600">Please arrive at the port at least 3 hours before departure.</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-3">
                                            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-100 flex-shrink-0 mt-0.5">
                                                <FaSuitcaseRolling className="text-amber-600 text-sm" />
                                            </div>
                                            <div>
                                                <p className="font-semibold text-gray-800 text-sm">Travel Documents</p>
                                                <p className="text-xs text-gray-600">Carry a valid passport and required visas for port calls.</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-3">
                                            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-100 flex-shrink-0 mt-0.5">
                                                <FaPhoneAlt className="text-amber-600 text-sm" />
                                            </div>
                                            <div>
                                                <p className="font-semibold text-gray-800 text-sm">Changes & Cancellations</p>
                                                <p className="text-xs text-gray-600">Contact support at least 72 hours before departure for any changes.</p>
                                            </div>
                                        </div>
                                        <div className="flex gap-3">
                                            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-100 flex-shrink-0 mt-0.5">
                                                <FaEnvelope className="text-amber-600 text-sm" />
                                            </div>
                                            <div>
                                                <p className="font-semibold text-gray-800 text-sm">Embarkation Guide</p>
                                                <p className="text-xs text-gray-600">A detailed itinerary will be sent to your registered email.</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* ── Footer Confirmation ── */}
                        <div className="px-8 pb-8 text-center">
                            <p className="text-sm text-gray-400 mb-1">🎉 A confirmation email has been sent with all the details of your booking.</p>
                            <p className="text-xs text-gray-300">JetSetters Travel • Booking #{bookingData.orderId}</p>
                        </div>
                    </div>

                    {/* ── Action Buttons ── */}
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
                        <button
                            onClick={() => navigate('/my-trips')}
                            className="w-full sm:w-auto px-8 py-4 rounded-2xl text-white font-bold text-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
                            style={{
                                background: 'linear-gradient(135deg, #055B75, #2563eb)',
                                boxShadow: '0 8px 25px rgba(5, 91, 117, 0.4)'
                            }}>
                            ← View All Trips
                        </button>
                        <button
                            onClick={() => navigate('/cruise')}
                            className="w-full sm:w-auto px-8 py-4 rounded-2xl font-bold text-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
                            style={{
                                background: 'rgba(255,255,255,0.12)',
                                backdropFilter: 'blur(8px)',
                                border: '2px solid rgba(255,255,255,0.25)',
                                color: 'white'
                            }}>
                            Book Another Cruise
                        </button>
                        <button
                            onClick={handleDownload}
                            disabled={isDownloading}
                            className="w-full sm:w-auto px-6 py-4 rounded-2xl font-bold text-lg transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
                            style={{
                                background: 'rgba(255,255,255,0.12)',
                                backdropFilter: 'blur(8px)',
                                border: '2px solid rgba(255,255,255,0.25)',
                                color: 'white',
                                opacity: isDownloading ? 0.7 : 1,
                                cursor: isDownloading ? 'wait' : 'pointer'
                            }}>
                            {isDownloading ? (
                                <span className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></span>
                            ) : (
                                <FaDownload />
                            )}
                            {isDownloading ? 'Generating...' : 'Download Ticket'}
                        </button>
                        <button
                            onClick={handlePrint}
                            className="w-full sm:w-auto px-6 py-4 rounded-2xl font-bold text-lg transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-2"
                            style={{
                                background: 'rgba(255,255,255,0.12)',
                                backdropFilter: 'blur(8px)',
                                border: '2px solid rgba(255,255,255,0.25)',
                                color: 'white'
                            }}>
                            <FaPrint /> Print Ticket
                        </button>
                    </div>
                </div>
            </div>

            <Footer />
        </div>
    );
}

export default withPageElements(CruiseBookingSuccess);
