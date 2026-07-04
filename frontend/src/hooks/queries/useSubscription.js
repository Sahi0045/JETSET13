import { useQuery, useMutation } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import SubscriptionService from '../../Services/SubscriptionService';

export function useSubscriptionStatus(userId, options = {}) {
  return useQuery({
    queryKey: queryKeys.subscription.status(userId),
    queryFn: () => SubscriptionService.getStatus(userId),
    enabled: (options.enabled ?? true) && !!userId,
    ...options,
  });
}

export function useCreateCheckoutSession() {
  return useMutation({
    mutationFn: (checkoutData) => SubscriptionService.createCheckoutSession(checkoutData),
  });
}
