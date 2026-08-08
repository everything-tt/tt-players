import { QueryClient } from '@tanstack/react-query';

export function createMobileQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5,
        retry: 2,
      },
    },
  });
}
