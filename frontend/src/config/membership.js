// Single source of truth for membership tiers and the benefits that apply
// across every booking surface (flights, packages, hotels, cruises).
//
// Keep this in sync with backend/config/membershipTiers.js

export const MEMBERSHIP_TIERS = {
  premium_monthly: {
    id: 'premium_monthly',
    label: 'Monthly Premium',
    shortLabel: 'Premium',
    discountRate: 0.05, // 5% off all bookings
    perks: [
      '5% discount on all bookings',
      'Priority 24/7 support',
      'Free standard seat selection',
    ],
  },
  premium_annual: {
    id: 'premium_annual',
    label: 'Annual Jetsetter',
    shortLabel: 'Premium',
    discountRate: 0.10, // 10% off all bookings
    perks: [
      '10% discount on all bookings',
      'VIP priority support',
      'Free premium seat selection',
      'Free checked baggage (when available)',
    ],
  },
};

/** Returns the discount rate (0..1) for a tier, 0 if none/unknown. */
export function getDiscountRate(tier) {
  return MEMBERSHIP_TIERS[tier]?.discountRate || 0;
}

/** Whether a tier string represents a paid premium membership. */
export function isPremiumTier(tier) {
  return !!MEMBERSHIP_TIERS[tier];
}

/** A membership is active only if it's a premium tier and not expired. */
export function isMembershipActive(tier, endDate) {
  if (!isPremiumTier(tier)) return false;
  if (!endDate) return true; // tier present, treat as active if no end date recorded
  const end = new Date(endDate);
  return Number.isFinite(end.getTime()) ? end.getTime() > Date.now() : true;
}

/** Compute the member discount amount for a given base amount. */
export function memberDiscountAmount(baseAmount, tier, endDate) {
  if (!isMembershipActive(tier, endDate)) return 0;
  const rate = getDiscountRate(tier);
  const amt = (Number(baseAmount) || 0) * rate;
  return Math.max(0, Math.round(amt * 100) / 100);
}
