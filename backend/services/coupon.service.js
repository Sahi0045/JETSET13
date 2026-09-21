import { computeCouponDiscount, roundMoney } from '../../shared/flightCharge.js';

/**
 * Is this coupon valid for this order, and what does it take off?
 *
 * Extracted from POST /coupons/validate so checkout can ask the same question
 * with the total it computed itself. The route answered from the client's
 * `orderTotal`, and the page then charged the `finalTotal` it was handed -
 * frozen at the moment the coupon was applied, whatever changed afterwards.
 *
 * @param {object} client  a Supabase client
 * @returns {Promise<{ok: true, coupon, discountAmount, finalTotal} | {ok: false, status, message}>}
 */
export async function evaluateCoupon(client, { code, orderTotal = 0, bookingType = 'all', userId, email } = {}) {
  if (!code) return { ok: false, status: 400, message: 'Coupon code is required.' };

  const { data: coupon, error } = await client
    .from('coupons')
    .select('*')
    .eq('code', String(code).trim().toUpperCase())
    .eq('is_active', true)
    .maybeSingle();

  if (error) throw error;
  if (!coupon) return { ok: false, status: 404, message: 'Invalid or expired coupon code.' };

  const now = new Date();
  if (coupon.valid_from && new Date(coupon.valid_from) > now) {
    return { ok: false, status: 400, message: 'This coupon is not yet active.' };
  }
  if (coupon.valid_until && new Date(coupon.valid_until) < now) {
    return { ok: false, status: 400, message: 'This coupon has expired.' };
  }
  // Uses are counted once the airline holds a booking (recordCouponUse), so a
  // checkout still on its payment page, or paid and not yet booked, had not
  // used its coupon yet: every open checkout passed both limits, and a
  // one-per-customer coupon applied to two trips at once was given twice.
  const pending = await pendingCouponCheckouts(client, coupon);
  if (coupon.max_uses !== null && coupon.max_uses !== undefined
    && Number(coupon.current_uses || 0) + pending.length >= coupon.max_uses) {
    return { ok: false, status: 400, message: 'This coupon has reached its maximum usage limit.' };
  }
  if (parseFloat(coupon.min_order_value) > 0 && parseFloat(orderTotal) < parseFloat(coupon.min_order_value)) {
    return { ok: false, status: 400, message: `This coupon requires a minimum order of $${coupon.min_order_value}.` };
  }
  if (coupon.applicable_to !== 'all' && coupon.applicable_to !== bookingType) {
    return { ok: false, status: 400, message: `This coupon is only valid for ${coupon.applicable_to} bookings.` };
  }

  // One use per customer: by account, or by email for a guest. A guest passes
  // no user id, so the check used to be skipped for every guest booking.
  //
  // And by email for a signed-in customer too, not by account alone. A use can
  // be recorded with no account on it - a booking made as a guest, or one whose
  // owner the bookings table rejected so checkout saved it without one - and
  // the same customer, signed in, was asked only about their account, found
  // nothing, and was given a one-per-customer coupon again. Two lookups rather
  // than one `or` filter, so an address is never spliced into a filter string.
  const customerEmail = normalizeEmail(email);
  if (userId || customerEmail) {
    const usedBy = (column, value) => client.from('coupon_usage').select('id')
      .eq('coupon_id', coupon.id)
      .eq(column, value)
      .limit(1)
      .maybeSingle();
    const { data: byAccount } = userId ? await usedBy('user_id', userId) : { data: null };
    const { data: byEmail } = !byAccount && customerEmail ? await usedBy('user_email', customerEmail) : { data: null };
    if (byAccount || byEmail) return { ok: false, status: 400, message: 'You have already used this coupon.' };
    const mine = pending.some((row) => (userId && row.user_id === userId)
      || (customerEmail && normalizeEmail(row.booking_details?.customer_email) === customerEmail));
    if (mine) {
      return {
        ok: false,
        status: 400,
        message: 'This coupon is already on another booking you started in the last 15 minutes. Finish that payment, or try again once its payment page has closed.',
      };
    }
  }

  // Ceiling on what one booking may give away. A percentage coupon is unbounded
  // in money terms: 20% off a $1,200 international ticket is $240, against a
  // service fee of ~2.5% - and the airline is still paid the full fare through
  // ARC, so the difference comes straight out of the agency's margin.
  const discountAmount = computeCouponDiscount(coupon, orderTotal);
  return {
    ok: true,
    coupon,
    discountAmount,
    finalTotal: roundMoney(Number(orderTotal) - discountAmount),
  };
}

const normalizeEmail = (value) => String(value ?? '').trim().toLowerCase() || null;

// A hosted payment page lasts 15 minutes; a paid booking is booked, refunded or
// flagged within the abandoned-checkout job's six hours.
const OPEN_CHECKOUT_MS = 15 * 60 * 1000;
const PAID_UNBOOKED_MS = 6 * 60 * 60 * 1000;

/**
 * Checkouts holding this coupon that have not used it yet: a payment page still
 * open, or a payment taken and not yet booked. Neither is cancelled or refunded,
 * and neither has a usage row.
 */
async function pendingCouponCheckouts(client, coupon, now = Date.now()) {
  if (!coupon?.code) return [];
  try {
    const { data: rows, error } = await client
      .from('bookings')
      .select('booking_reference, user_id, status, payment_status, created_at, booking_details')
      .eq('booking_details->verified_charge->coupon->>code', coupon.code)
      .gte('created_at', new Date(now - PAID_UNBOOKED_MS).toISOString())
      .limit(200);
    if (error || !Array.isArray(rows) || rows.length === 0) return [];

    const live = rows.filter((row) => {
      if (row.status === 'cancelled') return false;
      if (['refunded', 'partially_refunded'].includes(row.payment_status)) return false;
      if (row.payment_status === 'paid') return !row.booking_details?.pnr;
      return now - Date.parse(row.created_at) < OPEN_CHECKOUT_MS;
    });
    if (live.length === 0) return [];

    const { data: used } = await client
      .from('coupon_usage')
      .select('booking_reference')
      .eq('coupon_id', coupon.id)
      .in('booking_reference', live.map((row) => row.booking_reference));
    const recorded = new Set((used || []).map((row) => row.booking_reference));
    return live.filter((row) => !recorded.has(row.booking_reference));
  } catch {
    // The limits already applied still apply; this only adds what is in flight.
    return [];
  }
}

/**
 * Record that a coupon was used on a booking - once per booking.
 *
 * Nothing wrote coupon usage: checkout evaluated the coupon and kept it on the
 * booking, and the counters `max_uses` and "one per customer" read were never
 * incremented, so every limit was decorative. Called once the airline holds the
 * booking; a checkout that was refunded has not used its coupon.
 *
 * Safe to call again for the same booking (a retry, a queue replay): the usage
 * row is keyed on the booking reference.
 *
 * @param {object} client a Supabase client
 * @param {{ coupon: {id, code, discountAmount}, userId?: string, email?: string, bookingReference: string }} p
 */
export async function recordCouponUse(client, { coupon, userId = null, email = null, bookingReference } = {}) {
  if (!coupon?.id || !bookingReference) return { recorded: false };

  const { data: already } = await client
    .from('coupon_usage')
    .select('id')
    .eq('coupon_id', coupon.id)
    .eq('booking_reference', bookingReference)
    .limit(1)
    .maybeSingle();
  if (already) return { recorded: false, duplicate: true };

  const { error: insertError } = await client.from('coupon_usage').insert([{
    coupon_id: coupon.id,
    user_id: userId || null,
    user_email: normalizeEmail(email),
    booking_reference: bookingReference,
    discount_amount: Number(coupon.discountAmount) || 0,
  }]);
  if (insertError) throw insertError;

  // Compare-and-set on the count just read, retried: two bookings finishing at
  // the same moment must both be counted, not overwrite each other's +1.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: row } = await client.from('coupons').select('current_uses').eq('id', coupon.id).maybeSingle();
    const current = row?.current_uses ?? null;
    const guarded = client.from('coupons').update({ current_uses: Number(current ?? 0) + 1 }).eq('id', coupon.id);
    const { data: updated, error } = await (current === null ? guarded.is('current_uses', null) : guarded.eq('current_uses', current))
      .select('id');
    if (!error && updated?.length) return { recorded: true, counted: true };
  }

  console.warn('⚠️ Coupon usage recorded but its count could not be updated', { couponId: coupon.id, bookingReference });
  return { recorded: true, counted: false };
}
