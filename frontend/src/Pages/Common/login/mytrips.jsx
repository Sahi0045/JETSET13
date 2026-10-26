"use client"

import React, { useState, useEffect, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { AlertTriangle, ArrowLeft, Hotel, LayoutGrid, Lock, Luggage, MessageSquare, Plane, RefreshCw, Ship, ShieldCheck, XCircle } from 'lucide-react'
import { daysUntilDate } from "../../../utils/dateUtils"
import { cancellationMessage } from "../../../utils/bookingStatus"
import { downloadTicketPdf } from "../../../utils/ticketDownload"
import { authHeaders } from "../../../utils/authHeaders"
import { getApiUrl } from '../../../utils/apiHelper'
import Navbar from '../Navbar'
import Footer from '../Footer'
import { useSupabaseAuth } from '../../../contexts/SupabaseAuthContext'
import ArcPayService from '../../../Services/ArcPayService'
import CancelOutcomeDialog from './CancelOutcomeDialog'
import CancelQuote from '../flights/CancelQuote'
import { fetchCancelQuote } from '../../../hooks/queries/useFlights'
import useCityNames from '../../../hooks/useCityNames'
import { groupRequests, groupTrips, pickNextTrip, routeOf, travelDateOf, tripReferenceOf, untilLabel } from './myTrips/tripView'
import { DetailsToggle, NextTripCard, NoTripCard, PastTripCard, TripRow, TripsBar, cardShell, focusRing, tripTitle } from './myTrips/TripCards'
import { TripActions, TripDetails } from './myTrips/TripDetails'
import RequestRow from './myTrips/RequestRow'

/**
 * One inquiries request, however many callers want it.
 *
 * loadBookings and loadRequests each fetched `inquiries?endpoint=my`, and both
 * run on mount - two identical round trips (~330ms each) for the same data. A
 * caller inside the freshness window joins the in-flight (or just-finished)
 * request instead of starting another.
 */
const INQUIRIES_FRESH_MS = 10000
let inquiriesInFlight = { at: 0, promise: null, owner: null }

/**
 * @param {object} headers
 * @param {string} owner - the signed-in user's id. The cache is keyed on it:
 *   signing out does not reload the page, so without this a second person
 *   signing in on the same tab within the freshness window would be handed the
 *   FIRST person's inquiries. A shared cache must never outlive its session.
 */
const fetchMyInquiries = (headers, owner) => {
  const usable = inquiriesInFlight.promise
    && inquiriesInFlight.owner === owner
    && Date.now() - inquiriesInFlight.at < INQUIRIES_FRESH_MS
  if (usable) {
    return inquiriesInFlight.promise
  }
  const promise = fetch(getApiUrl('inquiries?endpoint=my'), { method: 'GET', headers, credentials: 'include' })
    .then(async (response) => ({
      ok: response.ok,
      status: response.status,
      body: response.ok ? await response.json().catch(() => null) : null,
    }))
    .catch(() => ({ ok: false, status: 0, body: null }))

  inquiriesInFlight = { at: Date.now(), promise, owner }
  return promise
}

function TripCancelQuote({ reference }) {
  const [query, setQuery] = useState({ isLoading: true, data: undefined })
  useEffect(() => {
    let live = true
    fetchCancelQuote(reference)
      .then((data) => { if (live) setQuery({ isLoading: false, data }) })
      .catch(() => { if (live) setQuery({ isLoading: false, isError: true, data: undefined }) })
    return () => { live = false }
  }, [reference])
  return (
    <div className="basis-full space-y-1 text-sm text-gray-700">
      <CancelQuote query={query} />
    </div>
  )
}

const PAST_ON_OVERVIEW = 4

const VIEW_TITLE = {
  past: 'Past trips',
  cancelled: 'Cancelled trips',
  attention: 'Needs attention',
  requests: 'Your requests',
}

const TYPE_TABS = [
  { key: 'all', label: 'All trips', Icon: LayoutGrid },
  { key: 'flight', label: 'Flights', Icon: Plane },
  { key: 'cruise', label: 'Cruise', Icon: Ship },
  { key: 'hotel', label: 'Hotels', Icon: Hotel },
  { key: 'package', label: 'Packages', Icon: Luggage },
]

const Panel = ({ children, className = '' }) => <div className={`${cardShell} ${className}`}>{children}</div>

const Spinner = ({ label }) => (
  <Panel className="p-12 flex flex-col items-center justify-center">
    <div className="w-10 h-10 border-[3px] border-[#055B75] border-t-transparent rounded-full animate-spin" />
    <p className="mt-4 text-gray-600">{label}</p>
  </Panel>
)

const EmptyState = ({ icon: Icon, title, description, actionLabel, onAction }) => (
  <Panel className="p-10 sm:p-12 flex flex-col items-center text-center">
    <div className="w-16 h-16 rounded-2xl bg-[#F0FAFC] text-[#055B75] flex items-center justify-center mb-5"><Icon className="h-7 w-7" aria-hidden="true" /></div>
    <h3 className="font-grotesk text-xl font-semibold text-ink mb-1.5">{title}</h3>
    <p className="text-sm text-gray-500 mb-6 max-w-sm">{description}</p>
    {actionLabel && onAction && (
      <button type="button" onClick={onAction} className="px-7 py-3 bg-[#055B75] hover:bg-[#034457] text-white rounded-full text-sm font-bold shadow-sm">{actionLabel}</button>
    )}
  </Panel>
)

const SectionTitle = ({ children, action }) => (
  <div className="flex items-baseline justify-between gap-3 mb-3">
    <h2 className="text-lg font-bold text-gray-900">{children}</h2>
    {action && <button type="button" onClick={action.onClick} className="text-sm font-semibold text-[#055B75] hover:text-[#034457]">{action.label} ›</button>}
  </div>
)

export default function TravelDashboard() {
  const navigate = useNavigate()
  // Auth comes from the Supabase context (same source the navbar uses). Tokens
  // now live in httpOnly cookies, not localStorage, so don't read localStorage.
  const { user, isAuthenticated: authed, session, loading: authLoading } = useSupabaseAuth()
  const [view, setView] = useState('overview')
  const [tripType, setTripType] = useState('all')
  const [openTrip, setOpenTrip] = useState(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isGuest, setIsGuest] = useState(false)
  const [showLoginPopup, setShowLoginPopup] = useState(false)
  const [bookings, setBookings] = useState([])
  const [requests, setRequests] = useState([])
  const [isLoadingRequests, setIsLoadingRequests] = useState(false)
  const [isLoadingBookings, setIsLoadingBookings] = useState(true)
  const [cancellingBookingId, setCancellingBookingId] = useState(null)
  const [showCancelConfirm, setShowCancelConfirm] = useState(null)
  // What a cancel from this page did, shown in a dialog rather than a browser alert box
  const [cancelOutcome, setCancelOutcome] = useState(null)
  const [ticketDownload, setTicketDownload] = useState({ busy: null, failed: null, error: null })

  const downloadTrip = async (reference) => {
    setTicketDownload({ busy: reference, failed: null, error: null })
    try {
      await downloadTicketPdf(reference, {})
      setTicketDownload({ busy: null, failed: null, error: null })
    } catch (err) {
      setTicketDownload({ busy: null, failed: reference, error: err.message })
    }
  }

  useEffect(() => {
    // Wait for the Supabase session (cookie/in-memory) to resolve before deciding.
    if (authLoading) return

    if (!authed) {
      setIsAuthenticated(false)
      setIsGuest(true)
      const t = setTimeout(() => setShowLoginPopup(true), 500)
      return () => clearTimeout(t)
    }

    setIsAuthenticated(true)
    setIsGuest(false)
    setShowLoginPopup(false)

    loadBookings()
    loadRequests()

    // Reload when the window regains focus (user comes back from booking) -
    // but not on every alt-tab. Focus fires constantly, and each reload is two
    // API round trips, so the page spent its life reloading and flashing its
    // spinner. Anything newer than this is still fresh enough to show.
    let lastLoadedAt = Date.now()
    const REFRESH_AFTER_MS = 30000
    const handleFocus = () => {
      if (Date.now() - lastLoadedAt < REFRESH_AFTER_MS) return
      lastLoadedAt = Date.now()
      loadBookings()
      loadRequests()
    }
    window.addEventListener('focus', handleFocus)

    return () => {
      window.removeEventListener('focus', handleFocus)
    }
  }, [authed, authLoading])

  // While the requests list is open, a quote the team sends shows up without a reload.
  useEffect(() => {
    if (!isAuthenticated || view !== 'requests') return undefined
    const pollingInterval = setInterval(() => loadRequests(), 30000)
    return () => clearInterval(pollingInterval)
  }, [isAuthenticated, view])

  const loadBookings = async () => {
    setIsLoadingBookings(true)
    const allBookings = []

    console.log('🔍 Loading bookings...')

    // First, try to load bookings from database
    try {
      console.log('🔍 Fetching bookings from database...')
      // User id comes from the auth context (session), so the backend can filter.
      const currentUserId = user?.id || user?.uid || ''

      const bookingsUrl = currentUserId
        ? getApiUrl(`flights/bookings?userId=${encodeURIComponent(currentUserId)}`)
        : getApiUrl('flights/bookings')

      const response = await fetch(bookingsUrl, {
        method: 'GET',
        headers: await authHeaders({ 'Content-Type': 'application/json' }),
        credentials: 'include'
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

    // NOTE: Bookings are loaded exclusively from the server (database) below.
    // localStorage is intentionally NOT used as a booking source so that
    // My Trips always reflects the authoritative server state.

    // Load paid bookings from database
    try {
      // Cookie session authenticates the request; the Bearer header is a fallback
      // when the in-memory Supabase access token is available.
      const token = session?.access_token || ''

      if (authed) {
        console.log('🔍 Loading paid bookings from database...')

        // Method 1: Fetch user's inquiries and their quotes
        const inquiriesResponse = await fetchMyInquiries({
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          'Content-Type': 'application/json'
        }, user?.id || user?.uid || null)

        if (inquiriesResponse.ok) {
          const inquiriesResult = inquiriesResponse.body || {}
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


      // Cookie session authenticates the request; the in-memory Supabase access
      // token (if present) is sent as a Bearer fallback.
      const token = session?.access_token || ''

      if (!authed) {
        console.log('❌ Not signed in, cannot load requests')
        setRequests([])
        setIsLoadingRequests(false)
        return
      }

      // Use query parameter format for Vercel serverless functions
      const response = await fetchMyInquiries({
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }, user?.id || user?.uid || null)

      if (!response.ok) {
        if (response.status === 401) {
          console.log('User not authenticated, skipping requests load')
          setRequests([])
          return
        }
        throw new Error(`Failed to fetch requests: ${response.status}`)
      }

      const result = response.body || {}

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

  const allTrips = useMemo(() => groupTrips(bookings), [bookings])
  const trips = useMemo(() => groupTrips(tripType === 'all' ? bookings : bookings.filter((booking) => booking.type === tripType)), [bookings, tripType])
  const requestGroups = useMemo(() => groupRequests(requests), [requests])
  const nextTrip = pickNextTrip(trips.upcoming)
  const soonest = pickNextTrip(allTrips.upcoming)
  const keyOf = (booking) => booking.id || tripReferenceOf(booking)
  const alsoComing = trips.upcoming.filter((booking) => booking !== nextTrip)
  const placesBeen = trips.past.filter((booking, index, all) => {
    const place = routeOf(booking).to || keyOf(booking)
    return all.findIndex((other) => (routeOf(other).to || keyOf(other)) === place) === index
  }).slice(0, PAST_ON_OVERVIEW)
  const cityCodes = useMemo(() => bookings.flatMap((booking) => {
    const { legs, from, to } = routeOf(booking)
    return [from, to, ...legs.flatMap((leg) => leg.segments.flatMap((segment) => [segment.origin, segment.destination]))]
  }), [bookings])
  const cityNames = useCityNames(cityCodes)

  const handleLoginClick = () => navigate('/login')

  const openDatabaseBooking = async (booking) => {
    try {
      if (booking.quoteId && booking.inquiryId) {
        const token = session?.access_token || '' // cookie session also authenticates
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
          navigate('/quote-detail', { state: { quoteData: quoteData.data, inquiryData: inquiryData.data } })
          return
        }
      }
      if (booking.inquiryId) navigate(`/inquiry/${booking.inquiryId}`)
    } catch (error) {
      console.error('Error loading booking details:', error)
      if (booking.inquiryId) navigate(`/inquiry/${booking.inquiryId}`)
    }
  }

  const openDetails = (booking) => (booking.quoteId || booking.inquiryId
    ? openDatabaseBooking(booking)
    : navigate('/booking-confirmation', { state: { bookingData: booking } }))

  // The reference goes in the URL, so a refresh or a shared link still finds
  // the booking. Router state alone was lost on refresh.
  const manageTrip = (booking) => {
    const ref = booking.bookingReference || booking.orderId
    navigate(ref ? `/manage-booking/${encodeURIComponent(ref)}` : '/manage-booking', { state: { bookingData: booking } })
  }

  const cancelTrip = async (booking) => {
    const ref = booking.bookingReference || booking.booking_reference || booking.orderId
    if (!ref) {
      setCancelOutcome({ tone: 'error', text: 'This booking has no reference, so it cannot be cancelled here. Please contact support at (877) 538-7380.' })
      setShowCancelConfirm(null)
      return
    }
    setCancellingBookingId(booking.id)
    try {
      const userEmail = user?.email || null
      const isFlight = (booking.type || '').toLowerCase() === 'flight'
      // A flight goes through the same cancel Manage Booking makes, on the
      // flights host that reaches the airline; anything else through the ARC
      // Pay refund and status flow.
      const result = isFlight
        ? await ArcPayService.cancelFlightBooking(ref, userEmail, 'Customer request')
        : await ArcPayService.cancelBooking(ref, userEmail, 'Customer request')
      if (result.success) {
        // What happened to the money, from the cancellation record. A refused
        // refund used to read as a plain "cancelled successfully": its amount
        // is 0, which is falsy, so not even a refund line appeared.
        setCancelOutcome({ tone: 'success', text: cancellationMessage(result) })
      } else {
        setCancelOutcome({ tone: 'error', text: result.error || result.message || 'Failed to cancel booking. Please try again.' })
      }
      // Whatever the answer, the list is read again: a refusal can come after
      // the cancel changed the booking (no answer in time, or the airline
      // refused it after the ticket was voided), and the card has to show what
      // the booking says now rather than offer a second cancel.
      loadBookings()
    } catch (err) {
      console.error('Cancel error:', err)
      setCancelOutcome({ tone: 'error', text: 'Something went wrong while cancelling. Nothing may have changed - please check the booking again, or contact support at (877) 538-7380.' })
    } finally {
      setCancellingBookingId(null)
      setShowCancelConfirm(null)
    }
  }

  const ctx = {
    manage: manageTrip,
    openDetails,
    download: downloadTrip,
    downloadState: ticketDownload,
    cancel: {
      confirmFor: showCancelConfirm,
      busyFor: cancellingBookingId,
      ask: setShowCancelConfirm,
      dismiss: () => setShowCancelConfirm(null),
      run: cancelTrip,
    },
    CancelQuote: TripCancelQuote,
  }

  const isOpen = (booking) => openTrip === keyOf(booking)
  const toggle = (booking) => setOpenTrip((current) => (current === keyOf(booking) ? null : keyOf(booking)))

  const showView = (next, open = null) => {
    setView(next)
    setOpenTrip(open)
    window.scrollTo?.({ top: 0, behavior: 'smooth' })
  }

  const chooseType = (key) => {
    setTripType(key)
    setView('overview')
    setOpenTrip(null)
  }

  const typeTabs = (
    <div role="tablist" aria-label="Booking type" className="flex gap-2 overflow-x-auto [scrollbar-width:none] mb-5 -mx-4 px-4 sm:mx-0 sm:px-0">
      {TYPE_TABS.map(({ key, label, Icon }) => {
        const active = view !== 'requests' && tripType === key
        const count = key === 'all' ? bookings.length : bookings.filter((booking) => booking.type === key).length
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => chooseType(key)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-semibold whitespace-nowrap transition-colors ${focusRing} ${active ? 'bg-[#055B75] border-[#055B75] text-white' : 'bg-white border-[#EFE9DD] text-gray-600 hover:border-[#B9D0DC] hover:text-[#055B75]'}`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
            {count > 0 && <span className={`text-xs rounded-full px-1.5 ${active ? 'bg-white/20' : 'bg-[#F0FAFC] text-[#055B75]'}`}>{count}</span>}
          </button>
        )
      })}
      <button
        type="button"
        role="tab"
        aria-selected={view === 'requests'}
        onClick={() => showView('requests')}
        className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-semibold whitespace-nowrap transition-colors ${focusRing} ${view === 'requests' ? 'bg-[#055B75] border-[#055B75] text-white' : 'bg-white border-[#EFE9DD] text-gray-600 hover:border-[#B9D0DC] hover:text-[#055B75]'}`}
      >
        <MessageSquare className="h-4 w-4" aria-hidden="true" />
        Requests
        {requests.length > 0 && <span className={`text-xs rounded-full px-1.5 ${view === 'requests' ? 'bg-white/20' : 'bg-[#F0FAFC] text-[#055B75]'}`}>{requests.length}</span>}
      </button>
    </div>
  )

  const tripRows = (list) => (
    <Panel>
      {list.map((booking) => (
        <TripRow key={keyOf(booking)} booking={booking} cityNames={cityNames} expanded={isOpen(booking)} onToggle={() => toggle(booking)}>
          <TripDetails booking={booking} />
          <div className="px-4 sm:px-5 pb-5"><TripActions booking={booking} ctx={ctx} /></div>
        </TripRow>
      ))}
    </Panel>
  )

  const openRequest = (request) => navigate(`/inquiry/${request.id}`)
  const openQuote = (request, quote) => navigate('/quote-detail', { state: { quoteData: quote, inquiryData: request } })
  const requestRows = (list) => (
    <Panel>{list.map((request) => <RequestRow key={request.id} request={request} onOpen={openRequest} onQuote={openQuote} />)}</Panel>
  )

  const nextDays = soonest ? daysUntilDate(travelDateOf(soonest)) : null
  const nextLine = soonest ? <>Next: <b>{tripTitle(soonest, cityNames)}</b> {untilLabel(nextDays) || ''}</> : null

  const overview = (
    <>
      {nextTrip ? (
        <NextTripCard
          booking={nextTrip}
          cityNames={cityNames}
          expanded={isOpen(nextTrip)}
          actions={(
            <TripActions booking={nextTrip} ctx={ctx}>
              <DetailsToggle expanded={isOpen(nextTrip)} onClick={() => toggle(nextTrip)} />
            </TripActions>
          )}
          details={<TripDetails booking={nextTrip} />}
        />
      ) : (
        <NoTripCard type={tripType} onSearch={(path) => navigate(path)} />
      )}

      {alsoComing.length > 0 && (
        <section className="mt-8">
          <SectionTitle>Also coming up</SectionTitle>
          {tripRows(alsoComing)}
        </section>
      )}

      {tripType === 'all' && requestGroups.open.length > 0 && (
        <section className="mt-8">
          <SectionTitle action={{ label: 'All requests', onClick: () => showView('requests') }}>Your requests</SectionTitle>
          {requestRows(requestGroups.open)}
        </section>
      )}

      {trips.past.length > 0 && (
        <section className="mt-8">
          <SectionTitle action={{ label: trips.past.length > PAST_ON_OVERVIEW ? `All ${trips.past.length} past trips` : 'Past trips', onClick: () => showView('past') }}>
            Where you've been
          </SectionTitle>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {placesBeen.map((booking) => (
              <PastTripCard key={keyOf(booking)} booking={booking} cityNames={cityNames} onOpen={() => showView('past', keyOf(booking))} />
            ))}
          </div>
        </section>
      )}

      <nav aria-label="More trips" className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold">
        <button type="button" onClick={() => showView('cancelled')} className="inline-flex items-center gap-1.5 text-[#055B75] hover:text-[#034457]">
          <XCircle className="h-4 w-4" aria-hidden="true" /> Cancelled ({trips.cancelled.length})
        </button>
        <button type="button" onClick={() => showView('attention')} className={`inline-flex items-center gap-1.5 ${trips.attention.length ? 'text-amber-700 hover:text-amber-800' : 'text-[#055B75] hover:text-[#034457]'}`}>
          <AlertTriangle className="h-4 w-4" aria-hidden="true" /> Needs attention ({trips.attention.length})
        </button>
        <button type="button" onClick={() => showView('requests')} className="inline-flex items-center gap-1.5 text-[#055B75] hover:text-[#034457]">
          <MessageSquare className="h-4 w-4" aria-hidden="true" /> Requests ({requests.length})
        </button>
      </nav>
    </>
  )

  const viewList = view === 'requests' ? [...requestGroups.open, ...requestGroups.closed] : (trips[view] || [])
  const renderListView = () => (
    <>
      <button type="button" onClick={() => showView('overview')} className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#055B75] hover:text-[#034457] mb-3">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All trips
      </button>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">{VIEW_TITLE[view]}</h2>
          <p className="text-sm text-gray-500">{viewList.length} {view === 'requests' ? 'request' : 'booking'}{viewList.length === 1 ? '' : 's'}</p>
        </div>
        <button type="button" onClick={view === 'requests' ? loadRequests : loadBookings} title="Refresh" aria-label="Refresh" className="p-2 text-gray-400 hover:text-[#055B75] hover:bg-white rounded-lg transition-colors">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      {view === 'requests' ? (
        isLoadingRequests && requests.length === 0 ? <Spinner label="Loading requests..." />
          : viewList.length > 0 ? requestRows(viewList)
            : <EmptyState icon={MessageSquare} title="No requests yet" description="When you ask our team for a cruise or a custom trip, it shows up here with its quote." />
      ) : viewList.length > 0 ? tripRows(viewList) : (
        <EmptyState icon={Plane} title={`No ${VIEW_TITLE[view].toLowerCase()}`} description="Nothing here right now." actionLabel="Back to all trips" onAction={() => showView('overview')} />
      )}
    </>
  )

  let content
  if (isGuest) {
    content = <EmptyState icon={Lock} title="Sign in to see your trips" description="Your bookings, e-tickets and check-in are here once you sign in." actionLabel="Sign in" onAction={handleLoginClick} />
  } else if (authLoading || (isLoadingBookings && bookings.length === 0)) {
    content = <Spinner label="Loading your trips..." />
  } else {
    content = <>{typeTabs}{view === 'overview' ? overview : renderListView()}</>
  }

  return (
    <div className="min-h-screen flex flex-col font-sans bg-[#F0FAFC]">
      <Navbar />

      {isGuest && (
        <div className="bg-amber-50 border-b border-amber-200">
          <div className="max-w-6xl mx-auto px-4 py-2">
            <p className="text-sm text-amber-800 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              Viewing as guest. Sign in to see your bookings.
            </p>
          </div>
        </div>
      )}

      <TripsBar
        counts={{ upcoming: allTrips.upcoming.length, past: allTrips.past.length, cancelled: allTrips.cancelled.length }}
        nextLine={nextLine}
        onBook={() => navigate('/flights')}
      />

      <main className="flex-grow">
        <div className="max-w-6xl mx-auto w-full px-4 pt-6 pb-14">{content}</div>
      </main>

      {cancelOutcome && (
        <CancelOutcomeDialog outcome={cancelOutcome} onClose={() => setCancelOutcome(null)} />
      )}
      <Footer />

      {showLoginPopup && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-[0_24px_48px_-12px_rgba(5,91,117,0.4)]">
            <div className="text-center">
              <div className="w-16 h-16 bg-[#055B75]/10 rounded-full flex items-center justify-center mx-auto mb-4 text-[#055B75]">
                <ShieldCheck className="w-8 h-8" aria-hidden="true" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Sign In Required</h2>
              <p className="text-gray-600 text-sm mb-6">
                Sign in to view your trips, bookings, and travel requests.
              </p>
              <div className="space-y-3">
                <button
                  onClick={handleLoginClick}
                  className="w-full py-3 bg-[#055B75] hover:bg-[#034457] text-white font-semibold rounded-full transition-colors"
                >
                  Sign In
                </button>
                <button
                  onClick={() => setShowLoginPopup(false)}
                  className="w-full py-3 text-gray-600 font-semibold hover:bg-gray-100 rounded-full transition-colors"
                >
                  Continue as Guest
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
