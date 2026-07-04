import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import PricingService from '../../Services/PricingService';

/**
 * Admin-configured price settings (taxes/fees) via PricingService.
 * `service` is 'all' | 'flights' | 'cruises' | 'hotels' | 'general'.
 * PricingService already caches + falls back to defaults, so this never throws.
 */
export function usePriceConfig(service = 'all', options = {}) {
  return useQuery({
    queryKey: queryKeys.pricing.config(service),
    queryFn: () => PricingService.getPriceConfig(service),
    staleTime: 1000 * 60 * 10,
    ...options,
  });
}
