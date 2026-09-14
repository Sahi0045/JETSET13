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
  if (coupon.max_uses !== null && coupon.max_uses !== undefined && coupon.current_uses >= coupon.max_uses) {
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
  const customerEmail = normalizeEmail(email);
  if (userId || customerEmail) {
    const base = client.from('coupon_usage').select('id').eq('coupon_id', coupon.id);
    const { data: existing } = await (userId ? base.eq('user_id', userId) : base.eq('user_email', customerEmail))
      .limit(1)
      .maybeSingle();
    if (existing) return { ok: false, status: 400, message: 'You have already used this coupon.' };
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
