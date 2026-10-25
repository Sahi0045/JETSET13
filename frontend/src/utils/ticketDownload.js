import { getApiUrl } from './apiHelper';

/**
 * Downloads a booking's e-ticket (or booking confirmation) PDF, drawn by the
 * server. `email` proves a guest booking, as it does for opening one.
 *
 * @throws {Error} with the server's own reason when there is no document
 */
export async function downloadTicketPdf(bookingReference, { email } = {}) {
  const { authHeaders } = await import('./authHeaders');
  const res = await fetch(getApiUrl(`flights/bookings/${encodeURIComponent(bookingReference)}/ticket.pdf`), {
    credentials: 'include',
    headers: await authHeaders(email ? { 'x-booking-email': email } : {}),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || 'We could not prepare your ticket. Please try again.');
  }
  const blob = await res.blob();
  const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1] || `Jetsetters-${bookingReference}.pdf`;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
