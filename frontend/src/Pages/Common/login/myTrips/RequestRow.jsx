import React from 'react'
import { Ship, Plane, Hotel, Luggage, MessageSquare, FileText } from 'lucide-react'
import { formatCalendarDate } from '../../../../utils/dateUtils'

const TYPE_ICON = { flight: Plane, cruise: Ship, hotel: Hotel, package: Luggage }
const TYPE_NAME = { flight: 'Flight', cruise: 'Cruise', hotel: 'Hotel', package: 'Package', general: 'General' }

const STATUS = {
  pending: ['Pending review', 'bg-amber-50 text-amber-700', 1],
  processing: ['Processing', 'bg-[#F0FAFC] text-[#055B75]', 1],
  quoted: ['Quote sent', 'bg-emerald-50 text-emerald-700', 2],
  booked: ['Booked', 'bg-emerald-50 text-emerald-700', 3],
  cancelled: ['Cancelled', 'bg-red-50 text-red-700', 0],
  expired: ['Expired', 'bg-gray-100 text-gray-600', 0],
}

const focusRing = 'outline-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[#65B3CF] focus-visible:ring-offset-2'

const fmt = (date) => formatCalendarDate(date, { day: 'numeric', month: 'short', year: 'numeric' })

function summaryOf(request) {
  switch (request.inquiry_type) {
    case 'flight': return [request.flight_origin && `${request.flight_origin} → ${request.flight_destination}`, fmt(request.flight_departure_date)]
    case 'hotel': return [request.hotel_destination, fmt(request.hotel_checkin_date)]
    case 'cruise': return [request.cruise_destination, fmt(request.cruise_departure_date)]
    case 'package': return [request.package_destination, fmt(request.package_start_date)]
    default: return [request.inquiry_subject]
  }
}

export default function RequestRow({ request, onOpen, onQuote }) {
  const Icon = TYPE_ICON[request.inquiry_type] || MessageSquare
  const [label, tone, step] = STATUS[request.status] || [request.status, 'bg-gray-100 text-gray-700', 0]
  const quotes = (request.quotes || []).filter((q) => q.status === 'sent' || q.status === 'accepted')
  const summary = summaryOf(request).filter(Boolean).join(' · ')

  return (
    <div data-testid={`request-${request.id}`} className="border-b border-gray-100 last:border-b-0 p-4 sm:p-5">
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 sm:gap-4">
        <div className="w-10 h-10 rounded-lg bg-[#F0FAFC] text-[#055B75] flex items-center justify-center flex-shrink-0"><Icon className="h-5 w-5" aria-hidden="true" /></div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-gray-900 text-sm sm:text-[15px] truncate">{TYPE_NAME[request.inquiry_type] || 'Travel'} request <span className="text-xs font-medium text-gray-400">#{String(request.id).slice(-8)}</span></div>
          <div className="text-xs text-gray-500 truncate">{[summary, `Sent ${fmt(request.created_at)}`].filter(Boolean).join(' · ')}</div>
        </div>
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${tone}`}>
          <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />{label}
        </span>
        <div className="flex items-center gap-2 flex-shrink-0">
          {quotes.length > 0 && (
            <button type="button" onClick={() => onQuote(request, quotes[0])} className={`inline-flex items-center gap-1.5 px-5 py-2 bg-[#055B75] hover:bg-[#034457] text-white rounded-full text-sm font-bold ${focusRing}`}>
              <FileText className="h-4 w-4" aria-hidden="true" /> View quote
            </button>
          )}
          <button type="button" onClick={() => onOpen(request)} className={`px-2 py-1.5 rounded-full text-xs font-semibold text-[#055B75] hover:bg-[#F0FAFC] ${focusRing}`}>Details</button>
        </div>
      </div>
      {step > 0 && (
        <div className="mt-3 ml-0 sm:ml-14 flex items-center gap-2 text-[11px] text-gray-500" aria-label={`Step ${step} of 3`}>
          {['Sent', 'Quoted', 'Booked'].map((name, index) => (
            <React.Fragment key={name}>
              {index > 0 && <span className={`h-px w-8 sm:w-12 ${index < step ? 'bg-[#055B75]' : 'bg-gray-200'}`} />}
              <span className={`inline-flex items-center gap-1 ${index < step ? 'text-[#055B75] font-semibold' : ''}`}>
                <span className={`h-2 w-2 rounded-full ${index < step ? 'bg-[#055B75]' : 'bg-gray-300'}`} />{name}
              </span>
            </React.Fragment>
          ))}
          {quotes[0] && <span className="ml-2 font-semibold text-emerald-700">${quotes[0].total_amount} {quotes[0].currency}</span>}
        </div>
      )}
    </div>
  )
}
