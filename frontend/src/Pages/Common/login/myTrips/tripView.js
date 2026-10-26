import { daysUntilDate } from '../../../../utils/dateUtils'
import { needsAttention, refundStatus } from '../../../../utils/bookingStatus'
import { documentState, hasNoConfirmedSeat, isCommitUnknown } from '../../../../utils/eTicket'
import { bookingItineraries, tripTypeOf } from '../../../../../../shared/bookingItineraries'
import { isAwaitingTicketOnly } from '../../../../../../shared/reviewQueue'
import { checkInFor } from '../../../../../../shared/airlineCheckIn'

const statusOf = (booking) => String(booking?.status || '').toUpperCase()
const isClosed = (booking) => ['CANCELLED', 'FAILED'].includes(statusOf(booking))

export const tripReferenceOf = (booking) =>
  booking?.bookingReference || booking?.booking_reference || booking?.orderId || booking?.quoteId || ''

export const travelDateOf = (booking) => {
  if (booking?.type === 'flight') {
    return booking.departureDate || booking.flight_departure_date || booking.flightData?.departureDate
      || bookingItineraries(booking)[0]?.departureDate
  }
  if (booking?.type === 'cruise') return booking.cruiseDepartureDate || booking.cruise_departure_date || booking.cruiseData?.departureDate
  if (booking?.type === 'hotel') return booking.checkinDate || booking.hotel_checkin_date || booking.hotelData?.checkinDate
  if (booking?.type === 'package') return booking.packageStartDate || booking.package_start_date
  return booking?.departureDate || booking?.startDate || booking?.travelDate
}

// Past only once the departure day is over, where the customer is. Read as
// UTC, a US trip moved to Past on the morning it departed.
export const isTravelDatePast = (booking) => {
  const travelDate = travelDateOf(booking)
  if (!travelDate) return false
  const days = daysUntilDate(travelDate)
  return days !== null && days < 0
}

const byTravelDate = (a, b) => {
  const left = travelDateOf(a) || '9999-12-31'
  const right = travelDateOf(b) || '9999-12-31'
  return left.localeCompare(right)
}

/**
 * Bookings someone has to act on: a reservation flagged for review, a refund
 * that did not go through.
 *
 * Not a booking whose outcome is still open, which has not failed: a commit our
 * team is checking with the airline (isCommitUnknown), or a PNR the airline has
 * not confirmed a seat on yet (hasNoConfirmedSeat). Each tells the customer not
 * to book the trip again, and listed as failed invited exactly that. They stay
 * with the upcoming trips, with their sentences. A cancelled one whose refund
 * did not go through (refundStatus) is still listed: that has failed.
 *
 * Nor a reservation the airline holds that is only waiting on its ticket: a
 * live PNR with a confirmed seat, no ticket, not cancelled (documentState
 * 'held'), flagged for the ticket alone (isAwaitingTicketOnly). Its sentence is
 * "Your seats are reserved, but your ticket has not been issued yet", and
 * "Failed" beside it said otherwise. A PNR whose cancellation the airline
 * refused carries its own flag, and stays.
 */
const failed = (booking) => {
  if (!needsAttention(booking)) return false
  const waitingOnTicket = documentState(booking) === 'held' && isAwaitingTicketOnly(booking)
  const stillOpen = !refundStatus(booking) && (isCommitUnknown(booking) || hasNoConfirmedSeat(booking) || waitingOnTicket)
  return !stillOpen
}

export function groupTrips(bookings = []) {
  return {
    upcoming: bookings.filter((b) => !isClosed(b) && !isTravelDatePast(b)).sort(byTravelDate),
    past: bookings.filter((b) => !isClosed(b) && isTravelDatePast(b)).sort((a, b) => byTravelDate(b, a)),
    cancelled: bookings.filter((b) => statusOf(b) === 'CANCELLED'),
    attention: bookings.filter(failed),
  }
}

/** The trip the page leads with: the soonest flight with an itinerary, else the soonest booking. */
export function pickNextTrip(upcoming = []) {
  return upcoming.find((b) => b.type === 'flight' && bookingItineraries(b).length > 0) || upcoming[0] || null
}

const OPEN_REQUEST = ['pending', 'processing', 'quoted']

export function groupRequests(requests = []) {
  const open = requests.filter((r) => OPEN_REQUEST.includes(r.status))
  return { open, closed: requests.filter((r) => !OPEN_REQUEST.includes(r.status)) }
}

/**
 * Where the trip goes: a round trip's turnaround airport, otherwise the last
 * airport of the last leg.
 */
export function routeOf(booking) {
  const legs = booking?.type === 'flight' ? bookingItineraries(booking) : []
  if (legs.length > 0) {
    const roundTrip = tripTypeOf(legs) === 'roundTrip'
    return {
      legs,
      from: legs[0].origin,
      to: roundTrip ? legs[0].destination : legs[legs.length - 1].destination,
      roundTrip,
    }
  }
  return {
    legs,
    from: booking?.origin || '',
    to: booking?.destination || booking?.cruiseDestination || booking?.hotelDestination || booking?.packageDestination || '',
    roundTrip: false,
  }
}

export function airlineOf(booking, legs = []) {
  const code = String(legs[0]?.segments?.[0]?.carrierCode || booking?.airline || '').trim().toUpperCase()
  const saved = String(booking?.airlineName || '').trim()
  const name = (saved.length > 3 ? saved : '') || checkInFor(code)?.airline || saved || code
  return { code, name, logo: code ? `https://pics.avs.io/200/200/${code}.png` : '' }
}

export const cabinOf = (booking, legs = []) => {
  const raw = booking?.cabinClass || booking?.travelClass || legs[0]?.segments?.[0]?.cabin || ''
  return String(raw).toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export const travellerCount = (booking) => {
  const list = booking?.travelers || booking?.passengerData
  if (Array.isArray(list) && list.length > 0) return list.length
  return Number(booking?.passengers) || null
}

export function untilLabel(days) {
  if (days === null || days === undefined || days < 0) return null
  if (days === 0) return 'Today'
  if (days === 1) return 'Tomorrow'
  return `in ${days} days`
}
