/**
 * Whether a "save booking" call after payment may confirm the row it names.
 *
 * POST /api/cruises/bookings and POST /api/hotels/bookings take no session:
 * the payment page calls them on its way back from ARC with the order
 * reference and ARC's resultIndicator. They upserted on booking_reference
 * whatever the body named, and checked the indicator only when the body sent
 * one - so a reference alone rewrote ANY row of the bookings table, a
 * customer's flight booking included: a new owner (or none, and the caller's
 * email on it), travel_type changed, the amount the body gave. The stranger
 * then read the booking and its live PNR as its owner, the customer got 404
 * on their own booking, and a cancel as the new owner took the non-flight
 * refund path over a ticket still issued. A wrong indicator also reset any
 * row to pending/unpaid.
 *
 * A save now confirms only the checkout row it belongs to: the row checkout
 * created for this product, proven paid by the indicator ARC gave that
 * checkout. Anything else writes nothing.
 *
 * @param {object|null} existing  the bookings row for the reference, or null
 * @param {object} ctx
 * @param {'cruise'|'hotel'} ctx.travelType  the product this route saves
 * @param {string} [ctx.indicator]  the resultIndicator the payer came back with
 * @returns {null | { status: number, body: object }}  null when the save may go ahead
 */
export function checkoutSaveRefusal(existing, { travelType, indicator }) {
  if (!existing) {
    return {
      status: 404,
      body: {
        success: false,
        error: 'We could not find this checkout, so nothing was saved. If you were charged, please call (877) 538-7380.',
      },
    };
  }
  if (existing.travel_type !== travelType) {
    return {
      status: 409,
      body: { success: false, error: 'This reference does not belong to this booking, so nothing was saved.' },
    };
  }
  const stored = existing.booking_details?.success_indicator;
  if (!stored || !indicator || String(indicator) !== String(stored)) {
    return { status: 400, body: { success: false, verified: false, error: 'Payment could not be verified' } };
  }
  return null;
}

/**
 * The owner and the amount of a confirmed checkout row: what checkout
 * recorded, never what the body says. Checkout took the owner from the
 * verified session and the amount is what ARC was asked to charge.
 */
export const checkoutOwner = (existing) => existing?.user_id || null;
export const checkoutAmount = (existing, bodyAmount) => {
  const recorded = Number(existing?.total_amount);
  return recorded > 0 ? recorded : (parseFloat(bodyAmount) || 0);
};
