import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { RichTextView } from "@/components/shared/RichTextView";
import { absoluteApiUrl } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { normalizeImageUrl } from "@/lib/media";
import { qk } from "@/lib/queryKeys";
import { getPublicBlog } from "@/services/blog.service";

export default function BlogDetail() {
  const { slug } = useParams<{ slug: string }>();

  const { data: blog, isLoading, isError } = useQuery({
    queryKey: qk.public.blog(slug || ""),
    queryFn: () => getPublicBlog(slug as string),
    enabled: !!slug,
    staleTime: 60_000,
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-[50vh] grid place-items-center">
        <Spinner size={28} className="text-primary" />
      </div>
    );
  }

  if (isError || !blog) {
    return (
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-16">
        <EmptyState
          title="Post not found"
          description="This post may have been unpublished or the link is incorrect."
          icon="article"
          action={
            <Link to="/blog">
              <Button variant="outline" leftIcon="arrow_back">Back to blog</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const thumb = blog.thumbnail_url ? absoluteApiUrl(normalizeImageUrl(blog.thumbnail_url)) : null;

  return (
    <article className="max-w-3xl mx-auto px-4 md:px-6 py-10 md:py-14">
      <Link to="/blog" className="text-body-sm text-primary hover:underline inline-flex items-center gap-1 mb-6">
        <span className="icon text-[16px]">arrow_back</span> All posts
      </Link>

      <header className="space-y-4">
        <h1 className="font-display font-extrabold text-display-md md:text-display-lg text-ink leading-tight">
          {blog.title}
        </h1>

        <div className="flex items-center gap-4 text-body-sm text-ink-variant flex-wrap">
          <span className="inline-flex items-center gap-1.5">
            <span className="icon text-[18px]">person</span>
            {blog.author}
          </span>
          {blog.published_at && (
            <span className="inline-flex items-center gap-1.5">
              <span className="icon text-[18px]">calendar_today</span>
              {formatDate(blog.published_at)}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5">
            <span className="icon text-[18px]">visibility</span>
            {blog.view_count} views
          </span>
        </div>

        {(blog.tags || []).length > 0 && (
          <div className="flex flex-wrap gap-2">
            {blog.tags.map((t) => (
              <Badge key={t} tone="primary">{t}</Badge>
            ))}
          </div>
        )}
      </header>

      {thumb && (
        <img
          src={thumb}
          alt={blog.title}
          referrerPolicy="no-referrer"
          className="w-full rounded-2xl mt-6 mb-2 object-cover max-h-[460px]"
        />
      )}

      {/* Body — rendered as sanitized HTML so formatting (bold, headings, lists,
          images, YouTube) shows correctly; never as escaped/raw tags. */}
      <RichTextView html={blog.content} allowMedia className="rich-text--article mt-6" />
    </article>
  );
}
