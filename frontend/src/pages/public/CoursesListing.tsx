import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
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

const DEFAULT_CATEGORIES = ["Data Analytics", "Artificial Intelligence", "Finance"];

/**
 * Public course catalogue — fully browsable without login. Anyone can see every
 * published course with full information; enrolment (handled on the detail page)
 * is what requires an account.
 */
export default function CoursesListing() {
  const { user } = useAuthStore();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [language, setLanguage] = useState("");
  const categoryFromUrl = searchParams.get("category") || "";
  const [category, setCategoryState] = useState(categoryFromUrl);
  const debounced = useDebouncedValue(search, 250);

  useEffect(() => {
    setCategoryState(searchParams.get("category") || "");
  }, [searchParams]);

  const rawType = (searchParams.get("type") || "").toLowerCase().trim();
  const selectedType =
    rawType === "live" || rawType === "live_classes" || rawType === "live-classes"
      ? "live"
      : rawType === "self_paced" || rawType === "self-paced" || rawType === "recorded"
      ? "self_paced"
      : "";

  const setCourseType = (type: string) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (type) {
          next.set("type", type);
        } else {
          next.delete("type");
        }
        return next;
      },
      { replace: true }
    );
  };

  const setCategory = (cat: string) => {
    setCategoryState(cat);
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (cat) {
          next.set("category", cat);
        } else {
          next.delete("category");
        }
        return next;
      },
      { replace: true }
    );
  };

  // Discover all distinct categories and languages available in published courses
  const { data: allCourses } = useQuery({
    queryKey: qk.public.courses(),
    queryFn: () => listPublicCourses(),
    staleTime: 0,
    refetchOnMount: "always",
  });

  const availableCategories = useMemo(() => {
    const customCats = new Set<string>();
    (allCourses ?? []).forEach((c) => {
      if (c.category && c.category.trim()) {
        const trimmed = c.category.trim();
        const isDefault = DEFAULT_CATEGORIES.some(
          (d) => d.toLowerCase() === trimmed.toLowerCase()
        );
        if (!isDefault && trimmed.toLowerCase() !== "other") {
          customCats.add(trimmed);
        }
      }
    });
    const sortedCustom = Array.from(customCats).sort();
    return [...DEFAULT_CATEGORIES, ...sortedCustom, "Other"];
  }, [allCourses]);

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
    queryKey: qk.public.courses(debounced, language, selectedType, category),
    queryFn: () => listPublicCourses(debounced, language, selectedType, category),
    placeholderData: keepPreviousData,
    staleTime: 0,
    refetchOnMount: "always",
  });

  const courses = data ?? [];
  const hasActiveFilters = Boolean(debounced.trim() || language || selectedType || category);

  const resetFilters = () => {
    setSearch("");
    setLanguage("");
    setCategoryState("");
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("type");
        next.delete("category");
        return next;
      },
      { replace: true }
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 md:px-6 py-10 md:py-14 space-y-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 animate-slide-up">
        <div>
          <p className="text-caption text-tertiary mb-2">CATALOG</p>
          <h1 className="font-display font-bold text-display-md md:text-display-lg text-ink">
            {selectedType === "live"
              ? "Live Classes"
              : selectedType === "self_paced"
              ? "Self-paced Courses"
              : "Explore courses"}
          </h1>
          <p className="text-body-sm text-ink-variant mt-1 max-w-xl">
            {selectedType === "live"
              ? "Join live interactive cohorts with expert mentors, live doubt clearing, and hands-on projects."
              : selectedType === "self_paced"
              ? "Learn on your own schedule with recorded lessons, assignments, mentor support, and verifiable certificates."
              : "Browse every course with full details — no account needed. Create a free account when you're ready to enroll."}
          </p>
        </div>
        {!user && (
          <Link to={ROUTES.signup} className="shrink-0">
            <Button rightIcon="arrow_forward">Create free account</Button>
          </Link>
        )}
      </div>

      {/* Course Type Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-outlineVariant/30 pb-3 animate-slide-up">
        <button
          type="button"
          onClick={() => setCourseType("")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-body-sm transition-all ${
            !selectedType
              ? "bg-primary text-white shadow-sm font-semibold"
              : "bg-surface-container hover:bg-surface-containerHigh text-ink font-medium"
          }`}
        >
          <span className="icon text-[18px]">apps</span>
          All Courses
        </button>
        <button
          type="button"
          onClick={() => setCourseType("live")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-body-sm transition-all ${
            selectedType === "live"
              ? "bg-primary text-white shadow-sm font-semibold"
              : "bg-surface-container hover:bg-surface-containerHigh text-ink font-medium"
          }`}
        >
          <span className="icon text-[18px]">live_tv</span>
          Live Classes
        </button>
        <button
          type="button"
          onClick={() => setCourseType("self_paced")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-body-sm transition-all ${
            selectedType === "self_paced"
              ? "bg-primary text-white shadow-sm font-semibold"
              : "bg-surface-container hover:bg-surface-containerHigh text-ink font-medium"
          }`}
        >
          <span className="icon text-[18px]">play_circle</span>
          Self-paced Courses
        </button>
      </div>

      <div className="space-y-3 animate-slide-up" style={{ animationDelay: "40ms" }}>
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
          <Input
            placeholder="Search courses by title, category or language…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            leftIcon="search"
            containerClassName="flex-1 min-w-[200px]"
          />
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            options={[
              { value: "", label: "All categories" },
              ...availableCategories.map((cat) => ({ value: cat, label: cat })),
            ]}
            containerClassName="w-full md:w-56"
          />
          <Select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            options={[
              { value: "", label: "All languages of instruction" },
              ...availableLanguages.map((lang) => ({ value: lang, label: lang })),
            ]}
            containerClassName="w-full md:w-60"
          />
          {isFetching && !isLoading && (
            <span className="icon text-ink-outline animate-spin text-[20px] self-center">progress_activity</span>
          )}
        </div>

        <div className="flex flex-col gap-2 pt-1">
          {availableCategories.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-caption text-ink-outline mr-1 flex items-center gap-1">
                <span className="icon text-[14px]">category</span>
                Category:
              </span>
              <button
                type="button"
                onClick={() => setCategory("")}
                className={`px-3 py-1 rounded-full text-label font-medium transition-all ${
                  !category
                    ? "bg-primary text-white shadow-sm"
                    : "bg-surface-container hover:bg-surface-containerHigh text-ink"
                }`}
              >
                All
              </button>
              {availableCategories.map((cat) => {
                const isSelected = category.toLowerCase() === cat.toLowerCase();
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(isSelected ? "" : cat)}
                    className={`px-3 py-1 rounded-full text-label font-medium transition-all ${
                      isSelected
                        ? "bg-primary text-white shadow-sm"
                        : "bg-surface-container hover:bg-surface-containerHigh text-ink"
                    }`}
                  >
                    {cat}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {availableLanguages.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
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
              </div>
            )}

            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="text-label text-ink-outline hover:text-danger flex items-center gap-0.5 underline underline-offset-2 transition-colors py-1"
              >
                <span className="icon text-[14px]">clear</span>
                Clear filters
              </button>
            )}
          </div>
        </div>
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
              ? `No ${selectedType === "live" ? "live " : selectedType === "self_paced" ? "self-paced " : ""}courses found${
                  debounced ? ` matching "${debounced}"` : ""
                }${category ? ` in category "${category}"` : ""}${language ? ` with language "${language}"` : ""}. Try adjusting your filters.`
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
