import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { CourseCard, CourseCardSkeleton } from "@/components/student/CourseCard";
import { QueryErrorState } from "@/components/student/QueryErrorState";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { qk } from "@/lib/queryKeys";
import { listPublicCourses } from "@/services/public.service";

export default function ExploreCatalogue() {
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 250);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: qk.public.courses(debounced),
    queryFn: () => listPublicCourses(debounced),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });

  const courses = data ?? [];

  return (
    <div className="space-y-5">
      <div className="animate-slide-up">
        <h1 className="font-display font-bold text-display-md text-ink">Explore courses</h1>
        <p className="text-body-sm text-ink-variant">
          Browse the catalogue, pick a course and a batch, and enrol in minutes.
        </p>
      </div>

      <div className="flex items-center gap-3 animate-slide-up" style={{ animationDelay: "40ms" }}>
        <Input
          placeholder="Search courses by title or category…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          leftIcon="search"
          containerClassName="flex-1 max-w-xl"
        />
        {isFetching && !isLoading && (
          <span className="icon text-ink-outline animate-spin text-[20px]">progress_activity</span>
        )}
      </div>

      {isError ? (
        <QueryErrorState error={error} onRetry={() => refetch()} title="Couldn't load courses" />
      ) : isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <CourseCardSkeleton key={i} />
          ))}
        </div>
      ) : courses.length === 0 ? (
        <EmptyState
          title={debounced ? "No matches" : "No courses yet"}
          description={
            debounced
              ? "Try a different search term."
              : "New courses are on the way — check back soon."
          }
          icon="travel_explore"
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {courses.map((c) => (
            <CourseCard key={c.id} course={c} />
          ))}
        </div>
      )}
    </div>
  );
}
