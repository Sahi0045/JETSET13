import express from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY
);

// ─────────────────────────────────────────────
// PUBLIC: Validate a coupon code
// POST /api/coupons/validate
// body: { code, orderTotal, bookingType, userId }
// ─────────────────────────────────────────────
router.post('/validate', async (req, res) => {
    try {
        const { code, orderTotal = 0, bookingType = 'all', userId } = req.body;

        if (!code) {
            return res.status(400).json({ success: false, message: 'Coupon code is required.' });
        }

        const { data: coupon, error } = await supabase
            .from('coupons')
            .select('*')
            .eq('code', code.trim().toUpperCase())
            .eq('is_active', true)
            .maybeSingle();

        if (error) throw error;

        if (!coupon) {
            return res.status(404).json({ success: false, message: 'Invalid or expired coupon code.' });
        }

        // Check validity dates
        const now = new Date();
        if (coupon.valid_from && new Date(coupon.valid_from) > now) {
            return res.status(400).json({ success: false, message: 'This coupon is not yet active.' });
        }
        if (coupon.valid_until && new Date(coupon.valid_until) < now) {
            return res.status(400).json({ success: false, message: 'This coupon has expired.' });
        }

        // Check max uses
        if (coupon.max_uses !== null && coupon.current_uses >= coupon.max_uses) {
            return res.status(400).json({ success: false, message: 'This coupon has reached its maximum usage limit.' });
        }

        // Check minimum order value
        if (parseFloat(coupon.min_order_value) > 0 && parseFloat(orderTotal) < parseFloat(coupon.min_order_value)) {
            return res.status(400).json({
                success: false,
                message: `This coupon requires a minimum order of $${coupon.min_order_value}.`
            });
        }

        // Check booking type applicability
        if (coupon.applicable_to !== 'all' && coupon.applicable_to !== bookingType) {
            return res.status(400).json({
                success: false,
                message: `This coupon is only valid for ${coupon.applicable_to} bookings.`
            });
        }

        // Check for user-specific usage limit (max 1 use per user)
        if (userId) {
            const { data: existing } = await supabase
                .from('coupon_usage')
                .select('id')
                .eq('coupon_id', coupon.id)
                .eq('user_id', userId)
                .maybeSingle();

            if (existing) {
                return res.status(400).json({ success: false, message: 'You have already used this coupon.' });
            }
        }

        // Calculate discount
        let discountAmount = 0;
        const total = parseFloat(orderTotal);
        if (coupon.discount_type === 'percentage') {
            discountAmount = (total * parseFloat(coupon.discount_value)) / 100;
        } else {
            discountAmount = parseFloat(coupon.discount_value);
        }
        discountAmount = Math.min(discountAmount, total); // can't discount more than total
        discountAmount = parseFloat(discountAmount.toFixed(2));

        return res.json({
            success: true,
            coupon: {
                id: coupon.id,
                code: coupon.code,
                description: coupon.description,
                discountType: coupon.discount_type,
                discountValue: coupon.discount_value,
                applicableTo: coupon.applicable_to
            },
            discountAmount,
            finalTotal: parseFloat((total - discountAmount).toFixed(2))
        });

    } catch (error) {
        console.error('Coupon validate error:', error);
        return res.status(500).json({ success: false, message: 'Failed to validate coupon.' });
    }
});

// ─────────────────────────────────────────────
// INTERNAL: Record coupon usage (called after successful booking)
// POST /api/coupons/use
// body: { couponId, userId, userEmail, bookingReference, discountAmount }
// ─────────────────────────────────────────────
router.post('/use', async (req, res) => {
    try {
        const { couponId, userId, userEmail, bookingReference, discountAmount } = req.body;

        if (!couponId) {
            return res.status(400).json({ success: false, message: 'couponId is required.' });
        }

        // Increment current_uses atomically
        const { error: incErr } = await supabase.rpc('increment_coupon_uses', { coupon_id: couponId });
        // If RPC not available, do it manually
        if (incErr) {
            const { data: c } = await supabase.from('coupons').select('current_uses').eq('id', couponId).single();
            await supabase.from('coupons').update({ current_uses: (c?.current_uses || 0) + 1 }).eq('id', couponId);
        }

        // Record usage
        await supabase.from('coupon_usage').insert([{
            coupon_id: couponId,
            user_id: userId || null,
            user_email: userEmail || null,
            booking_reference: bookingReference || null,
            discount_amount: discountAmount || 0
        }]);

        return res.json({ success: true, message: 'Coupon usage recorded.' });
    } catch (error) {
        console.error('Coupon use error:', error);
        return res.status(500).json({ success: false, message: 'Failed to record coupon usage.' });
    }
});

// ─────────────────────────────────────────────
// ADMIN: List all coupons
// GET /api/coupons
// ─────────────────────────────────────────────
router.get('/', async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('coupons')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        return res.json({ success: true, data });
    } catch (error) {
        console.error('List coupons error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch coupons.' });
    }
});

// ─────────────────────────────────────────────
// ADMIN: Create a coupon
// POST /api/coupons
// ─────────────────────────────────────────────
router.post('/', async (req, res) => {
    try {
        const { code, description, discountType, discountValue, minOrderValue, maxUses, validFrom, validUntil, applicableTo } = req.body;

        if (!code || !discountType || !discountValue) {
            return res.status(400).json({ success: false, message: 'code, discountType, discountValue are required.' });
        }

        const { data, error } = await supabase.from('coupons').insert([{
            code: code.trim().toUpperCase(),
            description,
            discount_type: discountType,
            discount_value: discountValue,
            min_order_value: minOrderValue || 0,
            max_uses: maxUses || null,
            valid_from: validFrom || new Date().toISOString(),
            valid_until: validUntil || null,
            applicable_to: applicableTo || 'all',
            is_active: true
        }]).select().single();

        if (error) throw error;
        return res.json({ success: true, data });
    } catch (error) {
        console.error('Create coupon error:', error);
        return res.status(500).json({ success: false, message: error.message || 'Failed to create coupon.' });
    }
});

// ─────────────────────────────────────────────
// ADMIN: Update a coupon
// PUT /api/coupons/:id
// ─────────────────────────────────────────────
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const { data, error } = await supabase
            .from('coupons')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;
        return res.json({ success: true, data });
    } catch (error) {
        console.error('Update coupon error:', error);
        return res.status(500).json({ success: false, message: 'Failed to update coupon.' });
    }
});

// ─────────────────────────────────────────────
// ADMIN: Delete (deactivate) a coupon
// DELETE /api/coupons/:id
// ─────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { error } = await supabase.from('coupons').update({ is_active: false }).eq('id', id);
        if (error) throw error;
        return res.json({ success: true, message: 'Coupon deactivated.' });
    } catch (error) {
        console.error('Delete coupon error:', error);
        return res.status(500).json({ success: false, message: 'Failed to deactivate coupon.' });
    }
});

export default router;
