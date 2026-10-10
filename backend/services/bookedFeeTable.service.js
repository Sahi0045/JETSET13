import FlightProvider from './flightProvider.js';
import { get as cacheGet, set as cacheSet } from './cache.service.js';

export const BOOKED_FEE_TABLE_TTL_SECONDS = 6 * 60 * 60;

export const bookedFeeTableKey = (bookingReference) => `flight:booked-fee-table:${bookingReference}`;

/**
 * A booked trip's airline fee table, read from its PNR, or null. Never throws:
 * each read is an Amadeus session, and a cancel that asks must go on without it.
 */
export async function readBookedFeeTable(booking) {
  const pnr = booking?.booking_details?.pnr;
  if (!pnr) return null;

  const key = bookedFeeTableKey(booking.booking_reference);
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
