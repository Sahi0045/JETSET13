import React, { forwardRef } from 'react';
import { Plane, User } from 'lucide-react';
import Price from '../../../Components/Price';
import {
    resolveTickets,
    ticketState,
    ticketForTraveler,
    issueDate,
    isPaid,
} from '../../../utils/eTicket';

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
    const calculatedFare = bookingData.calculatedFare || {
        totalAmount: bookingData.amount || bookingData.totalPrice || '0'
    };

    // What the booking can actually prove about ticketing.
    const tickets = resolveTickets(bookingData);
    const state = ticketState(bookingData);
    const issuedOn = issueDate(tickets);
    const paid = isPaid(bookingData) || isPaid(bookingDetails);

    const isTicketed = state === 'issued';
    // "E-Ticket" is a claim. Only make it once a ticket exists.
    const documentTitle = isTicketed ? 'E-Ticket' : 'Booking Confirmation';

    // Get flight data - handle both nested and direct structures. Identifiers
    // fall back to a visible placeholder rather than a plausible-looking
    // invention: an unknown airline printed as "Jetsetters Air" reads as fact.
    const flight = bookingDetails?.flight || bookingData.flight || {
        airline: bookingData.airlineName || bookingData.airline || '—',
        flightNumber: bookingData.flightNumber || '—',
        stops: bookingData.stops || 0,
        cabin: bookingData.cabinClass || bookingData.cabin || 'Economy',
        duration: bookingData.duration || '—',
        departureTime: bookingData.departureTime || '--:--',
        departureCity: bookingData.originCity || bookingData.origin || 'Departure',
        departureAirport: bookingData.origin || '—',
        departureDate: bookingData.departureDate || new Date().toISOString(),
        departureTerminal: bookingData.departureTerminal || null,
        arrivalTime: bookingData.arrivalTime || '--:--',
        arrivalCity: bookingData.destinationCity || bookingData.destination || 'Arrival',
        arrivalAirport: bookingData.destination || '—',
        arrivalDate: bookingData.arrivalDate || bookingData.departureDate || new Date().toISOString(),
        arrivalTerminal: bookingData.arrivalTerminal || null
    };

    const safeBookingDetails = {
        bookingId: bookingDetails?.bookingId || bookingData.orderId || bookingData.bookingReference || 'N/A',
        status: bookingDetails?.status || bookingData.status || 'PENDING',
        pnr: bookingDetails?.pnr || bookingData.pnr || 'N/A',
        baggage: bookingDetails?.baggage || { checkIn: '23KG' }
    };

    // Format helpers
    const formatDate = (dateString) => {
        return new Date(dateString).toLocaleDateString('en-US', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
    };

    /** What to print where a ticket number goes, for one passenger. */
    const ticketLabel = (traveler, index) => {
        const match = ticketForTraveler(tickets, traveler, index);
        if (match?.number) return `Ticket #: ${match.number}`;
        if (state === 'pending') return 'Ticket issued — number pending';
        return 'Ticket not yet issued';
    };

    return (
        <div className="hidden"> {/* Container for off-screen rendering */}
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
                        {issuedOn
                            ? `Date of Issue: ${new Date(issuedOn).toLocaleDateString()}`
                            : 'Ticket not yet issued'}
                    </span>
                    <span className={`font-bold uppercase px-3 py-1 rounded text-xs ${isTicketed ? 'bg-green-500' : 'bg-amber-500'}`}>
                        {safeBookingDetails.status}
                    </span>
                </div>

                <div className="p-8">
                    {/* Says plainly what this document is not, so nobody travels on
                        a reservation believing it is a ticket. */}
                    {!isTicketed && (
                        <div className="mb-6 border border-amber-300 bg-amber-50 rounded-lg px-5 py-4">
                            <p className="font-bold text-amber-900 text-sm">
                                {state === 'pending'
                                    ? 'Your ticket has been issued. The ticket number is still being confirmed.'
                                    : 'This is a confirmed reservation, not a ticket.'}
                            </p>
                            <p className="text-xs text-amber-800 mt-1">
                                {state === 'pending'
                                    ? 'We will email your ticket number shortly. Your booking reference and PNR below are valid.'
                                    : 'Your seat is held under the PNR below. We will email your e-ticket once it is issued. Please do not travel on this document alone.'}
                            </p>
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
                                        <p className="text-xs text-gray-400 mt-1">{flight.cabin} Class</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-sm text-gray-500 mb-1">Duration</div>
                                    <div className="font-bold text-lg">{flight.duration}</div>
                                </div>
                            </div>

                            {/* Route Visual */}
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
                                        <p className={`text-xs mt-1 ${isTicketed ? 'text-gray-500' : 'text-amber-700 font-medium'}`}>
                                            {ticketLabel(p, idx)}
                                        </p>
                                    </div>
                                    <div className="flex gap-8 text-sm text-gray-600">
                                        <div className="text-right">
                                            <span className="block text-xs text-gray-400 uppercase">Seat</span>
                                            <span className="font-mono font-bold text-gray-800">{p.seatNumber || 'ANY'}</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="block text-xs text-gray-400 uppercase">Class</span>
                                            <span className="font-medium text-gray-800">{flight.cabin || 'Economy'}</span>
                                        </div>
                                        <div className="text-right">
                                            <span className="block text-xs text-gray-400 uppercase">Baggage</span>
                                            <span className="font-medium text-gray-800">{safeBookingDetails.baggage.checkIn}</span>
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
                                {!isTicketed && <li className="text-amber-700">Carry your issued e-ticket for check-in; this document alone is not accepted.</li>}
                            </ul>
                        </div>
                        <div className="text-right">
                            <div className="inline-block text-left">
                                <p className="text-xs text-gray-400 uppercase mb-1">Total Amount</p>
                                <p className="text-3xl font-bold text-[#055B75]"><Price amount={calculatedFare.totalAmount} /></p>
                                {/* Only claimed when the booking says so. */}
                                {paid && <p className="text-xs text-green-600 mt-1 font-medium">Payment Confirmed ✅</p>}
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
