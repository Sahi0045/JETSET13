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
export async function evaluateCoupon(client, { code, orderTotal = 0, bookingType = 'all', userId } = {}) {
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

  // One use per user.
  if (userId) {
    const { data: existing } = await client
      .from('coupon_usage')
      .select('id')
      .eq('coupon_id', coupon.id)
      .eq('user_id', userId)
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
