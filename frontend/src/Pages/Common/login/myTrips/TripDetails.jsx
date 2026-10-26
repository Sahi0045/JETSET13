import React, { useState } from 'react'
import { Check, Copy, Download, ExternalLink, Eye, Settings } from 'lucide-react'
import { daysUntilDate, formatCalendarDate } from '../../../../utils/dateUtils'
import { attentionMessage } from '../../../../utils/bookingStatus'
import { bookingCodeOf, canDownloadDocument, documentState, isCommitUnknown, liveTickets, ticketState, ticketsVoided } from '../../../../utils/eTicket'
import { formatUsd } from '../../../../utils/bookingCharge'
import BookingItinerary from '../../flights/BookingItinerary'
import { checkInOpensText, checkInsOf } from '../../../../../../shared/airlineCheckIn'
import { cabinOf, routeOf, travelDateOf, travellerCount, tripReferenceOf } from './tripView'

const fmt = (date, options = { month: 'short', day: 'numeric', year: 'numeric' }) => formatCalendarDate(date, options)

const Fact = ({ label, children }) => (
  <div className="flex items-baseline justify-between gap-4 py-2.5 min-w-0">
    <dt className="text-sm text-gray-500 flex-shrink-0">{label}</dt>
    <dd className="text-sm font-semibold text-gray-900 text-right break-words min-w-0">{children}</dd>
  </div>
)

const FactGroup = ({ title, children }) => (
  <section className="min-w-0">
    <h4 className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#055B75] mb-1">{title}</h4>
    <dl className="divide-y divide-gray-200/80">{children}</dl>
  </section>
)

function ticketText(booking) {
  const status = String(booking.status || '').toUpperCase()
  // A cancelled booking's tickets were voided or refunded: no number is shown
  // as though it could still be used. Nor one whose cancel went through and
  // could not be recorded: its row still reads confirmed (ticketState).
  if (status === 'CANCELLED' || ticketState(booking) === 'cancelled') return 'Cancelled'
  const numbers = liveTickets(booking).map((t) => t?.number).filter(Boolean)
  if (numbers.length) return <span className="tracking-wider">{numbers.join(', ')}</span>
  if (ticketsVoided(booking)) return 'Voided'
  if (documentState(booking) === 'cancel_pending') return 'None, cancellation pending'
  return ticketState(booking) === 'pending' ? 'Issued, number pending' : 'Not yet issued'
}

const amountOf = (booking) => parseFloat(booking.totalAmount || booking.total_amount || booking.amount || 0)

export function paidText(booking) {
  const amount = amountOf(booking)
  // What was charged, in USD. <Price> converted it into the visitor's chosen
  // currency, which is not what the card paid.
  return amount > 0 ? formatUsd(amount) : 'On request'
}

function OtherTravelFacts({ booking }) {
  if (booking.type === 'hotel') {
    return (
      <>
        {booking.hotelDestination && <Fact label="Destination">{booking.hotelDestination}</Fact>}
        {booking.checkinDate && <Fact label="Check-in">{fmt(booking.checkinDate)}</Fact>}
        {booking.checkoutDate && <Fact label="Check-out">{fmt(booking.checkoutDate)}</Fact>}
        {(booking.hotelRooms || booking.hotelGuests) && (
          <Fact label="Rooms & guests">{[booking.hotelRooms && `${booking.hotelRooms} room${booking.hotelRooms === 1 ? '' : 's'}`, booking.hotelGuests && `${booking.hotelGuests} guest${booking.hotelGuests === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</Fact>
        )}
      </>
    )
  }
  if (booking.type === 'cruise') {
    return (
      <>
        {booking.cruiseDestination && <Fact label="Destination">{booking.cruiseDestination}</Fact>}
        {booking.cruiseDepartureDate && <Fact label="Sails">{fmt(booking.cruiseDepartureDate)}</Fact>}
        {booking.cruiseDuration && <Fact label="Duration">{booking.cruiseDuration} {booking.cruiseDuration === 1 ? 'day' : 'days'}</Fact>}
        {(booking.cruisePassengers || booking.cruiseCabinType) && (
          <Fact label="Cabin & guests">{[booking.cruiseCabinType, booking.cruisePassengers && `${booking.cruisePassengers} guest${booking.cruisePassengers === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</Fact>
        )}
      </>
    )
  }
  if (booking.type === 'package') {
    return (
      <>
        {booking.packageDestination && <Fact label="Destination">{booking.packageDestination}</Fact>}
        {booking.packageStartDate && <Fact label="Starts">{fmt(booking.packageStartDate)}</Fact>}
        {booking.packageEndDate && <Fact label="Ends">{fmt(booking.packageEndDate)}</Fact>}
        {booking.packageTravelers && <Fact label="Travellers">{booking.packageTravelers}</Fact>}
      </>
    )
  }
  return null
}

export function TripDetails({ booking }) {
  const isFlight = booking.type === 'flight'
  const { legs } = routeOf(booking)
  const code = bookingCodeOf(booking) || {}
  const isDatabaseBooking = Boolean(booking.quoteId || booking.inquiryId)
  const travellers = travellerCount(booking)
  const cabin = isFlight ? cabinOf(booking, legs) : ''

  return (
    <div data-testid="trip-details" className="p-4 sm:p-5 space-y-4">
      {legs.length > 0 && <BookingItinerary legs={legs} />}
      {isFlight && legs.length === 0 && (booking.origin || booking.destination) && (
        <p className="text-sm text-gray-700">{booking.origin} → {booking.destination}{booking.departureDate ? ` · ${fmt(booking.departureDate)}` : ''}</p>
      )}
      <div className="grid md:grid-cols-2 gap-x-10 gap-y-5">
        <FactGroup title="Your booking">
          {isFlight && booking.pnr && (
            <Fact label={code.label}>
              <span className="font-mono tracking-widest text-[#034457]">{code.value}</span>
              {code.amadeusReference && <span className="block text-[11px] font-medium text-gray-500">{`Amadeus reference ${code.amadeusReference}`}</span>}
            </Fact>
          )}
          {/* A PNR alone is a reservation, not a ticket. */}
          {isFlight && booking.pnr && <Fact label="Ticket">{ticketText(booking)}</Fact>}
          {cabin && <Fact label="Cabin">{cabin}</Fact>}
          {travellers && <Fact label="Travellers">{travellers}</Fact>}
          {booking.baggage && <Fact label="Baggage">{typeof booking.baggage === 'object' ? JSON.stringify(booking.baggage) : booking.baggage}</Fact>}
          {booking.brandedFareLabel && <Fact label="Fare type">{booking.brandedFareLabel}</Fact>}
          <OtherTravelFacts booking={booking} />
        </FactGroup>
        <FactGroup title="Payment">
          <Fact label="Paid">{paidText(booking)}</Fact>
          <Fact label="Booked on">{fmt(booking.bookingDate || booking.orderCreatedAt || booking.paid_at || new Date())}</Fact>
          <Fact label="Reference">{booking.orderId || booking.bookingReference || booking.quoteId || 'N/A'}</Fact>
          <Fact label={isDatabaseBooking ? 'Quote number' : 'Transaction ID'}>
            {isDatabaseBooking ? (booking.orderId || booking.bookingReference) : (booking.transactionId || 'N/A')}
          </Fact>
        </FactGroup>
      </div>
      {booking.description && <p className="text-sm text-gray-600">{booking.description}</p>}
    </div>
  )
}

export function AttentionNote({ booking }) {
  const attention = attentionMessage(booking)
  if (!attention) return null
  return <div className="p-3 rounded-xl border border-amber-200 bg-amber-50 text-sm text-amber-800">{attention}</div>
}

/**
 * Whether the trip can still be cancelled here. Not one already cancelled, nor
 * one whose cancel went through and could not be recorded (ticketState
 * 'cancelled'): the customer was told not to try again. Nor while our team is
 * checking with the airline whether the booking went through (isCommitUnknown):
 * the server refuses it.
 */
export function canCancel(booking) {
  const status = String(booking.status || '').toUpperCase()
  const days = daysUntilDate(travelDateOf(booking))
  return status !== 'CANCELLED' && status !== 'FAILED' && ticketState(booking) !== 'cancelled'
    && (days === null || days >= 0) && !isCommitUnknown(booking)
}

const focusRing = 'outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#65B3CF] focus-visible:ring-offset-2'
const primaryBtn = `inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-[#055B75] hover:bg-[#034457] text-white rounded-full text-sm font-bold shadow-sm transition-colors ${focusRing}`
const outlineBtn = `inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-white border border-[#B9D0DC] hover:border-[#055B75] text-[#055B75] rounded-full text-sm font-bold transition-colors ${focusRing}`
const textBtn = `inline-flex items-center gap-1.5 px-3 py-2.5 rounded-full text-sm font-semibold text-[#055B75] hover:bg-[#F0FAFC] transition-colors disabled:opacity-60 ${focusRing}`

/** The airline's code and its check-in, in one strip. */
export function CheckInStrip({ booking }) {
  const [copied, setCopied] = useState(null)
  const checkIns = checkInsOf(booking)
  if (checkIns.length === 0) return null

  const copy = async (code) => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(code)
    } catch {
      setCopied(null)
    }
  }

  return (
    <div className="space-y-2">
      {checkIns.map((checkIn) => (
        <div key={checkIn.carrierCode} data-check-in className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5 rounded-2xl bg-[#F5FAFB] border border-[#DCEBF0] px-4 py-3">
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-500">{checkIn.codeIsAirlines ? 'Airline booking code' : 'Booking code'}</div>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-lg font-bold tracking-[0.2em] text-[#034457]">{checkIn.code}</span>
              <button type="button" onClick={() => copy(checkIn.code)} aria-label={`Copy ${checkIn.code}`} title="Copy" className={`p-1.5 rounded-md text-[#055B75] hover:bg-white ${focusRing}`}>
                {copied === checkIn.code ? <Check className="h-4 w-4" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
              </button>
            </div>
          </div>
          <span className="hidden sm:block h-10 w-px bg-[#DCEBF0]" aria-hidden="true" />
          <p className="flex-1 text-xs text-gray-500 leading-relaxed">
            {[checkInOpensText(checkIn), checkIn.codeIsAirlines ? '' : 'If the airline does not find this code, use your ticket number.'].filter(Boolean).join('. ')}
          </p>
          <a href={checkIn.url} target="_blank" rel="noopener noreferrer" className={primaryBtn}>
            {`Check in with ${checkIn.airline}`}
            <ExternalLink className="h-4 w-4" aria-hidden="true" />
          </a>
        </div>
      ))}
    </div>
  )
}

/**
 * @param {object} props
 * @param {object} props.booking
 * @param {object} props.ctx - the page's handlers: openDetails, manage, download,
 *   downloadState, cancel (confirmFor, busyFor, ask, dismiss, run), CancelQuote
 * @param {boolean} [props.withCheckIn] - show the airline check-in strip
 * @param {React.ReactNode} [props.children] - more buttons for the toolbar
 */
export function TripActions({ booking, ctx, withCheckIn = true, children }) {
  const isFlight = booking.type === 'flight'
  const reference = tripReferenceOf(booking)
  const isDatabaseBooking = Boolean(booking.quoteId || booking.inquiryId)
  const { downloadState, cancel, CancelQuote } = ctx
  const confirming = cancel.confirmFor === booking.id
  const checkIn = withCheckIn && isFlight && checkInsOf(booking).length > 0
  const mainBtn = checkIn ? outlineBtn : primaryBtn

  return (
    <div className="space-y-3">
      {checkIn && <CheckInStrip booking={booking} />}
      <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
        {isFlight && !isDatabaseBooking ? (
          <button type="button" onClick={() => ctx.manage(booking)} className={`${mainBtn} mr-1`}>
            <Settings className="h-4 w-4" aria-hidden="true" /> Manage trip
          </button>
        ) : (
          <button type="button" onClick={() => ctx.openDetails(booking)} className={`${mainBtn} mr-1`}>
            <Eye className="h-4 w-4" aria-hidden="true" /> View booking
          </button>
        )}
        {isFlight && canDownloadDocument(booking) && reference && (
          <button type="button" onClick={() => ctx.download(reference)} disabled={downloadState.busy === reference} className={textBtn}>
            <Download className="h-4 w-4" aria-hidden="true" />
            {downloadState.busy === reference
              ? 'Preparing your PDF…'
              : (ticketState(booking) === 'issued' ? 'Download e-ticket' : 'Download confirmation')}
          </button>
        )}
        {children}
        {canCancel(booking) && !confirming && (
          <button type="button" onClick={() => cancel.ask(booking.id)} className={`ml-auto inline-flex items-center px-3 py-2.5 rounded-full text-sm font-semibold text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors ${focusRing}`}>
            Cancel booking
          </button>
        )}
      </div>
      {downloadState.failed && downloadState.failed === reference && (
        <p role="alert" className="text-sm text-red-700">{downloadState.error}</p>
      )}
      {canCancel(booking) && confirming && (
        <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl border border-red-200 bg-red-50/60">
          {isFlight && reference && <CancelQuote reference={reference} />}
          <span className="text-sm text-red-700 font-semibold">Cancel this booking?</span>
          <button
            type="button"
            disabled={cancel.busyFor === booking.id}
            onClick={() => cancel.run(booking)}
            className={`px-4 py-1.5 bg-red-600 text-white text-xs font-bold rounded-full hover:bg-red-700 disabled:opacity-50 ${focusRing}`}
          >
            {cancel.busyFor === booking.id ? 'Cancelling...' : 'Yes, cancel'}
          </button>
          <button type="button" onClick={cancel.dismiss} className={`px-4 py-1.5 bg-white border border-gray-200 text-gray-700 text-xs font-bold rounded-full hover:bg-gray-50 ${focusRing}`}>
            No
          </button>
        </div>
      )}
    </div>
  )
}
