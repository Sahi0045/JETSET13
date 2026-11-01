import { documentState, isPaid, pnrOf, ticketState } from './eTicket.js';

/** 'all' when the payment went back in full, 'part' when in part, else null. */
export function paymentReturned(booking) {
  const payment = String(booking?.payment_status ?? booking?.paymentStatus ?? '').toLowerCase();
  if (['refunded', 'reversed'].includes(payment)) return 'all';
  if (payment === 'partially_refunded') return 'part';
  return null;
}

/** 'E-Ticket', 'Booking Confirmation', 'Booking Summary' or 'Cancelled Booking'. */
export function documentTitleOf(booking) {
  const state = ticketState(booking);
  const docState = documentState(booking);
  if (state === 'cancelled') return 'Cancelled Booking';
  if (state === 'issued') return 'E-Ticket';
  return pnrOf(booking) && !['no_confirmed_seat', 'tickets_voided', 'cancel_pending'].includes(docState)
    ? 'Booking Confirmation'
    : 'Booking Summary';
}

/** What the travel document must say above everything else, or null. */
export function documentNoticeOf(booking, { paid = isPaid(booking) } = {}) {
  const notices = {
      // Refunded since, in full or in part (the Payments tab refunds without
      // cancelling): nobody is getting that number - ticket sync reads it
      // for paid bookings only, and the alarm drops refunded ones - so no
      // email is promised, as on the confirmation page.
      ticket_pending: paymentReturned(booking)
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
      // A held PNR whose cancel the airline refused. Manage Booking does not
      // offer this one (canDownloadDocument): "We will email your e-ticket
      // once it is issued" was said of it.
      cancel_pending: {
          title: 'Your cancellation has not been completed with the airline yet. No ticket will be issued on this booking.',
          body: 'Our team has been alerted and will complete it. Please do not travel on this document.',
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
  return notices[documentState(booking)] || null;
}
