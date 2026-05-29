import { Link } from "react-router-dom";
import { useQueries, useQuery } from "@tanstack/react-query";

import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { BatchCard } from "@/components/student/BatchCard";
import { QueryErrorState } from "@/components/student/QueryErrorState";
import { useAuthStore } from "@/features/auth/stores/authStore";
import { qk } from "@/lib/queryKeys";
import { ROUTES } from "@/router/routes";
import { fetchBatchProgress, fetchMyBatches } from "@/services/student.service";

export default function MyCourses() {
  const user = useAuthStore((s) => s.user);

  const batchesQ = useQuery({
    queryKey: qk.student.batches(),
    queryFn: fetchMyBatches,
  });
  const batches = batchesQ.data ?? [];

  // Per-batch progress, in parallel — each card reveals its bar as it resolves.
  const progressQueries = useQueries({
    queries: batches.map((b) => ({
      queryKey: qk.student.progress(b.id),
      queryFn: () => fetchBatchProgress(b.id),
      staleTime: 30_000,
    })),
  });

  return (
    <div className="space-y-5">
      <div className="animate-slide-up flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display font-bold text-display-md text-ink">My courses</h1>
          <p className="text-body-sm text-ink-variant">
            Hi {user?.display_name || "there"} — here's everything you're learning.
          </p>
        </div>
        <Link to={ROUTES.student.explore}>
          <Button variant="outline" leftIcon="travel_explore">
            Explore more
          </Button>
        </Link>
      </div>

      {batchesQ.isError ? (
        <QueryErrorState error={batchesQ.error} onRetry={() => batchesQ.refetch()} title="Couldn't load your courses" />
      ) : batchesQ.isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-72 bg-surface-container rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : batches.length === 0 ? (
        <EmptyState
          icon="school"
          title="No courses yet"
          description="You haven't enrolled in any course. Explore the catalogue to get started."
          action={
            <Link to={ROUTES.student.explore}>
              <Button leftIcon="travel_explore">Explore courses</Button>
            </Link>
          }
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {batches.map((b, i) => (
            <BatchCard
              key={b.id}
              batch={b}
              progress={progressQueries[i]?.data}
              loadingProgress={progressQueries[i]?.isLoading}
            />
          ))}
        </div>
      )}
    </div>
  );
}
