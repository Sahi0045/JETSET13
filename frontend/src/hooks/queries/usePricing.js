import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import PricingService from '../../Services/PricingService';

/**
 * Admin-configured price settings (taxes/fees) via PricingService.
 * `service` is 'all' | 'flights' | 'cruises' | 'hotels' | 'general'.
 *
 * This CAN reject: PricingService no longer substitutes its hardcoded defaults
 * for a failed read, because the caller charges whatever it returns and the
 * defaults are ~25x the configured flight fee. Callers must handle `error`
 * rather than quoting from `data` being undefined.
 */
export function usePriceConfig(service = 'all', options = {}) {
  return useQuery({
    queryKey: queryKeys.pricing.config(service),
    queryFn: () => PricingService.getPriceConfig(service),
    staleTime: 1000 * 60 * 10,
    ...options,
  });
}

/** Hotel tax/service/fixed-fee rates derived from the admin price settings. */
export function useHotelRates(options = {}) {
  return useQuery({
    queryKey: [...queryKeys.pricing.all, 'hotelRates'],
    queryFn: () => PricingService.getHotelRates(),
    staleTime: 1000 * 60 * 10,
    ...options,
  });
}
