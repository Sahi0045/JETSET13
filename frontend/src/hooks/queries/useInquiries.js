import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '../../lib/queryKeys';
import { getApiUrl } from '../../utils/apiHelper';

export function useInquiryById(inquiryId, { session } = {}, options = {}) {
  return useQuery({
    queryKey: ['inquiries', 'detail', inquiryId],
    queryFn: async () => {
      const token = session?.access_token || '';
      const res = await fetch(getApiUrl(`inquiries?id=${inquiryId}`), {
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Failed to fetch inquiry (${res.status})`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Inquiry not found');
      return data.data || data;
    },
    enabled: (options.enabled ?? true) && !!inquiryId,
    ...options,
  });
}

export function useQuotesByInquiry(inquiryId, { session } = {}, options = {}) {
  return useQuery({
    queryKey: ['quotes', 'byInquiry', inquiryId],
    queryFn: async () => {
      const token = session?.access_token || '';
      const res = await fetch(getApiUrl(`quotes?inquiryId=${inquiryId}`), {
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });
      if (!res.ok) throw new Error(`Failed to fetch quotes (${res.status})`);
      const data = await res.json();
      return Array.isArray(data.data) ? data.data : (data.quotes || []);
    },
    enabled: (options.enabled ?? true) && !!inquiryId,
    ...options,
  });
}
