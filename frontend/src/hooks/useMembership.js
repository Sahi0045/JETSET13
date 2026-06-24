import { useEffect, useState } from 'react';
import { useSupabaseAuth } from '../contexts/SupabaseAuthContext';
import SubscriptionService from '../Services/SubscriptionService';
import {
  MEMBERSHIP_TIERS,
  getDiscountRate,
  isMembershipActive,
  memberDiscountAmount,
} from '../config/membership';

/**
 * Returns the current user's membership benefits, usable on any booking surface.
 *
 * {
 *   loading, tier, label, isActive, discountRate,
 *   endDate, discountFor(amount)
 * }
 */
export default function useMembership() {
  const { user } = useSupabaseAuth();
  const [state, setState] = useState({
    loading: true,
    tier: null,
    endDate: null,
  });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      // Resolve a user id from auth context, falling back to localStorage.
      let userId = user?.id;
      if (!userId) {
        try {
          const lsUser = JSON.parse(localStorage.getItem('user') || 'null');
          userId = lsUser?.id || null;
        } catch { /* ignore */ }
      }

      if (!userId) {
        if (!cancelled) setState({ loading: false, tier: null, endDate: null });
        return;
      }

      const res = await SubscriptionService.getStatus(userId);
      if (cancelled) return;

      if (res.success && res.data) {
        setState({
          loading: false,
          tier: res.data.subscription_tier || null,
          endDate: res.data.subscription_end_date || null,
        });
      } else {
        setState({ loading: false, tier: null, endDate: null });
      }
    };

    load();
    return () => { cancelled = true; };
  }, [user?.id]);

  const { tier, endDate } = state;
  const active = isMembershipActive(tier, endDate);

  return {
    loading: state.loading,
    tier,
    endDate,
    isActive: active,
    discountRate: active ? getDiscountRate(tier) : 0,
    label: active ? (MEMBERSHIP_TIERS[tier]?.shortLabel || 'Premium') : null,
    fullLabel: active ? (MEMBERSHIP_TIERS[tier]?.label || 'Premium') : null,
    // Helper: member discount amount for a given base price
    discountFor: (amount) => memberDiscountAmount(amount, tier, endDate),
  };
}
