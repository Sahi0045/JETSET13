import React from 'react'
import { ChevronDown, Clock, Plane, Ship, Hotel, Luggage, ClipboardList, Search } from 'lucide-react'
import { daysUntilDate, formatCalendarDate, formatIsoDuration } from '../../../../utils/dateUtils'
import { attentionMessage, bookingStatusBadge, isCompletedTrip, refundStatus } from '../../../../utils/bookingStatus'
import { clockTime, layoverBetween, legLabel } from '../../../../../../shared/bookingItineraries'
import { getDestImage } from '../../../../utils/destinationImage'
import { airlineOf, cabinOf, routeOf, travelDateOf, travellerCount, tripReferenceOf, untilLabel } from './tripView'
import { AttentionNote, paidText } from './TripDetails'

const TYPE_ICON = { flight: Plane, cruise: Ship, hotel: Hotel, package: Luggage }
const TYPE_NAME = { flight: 'Flight', cruise: 'Cruise', hotel: 'Hotel', package: 'Package' }

const TONES = {
  success: 'bg-emerald-50 text-emerald-700',
  danger: 'bg-red-50 text-red-700',
  warning: 'bg-amber-50 text-amber-700',
  neutral: 'bg-[#F0FAFC] text-[#055B75]',
}

const focusRing = 'outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#65B3CF] focus-visible:ring-offset-2'

const cardShell = 'bg-white rounded-2xl border border-[#EFE9DD] shadow-[0_10px_26px_-20px_rgba(12,42,51,0.45)]'

const dayShift = (from, to) => {
  const a = /^\d{4}-\d{2}-\d{2}$/.test(from || '') ? Date.parse(`${from}T00:00:00Z`) : NaN
  const b = /^\d{4}-\d{2}-\d{2}$/.test(to || '') ? Date.parse(`${to}T00:00:00Z`) : NaN
  const days = Math.round((b - a) / 86400000)
  return Number.isFinite(days) && days > 0 ? `+${days}` : ''
}

export function StatusPills({ booking }) {
  const badge = bookingStatusBadge(booking)
  const refund = refundStatus(booking)
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${TONES[badge.tone] || TONES.neutral}`}>
        <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />{badge.label}
      </span>
      {refund && (
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${TONES[refund.tone] || TONES.neutral}`}>{refund.label}</span>
      )}
    </span>
  )
}

function StopsPill({ leg, cityNames }) {
  if (!leg.stops) {
    return <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-700">Non-stop</span>
  }
  const [first, second] = leg.segments
  const one = leg.stops === 1 && !leg.partial && second
  const wait = one ? layoverBetween(first, second) : ''
  return (
    <span className="inline-flex flex-wrap items-center justify-center gap-x-1 rounded-2xl bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-700">
      <span className="whitespace-nowrap">{leg.stops} {leg.stops === 1 ? 'stop' : 'stops'}{one ? ' ·' : ''}</span>
      {one && <span className="font-semibold text-amber-800/90">{cityNames[first.destination] || first.destination}{wait && <span className="whitespace-nowrap"> · {wait} wait</span>}</span>}
    </span>
  )
}

const End = ({ time, date, code, terminal, city, right, large }) => (
  <div className={`shrink-0 ${right ? 'text-right' : 'text-left'}`}>
    <div className={`font-grotesk ${large ? 'text-[26px] sm:text-[32px]' : 'text-2xl'} font-semibold text-ink leading-none tracking-tight whitespace-nowrap`}>
      {time.main}{time.shift && <sup className="ml-0.5 text-[10px] font-semibold text-amber-600" title="Arrives on a later day">{time.shift}</sup>}
    </div>
    <div className="whitespace-nowrap text-[11px] text-gray-500 mt-1">{formatCalendarDate(date, { weekday: 'short', day: 'numeric', month: 'short' })}</div>
    <div className="text-xs text-gray-500 mt-0.5"><span className="font-semibold text-gray-700">{code}</span>{terminal && <span className="ml-1 text-[10px]">T{terminal}</span>}</div>
    {city && city !== code && <div className={`text-[11px] text-gray-400 truncate max-w-[110px] ${right ? 'ml-auto' : ''}`}>{city}</div>}
  </div>
)

export function FlightTimes({ leg, cityNames = {}, large = false }) {
  const first = leg.segments[0] || {}
  const last = leg.segments[leg.segments.length - 1] || {}
  return (
    <div className="flex items-center justify-between gap-2 sm:gap-4">
      <End large={large} time={{ main: clockTime(first.departureTime) || '--:--' }} date={leg.departureDate || first.departureDate} code={leg.origin} terminal={first.departureTerminal} city={cityNames[leg.origin]} />
      <div className="flex-1 min-w-0 flex flex-col items-center px-1">
        {leg.duration && (
          <div className="text-[13px] font-bold text-ink mb-1.5 flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-gray-400" aria-hidden="true" />{formatIsoDuration(leg.duration)}</div>
        )}
        <div className="w-full flex items-center gap-1" aria-hidden="true">
          <span className="h-2 w-2 rounded-full border-2 border-gray-300 flex-shrink-0" />
          <span className="flex-1 h-px bg-gray-300 relative">
            {Array.from({ length: Math.min(leg.stops || 0, 3) }).map((_, i, all) => (
              <span key={i} style={{ left: `${((i + 1) / (all.length + 1)) * 100}%` }} className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 h-2 w-2 rounded-full border-2 border-white bg-amber-500" />
            ))}
          </span>
          <Plane className="h-3 w-3 text-gray-400 rotate-90 flex-shrink-0" />
        </div>
        <div className="mt-2 flex w-full justify-center text-center"><StopsPill leg={leg} cityNames={cityNames} /></div>
      </div>
      <End large={large} right time={{ main: clockTime(last.arrivalTime) || '--:--', shift: dayShift(leg.departureDate || first.departureDate, leg.arrivalDate || last.arrivalDate) }} date={leg.arrivalDate || last.arrivalDate} code={leg.destination} terminal={last.arrivalTerminal} city={cityNames[leg.destination]} />
    </div>
  )
}

export function AirlineLine({ booking, legs }) {
  const airline = airlineOf(booking, legs)
  const numbers = legs.flatMap((leg) => leg.segments.map((s) => s.flightNumber)).filter(Boolean)
  const detail = [numbers.join(', '), cabinOf(booking, legs), travellerCount(booking) && `${travellerCount(booking)} traveller${travellerCount(booking) === 1 ? '' : 's'}`].filter(Boolean).join(' · ')
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="w-10 h-10 flex items-center justify-center bg-white rounded-lg overflow-hidden border border-gray-100 flex-shrink-0">
        {airline.logo ? <img src={airline.logo} alt="" className="w-8 h-8 object-contain" loading="lazy" /> : <Plane className="h-5 w-5 text-[#055B75]" aria-hidden="true" />}
      </div>
      <div className="min-w-0">
        <h3 className="font-semibold text-gray-900 text-sm leading-tight truncate">{airline.name || 'Flight'}</h3>
        {detail && <div className="text-xs text-gray-400 truncate">{detail}</div>}
      </div>
    </div>
  )
}

function placeOf(booking, cityNames) {
  const { to } = routeOf(booking)
  return cityNames[to] || to
}

function tripTitle(booking, cityNames) {
  const { from, to, roundTrip } = routeOf(booking)
  if (booking.type === 'flight' && from && to) return `${cityNames[from] || from} ${roundTrip ? '⇄' : '→'} ${cityNames[to] || to}`
  if (booking.title) return booking.title
  if (booking.type === 'hotel' && booking.hotelName) return booking.hotelName
  if (booking.type === 'cruise' && booking.cruiseName) return booking.cruiseName
  return `${TYPE_NAME[booking.type] || 'Travel'} booking`
}

export function DetailsToggle({ expanded, onClick, label = 'Booking details' }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={expanded} className={`inline-flex items-center gap-1 px-3 py-2.5 rounded-full text-sm font-semibold text-[#055B75] hover:bg-[#F0FAFC] transition-colors ${focusRing}`}>
      {expanded ? 'Hide details' : label}
      <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
    </button>
  )
}

export function NextTripCard({ booking, cityNames, actions, details, expanded }) {
  const { legs, to } = routeOf(booking)
  const days = daysUntilDate(travelDateOf(booking))
  const city = placeOf(booking, cityNames)
  const verb = booking.type === 'cruise' ? 'sail' : booking.type === 'flight' ? 'fly' : 'travel'
  const Icon = TYPE_ICON[booking.type] || ClipboardList

  return (
    <article data-testid={`trip-${tripReferenceOf(booking)}`} className={`${cardShell} overflow-hidden`}>
      <div className="grid lg:grid-cols-[1.15fr_0.85fr]">
        <div className="order-2 lg:order-1 p-5 sm:p-7 min-w-0">
          <div className="flex flex-wrap items-center gap-3 mb-5">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#055B75]">Your next trip</span>
            <StatusPills booking={booking} />
          </div>
          {legs.length > 0 ? (
            <>
              <div className="mb-5"><AirlineLine booking={booking} legs={legs} /></div>
              <div className="space-y-4">
                {legs.map((leg, index) => (
                  <div key={`${leg.origin}-${leg.destination}-${index}`}>
                    {legs.length > 1 && <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-1">{legLabel(leg, index, legs.length)}</div>}
                    <FlightTimes leg={leg} cityNames={cityNames} large />
                    {index < legs.length - 1 && <div className="border-t border-dashed border-gray-200 mt-4" />}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-[#F0FAFC] text-[#055B75] flex items-center justify-center flex-shrink-0"><Icon className="h-5 w-5" aria-hidden="true" /></div>
              <div>
                <h3 className="font-grotesk text-2xl font-semibold text-ink leading-tight">{tripTitle(booking, cityNames)}</h3>
                <p className="text-sm text-gray-500 mt-1">{[formatCalendarDate(travelDateOf(booking), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }, ''), to].filter(Boolean).join(' · ')}</p>
              </div>
            </div>
          )}
          <div className="mt-5 space-y-4">
            <AttentionNote booking={booking} />
            {actions}
          </div>
        </div>
        <div className="order-1 lg:order-2 relative min-h-[170px] lg:min-h-[340px] bg-[#034457] bg-cover bg-center" style={{ backgroundImage: `url(${getDestImage(to, city)})` }}>
          <div className="absolute inset-0 bg-gradient-to-t from-[#034457]/85 via-[#034457]/10 to-transparent" />
          {city && <span className="absolute top-4 right-4 rounded-full bg-[#055B75] text-white text-[11px] font-bold px-3 py-1">{city}</span>}
          {days !== null && days >= 0 && (
            <div className="absolute left-5 sm:left-6 bottom-4 sm:bottom-5 text-white">
              <div className="font-grotesk text-4xl sm:text-5xl font-bold leading-none">{days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days} days`}</div>
              <div className="text-[12px] font-bold uppercase tracking-[0.18em] mt-1 opacity-90">{days > 1 ? `until you ${verb}` : `you ${verb}`}</div>
            </div>
          )}
        </div>
      </div>
      {expanded && <div className="border-t border-gray-100 bg-[#FCFBF8]">{details}</div>}
    </article>
  )
}

const EMPTY = {
  all: ['No trips coming up', 'When you book a flight with us, it shows up here with your e-ticket and check-in.', 'Search flights', '/flights', Plane],
  flight: ['No flights coming up', 'When you book a flight with us, it shows up here with your e-ticket and check-in.', 'Search flights', '/flights', Plane],
  cruise: ['No cruises coming up', 'Ask our team for a cruise and your quote and booking show up here.', 'Explore cruises', '/cruise', Ship],
  hotel: ['No hotel stays coming up', 'Hotel bookings you make with us show up here.', 'Find a hotel', '/hotels', Hotel],
  package: ['No packages coming up', 'Holiday packages you book with us show up here.', 'Browse packages', '/packages', Luggage],
}

export function NoTripCard({ type = 'all', onSearch }) {
  const [title, text, action, path, Icon] = EMPTY[type] || EMPTY.all
  return (
    <div className={`${cardShell} p-8 sm:p-10 flex flex-col sm:flex-row sm:items-center gap-5`}>
      <div className="w-14 h-14 rounded-2xl bg-[#F0FAFC] text-[#055B75] flex items-center justify-center flex-shrink-0"><Icon className="h-6 w-6" aria-hidden="true" /></div>
      <div className="flex-1">
        <h2 className="font-grotesk text-2xl font-semibold text-ink">{title}</h2>
        <p className="text-sm text-gray-500 mt-1">{text}</p>
      </div>
      <button type="button" onClick={() => onSearch(path)} className={`inline-flex items-center gap-2 px-7 py-3 bg-[#055B75] hover:bg-[#034457] text-white rounded-full text-sm font-bold shadow-sm ${focusRing}`}>
        <Search className="h-4 w-4" aria-hidden="true" /> {action}
      </button>
    </div>
  )
}

export function TripRow({ booking, cityNames, expanded, onToggle, children }) {
  const { legs } = routeOf(booking)
  const date = travelDateOf(booking)
  const days = daysUntilDate(date)
  const airline = booking.type === 'flight' && legs.length > 0 ? airlineOf(booking, legs) : null
  const Icon = TYPE_ICON[booking.type] || ClipboardList
  // "Trip completed" only for a trip that could have been taken: a reservation
  // never ticketed has only had its travel date pass.
  const when = days !== null && days < 0 ? (isCompletedTrip(booking) ? 'Trip completed' : 'Travel date passed') : untilLabel(days)
  const sub = [
    formatCalendarDate(date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }, ''),
    airline?.name,
    when,
  ].filter(Boolean).join(' · ')

  return (
    <div data-testid={`trip-${tripReferenceOf(booking)}`} className="border-b border-gray-100 last:border-b-0">
      <div className="p-4 sm:p-5 flex flex-wrap sm:flex-nowrap items-center gap-3 sm:gap-4">
        <div className="w-10 h-10 flex items-center justify-center bg-white rounded-lg overflow-hidden border border-gray-100 flex-shrink-0">
          {airline?.logo ? <img src={airline.logo} alt="" className="w-8 h-8 object-contain" loading="lazy" /> : <Icon className="h-5 w-5 text-[#055B75]" aria-hidden="true" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-gray-900 text-sm sm:text-[15px] truncate">{tripTitle(booking, cityNames)}</div>
          <div className="text-xs text-gray-500 truncate">{sub || `Booked ${formatCalendarDate(booking.bookingDate || booking.orderCreatedAt, { day: 'numeric', month: 'short', year: 'numeric' }, '')}`}</div>
        </div>
        <StatusPills booking={booking} />
        <span className="font-grotesk text-lg font-bold text-ink sm:w-28 sm:text-right">{paidText(booking)}</span>
        <button type="button" onClick={onToggle} aria-expanded={expanded} className={`inline-flex items-center gap-1 px-2 py-1.5 rounded-full text-xs font-semibold text-[#055B75] hover:bg-[#F0FAFC] flex-shrink-0 ${focusRing}`}>
          {expanded ? 'Hide' : 'Details'}
          <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
      </div>
      {attentionMessage(booking) && <div className="px-4 sm:px-5 pb-4 -mt-1"><AttentionNote booking={booking} /></div>}
      {expanded && <div className="border-t border-gray-100 bg-[#FCFBF8]">{children}</div>}
    </div>
  )
}

export function PastTripCard({ booking, cityNames, onOpen }) {
  const { legs, to } = routeOf(booking)
  const city = placeOf(booking, cityNames) || tripTitle(booking, cityNames)
  const airline = booking.type === 'flight' && legs.length > 0 ? airlineOf(booking, legs).name : ''
  const when = formatCalendarDate(travelDateOf(booking), { month: 'short', year: 'numeric' }, '')
  return (
    <button type="button" onClick={onOpen} className={`text-left bg-white rounded-2xl overflow-hidden border border-[#EFE9DD] hover:border-[#B9D0DC] transition-colors ${focusRing}`}>
      <div className="h-28 sm:h-32 bg-[#E3F1F6] bg-cover bg-center" style={{ backgroundImage: `url(${getDestImage(to, city)})` }} />
      <div className="p-3.5">
        <div className="font-bold text-gray-900 text-sm truncate">{city}</div>
        <div className="text-xs text-gray-500 truncate">{[when, airline].filter(Boolean).join(' · ')}</div>
      </div>
    </button>
  )
}

export function TripsBar({ counts, nextLine, onBook }) {
  return (
    <div className="bg-gradient-to-r from-[#055B75] to-[#034457] text-white shadow-md">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3 sm:gap-4">
        <h1 className="text-base sm:text-lg font-bold leading-none whitespace-nowrap">My Trips</h1>
        <span className="h-8 w-px bg-white/20 flex-shrink-0" />
        <div className="text-sm min-w-0 truncate">
          <span className="font-medium">{counts.upcoming} upcoming</span>
          <span className="hidden sm:inline text-white/80"><span className="text-white/50 mx-2">·</span>{counts.past} past · {counts.cancelled} cancelled</span>
        </div>
        {nextLine && (
          <>
            <span className="hidden md:block h-8 w-px bg-white/20 flex-shrink-0" />
            <div className="hidden md:block text-sm text-white/90 truncate">{nextLine}</div>
          </>
        )}
        <button type="button" onClick={onBook} className="ml-auto flex-shrink-0 inline-flex items-center gap-1.5 px-4 py-2 bg-white text-[#055B75] rounded-lg text-sm font-bold shadow-sm hover:bg-[#F0FAFC] transition-colors outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
          <Plane className="h-4 w-4" aria-hidden="true" /> <span className="hidden sm:inline">Book a flight</span><span className="sm:hidden">Book</span>
        </button>
      </div>
    </div>
  )
}

export { cardShell, focusRing, tripTitle }
