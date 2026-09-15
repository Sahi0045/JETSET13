import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Three customer-facing pages, three fabrications, zero component tests.
 *
 * Found by the 2026-09-12 flight-flow audit and fixed the next day:
 *
 *  - The review page - where money is taken - fell back to a hardcoded mock
 *    booking (Air India, Mumbai-Delhi, "John Smith" and "Emma Smith") on any
 *    load without router state, and let the customer pay for it.
 *  - Manage Booking's "Download E-Ticket" did not render the honest
 *    FlightETicket component it imported. It used a second, inline template
 *    that printed `328{pnr}{i+45}` under a column headed "E-Ticket No".
 *  - Its cancel handler called a `setBookingData` that did not exist, threw
 *    after the seat was released and the refund had run, and reported every
 *    successful cancellation as a failure.
 *
 * Reading the source is crude, but it is the one check that catches exactly
 * this class of regression - a fallback quietly re-added, a template quietly
 * restored - which no unit test of a helper can see. Same approach as
 * tests/backend/bookingOwnerWiring.test.js, for the same reason.
 */

// Resolved from the working directory rather than import.meta.url: this file
// runs under the jsdom project, where that URL is http://, not file://, and
// readFileSync refuses it. Vitest runs from the repo root.
const FLIGHTS = path.resolve(process.cwd(), 'frontend/src/Pages/Common/flights');
const COMMON = path.resolve(process.cwd(), 'frontend/src/Pages/Common');
const page = (name) => readFileSync(path.join(FLIGHTS, name), 'utf8');
const commonPage = (name) => readFileSync(path.join(COMMON, name), 'utf8');

describe('the review page has nothing to fall back to', () => {
  const src = page('FlightBookingConfirmation.jsx');

  it('no longer imports or loads a mock booking', () => {
    expect(src).not.toMatch(/data-mock-booking/);
    expect(src).not.toMatch(/fetchBookingFromMockData/);
    expect(src).not.toMatch(/TEST_BOOKING_123/);
  });

  it('the mock data file is gone', () => {
    expect(existsSync(path.join(FLIGHTS, 'data-mock-booking.js'))).toBe(false);
  });

  it('shows the honest error when there is no offer to review', () => {
    expect(src).toMatch(/No flight data available/);
  });
});

describe('Manage Booking downloads the honest document', () => {
  const src = page('ManageBooking.jsx');

  it('renders FlightETicket into the ref the download captures', () => {
    expect(src).toMatch(/<FlightETicket\s+ref=\{ticketRef\}/);
  });

  // The inline template, by its most damning line.
  it('has no fabricated ticket number', () => {
    expect(src).not.toMatch(/328\{bookingData/);
    expect(src).not.toMatch(/E-Ticket No/);
  });

  it('names the saved file for what it is', () => {
    expect(src).toMatch(/ticketState\(bookingData\) === 'issued' \? 'ETicket' : 'BookingConfirmation'/);
  });
});

describe('cancelling reports what actually happened', () => {
  const src = page('ManageBooking.jsx');

  it('never calls the setter that does not exist', () => {
    expect(src).not.toMatch(/setBookingData\(/);
  });

  it('never marks a booking cancelled in localStorage', () => {
    expect(src).not.toMatch(/completedFlightBooking/);
  });

  it('reads the refund outcome from the object that carries it', () => {
    expect(src).toMatch(/result\.cancellation \|\| result\.booking/);
  });

  // A refused cancellation is a failure, not a success with a note.
  it('does not report success when the server refused', () => {
    expect(src).not.toMatch(/Booking marked as cancelled\. Refund will be processed/);
  });
});

/**
 * The post-payment screens, after the second pass of the same audit.
 *
 *  - The order page invented a transaction id (`TXN-<timestamp>`), an amount
 *    ("100.00"), a passenger ("Traveler Name", born 1990-01-01, MALE), a
 *    contact phone (1234567890) and, when the offer was lost, a placeholder
 *    offer to send anyway. It then said "Booking Confirmed! / PNR: Generated"
 *    for a 202 that meant "queued, nothing sent to the airline yet".
 *  - The confirmation page said "Booking Confirmed! / Payment Successful"
 *    unconditionally, including for that queue receipt and for a held PNR
 *    with no ticket.
 *  - Manage Booking explained a refused refund as a "Test Environment
 *    Notice" about sandbox cards - on production.
 */
describe('the order page reports what the server did', () => {
  const src = page('FlightCreateOrders.jsx');

  it('invents no transaction id, amount, passenger or contact', () => {
    expect(src).not.toMatch(/TXN-\$\{Date\.now\(\)\}/);
    expect(src).not.toMatch(/"100\.00"/);
    expect(src).not.toMatch(/'Generated'/);
    expect(src).not.toMatch(/'Guest'|"Traveler"|"1990-01-01"|"MALE"/);
    expect(src).not.toMatch(/jetsetgo\.com|1234567890/);
  });

  it('has no placeholder offer to send when the real one is missing', () => {
    expect(src).not.toMatch(/id: "test-flight"/);
    expect(src).toMatch(/OFFER_MISSING/);
    expect(src).toMatch(/PASSENGERS_INCOMPLETE/);
  });

  // The abandoned-checkout job books a paid, abandoned checkout with the same
  // builder; two copies would drift and book differently.
  it('builds its order with the shared builder the abandoned-checkout job uses', () => {
    expect(src).toMatch(/buildFlightOrderBody\(orderData/);
  });

  it('reads queued and ticketed from the response', () => {
    expect(src).toMatch(/body\?\.queued === true/);
    expect(src).toMatch(/body\?\.ticketed === true/);
    expect(src).not.toMatch(/\|\| 'CONFIRMED'/);
  });

  it('confirms only a ticketed booking', () => {
    expect(src).toMatch(/outcome === 'ticketed' \? \(/);
    expect(src).toMatch(/Reservation Held/);
    expect(src).toMatch(/Booking Received/);
  });

  it('hands the booking to the confirmation page in router state', () => {
    expect(src).toMatch(/navigate\('\/booking-confirmation', \{ state: \{ bookingData: completedFlightBooking \} \}\)/);
  });

  it('no longer pretends to verify the payment client-side', () => {
    // The server checks ARC Pay itself before it books.
    expect(src).not.toMatch(/verifyPayment|paymentVerified/);
  });
});

describe('the payment callback invents nothing either', () => {
  const src = commonPage('PaymentCallback.jsx');

  it('passes a null transaction id rather than a timestamp', () => {
    expect(src).not.toMatch(/TXN-\$\{Date\.now\(\)\}/);
    expect(src).not.toMatch(/jetsetgo\.com/);
  });
});

describe('the confirmation page branches on the outcome', () => {
  const src = commonPage('BookingConfirmation.jsx');

  it('derives an outcome instead of assuming success', () => {
    expect(src).toMatch(/const outcome = statusUpper === 'CANCELLED'/);
    expect(src).toMatch(/PENDING_CONFIRMATION/);
    expect(src).toMatch(/isFlight \? 'held'/);
  });

  it('says "Booking Confirmed" only through the outcome copy', () => {
    const bare = src.split('\n').filter((line) => line.includes('Booking Confirmed!') && !/title:/.test(line));
    expect(bare).toEqual([]);
    expect(src).toMatch(/\{copy\.title\}/);
    expect(src).toMatch(/\{copy\.badgeText\}/);
  });

  it('never claims payment success beside a zero amount', () => {
    expect(src).not.toMatch(/Payment Successful/);
    expect(src).toMatch(/hasAmount \?/);
  });

  it('makes the email claim per outcome', () => {
    expect(src).toMatch(/📧 \{copy\.mail\}/);
  });
});

describe('Manage Booking explains a refused refund honestly', () => {
  const src = page('ManageBooking.jsx');

  it('has no sandbox copy on a production page', () => {
    expect(src).not.toMatch(/Test Environment|Sandbox|sandbox|no refund relies/);
    expect(src).toMatch(/Refund Not Yet Processed/);
  });

  it('reads the outcome from the list payload', () => {
    expect(src).toMatch(/bookingData\?\.cancellation/);
    // The refund outcome comes from the shared reading of the record, not a
    // list of actions kept on the page.
    expect(src).toMatch(/refundStatus\(/);
  });

  it('does not label an unknown status as Confirmed', () => {
    expect(src).not.toMatch(/\|\| 'Confirmed'\}/);
    expect(src).toMatch(/bookingStatusBadge\(bookingData\)/);
  });
});

/**
 * The review page charges what checkout verifies.
 *
 * It multiplied the airline's all-passenger total by the passenger count again
 * (two adults paid four fares), added $90 of insurance, transfer and "VIP"
 * nothing ever fulfilled, charged for seats and bags never sent to the airline,
 * let the customer add travellers the fare was not priced for, typed everyone
 * as an Adult, and sent the offer id to the card network as the flight number.
 */
describe('the review page charges what checkout verifies', () => {
  const src = page('FlightBookingConfirmation.jsx');

  it('uses the shared charge formula and no per-passenger multiplication', () => {
    expect(src).toMatch(/computeFlightCharge\(/);
    expect(src).not.toMatch(/effectivePassengerCount/);
  });

  it('offers nothing it does not fulfil', () => {
    for (const phantom of ['Travel Insurance', 'Airport Transfer', 'Upgrade to VIP', 'vipServiceFee', 'seatExtraFee', 'bagExtraFee', 'onBagsChange={']) {
      expect(src, phantom).not.toContain(phantom);
    }
  });

  it('locks travellers to the fare and checks their ages', () => {
    expect(src).not.toMatch(/Add Another Traveller/);
    expect(src).not.toMatch(/type: "Adult"/);
    // The checks live in one list shared by payment and the page's progress.
    expect(src).toMatch(/travellerProblems\(/);
    expect(readFileSync(path.resolve(process.cwd(), 'frontend/src/utils/travellerChecks.js'), 'utf8')).toMatch(/passengerAgeProblem\(/);
  });

  it('checks the fare with the airline and handles a changed price', () => {
    expect(src).toMatch(/apiConfig\.endpoints\.flights\.price/);
    expect(src).toMatch(/PRICE_CHANGED/);
  });

  it('sends real flight numbers, the coupon code, and no placeholder identity', () => {
    expect(src).not.toMatch(/rawFlightData\?\.id \|\| '000'/);
    expect(src).toMatch(/couponCode/);
    expect(src).not.toMatch(/customer@jetsetgo\.com|'Guest User'|BOOK-\$\{Date\.now\(\)\}/);
  });

  it('promises nothing before payment it cannot keep', () => {
    expect(src).not.toMatch(/Instant Confirmation/);
    expect(src).not.toMatch(/visaRequirements\?\.officialWebsite/);
  });
});

/**
 * My Trips, Manage Booking and the surrounding pages say what the record says.
 */
describe('My Trips reads the booking record', () => {
  const trips = readFileSync(path.resolve(process.cwd(), 'frontend/src/Pages/Common/login/mytrips.jsx'), 'utf8');

  it('derives its badge from the record and never defaults to Confirmed', () => {
    expect(trips).toMatch(/bookingStatusBadge\(booking\)/);
    expect(trips).not.toMatch(/booking\.status \|\| 'Confirmed'/);
  });

  it('lists bookings that need attention under Failed', () => {
    expect(trips).toMatch(/activeTab === "Failed"\) return list\.filter\(\(b\) => needsAttention\(b\)\)/);
  });

  it('reports what happened to the refund on cancel', () => {
    expect(trips).toMatch(/cancellationMessage\(result\)/);
    expect(trips).not.toMatch(/Refund: \$\$\{/);
  });

  it('opens Manage Booking by reference so a refresh still works', () => {
    expect(trips).toMatch(/\/manage-booking\/\$\{encodeURIComponent\(ref\)\}/);
  });
});

describe('Manage Booking claims nothing it cannot back', () => {
  const src = page('ManageBooking.jsx');

  it('has no pretend modify flow', () => {
    expect(src).not.toMatch(/will be implemented soon/);
  });

  it('masks passport numbers and shows the arrival date for arrival', () => {
    expect(src).not.toMatch(/\{traveler\.passportNumber\}<\/p>/);
    expect(src).toMatch(/bookingData\?\.arrivalDate \|\| bookingData\?\.arrival_date/);
  });

  it('reads payment from the record', () => {
    expect(src).toMatch(/isPaid\(bookingData\)/);
    expect(src).not.toMatch(/successfully processed and your booking is confirmed/);
  });

  it('lets a guest find their booking by email', () => {
    expect(src).toMatch(/Enter the email used when booking/);
  });

  it('cancels with the email the guest proved the booking with', () => {
    expect(src).toMatch(/submittedEmail \|\| bookingData\.email/);
  });
});

/**
 * A cancelled booking, after the cancel and refund audit.
 *
 *  - Manage Booking still offered "Download E-Ticket" for it, and the document
 *    printed the voided tickets' numbers.
 *  - One cancellation read three ways: a modal promising a fee and 5-7 days, a
 *    green "Cancelled Successfully" over a refused refund, and My Trips adding
 *    "the airline cancellation is still being processed" to bookings that never
 *    had a reservation.
 */
describe('a cancelled booking has no usable ticket and one account of its refund', () => {
  const manage = page('ManageBooking.jsx');
  const trips = readFileSync(path.resolve(process.cwd(), 'frontend/src/Pages/Common/login/mytrips.jsx'), 'utf8');
  const confirmation = commonPage('BookingConfirmation.jsx');

  it('Manage Booking offers no download for a cancelled booking', () => {
    // Offered only for a booking the airline holds, which a cancelled one does
    // not (canDownloadDocument, tests/utils/eTicketDocument.test.js).
    expect(manage).toMatch(/\{canDownloadDocument\(bookingData\) && \(\s*<button\s+onClick=\{downloadETicket\}/);
  });

  it('Manage Booking promises no fee or timescale the cancellation does not keep', () => {
    expect(manage).not.toMatch(/A cancellation fee will be deducted/);
    expect(manage).not.toMatch(/5-7 business days/);
    expect(manage).not.toMatch(/Booking Cancelled Successfully/);
    expect(manage).toMatch(/cancellationMessage\(\{ cancellation: cancelResult\.cancellation \}\)/);
  });

  it('My Trips adds nothing to the outcome, shows no ticket for a cancelled booking, and words attention by case', () => {
    expect(trips).not.toMatch(/airline cancellation is still being processed/);
    expect(trips).toMatch(/alert\(cancellationMessage\(result\)\)/);
    expect(trips).toMatch(/if \(statusUp === 'CANCELLED'\) return 'Cancelled'/);
    expect(trips).toMatch(/attentionMessage\(booking\)/);
    expect(trips).toMatch(/refundStatus\(booking\)/);
  });

  it('View Details says what the payment did', () => {
    expect(confirmation).toMatch(/refundStatus\(bookingData\)/);
    expect(confirmation).not.toMatch(/<span className="font-semibold">Payment received<\/span>/);
    expect(confirmation).toMatch(/'awaiting_payment'/);
  });
});

describe('policy, offers and prices shown as they are', () => {
  it('the cancellation card invents no tier, cutoff, currency or time zone', () => {
    const policy = page('FlightCancellationPolicy.jsx');
    expect(policy).not.toMatch(/\* 1\.6/);
    expect(policy).not.toMatch(/cutoffHours \|\| 4/);
    expect(policy).not.toMatch(/\|\| 'INR'/);
    expect(policy).not.toMatch(/\(IST\)/);
  });

  it('the search page advertises no offers that do not exist', () => {
    expect(page('flightsearchpage.jsx')).not.toMatch(/promoBanners/);
  });

  it('cheapest fares labels cached prices as cached and marks one best price', () => {
    const cheapest = page('cheapest-flight.jsx');
    expect(cheapest).toMatch(/pricesLive \?/);
    expect(cheapest).toMatch(/flight\.id === cheapestId/);
  });

  it('the confirmation page does not read an old booking from storage', () => {
    expect(commonPage('BookingConfirmation.jsx')).not.toMatch(/localStorage\.getItem/);
  });

  it('the travel document invents no cabin, date, bag or seat', () => {
    const ticket = page('FlightETicket.jsx');
    for (const invented of ["'23KG'", "'ANY'", "'Economy'", 'new Date().toISOString()']) {
      expect(ticket, invented).not.toContain(invented);
    }
  });

  it('the unreachable success page is gone', () => {
    expect(existsSync(path.join(FLIGHTS, 'FlightBookingSuccess.jsx'))).toBe(false);
    expect(readFileSync(path.resolve(process.cwd(), 'frontend/src/app.jsx'), 'utf8')).not.toMatch(/\/flight-booking-success/);
  });
});

/**
 * Search results show what the fare says - and "see fare rules" when it is
 * silent. Missing baggage became "Cabin only", a missing cabin "Economy",
 * refundability came from a tax amount, seats were "Available", a connecting
 * flight could be drawn as one invented non-stop leg, and an all-traveller
 * total was labelled "Per adult".
 */
describe('search results show what the fare says', () => {
  const search = page('flightsearchpage.jsx');
  const card = page('FlightCard.jsx');
  const options = page('FlightFareOptions.jsx');
  const review = page('FlightBookingConfirmation.jsx');

  it('the search page invents no baggage, cabin, refundability or seats', () => {
    expect(search).not.toMatch(/\{ weight: 0, weightUnit: 'KG' \}/);
    // The result's cabin and class, not the search form's default travel class
    // (a real request parameter when the customer picks none).
    expect(search).not.toMatch(/\s(cabin|class): [^\n]*\|\| '(ECONOMY|Economy)'/);
    expect(search).not.toMatch(/refundableTaxes \? true : false/);
    expect(search).not.toMatch(/\|\| 'Available'/);
  });

  it('draws no invented non-stop leg for a connecting flight', () => {
    expect(search).toMatch(/\(flight\.stops \|\| 0\) > 0 \? \[\] : \[\{/);
    expect(search).toMatch(/if \(\(flight\.stops \|\| 0\) > 0\) return \[\];/);
  });

  it('cards and fare options say "see fare rules" when the fare is silent', () => {
    expect(card).not.toMatch(/: 'Cabin only'/);
    expect(card).not.toMatch(/Per adult · \{cabinClass\}/);
    expect(card).not.toMatch(/: 'Economy';/);
    expect(options).not.toMatch(/\|\| 'Cabin only'\)/);
    expect(options).not.toMatch(/'Standard'/);
  });

  it('the review page calls an unknown fare neither Economy nor non-refundable', () => {
    expect(review).not.toMatch(/'Partially Refundable'/);
    expect(review).not.toMatch(/'Economy Class'/);
    expect(review).toMatch(/refundable: flightData\.refundable \?\? null/);
  });
});

/**
 * Flights are booked from an account unless an admin switches guest booking on
 * (tests/components/guestBookingSwitch.test.js); guest checkout was first
 * switched off on 2026-09-13. The review page's "LOGIN NOW" set a local flag and
 * logged nobody in, and a visitor sent to log in would have lost the flight
 * they picked.
 */
describe('flights are booked from an account', () => {
  const review = page('FlightBookingConfirmation.jsx');

  it('sends a signed-out visitor to log in, with the flight kept', () => {
    expect(review).toMatch(/useSupabaseAuth\(\)/);
    expect(review).toMatch(/saveFlightReview\(reviewState\)/);
    expect(review).toMatch(/readFlightReview\(\)/);
  });

  it('has no pretend login', () => {
    expect(review).not.toMatch(/handleLogin/);
    expect(review).not.toMatch(/LOGIN NOW/);
    expect(review).not.toMatch(/localStorage\.getItem\('isAuthenticated'\)/);
  });

  it('handles checkout refusing a signed-out customer', () => {
    expect(review).toMatch(/refusal\.code === 'LOGIN_REQUIRED'/);
  });

  it('keeps the way back through creating an account', () => {
    expect(commonPage('login/SupabaseLogin.jsx')).toMatch(/to="\/supabase-signup" state=\{location\.state\}/);
    const signup = commonPage('login/SupabaseSignup.jsx');
    expect(signup).toMatch(/navigate\('\/supabase-login', \{ state: location\.state \}\)/);
    expect(signup).toMatch(/to="\/supabase-login" state=\{location\.state\}/);
  });
});

/**
 * The review page told customers what was wrong in the browser's own alert box:
 * "localhost:5173 says", one plain-text list, no way to the field.
 */
describe("the review page speaks in the site's dialog, not the browser's", () => {
  const review = page('FlightBookingConfirmation.jsx');

  it('has no browser alert left', () => {
    expect(review).not.toMatch(/\balert\(/);
  });

  it('groups traveller issues and takes the customer to them', () => {
    expect(review).toMatch(/<NoticeDialog/);
    expect(review).toMatch(/onAction: \(\) => showTraveller\(/);
    expect(review).toMatch(/id=\{`traveller-\$\{passenger\.id\}`\}/);
  });
});

describe('FlightETicket can actually be captured', () => {
  const src = page('FlightETicket.jsx');

  // html2canvas renders layout; a display:none element has none. The wrapper
  // used to be `className="hidden"`, which is a blank PDF.
  it('is positioned off-screen, not display:none', () => {
    expect(src).toMatch(/top: '-10000px'/);
    expect(src).not.toMatch(/<div className="hidden">/);
  });
});
