import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { Input } from "@/components/ui/Input";
import { EmptyState } from "@/components/ui/EmptyState";
import { BlogCard, BlogCardSkeleton } from "@/components/blog/BlogCard";
import { QueryErrorState } from "@/components/student/QueryErrorState";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { qk } from "@/lib/queryKeys";
import { listPublicBlogs } from "@/services/blog.service";

/**
 * Public blog index — searchable, newest-first. Search matches title, content,
 * excerpt, author, slug and tags (handled server-side).
 */
export default function BlogListing() {
  const [search, setSearch] = useState("");
  const debounced = useDebouncedValue(search, 250);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: qk.public.blogs(debounced),
    queryFn: () => listPublicBlogs(debounced),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const blogs = data ?? [];

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-10 md:py-14 space-y-6">
      <div className="animate-slide-up">
        <p className="text-caption text-tertiary mb-2">BLOG</p>
        <h1 className="font-display font-bold text-display-md md:text-display-lg text-ink">From the Silicon Mango blog</h1>
        <p className="text-body-sm text-ink-variant mt-1 max-w-xl">
          Tutorials, stories and updates from our instructors and community.
        </p>
      </div>

      <div className="flex items-center gap-3 animate-slide-up" style={{ animationDelay: "40ms" }}>
        <Input
          placeholder="Search posts by title, content, tags or author…"
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
        <QueryErrorState error={error} onRetry={() => refetch()} title="Couldn't load posts" />
      ) : isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <BlogCardSkeleton key={i} />
          ))}
        </div>
      ) : blogs.length === 0 ? (
        <EmptyState
          title={debounced ? "No matches" : "No posts yet"}
          description={debounced ? "Try a different search term." : "New posts are on the way — check back soon."}
          icon="article"
        />
      ) : (
        <div className="space-y-4">
          {blogs.map((b) => (
            <BlogCard key={b.id} blog={b} />
          ))}
        </div>
      )}
    </div>
  );
}
