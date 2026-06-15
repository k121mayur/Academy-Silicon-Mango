import { useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { CourseCard, CourseCardSkeleton } from "@/components/student/CourseCard";
import { QueryErrorState } from "@/components/student/QueryErrorState";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useAuthStore } from "@/features/auth/stores/authStore";
import { qk } from "@/lib/queryKeys";
import { ROUTES } from "@/router/routes";
import { listPublicCourses } from "@/services/public.service";

/**
 * Public course catalogue — fully browsable without login. Anyone can see every
 * published course with full information; enrolment (handled on the detail page)
 * is what requires an account.
 */
export default function CoursesListing() {
  const { user } = useAuthStore();
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
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-10 md:py-14 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 animate-slide-up">
        <div>
          <p className="text-caption text-tertiary mb-2">CATALOG</p>
          <h1 className="font-display font-bold text-display-md md:text-display-lg text-ink">Explore courses</h1>
          <p className="text-body-sm text-ink-variant mt-1 max-w-xl">
            Browse every course with full details — no account needed. Create a free account when you're ready to enrol.
          </p>
        </div>
        {!user && (
          <Link to={ROUTES.signup} className="shrink-0">
            <Button rightIcon="arrow_forward">Create free account</Button>
          </Link>
        )}
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
          description={debounced ? "Try a different search term." : "New courses are on the way — check back soon."}
          icon="travel_explore"
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {courses.map((c) => (
            <CourseCard key={c.id} course={c} to={ROUTES.public.courseDetails(c.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
