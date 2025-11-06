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
  const [requests, setRequests] = useState([])
  const [isLoadingRequests, setIsLoadingRequests] = useState(false)

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

    // Load user requests if authenticated
    if (authStatus === 'true') {
      loadRequests()
    }

    // Reload bookings when the window regains focus (user comes back from booking)
    const handleFocus = () => {
      loadBookings()
      if (authStatus === 'true') {
        loadRequests()
      }
    }
    window.addEventListener('focus', handleFocus)
    
    return () => {
      window.removeEventListener('focus', handleFocus)
    }
  }, [navigate])

  // Polling effect for real-time request updates
  useEffect(() => {
    let pollingInterval

    if (isAuthenticated && activeSidebarItem === "Requests") {
      // Start polling every 30 seconds
      pollingInterval = setInterval(() => {
        console.log('🔄 Polling for request updates...')
        loadRequests()
      }, 30000) // 30 seconds
    }

    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval)
      }
    }
  }, [isAuthenticated, activeSidebarItem])

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

  const loadRequests = async () => {
    setIsLoadingRequests(true)
    try {
      console.log('🔍 Loading user inquiries...')

      // Debug: Check all localStorage keys
      console.log('📦 localStorage contents:', {
        token: localStorage.getItem('token') ? 'EXISTS' : 'MISSING',
        adminToken: localStorage.getItem('adminToken') ? 'EXISTS' : 'MISSING',
        isAuthenticated: localStorage.getItem('isAuthenticated'),
        user: localStorage.getItem('user') ? 'EXISTS' : 'MISSING'
      })

      // Get authentication token
      const token = localStorage.getItem('token') || localStorage.getItem('adminToken')

      if (!token) {
        console.log('❌ No authentication token found, cannot load requests')
        console.log('💡 Please log in with Firebase first')
        setRequests([])
        setIsLoadingRequests(false)
        return
      }

      console.log('✅ Token found, making API request...')

      const response = await fetch('/api/inquiries/my', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        credentials: 'include'
      })

      if (!response.ok) {
        if (response.status === 401) {
          console.log('User not authenticated, skipping requests load')
          setRequests([])
          return
        }
        throw new Error(`Failed to fetch requests: ${response.status}`)
      }

      const result = await response.json()

      if (result.success) {
        console.log('📋 Total requests loaded:', result.data.length)
        console.log('Requests with quotes:', result.data)

        // Debug: Show which inquiries have quotes
        result.data.forEach(inquiry => {
          console.log(`Inquiry ${inquiry.id} (${inquiry.status}):`, {
            hasQuotes: inquiry.quotes && inquiry.quotes.length > 0,
            quoteCount: inquiry.quotes?.length || 0,
            quotes: inquiry.quotes?.map(q => ({ id: q.id, status: q.status, amount: q.total_amount }))
          })
        })

        setRequests(result.data || [])
      } else {
        console.error('Failed to load requests:', result.message)
        setRequests([])
      }
    } catch (error) {
      console.error('Error loading requests:', error)
      setRequests([])
    } finally {
      setIsLoadingRequests(false)
    }
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
    if (activeSidebarItem !== "All Bookings" && activeSidebarItem !== "Requests") {
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

  const getFilteredRequests = () => {
    let filtered = requests
    console.log('🔍 Filtering requests...', { 
      totalRequests: requests.length, 
      activeTab
    })

    // Filter by status (tab) - similar to bookings but for inquiry status
    if (activeTab === "Upcoming") {
      // Show pending, processing, and quoted inquiries (so sent quotes appear here)
      filtered = filtered.filter(request => 
        request.status === 'pending' || request.status === 'processing' || request.status === 'quoted'
      )
    } else if (activeTab === "Past") {
      // Show completed inquiries (quoted, booked)
      filtered = filtered.filter(request => 
        request.status === 'quoted' || request.status === 'booked'
      )
    } else if (activeTab === "Cancelled") {
      filtered = filtered.filter(request => request.status === 'cancelled')
    } else if (activeTab === "Failed") {
      filtered = filtered.filter(request => request.status === 'expired')
    }

    console.log(`Final filtered requests for ${activeTab}:`, filtered.length)
    return filtered
  }

  const filteredRequests = getFilteredRequests()

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

  const renderRequestCard = (request) => {
    const getStatusColor = (status) => {
      switch (status) {
        case 'pending': return 'bg-yellow-100 text-yellow-800'
        case 'processing': return 'bg-blue-100 text-blue-800'
        case 'quoted': return 'bg-green-100 text-green-800'
        case 'booked': return 'bg-purple-100 text-purple-800'
        case 'cancelled': return 'bg-red-100 text-red-800'
        case 'expired': return 'bg-gray-100 text-gray-800'
        default: return 'bg-gray-100 text-gray-800'
      }
    }

    const getStatusText = (status) => {
      switch (status) {
        case 'pending': return 'Pending Review'
        case 'processing': return 'Processing'
        case 'quoted': return 'Quote Sent'
        case 'booked': return 'Booked'
        case 'cancelled': return 'Cancelled'
        case 'expired': return 'Expired'
        default: return status
      }
    }

    const getInquiryTypeIcon = (type) => {
      switch (type) {
        case 'flight': return '✈️'
        case 'hotel': return '🏨'
        case 'cruise': return '🚢'
        case 'package': return '🎒'
        case 'general': return '💬'
        default: return '📝'
      }
    }

    const getInquiryTypeName = (type) => {
      switch (type) {
        case 'flight': return 'Flight'
        case 'hotel': return 'Hotel'
        case 'cruise': return 'Cruise'
        case 'package': return 'Package'
        case 'general': return 'General'
        default: return 'Inquiry'
      }
    }

    return (
      <div key={request.id} 
           className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <span className="text-xl">{getInquiryTypeIcon(request.inquiry_type)}</span>
              {getInquiryTypeName(request.inquiry_type)} Inquiry
            </h3>
            <p className="text-sm text-gray-500">ID: {request.id.slice(-8)}</p>
          </div>
          <span className={`px-3 py-1 text-xs font-medium rounded-full ${getStatusColor(request.status)}`}>
            {getStatusText(request.status)}
          </span>
        </div>
        
        {/* Progress bar for status tracking */}
        <div className="mb-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>Submitted</span>
            <span>{request.status === 'booked' ? 'Completed' : 'In Progress'}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className={`h-2 rounded-full transition-all duration-500 ${
                request.status === 'pending' ? 'bg-yellow-400 w-1/4' :
                request.status === 'processing' ? 'bg-blue-400 w-1/2' :
                request.status === 'quoted' ? 'bg-green-400 w-3/4' :
                request.status === 'booked' ? 'bg-purple-400 w-full' :
                'bg-gray-400 w-full'
              }`}
            ></div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-sm text-gray-500">Submitted</p>
            <p className="font-medium">
              {new Date(request.created_at).toLocaleDateString()}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Last Updated</p>
            <p className="font-medium">
              {new Date(request.updated_at).toLocaleDateString()}
            </p>
          </div>
          {request.expires_at && (
            <div>
              <p className="text-sm text-gray-500">Expires</p>
              <p className="font-medium">
                {new Date(request.expires_at).toLocaleDateString()}
              </p>
            </div>
          )}
          <div>
            <p className="text-sm text-gray-500">Priority</p>
            <p className="font-medium capitalize">{request.priority || 'Normal'}</p>
          </div>
        </div>
        
        {/* Inquiry details based on type */}
        <div className="mb-4">
          <p className="text-sm text-gray-500 mb-2">Details:</p>
          {request.inquiry_type === 'flight' && (
            <div className="text-sm text-gray-700">
              <p><strong>Route:</strong> {request.flight_origin} → {request.flight_destination}</p>
              {request.flight_departure_date && <p><strong>Departure:</strong> {new Date(request.flight_departure_date).toLocaleDateString()}</p>}
              {request.flight_passengers && <p><strong>Passengers:</strong> {request.flight_passengers}</p>}
            </div>
          )}
          {request.inquiry_type === 'hotel' && (
            <div className="text-sm text-gray-700">
              <p><strong>Destination:</strong> {request.hotel_destination}</p>
              {request.hotel_checkin_date && <p><strong>Check-in:</strong> {new Date(request.hotel_checkin_date).toLocaleDateString()}</p>}
              {request.hotel_rooms && <p><strong>Rooms:</strong> {request.hotel_rooms}</p>}
            </div>
          )}
          {request.inquiry_type === 'cruise' && (
            <div className="text-sm text-gray-700">
              <p><strong>Destination:</strong> {request.cruise_destination}</p>
              {request.cruise_departure_date && <p><strong>Departure:</strong> {new Date(request.cruise_departure_date).toLocaleDateString()}</p>}
              {request.cruise_passengers && <p><strong>Passengers:</strong> {request.cruise_passengers}</p>}
            </div>
          )}
          {request.inquiry_type === 'package' && (
            <div className="text-sm text-gray-700">
              <p><strong>Destination:</strong> {request.package_destination}</p>
              {request.package_start_date && <p><strong>Start:</strong> {new Date(request.package_start_date).toLocaleDateString()}</p>}
              {request.package_travelers && <p><strong>Travelers:</strong> {request.package_travelers}</p>}
            </div>
          )}
          {request.inquiry_type === 'general' && (
            <div className="text-sm text-gray-700">
              <p><strong>Subject:</strong> {request.inquiry_subject}</p>
              <p className="truncate"><strong>Message:</strong> {request.inquiry_message}</p>
            </div>
          )}
        </div>

        {/* Show quote information if available */}
        {request.quotes && request.quotes.length > 0 && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md">
            <p className="text-sm font-semibold text-green-800 mb-2">
              💰 {request.quotes.filter(q => q.status === 'sent' || q.status === 'accepted').length} Quote{request.quotes.filter(q => q.status === 'sent' || q.status === 'accepted').length !== 1 ? 's' : ''} Available
            </p>
            {request.quotes
              .filter(q => q.status === 'sent' || q.status === 'accepted')
              .map((quote) => (
                <div key={quote.id} className="text-sm text-gray-700">
                  <p><strong>Quote #{quote.quote_number}:</strong> ${quote.total_amount} {quote.currency}</p>
                  {quote.expires_at && (
                    <p className="text-xs text-gray-600">
                      Expires: {new Date(quote.expires_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
              ))}
          </div>
        )}

        <div className="flex gap-2">
          <button
            onClick={() => navigate('/request', { state: { inquiryData: request } })}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition"
          >
            View Details
          </button>
          {request.quotes && request.quotes.some(q => q.status === 'sent' || q.status === 'accepted') && (
            <button
              onClick={() => {
                const sentQuote = request.quotes.find(q => q.status === 'sent' || q.status === 'accepted')
                navigate('/quote-detail', { state: { quoteData: sentQuote, inquiryData: request } })
              }}
              className="px-4 py-2 border border-green-300 bg-green-50 text-green-700 text-sm rounded-md hover:bg-green-100 transition"
            >
              View Quote
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
                {["All Bookings", "Flights", "Cruise", "Packages", "Requests"].map((item) => (
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
            {activeSidebarItem === "Requests" ? (
              // Requests section
              isAuthenticated ? (
                isLoadingRequests ? (
                  <div className="flex items-center justify-center p-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <span className="ml-2 text-gray-600">Loading requests...</span>
                  </div>
                ) : filteredRequests.length > 0 ? (
                  <div className="p-6">
                    <div className="mb-6 flex justify-between items-center">
                      <div>
                        <h2 className="text-xl font-semibold text-gray-900">
                          {activeTab} Requests
                        </h2>
                        <p className="text-gray-600">
                          {filteredRequests.length} request{filteredRequests.length !== 1 ? 's' : ''} found
                        </p>
                      </div>
                      <button
                        onClick={loadRequests}
                        className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-md transition"
                        title="Refresh requests"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      </button>
                    </div>
                    <div className="space-y-4">
                      {filteredRequests.map(renderRequestCard)}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center p-6 sm:p-8 md:p-10">
                    <div className="w-48 h-48 sm:w-64 sm:h-64 flex items-center justify-center">
                      <img
                        src="/images/empty-trips.svg" 
                        alt="No requests illustration"
                        className="w-full h-full object-contain"
                        onError={(e) => {
                          e.target.onerror = null
                          e.target.src = "https://via.placeholder.com/300?text=No+Requests"
                        }}
                      />
                    </div>
                    <h2 className="text-xl sm:text-2xl font-semibold mt-6 text-center">
                      No {activeTab} Requests
                    </h2>
                    <p className="text-gray-500 mt-3 text-center max-w-md">
                      You don't have any {activeTab.toLowerCase()} travel requests.
                      {activeTab === "Upcoming" && " When you submit an inquiry, it will appear here."}
                    </p>
                    <div className="mt-8">
                      <button 
                        onClick={() => navigate('/request')} 
                        className="px-8 py-3 bg-[#0ea5e9] text-white rounded-md hover:bg-[#0284c7] transition shadow-sm"
                      >
                        Submit New Request
                      </button>
                    </div>
                  </div>
                )
              ) : (
                <div className="flex flex-col items-center justify-center p-6 sm:p-8 md:p-10">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <h2 className="text-xl sm:text-2xl font-semibold mt-6 text-center">
                    Login Required
                  </h2>
                  <p className="text-gray-500 mt-3 text-center max-w-md">
                    Please log in to view your travel requests and track their status.
                  </p>
                  <div className="mt-8">
                    <button 
                      onClick={handleLoginClick} 
                      className="px-8 py-3 bg-[#0ea5e9] text-white rounded-md hover:bg-[#0284c7] transition shadow-sm"
                    >
                      Log In
                    </button>
                  </div>
                </div>
              )
            ) : (
              // Bookings section (existing logic)
              filteredBookings.length > 0 ? (
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
            )
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
