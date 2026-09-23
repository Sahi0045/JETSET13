import React, { forwardRef } from 'react';
import { Plane, User } from 'lucide-react';
import { formatUsd } from '../../../utils/bookingCharge';
import { bookingStatusBadge, paymentReturned } from '../../../utils/bookingStatus';
import {
    resolveTickets,
    ticketState,
    ticketForTraveler,
    issueDate,
    isPaid,
    documentState,
    pnrOf,
    liveTickets,
    voidedTicketDigits,
    isVoidedTicket,
} from '../../../utils/eTicket';
import { formatCalendarDate } from '../../../utils/dateUtils';
import { bookingItineraries } from '../../../../../shared/bookingItineraries';
import BookingItinerary from './BookingItinerary';

/**
 * The travel document a customer downloads and may carry to an airport.
 *
 * It previously asserted things it had no way to know: a `Math.random()` ticket
 * number per passenger (regenerated every render), today's date as the date of
 * issue, an unconditional "Payment Confirmed", a decorative barcode, and an
 * invented airline when data was missing — all headed "E-Ticket". Since
 * ticketing has never once succeeded here, every one of those documents was
 * fiction, and someone could have been turned away at a counter holding one.
 *
 * The rule now: print only what the booking can prove, and say plainly when a
 * ticket has not been issued yet. A booking with a PNR and no ticket is a real,
 * valid reservation - it is simply not a ticket, and must not look like one.
 */
const FlightETicket = forwardRef(({ bookingData }, ref) => {
    if (!bookingData) return null;

    // Support both nested structure (from success page) and flat structure (from manage booking)
    const bookingDetails = bookingData.bookingDetails || bookingData;
    const passengerData = bookingData.passengerData || bookingData.travelers || [];
    // `|| '0'` used to sit at the end of this, and `toClientBooking` sends
    // `amount: parseFloat(amount) || 0` - so a booking with no recorded total
    // printed "$0.00" as the Total Amount on a document the customer downloads
    // and may present. ManageBooking guards the same figure on screen
    // ("Not recorded"); the document did not, and a document asserting $0.00 is
    // a claim about money the booking cannot support.
    const calculatedFare = bookingData.calculatedFare || {
        totalAmount: bookingData.amount || bookingData.totalPrice || null
    };
    const recordedTotal = Number(calculatedFare.totalAmount) > 0
        ? formatUsd(calculatedFare.totalAmount)
        : 'Not recorded';

    // What the booking can actually prove about ticketing.
    const tickets = resolveTickets(bookingData);
    // Every leg and flight. The document printed the first leg only, as one
    // flight from its first departure to its last arrival - no return flight,
    // and a connection drawn as a non-stop.
    const legs = bookingItineraries(bookingData);
    const state = ticketState(bookingData);
    // The tickets a cancel voided (the cancel does not prune the list). The
    // whole list is still what each traveller is matched against, so that a
    // match by position cannot hand one traveller another's ticket; a match
    // that is void is then said to be void. The date of issue is a live
    // ticket's: a void one printed "Date of Issue" over no valid ticket.
    const voided = voidedTicketDigits(bookingData);
    const issuedOn = issueDate(liveTickets(bookingData));
    const paid = isPaid(bookingData) || isPaid(bookingDetails);

    const isTicketed = state === 'issued';
    // A cancelled booking's tickets were voided or refunded with the airline.
    // Its document still downloaded headed "E-Ticket", with every number on it.
    const isCancelled = state === 'cancelled';
    const hasPnr = Boolean(pnrOf(bookingData));
    const docState = documentState(bookingData);
    // "E-Ticket" is a claim, and so is "Booking Confirmation": the first needs a
    // ticket, the second a PNR with a seat on it. Neither is made for a booking
    // that holds none - including a PNR the airline confirmed no seat on.
    // Nor for one whose tickets a cancel voided: it holds no valid ticket, and
    // it is being cancelled.
    const documentTitle = isCancelled ? 'Cancelled Booking'
        : isTicketed ? 'E-Ticket'
            : hasPnr && docState !== 'no_confirmed_seat' && docState !== 'tickets_voided' ? 'Booking Confirmation'
                : 'Booking Summary';

    // Worded from what is true of the booking. "Your seat is held under the PNR
    // below" was printed whenever no ticket existed, over "PNR: N/A" for a
    // booking still queued, never sent to the airline, or never paid for.
    const NOTICES = {
        // Refunded since, in full or in part (the Payments tab refunds without
        // cancelling): nobody is getting that number - ticket sync reads it
        // for paid bookings only, and the alarm drops refunded ones - so no
        // email is promised, as on the confirmation page.
        ticket_pending: paymentReturned(bookingData)
            ? {
                title: 'Your ticket has been issued. Its ticket number has not reached us.',
                body: 'If you need your ticket number, call (877) 538-7380 with your booking reference. Your booking reference and PNR below are valid.',
            }
            : {
                title: 'Your ticket has been issued. The ticket number is still being confirmed.',
                body: 'We will email your ticket number shortly. Your booking reference and PNR below are valid.',
            },
        // Every ticket voided by a cancel the airline then refused. Manage
        // Booking does not offer this one either (canDownloadDocument).
        tickets_voided: {
            title: 'The ticket on this booking has been voided. It is not valid for travel.',
            body: 'The cancellation has not been completed with the airline yet. Our team has been alerted and will complete it. Please do not travel on this document.',
        },
        held: {
            title: 'This is a confirmed reservation, not a ticket.',
            body: 'Your seat is held under the PNR below. We will email your e-ticket once it is issued. Please do not travel on this document alone.',
        },
        // Manage Booking does not offer this one (canDownloadDocument), but the
        // template is on the page, and it must not say "held" either.
        no_confirmed_seat: {
            title: 'The airline has not confirmed a seat on every flight.',
            body: 'No ticket has been issued, and this document does not hold a seat. Our team will contact you. Please do not book this trip again in the meantime.',
        },
        queued: {
            title: 'Your booking is being confirmed with the airline.',
            body: 'Your payment is received, but no seat is held yet, so this is not a reservation or a ticket. We will email you once the airline confirms it.',
        },
        not_booked: paid
            ? {
                title: 'This booking has not been confirmed with the airline.',
                body: 'Your payment is received, but no seat is held, so this is not a reservation or a ticket. We will confirm your booking or refund you by email.',
            }
            : {
                title: 'This booking has not been paid for.',
                body: 'Nothing is held with the airline, so this is not a reservation or a ticket.',
            },
    };
    const notice = NOTICES[docState] || null;

    // Get flight data - handle both nested and direct structures. Identifiers
    // fall back to a visible placeholder rather than a plausible-looking
    // invention: an unknown airline printed as "Jetsetters Air" reads as fact.
    const flight = bookingDetails?.flight || bookingData.flight || {
        airline: bookingData.airlineName || bookingData.airline || '—',
        flightNumber: bookingData.flightNumber || '—',
        stops: bookingData.stops || 0,
        cabin: bookingData.cabinClass || bookingData.cabin || null,
        duration: bookingData.duration || '—',
        departureTime: bookingData.departureTime || '--:--',
        departureCity: bookingData.originCity || bookingData.origin || 'Departure',
        departureAirport: bookingData.origin || '—',
        // No date is not today's date: a missing date printed as the day the
        // document was downloaded.
        departureDate: bookingData.departureDate || null,
        departureTerminal: bookingData.departureTerminal || null,
        arrivalTime: bookingData.arrivalTime || '--:--',
        arrivalCity: bookingData.destinationCity || bookingData.destination || 'Arrival',
        arrivalAirport: bookingData.destination || '—',
        arrivalDate: bookingData.arrivalDate || null,
        arrivalTerminal: bookingData.arrivalTerminal || null
    };

    const safeBookingDetails = {
        bookingId: bookingDetails?.bookingId || bookingData.orderId || bookingData.bookingReference || 'N/A',
        status: bookingDetails?.status || bookingData.status || 'PENDING',
        pnr: pnrOf(bookingData) || 'Not yet assigned',
        // Never an invented allowance on a travel document.
        baggage: bookingDetails?.baggage || null
    };

    // Format helpers
    // The calendar day the booking names. `new Date('2026-11-15')` is UTC
    // midnight, so a US customer's document printed the day before.
    const formatDate = (dateString) => formatCalendarDate(dateString, {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    }, '—');

    /** What to print where a ticket number goes, for one passenger. */
    const ticketLabel = (traveler, index) => {
        if (isCancelled) return 'Cancelled — not valid for travel';
        const match = ticketForTraveler(tickets, traveler, index);
        // A void number printed as "Ticket #" reads as a ticket to fly on.
        if (match?.number && isVoidedTicket(match, voided)) return 'Ticket voided — not valid for travel';
        if (match?.number) return `Ticket #: ${match.number}`;
        // Tickets exist, but none can be tied to this traveller for certain
        // (see ticketForTraveler). Another traveller's number would be worse
        // than none, and "not yet issued" would be untrue.
        if (state === 'pending' || state === 'issued') return 'Ticket issued — number pending';
        if (docState === 'tickets_voided') return 'Ticket voided — not valid for travel';
        return 'Ticket not yet issued';
    };

    return (
        <div style={{ position: 'absolute', top: '-10000px', left: '-10000px' }} aria-hidden="true">
            {/* Off-screen rather than display:none. html2canvas renders layout,
                and a hidden element has none - the old `className="hidden"`
                wrapper produced a blank PDF. Captured by ref, never in flow. */}
            <div
                ref={ref}
                className="w-[800px] bg-white text-gray-800 font-sans p-0 m-0 relative"
                style={{ width: '800px', minHeight: '1100px' }} // Fixed A4-ish width ratio
            >
                {/* Header with Branding */}
                <div className="bg-[#055B75] text-white p-8 flex justify-between items-center print-header">
                    <div>
                        <h1 className="text-3xl font-bold tracking-wider italic">Jetsetters</h1>
                        <p className="text-sm text-blue-200 tracking-widest mt-1">JET SET GO</p>
                    </div>
                    <div className="text-right">
                        <h2 className="text-2xl font-bold uppercase tracking-widest">{documentTitle}</h2>
                        <p className="text-blue-200 mt-1">Booking Reference: <span className="text-white font-mono text-xl font-bold">{safeBookingDetails.bookingId}</span></p>
                    </div>
                </div>

                {/* Status Strip — the issue date is the one Amadeus reported, not
                    the day this happened to be opened. */}
                <div className="bg-[#034457] text-white px-8 py-2 flex justify-between items-center text-sm">
                    <span>
                        {isCancelled
                            ? 'Cancelled — not valid for travel'
                            : issuedOn
                                ? `Date of Issue: ${formatCalendarDate(issuedOn, { month: 'short', day: 'numeric', year: 'numeric' }, issuedOn)}`
                                : docState === 'tickets_voided' ? 'Ticket voided — not valid for travel'
                                    // Issued, its number not here yet: "not yet
                                    // issued" sat under a notice saying it was.
                                    : state === 'pending' ? 'Ticket issued — number pending'
                                        : hasPnr ? 'Ticket not yet issued' : 'Not yet confirmed with the airline'}
                    </span>
                    <span className={`font-bold uppercase px-3 py-1 rounded text-xs ${isCancelled ? 'bg-red-600' : isTicketed ? 'bg-green-500' : 'bg-amber-500'}`}>
                        {/* The status in words. The raw database value
                            ("pending_ticketing") was printed here. */}
                        {bookingStatusBadge(bookingData).label}
                    </span>
                </div>

                <div className="p-8">
                    {/* Says plainly what this document is not, so nobody travels on
                        a reservation believing it is a ticket. */}
                    {isCancelled && (
                        <div className="mb-6 border border-red-300 bg-red-50 rounded-lg px-5 py-4">
                            <p className="font-bold text-red-900 text-sm">This booking has been cancelled. It is not valid for travel.</p>
                            <p className="text-xs text-red-800 mt-1">
                                Any ticket on it has been voided or refunded with the airline, so no ticket number is shown. Keep this only as a record of the cancellation.
                            </p>
                        </div>
                    )}
                    {notice && (
                        <div className="mb-6 border border-amber-300 bg-amber-50 rounded-lg px-5 py-4">
                            <p className="font-bold text-amber-900 text-sm">{notice.title}</p>
                            <p className="text-xs text-amber-800 mt-1">{notice.body}</p>
                        </div>
                    )}

                    {/* Flight Summary Card */}
                    <div className="border border-gray-200 rounded-xl overflow-hidden mb-8 shadow-sm">
                        <div className="bg-gray-50 px-6 py-3 border-b border-gray-200 flex justify-between items-center">
                            <div className="flex items-center gap-2">
                                <Plane className="w-5 h-5 text-[#055B75]" />
                                <span className="font-bold text-gray-700">Flight Details</span>
                            </div>
                            <span className="text-sm text-gray-500 font-mono">PNR: {safeBookingDetails.pnr}</span>
                        </div>

                        <div className="p-6">
                            <div className="flex items-center justify-between mb-6">
                                <div className="flex items-center gap-4">
                                    <div className="w-16 h-16 bg-blue-50 rounded-lg flex items-center justify-center text-2xl font-bold text-[#055B75] border border-blue-100">
                                        {String(flight.airline).substring(0, 2).toUpperCase()}
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-gray-900">{flight.airline}</h3>
                                        <p className="text-gray-500">{flight.flightNumber} • {flight.stops === 0 ? 'Non-stop' : `${flight.stops} Stop(s)`}</p>
                                        {/* " Class" with nothing before it when the fare named no cabin. */}
                                        <p className="text-xs text-gray-400 mt-1 capitalize">
                                            {flight.cabin ? `${String(flight.cabin).toLowerCase().replace(/_/g, ' ')} class` : 'Cabin not recorded'}
                                        </p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-sm text-gray-500 mb-1">Duration</div>
                                    <div className="font-bold text-lg">{flight.duration}</div>
                                </div>
                            </div>

                            {/* Route Visual */}
                            {legs.length > 0 ? (
                                <BookingItinerary legs={legs} dateOptions={{ weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }} />
                            ) : (
                            <div className="flex justify-between items-start relative">
                                {/* Departure */}
                                <div className="flex-1">
                                    <div className="text-4xl font-light text-gray-900 mb-1">{flight.departureTime}</div>
                                    <div className="font-bold text-xl mb-1">{flight.departureCity} <span className="text-gray-400 font-normal">({flight.departureAirport})</span></div>
                                    <div className="text-sm text-gray-500">{formatDate(flight.departureDate)}</div>
                                    {flight.departureTerminal && <div className="text-xs text-[#055B75] mt-1 font-medium">Terminal {flight.departureTerminal}</div>}
                                </div>

                                {/* Connector */}
                                <div className="flex-1 flex flex-col items-center justify-center px-4 mt-4">
                                    <div className="w-full h-0.5 bg-gray-300 relative">
                                        <div className="absolute top-1/2 left-0 transform -translate-y-1/2 w-2 h-2 bg-gray-400 rounded-full"></div>
                                        <div className="absolute top-1/2 right-0 transform -translate-y-1/2 w-2 h-2 bg-gray-400 rounded-full"></div>
                                        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white p-1">
                                            <Plane className="w-4 h-4 text-gray-400 transform rotate-90" />
                                        </div>
                                    </div>
                                </div>

                                {/* Arrival */}
                                <div className="flex-1 text-right">
                                    <div className="text-4xl font-light text-gray-900 mb-1">{flight.arrivalTime}</div>
                                    <div className="font-bold text-xl mb-1">{flight.arrivalCity} <span className="text-gray-400 font-normal">({flight.arrivalAirport})</span></div>
                                    <div className="text-sm text-gray-500">{formatDate(flight.arrivalDate)}</div>
                                    {flight.arrivalTerminal && <div className="text-xs text-[#055B75] mt-1 font-medium">Terminal {flight.arrivalTerminal}</div>}
                                </div>
                            </div>
                            )}
                        </div>
                    </div>

                    {/* Passengers */}
                    <div className="mb-8">
                        <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2 border-b pb-2">
                            <User className="w-5 h-5 text-[#055B75]" />
                            Traveler Information
                        </h3>
                        <div className="grid grid-cols-1 gap-4">
                            {passengerData.map((p, idx) => (
                                <div key={idx} className="bg-white border border-gray-100 shadow-sm rounded-lg p-4 flex justify-between items-center">
                                    <div>
                                        <p className="font-bold text-gray-900 uppercase">{p.title} {p.firstName} {p.lastName}</p>
                                        <p className={`text-xs mt-1 ${isCancelled ? 'text-red-700 font-medium' : isTicketed ? 'text-gray-500' : 'text-amber-700 font-medium'}`}>
                                            {ticketLabel(p, idx)}
                                        </p>
                                    </div>
                                    <div className="flex gap-8 text-sm text-gray-600">
                                        <div className="text-right">
                                            <span className="block text-xs text-gray-400 uppercase">Seat</span>
                                            <span className="font-mono font-bold text-gray-800">{p.seatNumber || 'Not assigned'}</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="block text-xs text-gray-400 uppercase">Class</span>
                                            <span className="font-medium text-gray-800">{flight.cabin || '—'}</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="block text-xs text-gray-400 uppercase">Baggage</span>
                                            {/* The booking stores baggage as text ("23kg"); reading
                                                `.checkIn` off it always fell back. */}
                                            <span className="font-medium text-gray-800">
                                                {(typeof safeBookingDetails.baggage === 'string' ? safeBookingDetails.baggage : safeBookingDetails.baggage?.checkIn) || 'As per fare rules'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Payment & Footer */}
                    <div className="grid grid-cols-2 gap-8 mt-12 pt-8 border-t border-gray-200">
                        <div>
                            <h4 className="font-bold text-gray-900 mb-2">Important Information</h4>
                            <ul className="text-xs text-gray-500 space-y-1 list-disc pl-4">
                                <li>Check-in counters close 60 minutes before departure.</li>
                                <li>Valid photo ID required for entry.</li>
                                <li>Baggage allowances are as per airline regulations.</li>
                                {isCancelled
                                    ? <li className="text-red-700">This booking is cancelled and cannot be used to travel.</li>
                                    : !isTicketed && <li className="text-amber-700">Carry your issued e-ticket for check-in; this document alone is not accepted.</li>}
                            </ul>
                        </div>
                        <div className="text-right">
                            <div className="inline-block text-left">
                                <p className="text-xs text-gray-400 uppercase mb-1">Total Amount</p>
                                {/* What was charged, in USD. <Price> converted it into the
                                    visitor's currency, which is not what the card paid. */}
                                <p className="text-3xl font-bold text-[#055B75]">{recordedTotal}</p>
                                {/* Only claimed when the booking says so. */}
                                {paid && !isCancelled && <p className="text-xs text-green-600 mt-1 font-medium">Payment Confirmed ✅</p>}
                            </div>
                            {/* The decorative barcode that used to sit here was
                                random stripes on a document headed "E-Ticket".
                                Nothing could scan it, and its only function was
                                to look official. */}
                        </div>
                    </div>

                    <div className="mt-12 text-center border-t border-gray-100 pt-6">
                        <p className="text-xs text-gray-400">Restricted Carriage. Thank you for choosing Jetsetters.</p>
                        <p className="text-xs text-blue-500 mt-1">www.jetsetterss.com/support</p>
                    </div>

                </div>
            </div>
        </div>
    );
});

export default FlightETicket;
