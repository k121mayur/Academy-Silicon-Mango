import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/Badge";
import { absoluteApiUrl } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { normalizeImageUrl } from "@/lib/media";
import { queryClient } from "@/lib/queryClient";
import { qk } from "@/lib/queryKeys";
import { stripHtml } from "@/components/shared/RichTextView";
import { getPublicBlog, type BlogCardDTO } from "@/services/blog.service";

export function BlogCard({ blog }: { blog: BlogCardDTO }) {
  const href = `/blog/${blog.slug}`;
  const thumb = blog.thumbnail_url ? absoluteApiUrl(normalizeImageUrl(blog.thumbnail_url)) : null;
  const excerpt = stripHtml(blog.excerpt || "");

  const prefetch = () => {
    queryClient.prefetchQuery({ queryKey: qk.public.blog(blog.slug), queryFn: () => getPublicBlog(blog.slug) });
  };

  return (
    <Link
      to={href}
      onMouseEnter={prefetch}
      onFocus={prefetch}
      className="group flex gap-4 sm:gap-6 bg-surface-lowest rounded-2xl border border-ink-outlineVariant/40 shadow-card overflow-hidden p-3 sm:p-4 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card-hover hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
    >
      {/* Thumbnail (left) */}
      <div className="relative w-28 sm:w-48 md:w-60 shrink-0 rounded-xl overflow-hidden bg-gradient-to-br from-primary-container via-secondary-container to-tertiary-container self-stretch min-h-[6rem]">
        {thumb ? (
          <img
            src={thumb}
            alt={blog.title}
            loading="lazy"
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-primary-onContainer/50">
            <span className="icon text-[40px]">article</span>
          </div>
        )}
      </div>

      {/* Content (right) */}
      <div className="flex-1 min-w-0 flex flex-col py-1">
        <h3 className="font-display font-semibold text-title-md sm:text-title-lg text-ink line-clamp-2 group-hover:text-primary transition-colors">
          {blog.title}
        </h3>
        {excerpt && (
          <p className="text-body-sm text-ink-variant line-clamp-2 sm:line-clamp-3 mt-1.5">{excerpt}</p>
        )}

        {(blog.tags || []).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {blog.tags.slice(0, 4).map((t) => (
              <Badge key={t} tone="primary">{t}</Badge>
            ))}
            {blog.tags.length > 4 && (
              <span className="text-label text-ink-outline self-center">+{blog.tags.length - 4}</span>
            )}
          </div>
        )}

        <div className="flex items-center gap-3 text-label text-ink-outline mt-auto pt-3 flex-wrap">
          <span className="inline-flex items-center gap-1">
            <span className="icon text-[14px]">person</span>
            {blog.author}
          </span>
          {blog.published_at && (
            <span className="inline-flex items-center gap-1">
              <span className="icon text-[14px]">calendar_today</span>
              {formatDate(blog.published_at)}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <span className="icon text-[14px]">visibility</span>
            {blog.view_count}
          </span>
        </div>
      </div>
    </Link>
  );
}

export function BlogCardSkeleton() {
  return (
    <div className="flex gap-4 sm:gap-6 bg-surface-lowest rounded-2xl border border-ink-outlineVariant/40 p-3 sm:p-4 animate-pulse">
      <div className="w-28 sm:w-48 md:w-60 shrink-0 rounded-xl bg-surface-container min-h-[6rem]" />
      <div className="flex-1 space-y-3 py-1">
        <div className="h-5 bg-surface-container rounded w-3/4" />
        <div className="h-3 bg-surface-container rounded w-full" />
        <div className="h-3 bg-surface-container rounded w-2/3" />
        <div className="h-3 bg-surface-container rounded w-1/3 mt-4" />
      </div>
    </div>
  );
}
