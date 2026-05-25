import { QueryClient, QueryCache } from '@tanstack/react-query';
import type { Query, DefaultError, QueryKey } from '@tanstack/react-query';
import { toast } from 'sonner';
import { extractErrorMessage } from '../../services/apiClient';

declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: { showErrorToast?: boolean };
  }
}

/**
 * Global query error handler attached to the `QueryCache`.
 * Shows an error toast for every failed query unless the query explicitly sets `meta.showErrorToast` to `false`.
 * Centralises error surfacing so individual `useQuery` call sites stay clean.
 * @param error - The error thrown by the query's `queryFn`
 * @param query - The TanStack Query instance that failed; checked for the `showErrorToast` meta flag
 */
const onError = (error: DefaultError, query: Query<unknown, unknown, unknown, QueryKey>) => {
  if (query.meta?.showErrorToast !== false) {
    toast.error(extractErrorMessage(error));
  }
};

/**
 * Singleton TanStack QueryClient used throughout the application.
 * Attaches a global `QueryCache` error handler that shows a toast for every failed query
 * unless the query sets `meta.showErrorToast: false`.
 * Default `staleTime` is 5 minutes; override per-query only with a documented reason.
 */
export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError }),
  defaultOptions: {
    queries: {
      staleTime: 300000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
