import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

/**
 * Vercel serverless function for coupon management.
 * Actions (via query param ?action=...):
 *   GET  validate → validate a coupon code
 *   POST use      → record coupon usage
 *   GET  list     → list all coupons (admin)
 *   POST create   → create a coupon (admin)
 *   PUT  update   → update a coupon (admin)
 *   POST deactivate → deactivate a coupon (admin)
 */
export default async function handler(req, res) {
  const origin = req.headers.origin;
  const rawCorsOrigin = (process.env.CORS_ORIGIN || process.env.ALLOWED_ORIGIN || '').trim();
  const allowedOrigin = rawCorsOrigin === '*' || !origin ? origin || '*' : rawCorsOrigin.split(',').includes(origin) ? origin : 'https://www.jetsetterss.com';

  res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action, id } = req.query;

  // ── Validate coupon ────────────────────────────────
  if (req.method === 'POST' && action === 'validate') {
    const { code, orderTotal = 0, bookingType = 'all', userId } = req.body;
    if (!code) return res.status(400).json({ success: false, message: 'Coupon code is required.' });

    const { data: coupon, error } = await supabase.from('coupons').select('*')
      .eq('code', code.trim().toUpperCase()).eq('is_active', true).maybeSingle();

    if (error) return res.status(500).json({ success: false, message: error.message });
    if (!coupon) return res.status(404).json({ success: false, message: 'Invalid or expired coupon code.' });

    const now = new Date();
    if (coupon.valid_from && new Date(coupon.valid_from) > now)
      return res.status(400).json({ success: false, message: 'This coupon is not yet active.' });
    if (coupon.valid_until && new Date(coupon.valid_until) < now)
      return res.status(400).json({ success: false, message: 'This coupon has expired.' });
    if (coupon.max_uses !== null && coupon.current_uses >= coupon.max_uses)
      return res.status(400).json({ success: false, message: 'This coupon has reached its usage limit.' });
    if (parseFloat(coupon.min_order_value) > 0 && parseFloat(orderTotal) < parseFloat(coupon.min_order_value))
      return res.status(400).json({ success: false, message: `Minimum order of $${coupon.min_order_value} required.` });
    if (coupon.applicable_to !== 'all' && coupon.applicable_to !== bookingType)
      return res.status(400).json({ success: false, message: `Coupon only valid for ${coupon.applicable_to} bookings.` });

    if (userId) {
      const { data: existing } = await supabase.from('coupon_usage').select('id')
        .eq('coupon_id', coupon.id).eq('user_id', userId).maybeSingle();
      if (existing) return res.status(400).json({ success: false, message: 'You have already used this coupon.' });
    }

    const total = parseFloat(orderTotal);
    let discountAmount = coupon.discount_type === 'percentage'
      ? (total * parseFloat(coupon.discount_value)) / 100
      : parseFloat(coupon.discount_value);
    discountAmount = parseFloat(Math.min(discountAmount, total).toFixed(2));

    return res.json({ success: true, coupon: { id: coupon.id, code: coupon.code, description: coupon.description, discountType: coupon.discount_type, discountValue: coupon.discount_value }, discountAmount, finalTotal: parseFloat((total - discountAmount).toFixed(2)) });
  }

  // ── Record coupon use ────────────────────────────────
  if (req.method === 'POST' && action === 'use') {
    const { couponId, userId, userEmail, bookingReference, discountAmount } = req.body;
    if (!couponId) return res.status(400).json({ success: false, message: 'couponId required.' });

    const { data: c } = await supabase.from('coupons').select('current_uses').eq('id', couponId).single();
    await supabase.from('coupons').update({ current_uses: (c?.current_uses || 0) + 1 }).eq('id', couponId);
    await supabase.from('coupon_usage').insert([{ coupon_id: couponId, user_id: userId || null, user_email: userEmail || null, booking_reference: bookingReference || null, discount_amount: discountAmount || 0 }]);
    return res.json({ success: true, message: 'Coupon usage recorded.' });
  }

  // ── List coupons (admin) ────────────────────────────
  if (req.method === 'GET' && action === 'list') {
    const { data, error } = await supabase.from('coupons').select('*').order('created_at', { ascending: false });
    if (error) return res.status(500).json({ success: false, message: error.message });
    return res.json({ success: true, data });
  }

  // ── Create coupon (admin) ───────────────────────────
  if (req.method === 'POST' && action === 'create') {
    const { code, description, discountType, discountValue, minOrderValue, maxUses, validFrom, validUntil, applicableTo } = req.body;
    if (!code || !discountType || !discountValue) return res.status(400).json({ success: false, message: 'Code, discountType, discountValue required.' });
    const { data, error } = await supabase.from('coupons').insert([{ code: code.trim().toUpperCase(), description, discount_type: discountType, discount_value: discountValue, min_order_value: minOrderValue || 0, max_uses: maxUses || null, valid_from: validFrom || new Date().toISOString(), valid_until: validUntil || null, applicable_to: applicableTo || 'all', is_active: true }]).select().single();
    if (error) return res.status(500).json({ success: false, message: error.message });
    return res.json({ success: true, data });
  }

  // ── Update coupon (admin) ──────────────────────────
  if (req.method === 'PUT' && id) {
    const { data, error } = await supabase.from('coupons').update({ ...req.body, updated_at: new Date().toISOString() }).eq('id', id).select().single();
    if (error) return res.status(500).json({ success: false, message: error.message });
    return res.json({ success: true, data });
  }

  // ── Deactivate (admin) ─────────────────────────────
  if (req.method === 'DELETE' && id) {
    const { error } = await supabase.from('coupons').update({ is_active: false }).eq('id', id);
    if (error) return res.status(500).json({ success: false, message: error.message });
    return res.json({ success: true, message: 'Coupon deactivated.' });
  }

  return res.status(404).json({ success: false, message: 'Invalid action.' });
}
