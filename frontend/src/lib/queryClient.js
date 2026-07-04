import { QueryClient } from '@tanstack/react-query';

/**
 * Shared TanStack Query client for the web app.
 *
 * Defaults:
 *  - staleTime 60s            → avoid refetching the same data on every mount
 *  - gcTime 30m               → keep results cached for fast back-navigation
 *  - retry 1                  → one retry on transient failures
 *  - refetchOnWindowFocus off → booking searches shouldn't silently re-run when
 *    the user tabs back; screens opt in per-query where a refresh is wanted
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      gcTime: 1000 * 60 * 30,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});
