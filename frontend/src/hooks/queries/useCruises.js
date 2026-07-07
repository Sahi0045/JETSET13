import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import { getApiUrl } from '../../utils/apiHelper';

export function useCruiseList(options = {}) {
  return useQuery({
    queryKey: queryKeys.cruises.list(),
    queryFn: async () => {
      const res = await fetch(getApiUrl('cruises'));
      if (!res.ok) throw new Error('Failed to fetch cruises');
      const data = await res.json();
      return data.data || data.cruises || [];
    },
    staleTime: 1000 * 60 * 5,
    ...options,
  });
}

export function usePackageById(packageId, options = {}) {
  return useQuery({
    queryKey: queryKeys.packages.details(packageId),
    queryFn: async () => {
      const res = await fetch(getApiUrl(`packages/${packageId}`));
      if (!res.ok) throw new Error('Failed to fetch package');
      const data = await res.json();
      return data.data || data.package || data;
    },
    enabled: (options.enabled ?? true) && !!packageId,
    ...options,
  });
}
