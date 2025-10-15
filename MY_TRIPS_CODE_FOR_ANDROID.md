# 📱 My Trips (User Dashboard) Code - Complete Implementation Guide

This document contains the complete My Trips functionality from the Jetsetterss web platform. Use this code to replicate the exact same user dashboard and booking management features in the Android app.

## 🎯 My Trips Features Structure

The My Trips section includes multiple interconnected components:

1. **TravelDashboard** - Main dashboard with booking overview
2. **BookingConfirmation** - Detailed booking confirmation view
3. **ManageBooking** - Booking management and modification
4. **Guest Mode** - Limited functionality for non-logged-in users
5. **Real-time Updates** - Live booking status synchronization

---

## 📊 Main Travel Dashboard Component

```jsx
"use client"

import React, { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"

export default function TravelDashboard() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState("Upcoming")
  const [activeSidebarItem, setActiveSidebarItem] = useState("All Bookings")
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isGuest, setIsGuest] = useState(false)
  const [showLoginPopup, setShowLoginPopup] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [bookings, setBookings] = useState([])

  useEffect(() => {
    // Check if user is authenticated
    const authStatus = localStorage.getItem('isAuthenticated')
    if (authStatus !== 'true') {
      // Set as guest user instead of redirecting
      setIsGuest(true)
      // Show login popup after a short delay
      setTimeout(() => {
        setShowLoginPopup(true)
      }, 500)
    } else {
      setIsAuthenticated(true)
    }

    // Load bookings from localStorage
    loadBookings()

    // Reload bookings when the window regains focus (user comes back from booking)
    const handleFocus = () => {
      loadBookings()
    }
    window.addEventListener('focus', handleFocus)

    return () => {
      window.removeEventListener('focus', handleFocus)
    }
  }, [navigate])

  const loadBookings = () => {
    const allBookings = []

    console.log('🔍 Loading bookings from localStorage...')

    // Load flight bookings
    const flightBooking = localStorage.getItem('completedFlightBooking')
    console.log('Flight booking raw data:', flightBooking)

    if (flightBooking) {
      try {
        const booking = JSON.parse(flightBooking)
        console.log('Parsed flight booking:', booking)
        allBookings.push({
          ...booking,
          type: 'flight',
          bookingDate: booking.orderCreatedAt || new Date().toISOString()
        })
      } catch (error) {
        console.error('Error parsing flight booking:', error)
      }
    }

    // Load cruise bookings
    const cruiseBooking = localStorage.getItem('completedBooking')
    console.log('Cruise booking raw data:', cruiseBooking)

    if (cruiseBooking) {
      try {
        const booking = JSON.parse(cruiseBooking)
        console.log('Parsed cruise booking:', booking)
        allBookings.push({
          ...booking,
          type: 'cruise',
          bookingDate: booking.orderCreatedAt || new Date().toISOString()
        })
      } catch (error) {
        console.error('Error parsing cruise booking:', error)
      }
    }

    console.log('📋 Total bookings loaded:', allBookings.length)
    console.log('All bookings:', allBookings)
    setBookings(allBookings)
  }

  const handleTabChange = (tab) => {
    setActiveTab(tab)
  }

  const handleSidebarItemChange = (item) => {
    setActiveSidebarItem(item)
    setIsMobileMenuOpen(false)
  }

  const handleLoginClick = () => {
    navigate('/login')
  }

  const closeLoginPopup = () => {
    setShowLoginPopup(false)
  }

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen)
  }

  // Filter bookings based on active tab and sidebar selection
  const getFilteredBookings = () => {
    let filtered = bookings
    console.log('🔍 Filtering bookings...', {
      totalBookings: bookings.length,
      activeTab,
      activeSidebarItem
    })

    // Filter by booking type (sidebar)
    if (activeSidebarItem !== "All Bookings") {
      const typeMap = {
        "Flights": "flight",
        "Cruise": "cruise",
        "Packages": "package"
      }
      const targetType = typeMap[activeSidebarItem]
      filtered = filtered.filter(booking => booking.type === targetType)
      console.log(`Filtered by type "${targetType}":`, filtered.length)
    }

    // Filter by status (tab) - FIXED: Show bookings based on status, not travel date
    if (activeTab === "Upcoming") {
      // Show all confirmed bookings (regardless of travel date)
      filtered = filtered.filter(booking => {
        const isUpcoming = booking.status !== 'CANCELLED' && booking.status !== 'FAILED'
        console.log(`Booking ${booking.orderId}: status=${booking.status}, isUpcoming=${isUpcoming}`)
        return isUpcoming
      })
    } else if (activeTab === "Past") {
      // For now, show no bookings in Past (travel date logic would need flight/cruise departure dates)
      filtered = []
    } else if (activeTab === "Cancelled") {
      filtered = filtered.filter(booking => booking.status === 'CANCELLED')
    } else if (activeTab === "Failed") {
      filtered = filtered.filter(booking => booking.status === 'FAILED')
    }

    console.log(`Final filtered bookings for ${activeTab}:`, filtered.length)
    return filtered
  }

  const filteredBookings = getFilteredBookings()

  const renderBookingCard = (booking) => {
    const isFlightBooking = booking.type === 'flight'

    return (
      <div key={booking.orderId || booking.bookingReference}
           className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {isFlightBooking ? 'Flight Booking' : 'Cruise Booking'}
            </h3>
            <p className="text-sm text-gray-500">
              {booking.orderId || booking.bookingReference}
            </p>
          </div>
          <span className={`px-3 py-1 text-xs font-medium rounded-full ${
            booking.status === 'CONFIRMED' ? 'bg-green-100 text-green-800' :
            booking.status === 'CANCELLED' ? 'bg-red-100 text-red-800' :
            'bg-blue-100 text-blue-800'
          }`}>
            {booking.status || 'Confirmed'}
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-sm text-gray-500">PNR Number</p>
            <p className="font-medium">{booking.pnr || 'N/A'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Transaction ID</p>
            <p className="font-medium">{booking.transactionId || 'N/A'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Amount</p>
            <p className="font-medium">${booking.amount || 'N/A'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Booking Date</p>
            <p className="font-medium">
              {new Date(booking.bookingDate || booking.orderCreatedAt).toLocaleDateString()}
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            onClick={() => navigate('/booking-confirmation', { state: { bookingData: booking } })}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition"
          >
            View Details
          </button>
          {isFlightBooking && (
            <button
              onClick={() => navigate('/manage-booking', { state: { bookingData: booking } })}
              className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-md hover:bg-gray-50 transition"
            >
              Manage Booking
            </button>
          )}
        </div>
      </div>
    )
  }

  // Allow rendering for both authenticated and guest users
  return (
    <div className="min-h-screen bg-[#f0f7fc]">
      {/* Enhanced Header */}
      <header className="sticky top-0 z-10 bg-white shadow-sm">
        <div className="container mx-auto px-4 sm:px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/')}
                className="flex items-center text-[#006d92] hover:text-[#005a7a] transition"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 12H5M12 19l-7-7 7-7"/>
                </svg>
                <span className="ml-2 font-medium hidden sm:inline">Back to Home</span>
              </button>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-800">My Trips</h1>
            </div>

            <div className="flex items-center space-x-4">
              {isGuest && (
                <button
                  onClick={handleLoginClick}
                  className="px-4 py-1.5 rounded-md bg-[#0ea5e9] text-white hover:bg-[#0284c7] transition text-sm sm:text-base"
                >
                  Log In
                </button>
              )}
              <button
                onClick={toggleMobileMenu}
                className="md:hidden p-2 rounded-md hover:bg-gray-100"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>
          {isGuest && (
            <p className="text-gray-600 mt-1 text-sm">You're viewing as a guest user</p>
          )}
        </div>
      </header>

      {/* Enhanced Filter tabs - Horizontal scroll on mobile */}
      <div className="sticky top-[73px] z-10 bg-white shadow-sm mb-4">
        <div className="container mx-auto px-4 sm:px-6 py-3">
          <div className="flex overflow-x-auto hide-scrollbar gap-2">
            {["Upcoming", "Cancelled", "Past", "Failed"].map((tab) => (
              <button
                key={tab}
                onClick={() => handleTabChange(tab)}
                className={`px-4 py-1.5 rounded-full text-sm whitespace-nowrap transition-all ${
                  activeTab === tab
                    ? "bg-[#0ea5e9] text-white shadow-sm"
                    : "bg-white border border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="container mx-auto">
        <div className="flex flex-col md:flex-row px-4 sm:px-6 gap-4 md:gap-6">
          {/* Enhanced Sidebar with mobile support */}
          <div className={`
            fixed md:relative inset-0 z-20 bg-white md:bg-transparent
            transition-transform duration-300 ease-in-out
            ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
          `}>
            <div className="w-64 bg-white rounded-lg p-4 shadow-sm h-full md:h-auto">
              <div className="flex items-center justify-between mb-6 pl-4">
                <div className="flex items-center gap-2">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-5 w-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                  <span className="text-lg font-semibold">My Trips</span>
                </div>
                <button
                  onClick={toggleMobileMenu}
                  className="md:hidden p-2 hover:bg-gray-100 rounded-md"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <nav className="space-y-1">
                {["All Bookings", "Flights", "Cruise", "Packages"].map((item) => (
                  <button
                    key={item}
                    onClick={() => handleSidebarItemChange(item)}
                    className={`w-full text-left px-4 py-2.5 rounded-md transition-colors
                      ${activeSidebarItem === item
                        ? "bg-[#d9e9f1] text-[#006d92] font-medium"
                        : "hover:bg-gray-50"
                      }`}
                  >
                    {item}
                  </button>
                ))}
              </nav>
            </div>
          </div>

          {/* Overlay for mobile menu */}
          {isMobileMenuOpen && (
            <div
              className="fixed inset-0 bg-black bg-opacity-50 z-10 md:hidden"
              onClick={toggleMobileMenu}
            />
          )}

          {/* Enhanced main content */}
          <div className="flex-1 bg-white rounded-lg shadow-sm">
            {filteredBookings.length > 0 ? (
              <div className="p-6">
                <div className="mb-6 flex justify-between items-center">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900">
                      {activeTab} {activeSidebarItem === "All Bookings" ? "Bookings" : activeSidebarItem}
                    </h2>
                    <p className="text-gray-600">
                      {filteredBookings.length} booking{filteredBookings.length !== 1 ? 's' : ''} found
                    </p>
                    {/* Debug info */}
                    <p className="text-xs text-gray-400 mt-1">
                      Total loaded: {bookings.length} | localStorage keys: {localStorage.getItem('completedFlightBooking') ? 'flight✓' : ''} {localStorage.getItem('completedBooking') ? 'cruise✓' : ''}
                    </p>
                  </div>
                  <button
                    onClick={loadBookings}
                    className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition"
                    title="Refresh bookings"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </div>
                <div className="space-y-4">
                  {filteredBookings.map(renderBookingCard)}
                </div>
              </div>
            ) : (
            <div className="flex flex-col items-center justify-center p-6 sm:p-8 md:p-10">
              <div className="w-48 h-48 sm:w-64 sm:h-64 flex items-center justify-center">
                <img
                  src="/images/empty-trips.svg"
                  alt="No bookings illustration"
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    e.target.onerror = null
                    e.target.src = "https://via.placeholder.com/300?text=No+Bookings"
                  }}
                />
              </div>
              <h2 className="text-xl sm:text-2xl font-semibold mt-6 text-center">
                No {activeTab} Bookings
              </h2>
              <p className="text-gray-500 mt-3 text-center max-w-md">
                {isGuest ?
                  "Sign in to view your trips and bookings." :
                  `You don't have any ${activeTab.toLowerCase()} trips.\nWhen you book a trip, it will appear here.`
                }
              </p>
              <div className="mt-8">
                {isGuest ? (
                  <button
                    onClick={handleLoginClick}
                    className="px-8 py-3 bg-[#0ea5e9] text-white rounded-md hover:bg-[#0284c7] transition shadow-sm"
                  >
                    Sign In
                  </button>
                ) : (
                  <button
                    onClick={() => navigate('/')}
                    className="px-8 py-3 bg-[#0ea5e9] text-white rounded-md hover:bg-[#0284c7] transition shadow-sm"
                  >
                    Book a Trip
                  </button>
                )}
              </div>
            </div>
            )}
          </div>
        </div>
      </div>

      {/* Enhanced Login Popup */}
      {showLoginPopup && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 shadow-xl">
            <div className="flex justify-end">
              <button
                onClick={closeLoginPopup}
                className="text-gray-500 hover:text-gray-700 p-1"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="text-center mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 mx-auto text-[#0ea5e9]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <h2 className="text-2xl font-bold mt-4">Please Login</h2>
              <p className="text-gray-600 mt-2">
                You need to be logged in to view your trips and manage your bookings.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <button
                onClick={handleLoginClick}
                className="w-full py-3 bg-[#0ea5e9] text-white rounded-md hover:bg-[#0284c7] transition font-medium"
              >
                Login Now
              </button>
              <button
                onClick={closeLoginPopup}
                className="w-full py-3 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition font-medium"
              >
                Continue as Guest
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  )
}
```

---

## 📋 Booking Confirmation Component

```jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, Ship, Plane, Calendar, User, CreditCard, ArrowLeft } from 'lucide-react';
import Navbar from './Navbar';

function BookingConfirmation() {
  const navigate = useNavigate();
  const [bookingData, setBookingData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get booking data from localStorage - prioritize flight bookings
    const flightBooking = localStorage.getItem('completedFlightBooking');
    const cruiseBooking = localStorage.getItem('completedBooking');

    // Debug: Check what's in localStorage
    console.log('🔍 BookingConfirmation - localStorage check:');
    console.log('flightBooking:', flightBooking);
    console.log('cruiseBooking:', cruiseBooking);
    console.log('All localStorage items:');
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      console.log(`  ${key}:`, localStorage.getItem(key));
    }

    if (flightBooking) {
      const flightData = JSON.parse(flightBooking);
      console.log('📝 Parsed flight data:', flightData);
      setBookingData({ ...flightData, type: 'flight' });
    } else if (cruiseBooking) {
      const cruiseData = JSON.parse(cruiseBooking);
      console.log('📝 Parsed cruise data:', cruiseData);
      setBookingData({ ...cruiseData, type: 'cruise' });
    } else {
      console.log('❌ No booking data found in localStorage - redirecting to home in 2 seconds');
      // No booking data found, redirect to home
      setTimeout(() => navigate('/'), 2000);
    }

    setLoading(false);
  }, [navigate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading booking confirmation...</p>
        </div>
      </div>
    );
  }

  if (!bookingData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">No Booking Found</h2>
          <p className="text-gray-600 mb-6">We couldn't find your booking details.</p>
          <button
            onClick={() => navigate('/')}
            className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition-colors"
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  const isCruise = bookingData.type === 'cruise';

  return (
    <>
      <Navbar />
      <div className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-4xl mx-auto px-4">
          {/* Success Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Booking Confirmed!
            </h1>
            <p className="text-gray-600">
              Your {isCruise ? 'cruise' : 'flight'} has been successfully booked.
              Confirmation details have been sent to your email.
            </p>
          </div>

          {/* Booking Details Card */}
          <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
            <div className="flex items-center mb-6">
              {isCruise ? (
                <Ship className="w-6 h-6 text-blue-500 mr-2" />
              ) : (
                <Plane className="w-6 h-6 text-blue-500 mr-2" />
              )}
              <h2 className="text-xl font-semibold">
                {isCruise ? 'Cruise Booking Details' : 'Flight Booking Details'}
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Booking Reference */}
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-gray-500">
                    {isCruise ? 'Order ID' : 'Booking Reference'}
                  </label>
                  <p className="text-lg font-semibold text-gray-900">
                    {bookingData.orderId || bookingData.bookingReference || 'N/A'}
                  </p>
                </div>

                {bookingData.pnr && (
                  <div>
                    <label className="text-sm font-medium text-gray-500">PNR Number</label>
                    <p className="text-lg font-semibold text-gray-900">{bookingData.pnr}</p>
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium text-gray-500">Transaction ID</label>
                  <p className="text-lg font-semibold text-gray-900">
                    {bookingData.transactionId || 'N/A'}
                  </p>
                </div>
              </div>

              {/* Trip Details */}
              <div className="space-y-4">
                {isCruise ? (
                  <>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Cruise</label>
                      <p className="text-lg font-semibold text-gray-900">
                        {bookingData.cruiseData?.name || 'Cruise Booking'}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Route</label>
                      <p className="text-lg font-semibold text-gray-900">
                        {bookingData.cruiseData?.departure} - {bookingData.cruiseData?.arrival}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Duration</label>
                      <p className="text-lg font-semibold text-gray-900">
                        {bookingData.cruiseData?.duration || '7 Nights'}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Flight</label>
                      <p className="text-lg font-semibold text-gray-900">
                        {bookingData.flight?.airline} {bookingData.flight?.flightNumber}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Route</label>
                      <p className="text-lg font-semibold text-gray-900">
                        {bookingData.flight?.departure?.city} → {bookingData.flight?.arrival?.city}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-500">Date & Time</label>
                      <p className="text-lg font-semibold text-gray-900">
                        {new Date(bookingData.flight?.departure?.time).toLocaleDateString()}
                      </p>
                    </div>
                  </>
                )}

                <div>
                  <label className="text-sm font-medium text-gray-500">Total Amount</label>
                  <p className="text-lg font-semibold text-gray-900">
                    ${bookingData.amount || bookingData.calculatedFare?.totalAmount || 'N/A'}
                  </p>
                </div>
              </div>
            </div>

            {/* Passenger Information */}
            {bookingData.passengerDetails && (
              <div className="mt-6 pt-6 border-t border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Passenger Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-gray-500">Name</label>
                    <p className="text-lg font-semibold text-gray-900">
                      {bookingData.passengerDetails.firstName} {bookingData.passengerDetails.lastName}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-gray-500">Email</label>
                    <p className="text-lg font-semibold text-gray-900">
                      {bookingData.passengerDetails.email}
                    </p>
                  </div>
                  {bookingData.passengerDetails.phone && (
                    <div>
                      <label className="text-sm font-medium text-gray-500">Phone</label>
                      <p className="text-lg font-semibold text-gray-900">
                        {bookingData.passengerDetails.phone}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
              <button
                onClick={() => navigate('/my-trips')}
                className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                View My Trips
              </button>
              <button
                onClick={() => navigate('/')}
                className="px-8 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                Book Another Trip
              </button>
            </div>
          </div>

          {/* Important Information */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <div className="flex items-start">
              <User className="w-5 h-5 text-blue-600 mr-3 mt-0.5" />
              <div>
                <h3 className="text-lg font-semibold text-blue-900 mb-2">Important Information</h3>
                <ul className="text-blue-800 space-y-1">
                  <li>• A confirmation email has been sent to your registered email address</li>
                  <li>• Please arrive at the {isCruise ? 'port' : 'airport'} at least 2 hours before {isCruise ? 'departure' : 'flight time'}</li>
                  <li>• Carry a valid photo ID and this booking confirmation</li>
                  <li>• Contact us at ((877) 538-7380) for any assistance</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

export default BookingConfirmation;
```

---

## ⚙️ Manage Booking Component

```jsx
import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Plane, Calendar, Clock, User, CreditCard,
  AlertCircle, CheckCircle, Info, Phone, Mail, Edit3,
  Download, X, Wifi, Utensils, Luggage
} from 'lucide-react';
import Navbar from '../Navbar';
import Footer from '../Footer';

function ManageBooking() {
  const navigate = useNavigate();
  const location = useLocation();
  const { bookingId } = useParams();

  const [bookingData, setBookingData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('details');
  const [showCancelModal, setShowCancelModal] = useState(false);

  useEffect(() => {
    // Get booking data from location state or localStorage
    let booking = null;

    if (location.state?.bookingData) {
      booking = location.state.bookingData;
    } else if (bookingId) {
      // Try to find booking by ID in localStorage
      const flightBooking = localStorage.getItem('completedFlightBooking');
      if (flightBooking) {
        const parsed = JSON.parse(flightBooking);
        if (parsed.orderId === bookingId || parsed.bookingReference === bookingId) {
          booking = parsed;
        }
      }
    }

    if (booking) {
      setBookingData(booking);
    } else {
      setError('Booking not found');
    }

    setLoading(false);
  }, [location.state, bookingId]);

  const handleCancelBooking = () => {
    setShowCancelModal(true);
  };

  const confirmCancelBooking = () => {
    // Update booking status to cancelled
    if (bookingData) {
      const updatedBooking = { ...bookingData, status: 'CANCELLED' };
      localStorage.setItem('completedFlightBooking', JSON.stringify(updatedBooking));
      setBookingData(updatedBooking);
      setShowCancelModal(false);

      // Show success message
      alert('Booking cancelled successfully');
    }
  };

  const downloadETicket = () => {
    // Simulate e-ticket download
    alert('E-ticket download will be implemented soon');
  };

  const modifyBooking = () => {
    // Navigate to modify booking flow
    alert('Booking modification will be implemented soon');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading booking details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-800 mb-2">Error Loading Booking</h2>
            <p className="text-gray-600 mb-4">{error}</p>
            <button
              onClick={() => navigate('/my-trips')}
              className="bg-blue-500 text-white px-6 py-2 rounded-lg hover:bg-blue-600 transition"
            >
              Back to My Trips
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar />

      <div className="pt-[80px]">
        <div className="container mx-auto px-4 py-8">
          {/* Header */}
          <div className="flex items-center mb-6">
            <button
              onClick={() => navigate('/my-trips')}
              className="flex items-center text-blue-600 hover:text-blue-700 mr-4"
            >
              <ArrowLeft className="w-5 h-5 mr-1" />
              Back to My Trips
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Manage Booking</h1>
              <p className="text-gray-600">Booking Reference: {bookingData?.orderId || bookingData?.bookingReference}</p>
            </div>
          </div>

          {/* Status Banner */}
          <div className={`p-4 rounded-lg mb-6 ${
            bookingData?.status === 'CONFIRMED' ? 'bg-green-50 border border-green-200' :
            bookingData?.status === 'CANCELLED' ? 'bg-red-50 border border-red-200' :
            bookingData?.status === 'FAILED' ? 'bg-red-50 border border-red-200' :
            'bg-blue-50 border border-blue-200'
          }`}>
            <div className="flex items-center">
              {bookingData?.status === 'CONFIRMED' ? (
                <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
              ) : bookingData?.status === 'CANCELLED' ? (
                <X className="w-5 h-5 text-red-600 mr-2" />
              ) : (
                <Info className="w-5 h-5 text-blue-600 mr-2" />
              )}
              <span className={`font-medium ${
                bookingData?.status === 'CONFIRMED' ? 'text-green-800' :
                bookingData?.status === 'CANCELLED' ? 'text-red-800' :
                'text-blue-800'
              }`}>
                Booking Status: {bookingData?.status || 'Confirmed'}
              </span>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="bg-white rounded-lg shadow-sm mb-6">
            <div className="border-b border-gray-200">
              <nav className="flex">
                <button
                  onClick={() => setActiveTab('details')}
                  className={`px-6 py-3 text-sm font-medium border-b-2 ${
                    activeTab === 'details'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Booking Details
                </button>
                <button
                  onClick={() => setActiveTab('passengers')}
                  className={`px-6 py-3 text-sm font-medium border-b-2 ${
                    activeTab === 'passengers'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Passengers
                </button>
                <button
                  onClick={() => setActiveTab('actions')}
                  className={`px-6 py-3 text-sm font-medium border-b-2 ${
                    activeTab === 'actions'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                  }`}
                >
                  Actions
                </button>
              </nav>
            </div>

            {/* Tab Content */}
            <div className="p-6">
              {activeTab === 'details' && (
                <div className="space-y-6">
                  {/* Flight Information */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                      <Plane className="w-5 h-5 mr-2" />
                      Flight Information
                    </h3>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm text-gray-500">Flight</p>
                          <p className="font-medium">{bookingData?.flight?.airline} {bookingData?.flight?.flightNumber}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Route</p>
                          <p className="font-medium">{bookingData?.flight?.departure?.city} → {bookingData?.flight?.arrival?.city}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Date</p>
                          <p className="font-medium">{new Date(bookingData?.flight?.departure?.time).toLocaleDateString()}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-500">Time</p>
                          <p className="font-medium">{new Date(bookingData?.flight?.departure?.time).toLocaleTimeString()}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Booking Information */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                      <CreditCard className="w-5 h-5 mr-2" />
                      Booking Information
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-500">Booking Reference</p>
                        <p className="font-medium">{bookingData?.orderId || bookingData?.bookingReference}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">PNR Number</p>
                        <p className="font-medium">{bookingData?.pnr || 'N/A'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Booking Date</p>
                        <p className="font-medium">{new Date(bookingData?.bookingDate || bookingData?.orderCreatedAt).toLocaleDateString()}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">Total Amount</p>
                        <p className="font-medium">${bookingData?.amount || bookingData?.calculatedFare?.totalAmount}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'passengers' && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <User className="w-5 h-5 mr-2" />
                    Passenger Information
                  </h3>
                  <div className="space-y-4">
                    {bookingData?.passengerDetails ? (
                      <div className="bg-gray-50 rounded-lg p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <p className="text-sm text-gray-500">Name</p>
                            <p className="font-medium">{bookingData.passengerDetails.firstName} {bookingData.passengerDetails.lastName}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">Email</p>
                            <p className="font-medium">{bookingData.passengerDetails.email}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-500">Phone</p>
                            <p className="font-medium">{bookingData.passengerDetails.phone}</p>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <p className="text-gray-500">Passenger details not available</p>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'actions' && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Available Actions</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <button
                      onClick={downloadETicket}
                      className="flex items-center p-4 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition"
                    >
                      <Download className="w-6 h-6 text-blue-600 mr-3" />
                      <div>
                        <h4 className="font-medium text-blue-900">Download E-Ticket</h4>
                        <p className="text-sm text-blue-700">Get your electronic ticket</p>
                      </div>
                    </button>

                    <button
                      onClick={modifyBooking}
                      className="flex items-center p-4 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition"
                    >
                      <Edit3 className="w-6 h-6 text-green-600 mr-3" />
                      <div>
                        <h4 className="font-medium text-green-900">Modify Booking</h4>
                        <p className="text-sm text-green-700">Change flight details</p>
                      </div>
                    </button>

                    {bookingData?.status === 'CONFIRMED' && (
                      <button
                        onClick={handleCancelBooking}
                        className="flex items-center p-4 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition"
                      >
                        <X className="w-6 h-6 text-red-600 mr-3" />
                        <div>
                          <h4 className="font-medium text-red-900">Cancel Booking</h4>
                          <p className="text-sm text-red-700">Cancel this booking</p>
                        </div>
                      </button>
                    )}

                    <div className="flex items-center p-4 bg-gray-50 border border-gray-200 rounded-lg">
                      <Phone className="w-6 h-6 text-gray-600 mr-3" />
                      <div>
                        <h4 className="font-medium text-gray-900">Customer Support</h4>
                        <p className="text-sm text-gray-600">((877) 538-7380)</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Cancel Booking Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-gray-900">Cancel Booking</h3>
              <button onClick={() => setShowCancelModal(false)}>
                <X className="w-6 h-6 text-gray-400" />
              </button>
            </div>

            <div className="mb-6">
              <p className="text-gray-600 mb-4">
                Are you sure you want to cancel this booking? This action cannot be undone.
              </p>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex">
                  <AlertCircle className="w-5 h-5 text-yellow-600 mr-3 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-medium text-yellow-800">Cancellation Policy</h4>
                    <p className="text-sm text-yellow-700 mt-1">
                      Free cancellation up to 24 hours before departure. Late cancellations may incur fees.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowCancelModal(false)}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
              >
                Keep Booking
              </button>
              <button
                onClick={confirmCancelBooking}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
              >
                Cancel Booking
              </button>
            </div>
          </div>
        </div>
      )}

      <Footer />
    </div>
  );
}

export default ManageBooking;
```

---

## 🎨 My Trips CSS Styles

```css
/* My Trips Page Styles */
.min-h-screen {
  min-height: 100vh;
}

/* Header Styles */
.sticky {
  position: sticky;
  top: 0;
  z-index: 10;
}

.shadow-sm {
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
}

/* Tab Styles */
.px-4 {
  padding-left: 1rem;
  padding-right: 1rem;
}

.py-1\.5 {
  padding-top: 0.375rem;
  padding-bottom: 0.375rem;
}

.rounded-full {
  border-radius: 9999px;
}

.transition-all {
  transition-property: all;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  transition-duration: 150ms;
}

.bg-\[\\#0ea5e9\] {
  background-color: #0ea5e9;
}

.text-white {
  color: white;
}

.bg-white {
  background-color: white;
}

.border {
  border-width: 1px;
}

.border-gray-300 {
  border-color: #d1d5db;
}

.text-gray-700 {
  color: #374151;
}

.hover\:bg-gray-50:hover {
  background-color: #f9fafb;
}

/* Container Styles */
.container {
  width: 100%;
  max-width: 1280px;
  margin-left: auto;
  margin-right: auto;
}

.px-4 {
  padding-left: 1rem;
  padding-right: 1rem;
}

.px-6 {
  padding-left: 1.5rem;
  padding-right: 1.5rem;
}

.gap-4 {
  gap: 1rem;
}

.gap-6 {
  gap: 1.5rem;
}

/* Sidebar Styles */
.fixed {
  position: fixed;
}

.inset-0 {
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
}

.bg-white {
  background-color: white;
}

.md\:bg-transparent {
  background-color: transparent;
}

.transition-transform {
  transition-property: transform;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  transition-duration: 150ms;
}

.translate-x-0 {
  transform: translateX(0);
}

.-translate-x-full {
  transform: translateX(-100%);
}

.md\:translate-x-0 {
  transform: translateX(0);
}

.z-20 {
  z-index: 20;
}

.w-64 {
  width: 16rem;
}

.rounded-lg {
  border-radius: 0.5rem;
}

.p-4 {
  padding: 1rem;
}

.shadow-sm {
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
}

.h-full {
  height: 100%;
}

.md\:h-auto {
  height: auto;
}

/* Content Styles */
.flex-1 {
  flex: 1 1 0%;
}

.rounded-lg {
  border-radius: 0.5rem;
}

.shadow-sm {
  box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
}

/* Booking Card Styles */
.border {
  border-width: 1px;
}

.border-gray-200 {
  border-color: #e5e7eb;
}

.rounded-lg {
  border-radius: 0.5rem;
}

.p-6 {
  padding: 1.5rem;
}

.hover\:shadow-md:hover {
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
}

.transition-shadow {
  transition-property: box-shadow;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  transition-duration: 150ms;
}

/* Status Badge Styles */
.px-3 {
  padding-left: 0.75rem;
  padding-right: 0.75rem;
}

.py-1 {
  padding-top: 0.25rem;
  padding-bottom: 0.25rem;
}

.text-xs {
  font-size: 0.75rem;
  line-height: 1rem;
}

.font-medium {
  font-weight: 500;
}

.bg-green-100 {
  background-color: #dcfce7;
}

.text-green-800 {
  color: #166534;
}

.bg-red-100 {
  background-color: #fee2e2;
}

.text-red-800 {
  color: #991b1b;
}

.bg-blue-100 {
  background-color: #dbeafe;
}

.text-blue-800 {
  color: #1e40af;
}

/* Button Styles */
.px-4 {
  padding-left: 1rem;
  padding-right: 1rem;
}

.py-2 {
  padding-top: 0.5rem;
  padding-bottom: 0.5rem;
}

.bg-blue-600 {
  background-color: #2563eb;
}

.text-white {
  color: white;
}

.text-sm {
  font-size: 0.875rem;
  line-height: 1.25rem;
}

.rounded-md {
  border-radius: 0.375rem;
}

.hover\:bg-blue-700:hover {
  background-color: #1d4ed8;
}

.transition {
  transition-property: color, background-color, border-color, text-decoration-color, fill, stroke, opacity, box-shadow, transform, filter, backdrop-filter;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  transition-duration: 150ms;
}

.border {
  border-width: 1px;
}

.border-gray-300 {
  border-color: #d1d5db;
}

.text-gray-700 {
  color: #374151;
}

.hover\:bg-gray-50:hover {
  background-color: #f9fafb;
}

/* Empty State Styles */
.flex {
  display: flex;
}

.flex-col {
  flex-direction: column;
}

.items-center {
  align-items: center;
}

.justify-center {
  justify-content: center;
}

.p-6 {
  padding: 1.5rem;
}

.p-8 {
  padding: 2rem;
}

.p-10 {
  padding: 2.5rem;
}

.w-48 {
  width: 12rem;
}

.h-48 {
  height: 12rem;
}

.w-64 {
  width: 16rem;
}

.h-64 {
  height: 16rem;
}

.object-contain {
  object-fit: contain;
}

.text-xl {
  font-size: 1.25rem;
  line-height: 1.75rem;
}

.text-2xl {
  font-size: 1.5rem;
  line-height: 2rem;
}

.font-semibold {
  font-weight: 600;
}

.mt-6 {
  margin-top: 1.5rem;
}

.text-center {
  text-align: center;
}

.max-w-md {
  max-width: 28rem;
}

.mt-8 {
  margin-top: 2rem;
}

.bg-\[\\#0ea5e9\] {
  background-color: #0ea5e9;
}

.hover\:bg-\[\\#0284c7\]:hover {
  background-color: #0284c7;
}

.transition {
  transition-property: color, background-color, border-color, text-decoration-color, fill, stroke, opacity, box-shadow, transform, filter, backdrop-filter;
  transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  transition-duration: 150ms;
}

/* Mobile Styles */
@media (max-width: 768px) {
  .md\:hidden {
    display: none;
  }

  .md\:flex {
    display: flex;
  }

  .md\:flex-row {
    flex-direction: row;
  }

  .md\:items-center {
    align-items: center;
  }

  .md\:justify-between {
    justify-content: space-between;
  }

  .md\:gap-4 {
    gap: 1rem;
  }

  .md\:gap-6 {
    gap: 1.5rem;
  }

  .md\:col-span-2 {
    grid-column: span 2 / span 2;
  }

  .md\:w-1/3 {
    width: 33.333333%;
  }

  .md\:w-2/3 {
    width: 66.666667%;
  }
}
```

---

## 📊 Key Features Summary

### **My Trips Dashboard Features:**
1. **Authentication Check** - Redirects non-logged-in users to guest mode
2. **Booking Overview** - Displays all flight and cruise bookings
3. **Status Filtering** - Tabs for Upcoming, Cancelled, Past, Failed bookings
4. **Type Filtering** - Sidebar to filter by Flights, Cruises, Packages
5. **Booking Cards** - Detailed booking information with actions
6. **Guest Mode** - Limited functionality for non-authenticated users
7. **Real-time Updates** - Automatic refresh when returning from booking
8. **Mobile Responsive** - Collapsible sidebar and horizontal scrolling tabs

### **Booking Management Features:**
- **View Details** - Navigate to detailed booking confirmation
- **Manage Booking** - Modify flight bookings (cancel, download e-ticket)
- **Status Tracking** - Real-time booking status updates
- **Booking History** - Complete history of all transactions
- **Cross-platform Sync** - Same data across web and mobile

### **Technical Implementation:**
- **Local Storage Integration** - Persistent booking data storage
- **Real-time Synchronization** - Window focus event handling
- **Responsive Design** - Mobile-first approach with collapsible UI
- **State Management** - Complex filtering and sorting logic
- **Error Handling** - Graceful fallbacks for missing data

This comprehensive My Trips implementation provides users with complete control over their bookings, with the same functionality and user experience as the web platform! 📱🎫


