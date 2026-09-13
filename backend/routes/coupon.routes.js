import express from 'express';
import dotenv from 'dotenv';
import { protect, admin } from '../middleware/auth.middleware.js';
// The shared client, not a second one built here.
//
// This module used to call createClient itself off the same env vars, which
// made every database path in it unmockable: the shared module is what tests
// mock, so a test against these routes built a real client and hit the network.
// flight.routes.js was fixed the same way and for the same reason.
import supabase from '../config/supabase.js';
import { evaluateCoupon } from '../services/coupon.service.js';

dotenv.config();

const router = express.Router();

// No local `requireSupabase` gate any more: config/supabase.js fails fast at
// import if the credentials are missing, the same as every other route module.

// ─────────────────────────────────────────────
// PUBLIC: Validate a coupon code
// POST /api/coupons/validate
// body: { code, orderTotal, bookingType, userId }
// ─────────────────────────────────────────────
router.post('/validate', async (req, res) => {
    try {
        const { code, orderTotal = 0, bookingType = 'all', userId } = req.body;

        // The same evaluation checkout runs on the total it computes itself.
        // `max_discount_amount` caps what one booking may give away - see
        // services/coupon.service.js.
        const result = await evaluateCoupon(supabase, { code, orderTotal, bookingType, userId });
        if (!result.ok) {
            return res.status(result.status).json({ success: false, message: result.message });
        }
        const { coupon, discountAmount, finalTotal } = result;

        return res.json({
            success: true,
            coupon: {
                id: coupon.id,
                code: coupon.code,
                description: coupon.description,
                discountType: coupon.discount_type,
                discountValue: coupon.discount_value,
                maxDiscountAmount: coupon.max_discount_amount ?? null,
                applicableTo: coupon.applicable_to
            },
            discountAmount,
            finalTotal
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
router.get('/', protect, admin, async (req, res) => {
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
router.post('/', protect, admin, async (req, res) => {
    try {
        const { code, description, discountType, discountValue, minOrderValue, maxDiscountAmount, maxUses, validFrom, validUntil, applicableTo } = req.body;

        if (!code || !discountType || !discountValue) {
            return res.status(400).json({ success: false, message: 'code, discountType, discountValue are required.' });
        }

        const { data, error } = await supabase.from('coupons').insert([{
            code: code.trim().toUpperCase(),
            description,
            discount_type: discountType,
            discount_value: discountValue,
            min_order_value: minOrderValue || 0,
            // Blank means uncapped, which is the behaviour before this column
            // existed. Requires scripts/db/coupon-max-discount.sql to have run.
            max_discount_amount: maxDiscountAmount || null,
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
router.put('/:id', protect, admin, async (req, res) => {
    try {
        const { id } = req.params;
        const b = req.body;
        const updates = {};
        if (b.code != null) updates.code = String(b.code).trim().toUpperCase();
        if (b.description != null) updates.description = b.description;
        if (b.discountType != null) updates.discount_type = b.discountType;
        if (b.discount_type != null) updates.discount_type = b.discount_type;
        if (b.discountValue != null) updates.discount_value = b.discountValue;
        if (b.discount_value != null) updates.discount_value = b.discount_value;
        if (b.minOrderValue != null) updates.min_order_value = b.minOrderValue;
        if (b.min_order_value != null) updates.min_order_value = b.min_order_value;
        // Sent blank to clear the cap, so the key being present is what counts.
        if (b.maxDiscountAmount !== undefined) updates.max_discount_amount = b.maxDiscountAmount || null;
        if (b.max_discount_amount !== undefined) updates.max_discount_amount = b.max_discount_amount || null;
        if (b.maxUses !== undefined) updates.max_uses = b.maxUses;
        if (b.max_uses !== undefined) updates.max_uses = b.max_uses;
        if (b.validFrom != null) updates.valid_from = b.validFrom;
        if (b.valid_from != null) updates.valid_from = b.valid_from;
        if (b.validUntil != null) updates.valid_until = b.validUntil;
        if (b.valid_until != null) updates.valid_until = b.valid_until;
        if (b.applicableTo != null) updates.applicable_to = b.applicableTo;
        if (b.applicable_to != null) updates.applicable_to = b.applicable_to;
        if (typeof b.is_active === 'boolean') updates.is_active = b.is_active;

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
router.delete('/:id', protect, admin, async (req, res) => {
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
