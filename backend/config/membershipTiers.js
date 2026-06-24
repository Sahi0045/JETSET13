// Single source of truth for membership tiers on the backend.
// Mirror of frontend/src/config/membership.js — keep in sync.
//
// Used to verify/record member discounts server-side when creating
// payment sessions, so the benefit cannot be spoofed by the client.

export const MEMBERSHIP_TIERS = {
  premium_monthly: { id: 'premium_monthly', label: 'Monthly Premium', discountRate: 0.05 },
  premium_annual: { id: 'premium_annual', label: 'Annual Jetsetter', discountRate: 0.10 },
};

export function getDiscountRate(tier) {
  return MEMBERSHIP_TIERS[tier]?.discountRate || 0;
}

export function isPremiumTier(tier) {
  return !!MEMBERSHIP_TIERS[tier];
}

export function isMembershipActive(tier, endDate) {
  if (!isPremiumTier(tier)) return false;
  if (!endDate) return true;
  const end = new Date(endDate);
  return Number.isFinite(end.getTime()) ? end.getTime() > Date.now() : true;
}

/**
 * Look up a user's active membership from the users table and return the
 * discount rate to apply. Returns { tier, active, discountRate }.
 * `supabase` is a configured client (service role).
 */
export async function getUserMembership(supabase, userId) {
  if (!supabase || !userId) return { tier: null, active: false, discountRate: 0 };
  try {
    const { data, error } = await supabase
      .from('users')
      .select('subscription_tier, subscription_end_date')
      .eq('id', userId)
      .single();
    if (error || !data) return { tier: null, active: false, discountRate: 0 };
    const active = isMembershipActive(data.subscription_tier, data.subscription_end_date);
    return {
      tier: data.subscription_tier || null,
      active,
      discountRate: active ? getDiscountRate(data.subscription_tier) : 0,
    };
  } catch {
    return { tier: null, active: false, discountRate: 0 };
  }
}
