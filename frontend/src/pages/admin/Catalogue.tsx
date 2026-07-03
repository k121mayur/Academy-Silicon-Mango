import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Badge } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { extractErrorMessage } from "@/lib/api";
import { CourseDTO, listCourses, togglePublishCourse } from "@/services/admin.service";
import { formatCurrency } from "@/lib/utils";
import { CourseDetailModal } from "@/components/catalog/CourseDetailModal";
import { stripHtml } from "@/components/shared/RichTextView";

const PAGE_SIZE = 10;

export default function AdminCatalogue() {
  const [items, setItems] = useState<CourseDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ page: 1, pages: 1, total: 0, limit: PAGE_SIZE });
  const [categories, setCategories] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    try {
      const params: any = { page, limit: PAGE_SIZE };
      if (search) params.search = search;
      if (category) params.category = category;
      if (status) params.published = status === "published";
      const r = await listCourses(params);
      setItems(r.data);
      if (r.meta) setMeta(r.meta);
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, category, status, page]);

  // Populate the category dropdown from the full catalogue, independent of pagination.
  useEffect(() => {
    listCourses({ limit: 100 })
      .then((r) => {
        const set = new Set<string>();
        r.data.forEach((c) => c.category && set.add(c.category));
        setCategories(Array.from(set).sort());
      })
      .catch(() => {});
  }, []);

  const resetPage = () => setPage(1);

  const handleTogglePublish = async (c: CourseDTO) => {
    try {
      await togglePublishCourse(c.id);
      toast.success(c.is_published ? "Unpublished" : "Published");
      load();
    } catch (e) {
      toast.error(extractErrorMessage(e));
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display font-bold text-display-md text-ink">Catalogue</h1>
        <p className="text-body-sm text-ink-variant">
          A student-eye view of your courses. Click any card to preview the full course.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search by title, category, tag…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); resetPage(); }}
          leftIcon="search"
          containerClassName="flex-1 min-w-60"
        />
        <Select
          value={category}
          onChange={(e) => { setCategory(e.target.value); resetPage(); }}
          options={[
            { value: "", label: "All categories" },
            ...categories.map((c) => ({ value: c, label: c })),
          ]}
          containerClassName="w-48"
        />
        <Select
          value={status}
          onChange={(e) => { setStatus(e.target.value); resetPage(); }}
          options={[
            { value: "", label: "All status" },
            { value: "published", label: "Published" },
            { value: "draft", label: "Draft" },
          ]}
          containerClassName="w-40"
        />
      </div>

      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="bg-surface-containerLow rounded-2xl overflow-hidden animate-pulse"
            >
              <div className="h-48 bg-surface-container" />
              <div className="p-4 space-y-3">
                <div className="h-4 bg-surface-container rounded w-3/4" />
                <div className="h-3 bg-surface-container rounded w-full" />
                <div className="h-3 bg-surface-container rounded w-2/3" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          title={meta.total === 0 && !search && !category && !status ? "No courses yet" : "No matches"}
          description={
            meta.total === 0 && !search && !category && !status
              ? "Once you create courses, they'll appear here in a student-friendly view."
              : "Try clearing filters or a different search term."
          }
          icon="auto_stories"
        />
      ) : (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {items.map((c) => (
              <CourseCard key={c.id} course={c} onOpen={() => setOpenId(c.id)} />
            ))}
          </div>
          <Pagination page={meta.page} pages={meta.pages} total={meta.total} limit={meta.limit} onPageChange={setPage} />
        </>
      )}

      <CourseDetailModal
        courseId={openId}
        onClose={() => setOpenId(null)}
        onEdit={(id) => navigate(`/admin/courses/${id}/edit`)}
        onTogglePublish={async (course) => {
          await handleTogglePublish(course);
        }}
      />
    </div>
  );
}

function CourseCard({
  course,
  onOpen,
}: {
  course: CourseDTO;
  onOpen: () => void;
}) {
  const price = Number(course.price);
  const discount = Number(course.discount || 0);
  const finalPrice = Math.max(price - (price * discount) / 100, 0);
  const hasDiscount = discount > 0;
  const preview = stripHtml(course.description || "");

  return (
    <article
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group relative bg-surface-lowest rounded-2xl overflow-hidden border border-ink-outlineVariant/30 cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-modal hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 flex flex-col"
    >
      {/* Banner */}
      <div className="relative h-48 overflow-hidden bg-gradient-to-br from-primary-container via-secondary-container to-tertiary-container">
        {course.banner_url ? (
          <img
            src={course.banner_url}
            alt={course.title}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-primary-onContainer opacity-50">
            <span className="icon text-[64px]">menu_book</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

        <div className="absolute top-3 left-3 right-3 flex items-start justify-between gap-2">
          {course.category && (
            <span className="px-2.5 py-1 rounded-full text-label font-medium bg-white/95 text-ink backdrop-blur-sm shadow-sm">
              {course.category}
            </span>
          )}
          <span
            className={`px-2.5 py-1 rounded-full text-label font-medium backdrop-blur-sm shadow-sm ${
              course.is_published
                ? "bg-success/95 text-white"
                : "bg-white/90 text-ink-variant"
            }`}
          >
            {course.is_published ? "Live" : "Draft"}
          </span>
        </div>

        {hasDiscount && (
          <span className="absolute bottom-3 left-3 px-2.5 py-1 rounded-full text-label font-semibold bg-danger text-white shadow-md">
            {discount}% OFF
          </span>
        )}
      </div>

      {/* Body */}
      <div className="p-4 flex-1 flex flex-col">
        <h3 className="font-display font-semibold text-title-md text-ink line-clamp-2 group-hover:text-primary transition-colors min-h-[3rem]">
          {course.title}
        </h3>

        <p className="text-body-sm text-ink-variant line-clamp-2 mt-1.5 min-h-[2.5rem]">
          {preview || "—"}
        </p>

        {(course.tags || []).length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {course.tags.slice(0, 3).map((t) => (
              <Badge key={t} tone="neutral">{t}</Badge>
            ))}
            {course.tags.length > 3 && (
              <span className="text-label text-ink-outline self-center">
                +{course.tags.length - 3}
              </span>
            )}
          </div>
        )}

        <div className="flex items-center justify-between mt-auto pt-4 border-t border-ink-outlineVariant/30">
          <div className="flex items-center gap-3 text-body-sm text-ink-variant">
            <span className="flex items-center gap-1">
              <span className="icon text-[16px]">schedule</span>
              {course.duration_value} {course.duration_unit}
            </span>
            <span className="flex items-center gap-1">
              <span className="icon text-[16px]">
                {course.course_type === "self_paced" ? "self_improvement" : "live_tv"}
              </span>
              {course.course_type === "self_paced" ? "Self-paced" : "Live"}
            </span>
          </div>
          <div className="text-right">
            {hasDiscount && (
              <p className="text-label text-ink-outline line-through font-mono leading-tight">
                {formatCurrency(price)}
              </p>
            )}
            <p className="font-display font-bold text-title-md text-primary leading-tight">
              {formatCurrency(finalPrice)}
            </p>
          </div>
        </div>
      </div>

    </article>
  );
}
