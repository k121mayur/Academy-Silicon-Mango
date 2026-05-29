import { QueryClient, type Query } from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";

// Bump when the persisted query shapes change so a deploy doesn't serve stale data.
export const APP_CACHE_VERSION = "smango-cache-v1";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Retry with capped exponential backoff — kinder to flaky networks.
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      staleTime: 30_000,
      gcTime: 24 * 60 * 60 * 1000, // keep in cache long enough to persist for 24h
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
      // Serve cached data instantly, then revalidate — great on poor connections.
      networkMode: "offlineFirst",
    },
    mutations: {
      // Never auto-retry mutations — payment calls must run at most once.
      retry: 0,
      networkMode: "offlineFirst",
    },
  },
});

export const persister =
  typeof window !== "undefined"
    ? createSyncStoragePersister({
        storage: window.localStorage,
        key: "smango-rq-cache",
        throttleTime: 1000,
      })
    : undefined;

// Persist only non-sensitive, slow-changing data: the public catalogue and the
// student's own batch/profile lists. Never persist payments or per-batch detail.
export function shouldPersistQuery(query: Query): boolean {
  const key = query.queryKey as readonly unknown[];
  if (key[0] === "public") return true;
  if (key[0] === "student") {
    return key[1] === "profile" || key[1] === "batches";
  }
  return false;
}
