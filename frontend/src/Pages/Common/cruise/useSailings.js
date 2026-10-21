import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../../lib/queryKeys';
import { fetchSailing, fetchSailings } from './catalog';

const FIVE_MINUTES = 5 * 60 * 1000;

export const usePublishedSailings = () => useQuery({
  queryKey: queryKeys.cruises.published(),
  queryFn: () => fetchSailings(),
  staleTime: FIVE_MINUTES,
});

export const usePublishedSailing = (slug) => useQuery({
  queryKey: queryKeys.cruises.sailing(slug),
  queryFn: () => fetchSailing(slug),
  enabled: Boolean(slug),
  staleTime: FIVE_MINUTES,
});
