import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
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
  const [language, setLanguage] = useState("");
  const debounced = useDebouncedValue(search, 250);

  // Discover all distinct languages available in published courses
  const { data: allCourses } = useQuery({
    queryKey: qk.public.courses(),
    queryFn: () => listPublicCourses(),
    staleTime: 5 * 60_000,
  });

  const availableLanguages = useMemo(() => {
    const set = new Set<string>();
    (allCourses ?? []).forEach((c) => {
      if (c.language && c.language.trim()) {
        set.add(c.language.trim());
      }
    });
    return Array.from(set).sort();
  }, [allCourses]);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: qk.public.courses(debounced, language),
    queryFn: () => listPublicCourses(debounced, language),
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  });

  const courses = data ?? [];
  const hasActiveFilters = Boolean(debounced.trim() || language);

  const resetFilters = () => {
    setSearch("");
    setLanguage("");
  };

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-10 md:py-14 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 animate-slide-up">
        <div>
          <p className="text-caption text-tertiary mb-2">CATALOG</p>
          <h1 className="font-display font-bold text-display-md md:text-display-lg text-ink">Explore courses</h1>
          <p className="text-body-sm text-ink-variant mt-1 max-w-xl">
            Browse every course with full details — no account needed. Create a free account when you're ready to enroll.
          </p>
        </div>
        {!user && (
          <Link to={ROUTES.signup} className="shrink-0">
            <Button rightIcon="arrow_forward">Create free account</Button>
          </Link>
        )}
      </div>

      <div className="space-y-3 animate-slide-up" style={{ animationDelay: "40ms" }}>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <Input
            placeholder="Search courses by title, category or language…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon="search"
            containerClassName="flex-1 max-w-xl"
          />
          <Select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            options={[
              { value: "", label: "All languages of instruction" },
              ...availableLanguages.map((lang) => ({ value: lang, label: lang })),
            ]}
            containerClassName="w-full sm:w-64"
          />
          {isFetching && !isLoading && (
            <span className="icon text-ink-outline animate-spin text-[20px] self-center">progress_activity</span>
          )}
        </div>

        {availableLanguages.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            <span className="text-caption text-ink-outline mr-1 flex items-center gap-1">
              <span className="icon text-[14px]">translate</span>
              Language:
            </span>
            <button
              type="button"
              onClick={() => setLanguage("")}
              className={`px-3 py-1 rounded-full text-label font-medium transition-all ${
                !language
                  ? "bg-primary text-white shadow-sm"
                  : "bg-surface-container hover:bg-surface-containerHigh text-ink"
              }`}
            >
              All
            </button>
            {availableLanguages.map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => setLanguage(language.toLowerCase() === lang.toLowerCase() ? "" : lang)}
                className={`px-3 py-1 rounded-full text-label font-medium transition-all ${
                  language.toLowerCase() === lang.toLowerCase()
                    ? "bg-primary text-white shadow-sm"
                    : "bg-surface-container hover:bg-surface-containerHigh text-ink"
                }`}
              >
                {lang}
              </button>
            ))}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="text-label text-ink-outline hover:text-danger ml-2 flex items-center gap-0.5 underline underline-offset-2 transition-colors"
              >
                <span className="icon text-[14px]">clear</span>
                Clear filters
              </button>
            )}
          </div>
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
          title={hasActiveFilters ? "No matching courses" : "No courses yet"}
          description={
            hasActiveFilters
              ? language && debounced
                ? `No courses found matching "${debounced}" with language of instruction "${language}".`
                : language
                ? `No courses found with language of instruction "${language}".`
                : `No courses found matching "${debounced}". Try a different search term.`
              : "New courses are on the way — check back soon."
          }
          icon="travel_explore"
          action={
            hasActiveFilters ? (
              <Button variant="outline" onClick={resetFilters} leftIcon="restart_alt">
                Reset filters
              </Button>
            ) : undefined
          }
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
