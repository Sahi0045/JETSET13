"use client"

import React, { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { getApiUrl } from '../../../utils/apiHelper'

// Empty State Component
const EmptyState = ({ icon, title, description, actionLabel, onAction }) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12">
    <div className="flex flex-col items-center justify-center text-center">
      <div className="w-20 h-20 bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl flex items-center justify-center text-4xl mb-6 shadow-inner">
        {icon}
      </div>
      <h3 className="text-xl font-bold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-500 mb-6 max-w-sm">{description}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white font-semibold rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
        >
          {actionLabel}
        </button>
      )}
    </div>
  </div>
)

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

  const loadBookings = async () => {
    const allBookings = []
    
    console.log('🔍 Loading bookings from localStorage...')
    
    // Load flight bookings from localStorage
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

    // Load cruise bookings from localStorage
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

    // Load paid bookings from database (quotes with payment_status='paid')
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('adminToken') || localStorage.getItem('supabase_token')
      
      if (token) {
        console.log('🔍 Loading paid bookings from database...')
        
        // Fetch user's inquiries
        const inquiriesResponse = await fetch(getApiUrl('inquiries?endpoint=my'), {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          credentials: 'include'
        })

        if (inquiriesResponse.ok) {
          const inquiriesResult = await inquiriesResponse.json()
          
          if (inquiriesResult.success) {
            const inquiries = Array.isArray(inquiriesResult.data) 
              ? inquiriesResult.data 
              : (inquiriesResult.data?.inquiries || [])
            
            console.log('📋 Found inquiries:', inquiries.length)
            
            // For each inquiry, check for paid quotes
            for (const inquiry of inquiries) {
              // Fetch quotes for this inquiry
              const quotesResponse = await fetch(getApiUrl(`quotes?inquiryId=${inquiry.id}`), {
                method: 'GET',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json'
                },
                credentials: 'include'
              })

              if (quotesResponse.ok) {
                const quotesResult = await quotesResponse.json()
                
                if (quotesResult.success) {
                  const quotes = Array.isArray(quotesResult.data) ? quotesResult.data : []
                  
                  console.log(`📄 Inquiry ${inquiry.id?.slice(-8)}: Found ${quotes.length} quote(s)`)
                  quotes.forEach(q => {
                    console.log(`  Quote ${q.id?.slice(-8)}: payment_status=${q.payment_status}, status=${q.status}, amount=${q.total_amount}`)
                  })
                  
                  // Check payment status for each quote
                  const quotesWithPaymentStatus = await Promise.all(
                    quotes.map(async (quote) => {
                      try {
                        // Check if there's a completed payment for this quote
                        const paymentResponse = await fetch(getApiUrl(`payments?action=get-payment-details&quoteId=${quote.id}`), {
                          headers: {
                            'Authorization': `Bearer ${token}`,
                            'Content-Type': 'application/json'
                          },
                          credentials: 'include'
                        })
                        
                        if (paymentResponse.ok) {
                          const paymentData = await paymentResponse.json()
                          if (paymentData.success && paymentData.payment) {
                            const payment = paymentData.payment
                            const isPaymentCompleted = payment.payment_status === 'completed' || payment.payment_status === 'paid'
                            console.log(`  Quote ${quote.id?.slice(-8)}: Payment status=${payment.payment_status}, isCompleted=${isPaymentCompleted}`)
                            return { ...quote, hasCompletedPayment: isPaymentCompleted, payment }
                          }
                        }
                      } catch (error) {
                        console.error(`Error checking payment for quote ${quote.id}:`, error)
                      }
                      return { ...quote, hasCompletedPayment: false }
                    })
                  )
                  
                  // Filter for paid/booked quotes - check multiple conditions
                  // Show bookings if:
                  // 1. Quote payment_status is 'paid'
                  // 2. Quote status is 'paid'
                  // 3. Has a completed payment record
                  // 4. Inquiry status is 'booked' or 'paid' (even without payment - admin can mark as booked)
                  const paidQuotes = quotesWithPaymentStatus.filter(q => {
                    const isPaid = q.payment_status === 'paid' || q.status === 'paid'
                    const isBooked = inquiry.status === 'booked' || inquiry.status === 'paid'
                    const hasPayment = q.hasCompletedPayment
                    
                    // Consider it a booking if any of these conditions are true
                    const isPaidQuote = isPaid || hasPayment || isBooked
                    
                    console.log(`  Quote ${q.id?.slice(-8)}: payment_status=${q.payment_status}, quote_status=${q.status}, inquiry_status=${inquiry.status}, isPaid=${isPaid}, isBooked=${isBooked}, hasPayment=${hasPayment}, final=${isPaidQuote}`)
                    return isPaidQuote
                  })
                  
                  console.log(`📄 Inquiry ${inquiry.id?.slice(-8)}: ${paidQuotes.length} paid quote(s) after filtering`)
                  
                  // Convert paid quotes to booking format
                  paidQuotes.forEach(quote => {
                    // Map inquiry type to booking type
                    const typeMap = {
                      'flight': 'flight',
                      'cruise': 'cruise',
                      'hotel': 'hotel',
                      'package': 'package',
                      'general': 'package'
                    }
                    
                    const bookingType = typeMap[inquiry.inquiry_type] || 'package'
                    
                    // Create booking object
                    const booking = {
                      orderId: quote.quote_number || quote.id,
                      bookingReference: quote.quote_number || quote.id,
                      type: bookingType,
                      status: 'CONFIRMED',
                      bookingDate: quote.paid_at || quote.created_at || new Date().toISOString(),
                      amount: parseFloat(quote.total_amount || 0),
                      currency: quote.currency || 'USD',
                      title: quote.title || `${inquiry.inquiry_type} Booking`,
                      description: quote.description || '',
                      inquiryId: inquiry.id,
                      quoteId: quote.id,
                      inquiryType: inquiry.inquiry_type,
                      customerName: inquiry.customer_name,
                      customerEmail: inquiry.customer_email,
                      // Travel details from inquiry
                      travelDetails: inquiry.travel_details || {},
                      // Flight specific
                      origin: inquiry.flight_origin,
                      destination: inquiry.flight_destination,
                      departureDate: inquiry.flight_departure_date,
                      returnDate: inquiry.flight_return_date,
                      // Hotel specific
                      hotelDestination: inquiry.hotel_destination,
                      checkinDate: inquiry.hotel_checkin_date,
                      checkoutDate: inquiry.hotel_checkout_date,
                      // Cruise specific
                      cruiseDestination: inquiry.cruise_destination,
                      cruiseDepartureDate: inquiry.cruise_departure_date,
                      cruiseDuration: inquiry.cruise_duration
                    }
                    
                    allBookings.push(booking)
                    console.log(`✅ Added paid booking: ${booking.orderId} (${bookingType})`)
                  })
                }
              }
            }
          }
        }
      } else {
        console.log('⚠️ No authentication token, skipping database bookings')
      }
    } catch (error) {
      console.error('Error loading paid bookings from database:', error)
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
        supabaseToken: localStorage.getItem('supabase_token') ? 'EXISTS' : 'MISSING',
        isAuthenticated: localStorage.getItem('isAuthenticated'),
        user: localStorage.getItem('user') ? 'EXISTS' : 'MISSING'
      })

      // Get authentication token
      const token = localStorage.getItem('token') || localStorage.getItem('adminToken') || localStorage.getItem('supabase_token')

      if (!token) {
        console.log('❌ No authentication token found, cannot load requests')
        console.log('💡 Please log in first')
        setRequests([])
        setIsLoadingRequests(false)
        return
      }

      console.log('✅ Token found, making API request...')

      // Use query parameter format for Vercel serverless functions
      const response = await fetch(getApiUrl('inquiries?endpoint=my'), {
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
        // Handle both response formats: { data: [...] } or { data: { inquiries: [...] } }
        let inquiries = [];
        if (Array.isArray(result.data)) {
          inquiries = result.data;
        } else if (result.data && Array.isArray(result.data.inquiries)) {
          inquiries = result.data.inquiries;
        } else if (result.data && result.data.inquiries) {
          inquiries = Array.isArray(result.data.inquiries) ? result.data.inquiries : [];
        }
        console.log('📋 Total requests loaded:', inquiries.length)
        
        if (inquiries.length === 0) {
          console.warn('⚠️ No inquiries found. Possible reasons:')
          console.warn('   1. No inquiries created yet')
          console.warn('   2. Inquiries not linked to your account')
          console.warn('   3. Email mismatch (check if customer_email matches your login email)')
        } else {
          console.log('✅ Inquiries found:', inquiries.map(i => ({
            id: i.id?.slice(-8),
            type: i.inquiry_type,
            status: i.status,
            email: i.customer_email,
            hasUserId: !!i.user_id,
            quoteCount: i.quotes?.length || 0
          })))
        }

        // Debug: Show which inquiries have quotes
        inquiries.forEach(inquiry => {
          if (inquiry.quotes && inquiry.quotes.length > 0) {
            console.log(`📄 Inquiry ${inquiry.id?.slice(-8)} (${inquiry.status}):`, {
              hasQuotes: true,
              quoteCount: inquiry.quotes.length,
              quotes: inquiry.quotes.map(q => ({ 
                id: q.id?.slice(-8), 
                status: q.status, 
                amount: q.total_amount,
                number: q.quote_number
              }))
            })
          }
        })

        setRequests(inquiries)
      } else {
        console.error('❌ Failed to load requests:', result.message)
        if (result.error) {
          console.error('   Error details:', result.error)
        }
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
        "Hotels": "hotel",
        "Packages": "package"
      }
      const targetType = typeMap[activeSidebarItem]
      if (targetType) {
        filtered = filtered.filter(booking => booking.type === targetType)
        console.log(`Filtered by type "${targetType}":`, filtered.length)
      }
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
    const isCruiseBooking = booking.type === 'cruise'
    const isHotelBooking = booking.type === 'hotel'
    const isPackageBooking = booking.type === 'package'
    
    // Determine icon and title based on booking type
    const getBookingIcon = () => {
      if (isFlightBooking) return '✈️'
      if (isCruiseBooking) return '🚢'
      if (isHotelBooking) return '🏨'
      if (isPackageBooking) return '🎒'
      return '📦'
    }
    
    const getBookingTitle = () => {
      if (booking.title) return booking.title
      if (isFlightBooking) return 'Flight Booking'
      if (isCruiseBooking) return 'Cruise Booking'
      if (isHotelBooking) return 'Hotel Booking'
      if (isPackageBooking) return 'Package Booking'
      return 'Travel Booking'
    }
    
    // Check if this is a database booking (has quoteId or inquiryId)
    const isDatabaseBooking = !!(booking.quoteId || booking.inquiryId)
    
    return (
      <div key={booking.orderId || booking.bookingReference || booking.quoteId} 
           className="group bg-white border border-gray-200 rounded-xl p-6 hover:shadow-xl hover:border-blue-300 transition-all duration-300 hover:-translate-y-1 relative overflow-hidden">
        {/* Gradient accent bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-purple-600"></div>
        
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-6">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-white text-lg font-semibold ${isFlightBooking ? 'bg-gradient-to-br from-blue-500 to-blue-600' : isCruiseBooking ? 'bg-gradient-to-br from-purple-500 to-purple-600' : 'bg-gradient-to-br from-green-500 to-green-600'}
              `}>
                {getBookingIcon()}
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900 group-hover:text-blue-700 transition-colors">
                  {getBookingTitle()}
                </h3>
                <p className="text-sm text-gray-500 font-medium">
                  #{booking.orderId || booking.bookingReference || booking.quoteId || 'N/A'}
                </p>
                {booking.quoteId && (
                  <p className="text-xs text-gray-400 mt-1">
                    Quote: {booking.orderId || booking.bookingReference}
                  </p>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex flex-col items-start sm:items-end gap-2">
            <span className={`inline-flex items-center px-4 py-2 text-xs font-bold rounded-full shadow-sm ${booking.status === 'CONFIRMED' || booking.status === 'paid' ? 'bg-gradient-to-r from-green-500 to-green-600 text-white' :
              booking.status === 'CANCELLED' ? 'bg-gradient-to-r from-red-500 to-red-600 text-white' :
              'bg-gradient-to-r from-blue-500 to-blue-600 text-white'
            }`}>
              <span className="w-2 h-2 bg-white bg-opacity-50 rounded-full mr-2"></span>
              {booking.status === 'paid' ? 'Paid' : (booking.status || 'Confirmed')}
            </span>
            
            {/* Mobile-friendly status indicator */}
            <div className="sm:hidden text-xs text-gray-500 flex items-center gap-1">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0 1 1 0 002 0zM8 9a1 1 0 000 2h2a1 1 0 100 0H8z" clipRule="evenodd" />
              </svg>
              Tap for details
            </div>
          </div>
        </div>
        
        {/* Show travel details for database bookings */}
        {(booking.origin || booking.destination || booking.departureDate || booking.hotelDestination || booking.cruiseDestination) && (
          <div className="mb-4 p-3 bg-blue-50 rounded-lg">
            {isFlightBooking && booking.origin && booking.destination && (
              <p className="text-sm text-gray-700">
                <span className="font-semibold">Route:</span> {booking.origin} → {booking.destination}
                {booking.departureDate && (
                  <span className="ml-3">
                    <span className="font-semibold">Departure:</span> {new Date(booking.departureDate).toLocaleDateString()}
                  </span>
                )}
              </p>
            )}
            {isHotelBooking && booking.hotelDestination && (
              <p className="text-sm text-gray-700">
                <span className="font-semibold">Destination:</span> {booking.hotelDestination}
                {booking.checkinDate && (
                  <span className="ml-3">
                    <span className="font-semibold">Check-in:</span> {new Date(booking.checkinDate).toLocaleDateString()}
                  </span>
                )}
              </p>
            )}
            {isCruiseBooking && booking.cruiseDestination && (
              <p className="text-sm text-gray-700">
                <span className="font-semibold">Destination:</span> {booking.cruiseDestination}
                {booking.cruiseDepartureDate && (
                  <span className="ml-3">
                    <span className="font-semibold">Departure:</span> {new Date(booking.cruiseDepartureDate).toLocaleDateString()}
                  </span>
                )}
              </p>
            )}
          </div>
        )}
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-50 rounded-lg p-4 hover:bg-blue-50 transition-colors">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Reference</p>
            <p className="text-base font-bold text-gray-900">{booking.orderId || booking.bookingReference || booking.quoteId || 'N/A'}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 hover:bg-blue-50 transition-colors">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">{isDatabaseBooking ? 'Quote Number' : 'Transaction ID'}</p>
            <p className="text-base font-bold text-gray-900">{isDatabaseBooking ? (booking.orderId || booking.bookingReference) : (booking.transactionId || 'N/A')}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 hover:bg-blue-50 transition-colors">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Amount</p>
            <p className="text-lg font-bold text-green-600">
              {booking.currency || 'USD'} {booking.amount ? parseFloat(booking.amount).toFixed(2) : 'N/A'}
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 hover:bg-blue-50 transition-colors">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Booking Date</p>
            <p className="text-sm font-semibold text-gray-900">
              {new Date(booking.bookingDate || booking.orderCreatedAt || booking.paid_at || new Date()).toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric',
                year: 'numeric'
              })}
            </p>
          </div>
        </div>
        
        {booking.description && (
          <div className="mb-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Description</p>
            <p className="text-sm text-gray-700">{booking.description}</p>
          </div>
        )}
        
        <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-100">
          {isDatabaseBooking && booking.quoteId ? (
            <button 
              onClick={async () => {
                try {
                  const token = localStorage.getItem('token') || localStorage.getItem('adminToken') || localStorage.getItem('supabase_token')
                  
                  // Fetch quote and inquiry data
                  const [quoteResponse, inquiryResponse] = await Promise.all([
                    fetch(getApiUrl(`quotes?id=${booking.quoteId}`), {
                      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                      credentials: 'include'
                    }),
                    fetch(getApiUrl(`inquiries?id=${booking.inquiryId}`), {
                      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                      credentials: 'include'
                    })
                  ])
                  
                  const quoteData = await quoteResponse.json()
                  const inquiryData = await inquiryResponse.json()
                  
                  if (quoteData.success && inquiryData.success) {
                    navigate('/quote-detail', { 
                      state: { 
                        quoteData: quoteData.data, 
                        inquiryData: inquiryData.data 
                      } 
                    })
                  } else {
                    // Fallback: navigate to inquiry detail
                    navigate(`/inquiry/${booking.inquiryId}`)
                  }
                } catch (error) {
                  console.error('Error loading quote details:', error)
                  // Fallback: navigate to inquiry detail
                  navigate(`/inquiry/${booking.inquiryId}`)
                }
              }}
              className="flex-1 sm:flex-none px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-sm font-semibold rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5 active:translate-y-0"
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                View Booking Details
              </span>
            </button>
          ) : (
            <button 
              onClick={() => navigate('/booking-confirmation', { state: { bookingData: booking } })}
              className="flex-1 sm:flex-none px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-sm font-semibold rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5 active:translate-y-0"
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                View Details
              </span>
            </button>
          )}
          {isFlightBooking && !isDatabaseBooking && (
            <button 
              onClick={() => navigate('/manage-booking', { state: { bookingData: booking } })}
              className="flex-1 sm:flex-none px-6 py-3 border-2 border-gray-300 text-gray-700 text-sm font-semibold rounded-lg hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 transition-all duration-200 shadow-sm hover:shadow-md"
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Manage Booking
              </span>
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
           className="group bg-white border border-gray-200 rounded-xl p-6 hover:shadow-xl hover:border-blue-300 transition-all duration-300 hover:-translate-y-1 relative overflow-hidden">
        {/* Gradient accent bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-purple-600"></div>
        
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-6">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center text-2xl shadow-sm">
                {getInquiryTypeIcon(request.inquiry_type)}
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900 group-hover:text-blue-700 transition-colors flex items-center gap-2">
                  {getInquiryTypeName(request.inquiry_type)} Inquiry
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full font-medium">
                    #{request.id.slice(-8)}
                  </span>
                </h3>
                <p className="text-sm text-gray-500 font-medium mt-1">
                  Submitted {new Date(request.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>
              </div>
            </div>
          </div>
          
          <div className="flex flex-col items-start sm:items-end gap-2">
            <span className={`inline-flex items-center px-4 py-2 text-xs font-bold rounded-full shadow-sm ${getStatusColor(request.status)}
            `}>
              <span className="w-2 h-2 bg-current bg-opacity-30 rounded-full mr-2"></span>
              {getStatusText(request.status)}
            </span>
            
            {/* Mobile-friendly status indicator */}
            <div className="sm:hidden text-xs text-gray-500 flex items-center gap-1">
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0 1 1 0 002 0zM8 9a1 1 0 000 2h2a1 1 0 100 0H8z" clipRule="evenodd" />
              </svg>
              Tap for details
            </div>
          </div>
        </div>
        
        {/* Enhanced Progress bar */}
        <div className="mb-6 p-4 bg-gradient-to-r from-gray-50 to-blue-50 rounded-lg border border-gray-100">
          <div className="flex justify-between text-sm font-medium text-gray-700 mb-2">
            <span>Progress</span>
            <span className="capitalize">{request.status === 'booked' ? 'Completed' : 'In Progress'}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3 shadow-inner overflow-hidden">
            <div 
              className={`h-full rounded-full transition-all duration-1000 ease-out shadow-sm ${
                request.status === 'pending' ? 'bg-gradient-to-r from-yellow-400 to-yellow-500 w-1/4' :
                request.status === 'processing' ? 'bg-gradient-to-r from-blue-400 to-blue-500 w-1/2' :
                request.status === 'quoted' ? 'bg-gradient-to-r from-green-400 to-green-500 w-3/4' :
                request.status === 'booked' ? 'bg-gradient-to-r from-purple-400 to-purple-500 w-full' :
                'bg-gradient-to-r from-gray-400 to-gray-500 w-full'
              }`}
            ></div>
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-2">
            <span>Submitted</span>
            <span>Quoted</span>
            <span>Booked</span>
          </div>
        </div>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div className="bg-gray-50 rounded-lg p-4 hover:bg-blue-50 transition-colors">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Last Updated</p>
            <p className="text-sm font-semibold text-gray-900">
              {new Date(request.updated_at).toLocaleDateString('en-US', { 
                month: 'short', 
                day: 'numeric',
                year: 'numeric'
              })}
            </p>
          </div>
          <div className="bg-gray-50 rounded-lg p-4 hover:bg-blue-50 transition-colors">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Priority</p>
            <p className="text-sm font-semibold text-gray-900 capitalize">{request.priority || 'Normal'}</p>
          </div>
          {request.expires_at && (
            <div className="bg-amber-50 rounded-lg p-4 border border-amber-200 hover:bg-amber-100 transition-colors sm:col-span-2">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wider mb-1">Expires</p>
              <p className="text-sm font-semibold text-amber-800 flex items-center gap-2">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0 1 1 0 002 0zM8 9a1 1 0 000 2h2a1 1 0 100 0H8z" clipRule="evenodd" />
                </svg>
                {new Date(request.expires_at).toLocaleDateString('en-US', { 
                  month: 'short', 
                  day: 'numeric',
                  year: 'numeric'
                })}
              </p>
            </div>
          )}
        </div>
        
        {/* Inquiry details */}
        <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-100">
          <p className="text-sm font-semibold text-blue-800 mb-3 flex items-center gap-2">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            Inquiry Details
          </p>
          {request.inquiry_type === 'flight' && (
            <div className="text-sm text-gray-700 space-y-1">
              <p><strong className="text-blue-700">Route:</strong> {request.flight_origin} → {request.flight_destination}</p>
              {request.flight_departure_date && <p><strong className="text-blue-700">Departure:</strong> {new Date(request.flight_departure_date).toLocaleDateString()}</p>}
              {request.flight_passengers && <p><strong className="text-blue-700">Passengers:</strong> {request.flight_passengers}</p>}
            </div>
          )}
          {request.inquiry_type === 'hotel' && (
            <div className="text-sm text-gray-700 space-y-1">
              <p><strong className="text-blue-700">Destination:</strong> {request.hotel_destination}</p>
              {request.hotel_checkin_date && <p><strong className="text-blue-700">Check-in:</strong> {new Date(request.hotel_checkin_date).toLocaleDateString()}</p>}
              {request.hotel_rooms && <p><strong className="text-blue-700">Rooms:</strong> {request.hotel_rooms}</p>}
            </div>
          )}
          {request.inquiry_type === 'cruise' && (
            <div className="text-sm text-gray-700 space-y-1">
              <p><strong className="text-blue-700">Destination:</strong> {request.cruise_destination}</p>
              {request.cruise_departure_date && <p><strong className="text-blue-700">Departure:</strong> {new Date(request.cruise_departure_date).toLocaleDateString()}</p>}
              {request.cruise_passengers && <p><strong className="text-blue-700">Passengers:</strong> {request.cruise_passengers}</p>}
            </div>
          )}
          {request.inquiry_type === 'package' && (
            <div className="text-sm text-gray-700 space-y-1">
              <p><strong className="text-blue-700">Destination:</strong> {request.package_destination}</p>
              {request.package_start_date && <p><strong className="text-blue-700">Start:</strong> {new Date(request.package_start_date).toLocaleDateString()}</p>}
              {request.package_travelers && <p><strong className="text-blue-700">Travelers:</strong> {request.package_travelers}</p>}
            </div>
          )}
          {request.inquiry_type === 'general' && (
            <div className="text-sm text-gray-700 space-y-1">
              {request.inquiry_subject && <p><strong className="text-blue-700">Subject:</strong> {request.inquiry_subject}</p>}
              {request.inquiry_message && <p className="truncate"><strong className="text-blue-700">Message:</strong> {request.inquiry_message}</p>}
            </div>
          )}
        </div>

        {/* Show quote information if available */}
        {request.quotes && request.quotes.length > 0 && (
          <div className="mb-6 p-4 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg shadow-sm">
            <p className="text-sm font-bold text-green-800 mb-3 flex items-center gap-2">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" />
              </svg>
              {request.quotes.filter(q => q.status === 'sent' || q.status === 'accepted').length} Quote{request.quotes.filter(q => q.status === 'sent' || q.status === 'accepted').length !== 1 ? 's' : ''} Available
            </p>
            {request.quotes
              .filter(q => q.status === 'sent' || q.status === 'accepted')
              .map((quote) => (
                <div key={quote.id} className="bg-white bg-opacity-50 rounded-md p-3 mb-2 border border-green-200">
                  <div className="flex justify-between items-start mb-2">
                    <p className="text-sm font-semibold text-gray-900">Quote #{quote.quote_number}</p>
                    <p className="text-lg font-bold text-green-600">${quote.total_amount} {quote.currency}</p>
                  </div>
                  {quote.expires_at && (
                    <p className="text-xs text-gray-600 flex items-center gap-1">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0 1 1 0 002 0zM8 9a1 1 0 000 2h2a1 1 0 100 0H8z" clipRule="evenodd" />
                      </svg>
                      Expires: {new Date(quote.expires_at).toLocaleDateString()}
                    </p>
                  )}
                </div>
              ))}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-100">
          <button
            onClick={() => navigate(`/inquiry/${request.id}`)}
            className="flex-1 sm:flex-none px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white text-sm font-semibold rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5 active:translate-y-0"
          >
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              View Details
            </span>
          </button>
          {request.quotes && request.quotes.some(q => q.status === 'sent' || q.status === 'accepted') && (
            <button
              onClick={() => {
                const sentQuote = request.quotes.find(q => q.status === 'sent' || q.status === 'accepted')
                navigate('/quote-detail', { state: { quoteData: sentQuote, inquiryData: request } })
              }}
              className="flex-1 sm:flex-none px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white text-sm font-semibold rounded-lg hover:from-green-700 hover:to-green-800 transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5 active:translate-y-0"
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                View Quote
              </span>
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Clean Header */}
      <header className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => navigate('/')}
                className="flex items-center gap-2 text-gray-600 hover:text-blue-600 transition-colors p-2 -ml-2 rounded-lg hover:bg-gray-100"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                <span className="font-medium hidden sm:inline">Back</span>
              </button>
              <div className="h-6 w-px bg-gray-300 hidden sm:block"></div>
              <h1 className="text-xl font-bold text-gray-900">My Trips</h1>
            </div>
            
            <div className="flex items-center gap-3">
              {isGuest && (
                <button
                  onClick={handleLoginClick}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Sign In
                </button>
              )}
              <button
                onClick={toggleMobileMenu}
                className="lg:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
            </div>
          </div>
        </div>
        
        {isGuest && (
          <div className="bg-amber-50 border-b border-amber-200">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
              <p className="text-sm text-amber-800 flex items-center gap-2">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                Viewing as guest. Sign in to see your bookings.
              </p>
            </div>
          </div>
        )}
      </header>

      {/* Tab Navigation */}
      <div className="bg-white border-b border-gray-200 sticky top-16 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-1 py-3 overflow-x-auto hide-scrollbar">
            {["Upcoming", "Past", "Cancelled", "Failed"].map((tab) => (
              <button
                key={tab}
                onClick={() => handleTabChange(tab)}
                className={`px-5 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                  activeTab === tab 
                    ? "bg-blue-600 text-white shadow-sm" 
                    : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex gap-6">
          {/* Sidebar */}
          <aside className={`
            fixed lg:relative inset-y-0 left-0 z-40 w-72 bg-white lg:bg-transparent
            transform transition-transform duration-300 lg:transform-none
            ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
            lg:block flex-shrink-0
          `}>
            <div className="h-full lg:h-auto overflow-y-auto lg:overflow-visible p-4 lg:p-0">
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4 lg:sticky lg:top-36">
                <div className="flex items-center justify-between mb-4 lg:hidden">
                  <h2 className="font-semibold text-gray-900">Categories</h2>
                  <button onClick={toggleMobileMenu} className="p-1 hover:bg-gray-100 rounded">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                
                <nav className="space-y-1">
                  {[
                    { key: "All Bookings", icon: "📋", count: bookings.length },
                    { key: "Flights", icon: "✈️", count: bookings.filter(b => b.type === 'flight').length },
                    { key: "Hotels", icon: "🏨", count: bookings.filter(b => b.type === 'hotel').length },
                    { key: "Cruise", icon: "🚢", count: bookings.filter(b => b.type === 'cruise').length },
                    { key: "Packages", icon: "🎒", count: bookings.filter(b => b.type === 'package').length },
                  ].map((item) => (
                    <button
                      key={item.key}
                      onClick={() => handleSidebarItemChange(item.key)}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-colors ${
                        activeSidebarItem === item.key 
                          ? "bg-blue-50 text-blue-700" 
                          : "text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      <span className="flex items-center gap-3">
                        <span className="text-lg">{item.icon}</span>
                        <span className="font-medium text-sm">{item.key}</span>
                      </span>
                      {item.count > 0 && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${
                          activeSidebarItem === item.key 
                            ? "bg-blue-100 text-blue-700" 
                            : "bg-gray-100 text-gray-600"
                        }`}>
                          {item.count}
                        </span>
                      )}
                    </button>
                  ))}
                  
                  <div className="border-t border-gray-200 my-3"></div>
                  
                  <button
                    onClick={() => handleSidebarItemChange("Requests")}
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-colors ${
                      activeSidebarItem === "Requests" 
                        ? "bg-purple-50 text-purple-700" 
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <span className="flex items-center gap-3">
                      <span className="text-lg">💬</span>
                      <span className="font-medium text-sm">My Requests</span>
                    </span>
                    {requests.length > 0 && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        activeSidebarItem === "Requests" 
                          ? "bg-purple-100 text-purple-700" 
                          : "bg-gray-100 text-gray-600"
                      }`}>
                        {requests.length}
                      </span>
                    )}
                  </button>
                </nav>
              </div>
            </div>
          </aside>

          {/* Overlay for mobile */}
          {isMobileMenuOpen && (
            <div 
              className="fixed inset-0 bg-black/50 z-30 lg:hidden"
              onClick={toggleMobileMenu}
            />
          )}

          {/* Main Content */}
          <main className="flex-1 min-w-0">
            {activeSidebarItem === "Requests" ? (
              /* Requests Section */
              isAuthenticated ? (
                isLoadingRequests ? (
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-12">
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-10 h-10 border-3 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                      <p className="mt-4 text-gray-600">Loading requests...</p>
                    </div>
                  </div>
                ) : filteredRequests.length > 0 ? (
                  <div className="space-y-4">
                    {/* Header */}
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-lg font-semibold text-gray-900">{activeTab} Requests</h2>
                        <p className="text-sm text-gray-500">{filteredRequests.length} request{filteredRequests.length !== 1 ? 's' : ''}</p>
                      </div>
                      <button
                        onClick={loadRequests}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Refresh"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                      </button>
                    </div>
                    
                    {/* Request Cards */}
                    <div className="grid gap-4">
                      {filteredRequests.map(renderRequestCard)}
                    </div>
                  </div>
                ) : (
                  <EmptyState 
                    icon="💬"
                    title={`No ${activeTab} Requests`}
                    description="When you submit a travel inquiry, it will appear here."
                    actionLabel="Submit New Request"
                    onAction={() => navigate('/request')}
                  />
                )
              ) : (
                <EmptyState 
                  icon="🔒"
                  title="Login Required"
                  description="Please sign in to view your travel requests."
                  actionLabel="Sign In"
                  onAction={handleLoginClick}
                />
              )
            ) : (
              /* Bookings Section */
              filteredBookings.length > 0 ? (
                <div className="space-y-4">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">
                        {activeTab} {activeSidebarItem === "All Bookings" ? "Bookings" : activeSidebarItem}
                      </h2>
                      <p className="text-sm text-gray-500">{filteredBookings.length} booking{filteredBookings.length !== 1 ? 's' : ''}</p>
                    </div>
                    <button
                      onClick={loadBookings}
                      className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                      title="Refresh"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                    </button>
                  </div>
                  
                  {/* Booking Cards */}
                  <div className="grid gap-4">
                    {filteredBookings.map(renderBookingCard)}
                  </div>
                </div>
              ) : (
                <EmptyState 
                  icon={isGuest ? "🔒" : "✈️"}
                  title={isGuest ? "Sign In to View Bookings" : `No ${activeTab} Bookings`}
                  description={isGuest 
                    ? "Sign in to view your trips and bookings." 
                    : "When you book a trip, it will appear here."
                  }
                  actionLabel={isGuest ? "Sign In" : "Book a Trip"}
                  onAction={isGuest ? handleLoginClick : () => navigate('/')}
                />
              )
            )}
          </main>
        </div>
      </div>

      {/* Login Popup */}
      {showLoginPopup && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-xl">
            <div className="text-center">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Sign In Required</h2>
              <p className="text-gray-600 text-sm mb-6">
                Sign in to view your trips, bookings, and travel requests.
              </p>
              <div className="space-y-3">
                <button
                  onClick={handleLoginClick}
                  className="w-full py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Sign In
                </button>
                <button
                  onClick={closeLoginPopup}
                  className="w-full py-3 text-gray-600 font-medium hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Continue as Guest
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
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
