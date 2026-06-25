"use client"

import React, { useState, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import {
  FaPlane, FaShip, FaHotel, FaSuitcaseRolling, FaClipboardList,
  FaCommentDots, FaStar, FaEye, FaCog, FaTimesCircle, FaCheckCircle,
  FaCalendarAlt, FaMapMarkerAlt, FaLock,
  FaSyncAlt, FaInfoCircle, FaFileInvoiceDollar, FaExclamationTriangle,
  FaClock, FaShieldAlt,
} from 'react-icons/fa'
import { getApiUrl } from '../../../utils/apiHelper'
import Navbar from '../Navbar'
import Footer from '../Footer'
import { useSupabaseAuth } from '../../../contexts/SupabaseAuthContext'
import ArcPayService from '../../../Services/ArcPayService'
import Price from '../../../Components/Price'

// ----- Icon helpers (react-icons replace emoji) -----
const TYPE_ICON = {
  flight: FaPlane,
  cruise: FaShip,
  hotel: FaHotel,
  package: FaSuitcaseRolling,
  general: FaCommentDots,
  default: FaClipboardList,
}

const TypeIcon = ({ type, className = '' }) => {
  const Icon = TYPE_ICON[(type || '').toLowerCase()] || TYPE_ICON.default
  return <Icon className={className} />
}

const TYPE_NAME = {
  flight: 'Flight',
  cruise: 'Cruise',
  hotel: 'Hotel',
  package: 'Package',
  general: 'General',
  default: 'Travel',
}

const getTypeName = (type) => TYPE_NAME[(type || '').toLowerCase()] || TYPE_NAME.default

const fmtDate = (d, opts) => {
  if (!d) return ''
  try {
    return new Date(d).toLocaleDateString('en-US', opts || { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return ''
  }
}

// Reusable eyebrow label
const Eyebrow = ({ children, className = '' }) => (
  <span className={`text-[11px] font-semibold uppercase tracking-widest text-gray-400 ${className}`}>{children}</span>
)

// Empty State Component
const EmptyState = ({ icon, title, description, actionLabel, onAction }) => (
  <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_15px_30px_-5px_rgba(5,91,117,0.12)] p-12">
    <div className="flex flex-col items-center justify-center text-center">
      <div className="w-20 h-20 bg-gradient-to-br from-[#F0FAFC] to-[#E3F1F6] rounded-2xl flex items-center justify-center text-3xl mb-6 text-[#055B75]">
        {icon}
      </div>
      <h3 className="text-xl font-bold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-500 mb-6 max-w-sm">{description}</p>
      {actionLabel && onAction && (
        <button
          onClick={onAction}
          className="px-6 py-3 bg-gradient-to-br from-[#055B75] to-[#034457] text-white font-semibold rounded-lg hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 shadow-md shadow-[#055B75]/30"
        >
          {actionLabel}
        </button>
      )}
    </div>
  </div>
)

const Spinner = ({ label }) => (
  <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_15px_30px_-5px_rgba(5,91,117,0.12)] p-12">
    <div className="flex flex-col items-center justify-center">
      <div className="w-10 h-10 border-[3px] border-[#055B75] border-t-transparent rounded-full animate-spin"></div>
      <p className="mt-4 text-gray-600">{label}</p>
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
  const [isLoadingBookings, setIsLoadingBookings] = useState(false)
  const [cancellingBookingId, setCancellingBookingId] = useState(null)
  const [showCancelConfirm, setShowCancelConfirm] = useState(null)

  useEffect(() => {
    // Check if user is authenticated
    const authStatus = localStorage.getItem('isAuthenticated')
    const userStr = localStorage.getItem('user')

    console.log('🔐 Auth Check:', {
      isAuthenticated: authStatus,
      hasUser: !!userStr,
      token: localStorage.getItem('token') ? 'EXISTS' : 'MISSING',
      supabaseToken: localStorage.getItem('supabase_token') ? 'EXISTS' : 'MISSING'
    })

    if (authStatus !== 'true') {
      // Set as guest user instead of redirecting
      setIsGuest(true)
      // Show login popup after a short delay
      setTimeout(() => {
        setShowLoginPopup(true)
      }, 500)
    } else {
      setIsAuthenticated(true)
      // Parse user to get email for debugging
      if (userStr) {
        try {
          const user = JSON.parse(userStr)
          console.log('👤 User:', { email: user.email, id: user.id })
        } catch (e) { }
      }
    }

    // Load bookings - both from localStorage and database
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
  }, []) // Run once on mount

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
    setIsLoadingBookings(true)
    const allBookings = []

    console.log('🔍 Loading bookings...')

    // First, try to load bookings from database
    try {
      console.log('🔍 Fetching bookings from database...')
      // Get user ID from localStorage so backend can filter by user
      let currentUserId = ''
      try {
        const storedUser = localStorage.getItem('user')
        if (storedUser) {
          const parsed = JSON.parse(storedUser)
          currentUserId = parsed.id || parsed.uid || ''
        }
      } catch (e) { /* ignore parse errors */ }

      const bookingsUrl = currentUserId
        ? getApiUrl(`flights/bookings?userId=${encodeURIComponent(currentUserId)}`)
        : getApiUrl('flights/bookings')

      const response = await fetch(bookingsUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        const result = await response.json()
        console.log('📋 Database bookings response:', result)

        if (result.success && result.data) {
          result.data.forEach(booking => {
            allBookings.push({
              ...booking,
              source: 'database'
            })
          })
          console.log(`✅ Loaded ${result.data.length} bookings from database`)
        }
      }
    } catch (error) {
      console.error('Error fetching database bookings:', error)
    }

    // Load flight bookings from localStorage (as fallback/supplement)
    // Support both array format (new) and single object format (legacy)
    const flightBookingRaw = localStorage.getItem('completedFlightBookings') || localStorage.getItem('completedFlightBooking')
    console.log('Flight booking from localStorage:', flightBookingRaw ? 'Found' : 'Not found')

    if (flightBookingRaw) {
      try {
        const parsed = JSON.parse(flightBookingRaw)
        const flightBookingsArr = Array.isArray(parsed) ? parsed : [parsed]
        console.log(`Parsed ${flightBookingsArr.length} flight booking(s) from localStorage`)
        for (const booking of flightBookingsArr) {
          // Check if this booking already exists in database bookings
          const exists = allBookings.some(b =>
            b.bookingReference === booking.bookingReference ||
            b.pnr === booking.pnr
          )
          if (!exists) {
            allBookings.push({
              ...booking,
              type: 'flight',
              bookingDate: booking.orderCreatedAt || new Date().toISOString(),
              source: 'localStorage'
            })
          }
        }
      } catch (error) {
        console.error('Error parsing flight booking:', error)
      }
    }

    // Load cruise bookings from localStorage
    const cruiseBooking = localStorage.getItem('completedBooking')
    console.log('Cruise booking from localStorage:', cruiseBooking ? 'Found' : 'Not found')

    if (cruiseBooking) {
      try {
        const booking = JSON.parse(cruiseBooking)
        console.log('Parsed cruise booking:', booking)
        // Check if this booking already exists in database bookings
        const exists = allBookings.some(b =>
          b.bookingReference === booking.bookingReference
        )
        if (!exists) {
          allBookings.push({
            ...booking,
            type: 'cruise',
            bookingDate: booking.orderCreatedAt || new Date().toISOString(),
            source: 'localStorage'
          })
        }
      } catch (error) {
        console.error('Error parsing cruise booking:', error)
      }
    }

    // Load paid bookings from database
    try {
      const token = localStorage.getItem('token') || localStorage.getItem('adminToken') || localStorage.getItem('supabase_token')

      if (token) {
        console.log('🔍 Loading paid bookings from database...')

        // Method 1: Fetch user's inquiries and their quotes
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
          console.log('📋 Inquiries API response:', inquiriesResult)

          if (inquiriesResult.success) {
            const inquiries = Array.isArray(inquiriesResult.data)
              ? inquiriesResult.data
              : (inquiriesResult.data?.inquiries || [])

            console.log('📋 Found inquiries:', inquiries.length)

            // Check for booked/paid inquiries directly first
            const bookedInquiries = inquiries.filter(inq =>
              inq.status === 'booked' || inq.status === 'paid'
            )

            console.log('📋 Booked/Paid inquiries:', bookedInquiries.length)

            // For booked inquiries, add them directly as bookings
            for (const inquiry of bookedInquiries) {
              const typeMap = {
                'flight': 'flight',
                'cruise': 'cruise',
                'hotel': 'hotel',
                'package': 'package',
                'general': 'package'
              }

              const bookingType = typeMap[inquiry.inquiry_type] || 'package'

              // Create booking from inquiry
              const booking = {
                orderId: inquiry.id?.slice(-8) || 'N/A',
                bookingReference: inquiry.id,
                type: bookingType,
                status: 'CONFIRMED',
                bookingDate: inquiry.updated_at || inquiry.created_at || new Date().toISOString(),
                amount: inquiry.budget || 0,
                currency: 'USD',
                title: `${inquiry.inquiry_type?.charAt(0).toUpperCase() + inquiry.inquiry_type?.slice(1)} Booking`,
                description: '',
                inquiryId: inquiry.id,
                inquiryType: inquiry.inquiry_type,
                customerName: inquiry.customer_name,
                customerEmail: inquiry.customer_email,
                // Flight travel details
                origin: inquiry.flight_origin,
                destination: inquiry.flight_destination,
                departureDate: inquiry.flight_departure_date,
                returnDate: inquiry.flight_return_date,
                passengers: inquiry.flight_passengers,
                travelClass: inquiry.flight_class,
                // Hotel travel details
                hotelDestination: inquiry.hotel_destination,
                checkinDate: inquiry.hotel_checkin_date,
                checkoutDate: inquiry.hotel_checkout_date,
                hotelRooms: inquiry.hotel_rooms,
                hotelGuests: inquiry.hotel_guests,
                // Cruise travel details
                cruiseDestination: inquiry.cruise_destination,
                cruiseDepartureDate: inquiry.cruise_departure_date,
                cruiseDuration: inquiry.cruise_duration,
                cruisePassengers: inquiry.cruise_passengers,
                cruiseCabinType: inquiry.cruise_cabin_type,
                // Package travel details
                packageDestination: inquiry.package_destination,
                packageStartDate: inquiry.package_start_date,
                packageEndDate: inquiry.package_end_date,
                packageTravelers: inquiry.package_travelers,
                packageBudgetRange: inquiry.package_budget_range
              }

              // Check if already added to avoid duplicates
              const existingIndex = allBookings.findIndex(b => b.inquiryId === inquiry.id)
              if (existingIndex === -1) {
                allBookings.push(booking)
                console.log(`✅ Added booked inquiry: ${booking.orderId} (${bookingType})`)
              }
            }

            // Process quotes that are already embedded in inquiry objects (no extra API calls needed)
            for (const inquiry of inquiries) {
              // Use quotes directly from inquiry object (fetched via Supabase join)
              const quotes = Array.isArray(inquiry.quotes) ? inquiry.quotes : []

              // Find paid quotes
              const paidQuotes = quotes.filter(q =>
                q.payment_status === 'paid' ||
                q.status === 'paid' ||
                q.status === 'accepted'
              )

              if (paidQuotes.length > 0) {
                console.log(`📄 Inquiry ${inquiry.id?.slice(-8)}: ${paidQuotes.length} paid/accepted quote(s)`)
              }

              // Convert paid quotes to booking format
              for (const quote of paidQuotes) {
                const typeMap = {
                  'flight': 'flight',
                  'cruise': 'cruise',
                  'hotel': 'hotel',
                  'package': 'package',
                  'general': 'package'
                }

                const bookingType = typeMap[inquiry.inquiry_type] || 'package'

                // Check if already exists
                const existingIndex = allBookings.findIndex(b =>
                  b.quoteId === quote.id || b.inquiryId === inquiry.id
                )

                if (existingIndex === -1) {
                  const booking = {
                    orderId: quote.quote_number || quote.id?.slice(-8),
                    bookingReference: quote.quote_number || quote.id,
                    type: bookingType,
                    status: quote.payment_status === 'paid' ? 'paid' : 'CONFIRMED',
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
                    // Flight travel details
                    origin: inquiry.flight_origin,
                    destination: inquiry.flight_destination,
                    departureDate: inquiry.flight_departure_date,
                    returnDate: inquiry.flight_return_date,
                    passengers: inquiry.flight_passengers,
                    travelClass: inquiry.flight_class,
                    // Hotel travel details
                    hotelDestination: inquiry.hotel_destination,
                    checkinDate: inquiry.hotel_checkin_date,
                    checkoutDate: inquiry.hotel_checkout_date,
                    hotelRooms: inquiry.hotel_rooms,
                    hotelGuests: inquiry.hotel_guests,
                    // Cruise travel details
                    cruiseDestination: inquiry.cruise_destination,
                    cruiseDepartureDate: inquiry.cruise_departure_date,
                    cruiseDuration: inquiry.cruise_duration,
                    cruisePassengers: inquiry.cruise_passengers,
                    cruiseCabinType: inquiry.cruise_cabin_type,
                    // Package travel details
                    packageDestination: inquiry.package_destination,
                    packageStartDate: inquiry.package_start_date,
                    packageEndDate: inquiry.package_end_date,
                    packageTravelers: inquiry.package_travelers,
                    packageBudgetRange: inquiry.package_budget_range
                  }

                  allBookings.push(booking)
                  console.log(`✅ Added paid quote: ${booking.orderId} (${bookingType})`)
                }
              }
            }
          }
        } else {
          console.log('❌ Failed to fetch inquiries:', inquiriesResponse.status)
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
    setIsLoadingBookings(false)
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

  // Helper function to get travel date from booking
  const getTravelDateFromBooking = (booking) => {
    // Check various date fields depending on booking type
    if (booking.type === 'flight') {
      return booking.departureDate || booking.flight_departure_date || booking.flightData?.departureDate;
    } else if (booking.type === 'cruise') {
      return booking.cruiseDepartureDate || booking.cruise_departure_date || booking.cruiseData?.departureDate;
    } else if (booking.type === 'hotel') {
      return booking.checkinDate || booking.hotel_checkin_date || booking.hotelData?.checkinDate;
    } else if (booking.type === 'package') {
      return booking.packageStartDate || booking.package_start_date;
    }
    // Fallback to generic departure/start date fields
    return booking.departureDate || booking.startDate || booking.travelDate;
  };

  // Check if a booking's travel date is in the past
  const isTravelDatePast = (booking) => {
    const travelDate = getTravelDateFromBooking(booking);
    if (!travelDate) return false; // If no date, consider it upcoming

    const tripDate = new Date(travelDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    tripDate.setHours(0, 0, 0, 0);

    return tripDate < today;
  };

  // Filter bookings based on active tab and sidebar selection
  // Filter a booking list by the active tab (Upcoming / Past / Cancelled / Failed)
  const filterByTab = (list) => {
    const normalizeStatus = (s) => (s || '').toUpperCase();
    if (activeTab === "Upcoming") {
      return list.filter((b) => {
        const status = normalizeStatus(b.status);
        const isCancelled = status === 'CANCELLED' || status === 'FAILED';
        return !isCancelled && !isTravelDatePast(b);
      });
    }
    if (activeTab === "Past") {
      return list.filter((b) => {
        const status = normalizeStatus(b.status);
        const isCancelled = status === 'CANCELLED' || status === 'FAILED';
        return !isCancelled && isTravelDatePast(b);
      });
    }
    if (activeTab === "Cancelled") return list.filter((b) => normalizeStatus(b.status) === 'CANCELLED');
    if (activeTab === "Failed") return list.filter((b) => normalizeStatus(b.status) === 'FAILED');
    return list;
  };

  const getFilteredBookings = () => {
    // First narrow to the active tab, then by sidebar type
    let filtered = filterByTab(bookings);
    if (activeSidebarItem !== "All Bookings" && activeSidebarItem !== "Requests") {
      const typeMap = { "Flights": "flight", "Cruise": "cruise", "Hotels": "hotel", "Packages": "package" };
      const targetType = typeMap[activeSidebarItem];
      if (targetType) filtered = filtered.filter((booking) => booking.type === targetType);
    }
    return filtered;
  };

  const filteredBookings = getFilteredBookings()
  // Bookings within the current tab — used for sidebar counts so the badges match the list
  const tabBookings = filterByTab(bookings)

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

  // ---- Booking card ----
  const renderBookingCard = (booking) => {
    const isFlightBooking = booking.type === 'flight'
    const isCruiseBooking = booking.type === 'cruise'
    const isHotelBooking = booking.type === 'hotel'
    const isPackageBooking = booking.type === 'package'

    const getBookingTitle = () => {
      if (booking.title) return booking.title
      return `${getTypeName(booking.type)} Booking`
    }

    // Check if this is a database booking (has quoteId or inquiryId)
    const isDatabaseBooking = !!(booking.quoteId || booking.inquiryId)

    // Calculate days until trip
    const travelDate = getTravelDateFromBooking(booking);
    const getDaysUntil = () => {
      if (!travelDate) return null;
      const tripDate = new Date(travelDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      tripDate.setHours(0, 0, 0, 0);
      const diffTime = tripDate - today;
      return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    };
    const daysUntilTrip = getDaysUntil();
    const normalizeStatus = (s) => (s || '').toUpperCase();
    const statusUp = normalizeStatus(booking.status);

    const DetailCell = ({ label, children }) => (
      <div className="bg-white rounded-lg p-3 border border-[#D1E9F0]">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#0890BC] mb-1">{label}</p>
        <p className="text-sm font-bold text-gray-900">{children}</p>
      </div>
    )

    return (
      <div key={booking.orderId || booking.bookingReference || booking.quoteId}
        className="group bg-white rounded-2xl p-6 border border-gray-100 shadow-[0_15px_30px_-5px_rgba(5,91,117,0.12)] hover:shadow-[0_20px_40px_-8px_rgba(5,91,117,0.2)] hover:-translate-y-0.5 transition-all duration-200 relative overflow-hidden">
        {/* Teal accent rail */}
        <span className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-[#055B75] to-[#0890BC]" />

        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-[#055B75]/10 text-[#055B75] text-lg flex-shrink-0">
                <TypeIcon type={booking.type} />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-gray-900 group-hover:text-[#055B75] transition-colors truncate">
                  {getBookingTitle()}
                </h3>
                <p className="text-sm text-gray-500 font-medium">
                  #{booking.orderId || booking.bookingReference || booking.quoteId || 'N/A'}
                </p>
                {booking.quoteId && (
                  <p className="text-xs text-gray-400 mt-0.5">Quote: {booking.orderId || booking.bookingReference}</p>
                )}
              </div>
            </div>
            {/* Travel Date Countdown Badge */}
            {daysUntilTrip !== null && daysUntilTrip >= 0 && (
              <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold mt-3 ${daysUntilTrip === 0 ? 'bg-green-50 text-green-700 border border-green-200' :
                daysUntilTrip <= 3 ? 'bg-orange-50 text-orange-700 border border-orange-200' :
                  daysUntilTrip <= 7 ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                    'bg-[#F0FAFC] text-[#055B75] border border-[#D1E9F0]'
                }`}>
                <FaCalendarAlt className="w-3 h-3" />
                {daysUntilTrip === 0 ? '🎉 Today!' :
                  daysUntilTrip === 1 ? 'Tomorrow' :
                    `${daysUntilTrip} days to go`}
              </div>
            )}
            {daysUntilTrip !== null && daysUntilTrip < 0 && (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold mt-3 bg-gray-50 text-gray-500 border border-gray-200">
                <FaCheckCircle className="w-3 h-3" /> Trip Completed
              </div>
            )}
          </div>

          <div className="flex flex-col items-start sm:items-end gap-2">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-full border ${statusUp === 'CONFIRMED' || booking.status === 'paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
              statusUp === 'CANCELLED' ? 'bg-red-50 text-red-700 border-red-200' :
                'bg-[#F0FAFC] text-[#055B75] border-[#B9D0DC]'
              }`}>
              {statusUp === 'CONFIRMED' || booking.status === 'paid' ? <FaCheckCircle className="w-3 h-3" /> :
                statusUp === 'CANCELLED' ? <FaTimesCircle className="w-3 h-3" /> : null}
              {booking.status === 'paid' ? 'Paid' : statusUp === 'CONFIRMED' ? 'Confirmed' : statusUp === 'CANCELLED' ? 'Cancelled' : (booking.status || 'Confirmed')}
            </span>
          </div>
        </div>

        {/* Travel details panel */}
        {(booking.origin || booking.destination || booking.departureDate || booking.hotelDestination || booking.cruiseDestination || booking.returnDate || booking.checkinDate || booking.checkoutDate || booking.cruiseDepartureDate) && (
          <div className="mb-4 p-4 bg-[#F1FBFD] rounded-xl border border-[#D1E9F0]">
            <div className="flex items-center gap-2 mb-3">
              <FaMapMarkerAlt className="w-3.5 h-3.5 text-[#055B75]" />
              <span className="text-[11px] font-bold uppercase tracking-widest text-[#055B75]">Travel Details</span>
            </div>

            {isFlightBooking && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {(booking.origin || booking.destination) && (
                    <DetailCell label="Route">{booking.origin || 'N/A'} → {booking.destination || 'N/A'}</DetailCell>
                  )}
                  {booking.departureDate && <DetailCell label="Departure">{fmtDate(booking.departureDate)}</DetailCell>}
                  {booking.returnDate && <DetailCell label="Return">{fmtDate(booking.returnDate)}</DetailCell>}
                  {(booking.passengers || booking.travelClass) && (
                    <DetailCell label={booking.travelClass ? 'Class & Passengers' : 'Passengers'}>
                      <span className="capitalize">{booking.travelClass && booking.travelClass.replace('_', ' ')}</span>
                      {booking.travelClass && booking.passengers && ' • '}
                      {booking.passengers && `${booking.passengers} ${booking.passengers === 1 ? 'Traveler' : 'Travelers'}`}
                    </DetailCell>
                  )}
                </div>

                {/* Enriched Flight Details */}
                {(booking.airlineName || booking.flightNumber || booking.departureTime || booking.duration || booking.pnr) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
                    {(booking.airlineName || booking.flightNumber) && (
                      <DetailCell label="Airline / Flight">
                        {booking.airlineName || booking.airline || ''}{booking.flightNumber ? ` • ${booking.flightNumber}` : ''}
                        {booking.aircraft && <span className="block text-xs text-gray-500 font-medium mt-0.5">{booking.aircraft}</span>}
                        {booking.operatingAirlineName && booking.operatingAirlineName !== booking.airlineName && (
                          <span className="block text-xs text-gray-400 mt-0.5">Operated by {booking.operatingAirlineName}</span>
                        )}
                      </DetailCell>
                    )}
                    {(booking.departureTime || booking.departureTerminal) && (
                      <DetailCell label="Departure">
                        {booking.departureTime || ''}{booking.departureTerminal ? ` • Terminal ${booking.departureTerminal}` : ''}
                      </DetailCell>
                    )}
                    {(booking.arrivalTime || booking.arrivalTerminal) && (
                      <DetailCell label="Arrival">
                        {booking.arrivalTime || ''}{booking.arrivalTerminal ? ` • Terminal ${booking.arrivalTerminal}` : ''}
                      </DetailCell>
                    )}
                    {(booking.duration || booking.stops !== undefined) && (
                      <DetailCell label="Duration">
                        {booking.duration || ''}
                        {booking.stops !== undefined && booking.stops !== null && (
                          <span className="text-xs text-gray-500 ml-1 font-medium">• {booking.stops === 0 ? 'Direct' : `${booking.stops} Stop${booking.stops > 1 ? 's' : ''}`}</span>
                        )}
                      </DetailCell>
                    )}
                  </div>
                )}

                {/* PNR, Cabin Class, Baggage, Fare Type */}
                {(booking.pnr || booking.cabinClass || booking.baggage || booking.brandedFareLabel) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
                    {booking.pnr && <DetailCell label="PNR"><span className="tracking-wider">{booking.pnr}</span></DetailCell>}
                    {booking.cabinClass && <DetailCell label="Cabin Class"><span className="capitalize">{booking.cabinClass.replace('_', ' ')}</span></DetailCell>}
                    {booking.baggage && <DetailCell label="Baggage">{typeof booking.baggage === 'object' ? JSON.stringify(booking.baggage) : booking.baggage}</DetailCell>}
                    {booking.brandedFareLabel && <DetailCell label="Fare Type">{booking.brandedFareLabel}</DetailCell>}
                  </div>
                )}
              </>
            )}

            {isHotelBooking && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {booking.hotelDestination && <DetailCell label="Destination">{booking.hotelDestination}</DetailCell>}
                {booking.checkinDate && <DetailCell label="Check-in">{fmtDate(booking.checkinDate)}</DetailCell>}
                {booking.checkoutDate && <DetailCell label="Check-out">{fmtDate(booking.checkoutDate)}</DetailCell>}
                {(booking.hotelRooms || booking.hotelGuests) && (
                  <DetailCell label="Rooms & Guests">
                    {booking.hotelRooms && `${booking.hotelRooms} ${booking.hotelRooms === 1 ? 'Room' : 'Rooms'}`}
                    {booking.hotelRooms && booking.hotelGuests && ' • '}
                    {booking.hotelGuests && `${booking.hotelGuests} ${booking.hotelGuests === 1 ? 'Guest' : 'Guests'}`}
                  </DetailCell>
                )}
              </div>
            )}

            {isCruiseBooking && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {booking.cruiseDestination && <DetailCell label="Destination">{booking.cruiseDestination}</DetailCell>}
                {booking.cruiseDepartureDate && <DetailCell label="Departure">{fmtDate(booking.cruiseDepartureDate)}</DetailCell>}
                {booking.cruiseDuration && <DetailCell label="Duration">{booking.cruiseDuration} {booking.cruiseDuration === 1 ? 'Day' : 'Days'}</DetailCell>}
                {(booking.cruisePassengers || booking.cruiseCabinType) && (
                  <DetailCell label={booking.cruiseCabinType ? 'Cabin & Passengers' : 'Passengers'}>
                    {booking.cruiseCabinType && `${booking.cruiseCabinType}`}
                    {booking.cruiseCabinType && booking.cruisePassengers && ' • '}
                    {booking.cruisePassengers && `${booking.cruisePassengers} ${booking.cruisePassengers === 1 ? 'Person' : 'People'}`}
                  </DetailCell>
                )}
              </div>
            )}

            {isPackageBooking && (booking.packageDestination || booking.packageStartDate || booking.packageEndDate || booking.packageTravelers) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {booking.packageDestination && <DetailCell label="Destination">{booking.packageDestination}</DetailCell>}
                {booking.packageStartDate && <DetailCell label="Start Date">{fmtDate(booking.packageStartDate)}</DetailCell>}
                {booking.packageEndDate && <DetailCell label="End Date">{fmtDate(booking.packageEndDate)}</DetailCell>}
                {booking.packageTravelers && <DetailCell label="Travelers">{booking.packageTravelers} {booking.packageTravelers === 1 ? 'Person' : 'People'}</DetailCell>}
              </div>
            )}
          </div>
        )}

        {/* Meta grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <div className="bg-[#F0FAFC] rounded-lg p-3.5 border border-[#E3F1F6]">
            <Eyebrow className="block mb-1">Reference</Eyebrow>
            <p className="text-sm font-bold text-gray-900 truncate">{booking.orderId || booking.bookingReference || booking.quoteId || 'N/A'}</p>
          </div>
          <div className="bg-[#F0FAFC] rounded-lg p-3.5 border border-[#E3F1F6]">
            <Eyebrow className="block mb-1">{isDatabaseBooking ? 'Quote Number' : 'Transaction ID'}</Eyebrow>
            <p className="text-sm font-bold text-gray-900 truncate">{isDatabaseBooking ? (booking.orderId || booking.bookingReference) : (booking.transactionId || 'N/A')}</p>
          </div>
          <div className="bg-[#F0FAFC] rounded-lg p-3.5 border border-[#E3F1F6]">
            <Eyebrow className="block mb-1">Amount</Eyebrow>
            <p className="text-base font-bold text-[#055B75]">
              {(() => {
                const amt = parseFloat(booking.totalAmount || booking.total_amount || booking.amount || 0);
                return amt > 0 ? <Price amount={amt} /> : <span className="text-gray-400 font-semibold text-sm">On request</span>;
              })()}
            </p>
          </div>
          <div className="bg-[#F0FAFC] rounded-lg p-3.5 border border-[#E3F1F6]">
            <Eyebrow className="block mb-1">Booking Date</Eyebrow>
            <p className="text-sm font-semibold text-gray-900">
              {fmtDate(booking.bookingDate || booking.orderCreatedAt || booking.paid_at || new Date(), { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
        </div>

        {booking.description && (
          <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-100">
            <Eyebrow className="block mb-1">Description</Eyebrow>
            <p className="text-sm text-gray-700">{booking.description}</p>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-100">
          {isDatabaseBooking ? (
            <button
              onClick={async () => {
                try {
                  // If we have both quoteId and inquiryId, fetch full details
                  if (booking.quoteId && booking.inquiryId) {
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
                      return
                    }
                  }

                  // Fallback: navigate to inquiry detail page
                  if (booking.inquiryId) {
                    navigate(`/inquiry/${booking.inquiryId}`)
                  } else {
                    console.error('No inquiry ID found for booking')
                  }
                } catch (error) {
                  console.error('Error loading booking details:', error)
                  // Fallback: navigate to inquiry detail
                  if (booking.inquiryId) {
                    navigate(`/inquiry/${booking.inquiryId}`)
                  }
                }
              }}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-br from-[#055B75] to-[#034457] text-white text-sm font-semibold rounded-lg hover:shadow-lg hover:shadow-[#055B75]/30 hover:-translate-y-0.5 transition-all"
            >
              <FaEye className="w-4 h-4" /> View Booking Details
            </button>
          ) : (
            <button
              onClick={() => navigate('/booking-confirmation', { state: { bookingData: booking } })}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-br from-[#055B75] to-[#034457] text-white text-sm font-semibold rounded-lg hover:shadow-lg hover:shadow-[#055B75]/30 hover:-translate-y-0.5 transition-all"
            >
              <FaEye className="w-4 h-4" /> View Details
            </button>
          )}
          {isFlightBooking && !isDatabaseBooking && (
            <button
              onClick={() => navigate('/manage-booking', { state: { bookingData: booking } })}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-white text-[#055B75] text-sm font-semibold rounded-lg border-2 border-[#B9D0DC] hover:bg-[#F0FAFC] hover:border-[#055B75] transition-all"
            >
              <FaCog className="w-4 h-4" /> Manage Booking
            </button>
          )}
          {/* Cancel Booking Button — only for non-cancelled upcoming bookings */}
          {statusUp !== 'CANCELLED' && statusUp !== 'FAILED' && (daysUntilTrip === null || daysUntilTrip >= 0) && (
            <>
              {showCancelConfirm === booking.id ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm text-red-600 font-medium">Cancel this booking?</span>
                  <button
                    disabled={cancellingBookingId === booking.id}
                    onClick={async () => {
                      const ref = booking.bookingReference || booking.booking_reference || booking.orderId
                      if (!ref) {
                        alert('No booking reference found')
                        setShowCancelConfirm(null)
                        return
                      }
                      setCancellingBookingId(booking.id)
                      try {
                        const userStr = localStorage.getItem('user')
                        const userEmail = userStr ? JSON.parse(userStr).email : null
                        const isFlight = (booking.type || '').toLowerCase() === 'flight'
                        let result
                        if (isFlight) {
                          // Flight: cancel the real Amadeus order + ARC Pay refund + DB status
                          const resp = await fetch(getApiUrl(`flights/order/${encodeURIComponent(ref)}`), {
                            method: 'DELETE',
                            headers: { 'Content-Type': 'application/json' }
                          })
                          result = await resp.json()
                        } else {
                          // Non-flight: existing ARC Pay refund + DB status flow
                          result = await ArcPayService.cancelBooking(ref, userEmail, 'Customer request')
                        }
                        if (result.success) {
                          const refundMsg = result.cancellation?.refundAmount ? `. Refund: $${result.cancellation.refundAmount}` : ''
                          const amaMsg = isFlight ? (result.amadeusCancelled ? ' Airline reservation cancelled.' : ' (airline cancellation pending)') : ''
                          alert((result.message || 'Booking cancelled successfully') + refundMsg + amaMsg)
                          // Reload bookings to reflect the cancellation
                          loadBookings()
                        } else {
                          alert(result.error || 'Failed to cancel booking. Please try again.')
                        }
                      } catch (err) {
                        console.error('Cancel error:', err)
                        alert('An error occurred while cancelling. Please contact support.')
                      } finally {
                        setCancellingBookingId(null)
                        setShowCancelConfirm(null)
                      }
                    }}
                    className="px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    {cancellingBookingId === booking.id ? 'Cancelling...' : 'Yes, Cancel'}
                  </button>
                  <button
                    onClick={() => setShowCancelConfirm(null)}
                    className="px-3 py-1.5 bg-gray-100 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setShowCancelConfirm(booking.id)}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-red-600 text-sm font-semibold rounded-lg border-2 border-red-200 hover:bg-red-50 hover:border-red-400 transition-all"
                >
                  <FaTimesCircle className="w-4 h-4" /> Cancel Booking
                </button>
              )}
            </>
          )}
        </div>
      </div>
    )
  }

  // ---- Request card ----
  const renderRequestCard = (request) => {
    const getStatusColor = (status) => {
      switch (status) {
        case 'pending': return 'bg-amber-50 text-amber-700 border-amber-200'
        case 'processing': return 'bg-[#F0FAFC] text-[#055B75] border-[#B9D0DC]'
        case 'quoted': return 'bg-emerald-50 text-emerald-700 border-emerald-200'
        case 'booked': return 'bg-violet-50 text-violet-700 border-violet-200'
        case 'cancelled': return 'bg-red-50 text-red-700 border-red-200'
        case 'expired': return 'bg-gray-50 text-gray-600 border-gray-200'
        default: return 'bg-gray-50 text-gray-700 border-gray-200'
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

    const activeQuotes = (request.quotes || []).filter(q => q.status === 'sent' || q.status === 'accepted')

    return (
      <div key={request.id}
        className="group bg-white rounded-2xl p-6 border border-gray-100 shadow-[0_15px_30px_-5px_rgba(5,91,117,0.12)] hover:shadow-[0_20px_40px_-8px_rgba(5,91,117,0.2)] hover:-translate-y-0.5 transition-all duration-200 relative overflow-hidden">
        <span className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-[#055B75] to-[#0890BC]" />

        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-[#055B75]/10 text-[#055B75] flex items-center justify-center text-lg flex-shrink-0">
                <TypeIcon type={request.inquiry_type} />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-gray-900 group-hover:text-[#055B75] transition-colors flex items-center gap-2 flex-wrap">
                  {getTypeName(request.inquiry_type)} Inquiry
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full font-medium">
                    #{request.id.slice(-8)}
                  </span>
                </h3>
                <p className="text-sm text-gray-500 font-medium mt-0.5">
                  Submitted {new Date(request.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-start sm:items-end gap-2">
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-full border ${getStatusColor(request.status)}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70" />
              {getStatusText(request.status)}
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-6 p-4 bg-[#F1FBFD] rounded-xl border border-[#D1E9F0]">
          <div className="flex justify-between text-sm font-medium text-gray-700 mb-2">
            <span className="flex items-center gap-1.5"><FaClock className="w-3.5 h-3.5 text-[#0890BC]" /> Progress</span>
            <span className="capitalize text-[#055B75] font-semibold">{request.status === 'booked' ? 'Completed' : 'In Progress'}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ease-out ${request.status === 'pending' ? 'bg-gradient-to-r from-amber-400 to-amber-500 w-1/4' :
                request.status === 'processing' ? 'bg-gradient-to-r from-[#65B3CF] to-[#0890BC] w-1/2' :
                  request.status === 'quoted' ? 'bg-gradient-to-r from-emerald-400 to-emerald-500 w-3/4' :
                    request.status === 'booked' ? 'bg-gradient-to-r from-violet-400 to-violet-500 w-full' :
                      'bg-gradient-to-r from-gray-400 to-gray-500 w-full'
                }`}
            ></div>
          </div>
          <div className="flex justify-between text-xs text-gray-400 mt-2">
            <span>Submitted</span>
            <span>Quoted</span>
            <span>Booked</span>
          </div>
        </div>

        {/* Meta */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          <div className="bg-[#F0FAFC] rounded-lg p-3.5 border border-[#E3F1F6]">
            <Eyebrow className="block mb-1">Last Updated</Eyebrow>
            <p className="text-sm font-semibold text-gray-900">
              {new Date(request.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
          <div className="bg-[#F0FAFC] rounded-lg p-3.5 border border-[#E3F1F6]">
            <Eyebrow className="block mb-1">Priority</Eyebrow>
            <p className="text-sm font-semibold text-gray-900 capitalize">{request.priority || 'Normal'}</p>
          </div>
          {request.expires_at && (
            <div className="bg-amber-50 rounded-lg p-3.5 border border-amber-200 sm:col-span-2">
              <Eyebrow className="block mb-1 text-amber-700">Expires</Eyebrow>
              <p className="text-sm font-semibold text-amber-800">
                {new Date(request.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            </div>
          )}
        </div>

        {/* Inquiry details */}
        <div className="mb-6 p-4 bg-[#F1FBFD] rounded-xl border border-[#D1E9F0]">
          <p className="text-[11px] font-bold uppercase tracking-widest text-[#055B75] mb-3 flex items-center gap-2">
            <FaInfoCircle className="w-3.5 h-3.5" /> Inquiry Details
          </p>
          {request.inquiry_type === 'flight' && (
            <div className="text-sm text-gray-700 space-y-1">
              <p><strong className="text-[#055B75]">Route:</strong> {request.flight_origin} → {request.flight_destination}</p>
              {request.flight_departure_date && <p><strong className="text-[#055B75]">Departure:</strong> {new Date(request.flight_departure_date).toLocaleDateString()}</p>}
              {request.flight_passengers && <p><strong className="text-[#055B75]">Passengers:</strong> {request.flight_passengers}</p>}
            </div>
          )}
          {request.inquiry_type === 'hotel' && (
            <div className="text-sm text-gray-700 space-y-1">
              <p><strong className="text-[#055B75]">Destination:</strong> {request.hotel_destination}</p>
              {request.hotel_checkin_date && <p><strong className="text-[#055B75]">Check-in:</strong> {new Date(request.hotel_checkin_date).toLocaleDateString()}</p>}
              {request.hotel_rooms && <p><strong className="text-[#055B75]">Rooms:</strong> {request.hotel_rooms}</p>}
            </div>
          )}
          {request.inquiry_type === 'cruise' && (
            <div className="text-sm text-gray-700 space-y-1">
              <p><strong className="text-[#055B75]">Destination:</strong> {request.cruise_destination}</p>
              {request.cruise_departure_date && <p><strong className="text-[#055B75]">Departure:</strong> {new Date(request.cruise_departure_date).toLocaleDateString()}</p>}
              {request.cruise_passengers && <p><strong className="text-[#055B75]">Passengers:</strong> {request.cruise_passengers}</p>}
            </div>
          )}
          {request.inquiry_type === 'package' && (
            <div className="text-sm text-gray-700 space-y-1">
              <p><strong className="text-[#055B75]">Destination:</strong> {request.package_destination}</p>
              {request.package_start_date && <p><strong className="text-[#055B75]">Start:</strong> {new Date(request.package_start_date).toLocaleDateString()}</p>}
              {request.package_travelers && <p><strong className="text-[#055B75]">Travelers:</strong> {request.package_travelers}</p>}
            </div>
          )}
          {request.inquiry_type === 'general' && (
            <div className="text-sm text-gray-700 space-y-1">
              {request.inquiry_subject && <p><strong className="text-[#055B75]">Subject:</strong> {request.inquiry_subject}</p>}
              {request.inquiry_message && <p className="truncate"><strong className="text-[#055B75]">Message:</strong> {request.inquiry_message}</p>}
            </div>
          )}
        </div>

        {/* Quotes */}
        {activeQuotes.length > 0 && (
          <div className="mb-6 p-4 bg-emerald-50/60 border border-emerald-200 rounded-xl">
            <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-700 mb-3 flex items-center gap-2">
              <FaFileInvoiceDollar className="w-3.5 h-3.5" /> {activeQuotes.length} Quote{activeQuotes.length !== 1 ? 's' : ''} Available
            </p>
            {activeQuotes.map((quote) => (
              <div key={quote.id} className="bg-white rounded-lg p-3 mb-2 border border-emerald-200 last:mb-0">
                <div className="flex justify-between items-start mb-1">
                  <p className="text-sm font-semibold text-gray-900">Quote #{quote.quote_number}</p>
                  <p className="text-lg font-bold text-emerald-600">${quote.total_amount} {quote.currency}</p>
                </div>
                {quote.expires_at && (
                  <p className="text-xs text-gray-500 flex items-center gap-1">
                    <FaClock className="w-3 h-3" /> Expires: {new Date(quote.expires_at).toLocaleDateString()}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-3 pt-4 border-t border-gray-100">
          <button
            onClick={() => navigate(`/inquiry/${request.id}`)}
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-br from-[#055B75] to-[#034457] text-white text-sm font-semibold rounded-lg hover:shadow-lg hover:shadow-[#055B75]/30 hover:-translate-y-0.5 transition-all"
          >
            <FaEye className="w-4 h-4" /> View Details
          </button>
          {activeQuotes.length > 0 && (
            <button
              onClick={() => {
                const sentQuote = activeQuotes[0]
                navigate('/quote-detail', { state: { quoteData: sentQuote, inquiryData: request } })
              }}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-br from-emerald-500 to-emerald-600 text-white text-sm font-semibold rounded-lg hover:shadow-lg hover:shadow-emerald-500/30 hover:-translate-y-0.5 transition-all"
            >
              <FaFileInvoiceDollar className="w-4 h-4" /> View Quote
            </button>
          )}
        </div>
      </div>
    )
  }

  // ----- Sidebar items config -----
  const sidebarItems = [
    { key: "All Bookings", icon: FaClipboardList, count: tabBookings.length },
    { key: "Flights", icon: FaPlane, count: tabBookings.filter(b => b.type === 'flight').length },
    { key: "Hotels", icon: FaHotel, count: tabBookings.filter(b => b.type === 'hotel').length },
    { key: "Cruise", icon: FaShip, count: tabBookings.filter(b => b.type === 'cruise').length },
    { key: "Packages", icon: FaSuitcaseRolling, count: tabBookings.filter(b => b.type === 'package').length },
  ]

  return (
    <div className="min-h-screen flex flex-col font-sans" style={{ background: 'linear-gradient(180deg, #F0FAFC 0%, #E3F1F6 100%)' }}>
      <Navbar />

      {isGuest && (
        <div className="bg-amber-50 border-b border-amber-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-2">
            <p className="text-sm text-amber-800 flex items-center gap-2">
              <FaExclamationTriangle className="w-4 h-4 flex-shrink-0" />
              Viewing as guest. Sign in to see your bookings.
            </p>
          </div>
        </div>
      )}

      {/* Hero banner */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#034457] via-[#055B75] to-[#0890BC] px-4 py-14 md:py-20 text-center">
        <div className="absolute inset-0 opacity-10 pointer-events-none"
          style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #fff 1px, transparent 0)', backgroundSize: '26px 26px' }} />
        <div className="relative z-10 max-w-3xl mx-auto">
          <h1 className="text-3xl md:text-5xl font-bold text-white mb-3 leading-tight tracking-tight">My Trips</h1>
          <p className="text-base md:text-lg text-white/85 max-w-xl mx-auto leading-relaxed">
            All your flights, stays, cruises and requests — organized in one place.
          </p>
        </div>
      </section>

      {/* Stat strip floating over hero */}
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 -mt-9 relative z-20">
        <div className="grid grid-cols-3 gap-3 md:gap-4">
          {[
            { label: 'Upcoming', value: filterByTab(bookings).length, icon: FaCalendarAlt },
            { label: 'All Bookings', value: bookings.length, icon: FaClipboardList },
            { label: 'Requests', value: requests.length, icon: FaCommentDots },
          ].map((s) => (
            <div key={s.label} className="bg-white rounded-2xl p-3 md:p-4 border border-gray-100 shadow-[0_15px_30px_-5px_rgba(5,91,117,0.15)] flex items-center gap-3">
              <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-[#055B75]/10 text-[#055B75] flex items-center justify-center flex-shrink-0">
                <s.icon className="text-base md:text-lg" />
              </div>
              <div className="min-w-0">
                <p className="text-xl md:text-2xl font-bold text-gray-900 leading-none">{s.value}</p>
                <p className="text-[11px] md:text-xs font-semibold uppercase tracking-wider text-gray-400 mt-1 truncate">{s.label}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tab Navigation - Underline Style */}
      <div className="bg-white/70 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-30 mt-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-4 sm:gap-8 overflow-x-auto hide-scrollbar">
            {["Upcoming", "Past", "Cancelled", "Failed"].map((tab) => (
              <button
                key={tab}
                onClick={() => handleTabChange(tab)}
                className={`py-4 text-sm font-semibold whitespace-nowrap transition-all border-b-2 -mb-px ${activeTab === tab
                  ? "text-[#055B75] border-[#055B75]"
                  : "text-gray-500 border-transparent hover:text-gray-700 hover:border-gray-300"
                  }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-grow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex gap-6">
            {/* Mobile sidebar backdrop */}
            {isMobileMenuOpen && (
              <div
                className="fixed inset-0 bg-black/40 z-30 lg:hidden"
                onClick={toggleMobileMenu}
              />
            )}
            {/* Sidebar */}
            <aside className={`
            fixed lg:relative inset-y-0 left-0 z-40 w-[85vw] max-w-72 bg-white lg:bg-transparent
            transform transition-transform duration-300 lg:transform-none
            ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
            lg:block flex-shrink-0 shadow-xl lg:shadow-none
          `}>
              <div className="h-full lg:h-auto overflow-y-auto lg:overflow-visible p-4 lg:p-0">
                <div className="bg-white rounded-2xl border border-gray-100 shadow-[0_15px_30px_-5px_rgba(5,91,117,0.12)] p-2 lg:sticky lg:top-36">
                  <div className="flex items-center justify-between mb-2 lg:hidden px-3 pt-2">
                    <h2 className="font-semibold text-gray-900">Categories</h2>
                    <button onClick={toggleMobileMenu} className="p-1 hover:bg-gray-100 rounded">
                      <FaTimesCircle className="w-5 h-5 text-gray-400" />
                    </button>
                  </div>

                  <p className="hidden lg:block text-[11px] font-bold uppercase tracking-widest text-gray-400 px-3 pt-3 pb-1">Bookings</p>
                  <nav className="space-y-0.5">
                    {sidebarItems.map((item) => {
                      const active = activeSidebarItem === item.key
                      return (
                        <button
                          key={item.key}
                          onClick={() => handleSidebarItemChange(item.key)}
                          className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-colors ${active
                            ? "bg-gradient-to-r from-[#055B75]/10 to-[#034457]/10 text-[#055B75] font-semibold shadow-[inset_3px_0_0_#055B75]"
                            : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 font-medium"
                            }`}
                        >
                          <span className="flex items-center gap-3">
                            <span className={`text-base ${active ? 'text-[#055B75]' : 'text-gray-400'}`}><item.icon /></span>
                            <span className="text-sm">{item.key}</span>
                          </span>
                          {item.count > 0 && (
                            <span className={`text-xs px-2 py-0.5 rounded-full ${active
                              ? "bg-[#055B75] text-white"
                              : "bg-gray-100 text-gray-600"
                              }`}>
                              {item.count}
                            </span>
                          )}
                        </button>
                      )
                    })}

                    <div className="border-t border-gray-100 my-2"></div>

                    <button
                      onClick={() => handleSidebarItemChange("Requests")}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-left transition-colors ${activeSidebarItem === "Requests"
                        ? "bg-gradient-to-r from-[#055B75]/10 to-[#034457]/10 text-[#055B75] font-semibold shadow-[inset_3px_0_0_#055B75]"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900 font-medium"
                        }`}
                    >
                      <span className="flex items-center gap-3">
                        <span className={`text-base ${activeSidebarItem === "Requests" ? 'text-[#055B75]' : 'text-gray-400'}`}><FaCommentDots /></span>
                        <span className="text-sm">My Requests</span>
                      </span>
                      {requests.length > 0 && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${activeSidebarItem === "Requests"
                          ? "bg-[#055B75] text-white"
                          : "bg-gray-100 text-gray-600"
                          }`}>
                          {requests.length}
                        </span>
                      )}
                    </button>
                  </nav>

                  {/* Membership card */}
                  <div className="border-t border-gray-100 my-2"></div>
                  <button
                    onClick={() => navigate('/membership')}
                    className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-colors bg-gradient-to-br from-amber-50 to-orange-50 hover:from-amber-100 hover:to-orange-100 border border-amber-200"
                  >
                    <span className="w-9 h-9 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 text-white flex items-center justify-center flex-shrink-0">
                      <FaStar className="text-sm" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-amber-800">Premium Membership</span>
                      <span className="block text-xs text-amber-600">Unlock exclusive perks</span>
                    </span>
                  </button>
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
              {/* Mobile sidebar toggle button */}
              <button
                onClick={toggleMobileMenu}
                className="lg:hidden mb-4 flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <FaClipboardList className="w-4 h-4 text-[#055B75]" />
                Categories
              </button>

              {activeSidebarItem === "Requests" ? (
                /* Requests Section */
                isAuthenticated ? (
                  isLoadingRequests ? (
                    <Spinner label="Loading requests..." />
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
                          className="p-2 text-gray-400 hover:text-[#055B75] hover:bg-[#F0FAFC] rounded-lg transition-colors"
                          title="Refresh"
                        >
                          <FaSyncAlt className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Request Cards */}
                      <div className="grid gap-4">
                        {filteredRequests.map(renderRequestCard)}
                      </div>
                    </div>
                  ) : (
                    <EmptyState
                      icon={<FaCommentDots />}
                      title={`No ${activeTab} Requests`}
                      description="When you submit a travel inquiry, it will appear here."
                      actionLabel="Submit New Request"
                      onAction={() => navigate('/request')}
                    />
                  )
                ) : (
                  <EmptyState
                    icon={<FaLock />}
                    title="Login Required"
                    description="Please sign in to view your travel requests."
                    actionLabel="Sign In"
                    onAction={handleLoginClick}
                  />
                )
              ) : (
                /* Bookings Section */
                isLoadingBookings ? (
                  <Spinner label="Loading bookings..." />
                ) : filteredBookings.length > 0 ? (
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
                        className="p-2 text-gray-400 hover:text-[#055B75] hover:bg-[#F0FAFC] rounded-lg transition-colors"
                        title="Refresh"
                      >
                        <FaSyncAlt className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Booking Cards */}
                    <div className="grid gap-4">
                      {filteredBookings.map(renderBookingCard)}
                    </div>
                  </div>
                ) : (
                  <EmptyState
                    icon={isGuest ? <FaLock /> : <FaPlane />}
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
      </div>

      <Footer />

      {/* Login Popup */}
      {showLoginPopup && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-[0_24px_48px_-12px_rgba(5,91,117,0.4)]">
            <div className="text-center">
              <div className="w-16 h-16 bg-[#055B75]/10 rounded-full flex items-center justify-center mx-auto mb-4 text-[#055B75]">
                <FaShieldAlt className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Sign In Required</h2>
              <p className="text-gray-600 text-sm mb-6">
                Sign in to view your trips, bookings, and travel requests.
              </p>
              <div className="space-y-3">
                <button
                  onClick={handleLoginClick}
                  className="w-full py-3 bg-gradient-to-br from-[#055B75] to-[#034457] text-white font-semibold rounded-lg hover:shadow-lg transition-all"
                >
                  Sign In
                </button>
                <button
                  onClick={closeLoginPopup}
                  className="w-full py-3 text-gray-600 font-semibold hover:bg-gray-100 rounded-lg transition-colors"
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
