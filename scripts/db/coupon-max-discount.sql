-- Migration: cap what a single booking can give away with a coupon.
--
-- A percentage coupon is unbounded in money terms. FLY20 takes 20% off any
-- total: $16 off an $80 domestic hop, but $240 off a $1,200 international
-- ticket. The agency earns the service fee (2.5% by default) and settles the
-- FULL fare with the airline through ARC, so every discount above that fee is
-- paid out of margin - and one expensive booking can wipe out the earnings of
-- many cheap ones.
--
-- `max_discount_amount` is the ceiling in dollars, applied in
-- backend/routes/coupon.routes.js POST /validate after the percentage or fixed
-- amount is worked out. NULL means no cap, which is the behaviour before this
-- column existed, so nothing changes for existing coupons until someone sets
-- one in the admin panel (Coupons -> Max Discount).
--
-- Safe & additive: nullable column, no backfill, no default.
-- Apply via the Supabase SQL editor.

ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS max_discount_amount numeric(10, 2);

COMMENT ON COLUMN public.coupons.max_discount_amount IS
  'Maximum discount in USD one booking may take from this coupon. NULL = uncapped.';

-- Suggested caps for the flight coupons in use (uncomment and adjust before
-- running; the right number is a business decision about margin per booking):
--
-- UPDATE public.coupons SET max_discount_amount = 25 WHERE code = 'FLY20';
-- UPDATE public.coupons SET max_discount_amount = 20 WHERE code = 'FLY10';
