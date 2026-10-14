import FlightProvider from './flightProvider.js';
import { get as cacheGet, set as cacheSet } from './cache.service.js';
import { ticketsOf } from '../../shared/reviewQueue.js';

export const BOOKED_FEE_TABLE_TTL_SECONDS = 6 * 60 * 60;

// The record locator and tickets are in the key: the table describes the fare
// stored with them, and a reissued or moved booking has another.
export const bookedFeeTableKey = (booking) => {
  const details = booking?.booking_details || {};
  const tickets = ticketsOf(details).map((ticket) => String(ticket.number)).sort().join('+');
  return `flight:booked-fee-table:${booking?.booking_reference}:${details.pnr || ''}:${tickets}`;
};

/**
 * A booked trip's airline fee table, read from its PNR, or null. Never throws:
 * each read is an Amadeus session, and a cancel that asks must go on without it.
 */
export async function readBookedFeeTable(booking) {
  const pnr = booking?.booking_details?.pnr;
  if (!pnr) return null;

  const key = bookedFeeTableKey(booking);
  const cached = await cacheGet(key);
  if (cached) return cached;

  let penalties = null;
  try {
    penalties = await FlightProvider.getBookedFeeTable(pnr);
  } catch (cause) {
    console.warn('Booked fee table unavailable:', cause?.technicalError || cause?.message);
  }
  if (penalties) await cacheSet(key, penalties, BOOKED_FEE_TABLE_TTL_SECONDS);
  return penalties || null;
}
