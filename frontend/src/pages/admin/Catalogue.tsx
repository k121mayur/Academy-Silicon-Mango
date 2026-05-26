import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Card, CardBody } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { extractErrorMessage } from "@/lib/api";
import { CourseDTO, listCourses, togglePublishCourse } from "@/services/admin.service";
import { formatCurrency } from "@/lib/utils";

export default function AdminCatalogue() {
  const [items, setItems] = useState<CourseDTO[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const r = await listCourses({ limit: 50 });
      setItems(r.data);
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display font-bold text-display-md text-ink">Catalogue</h1>
        <p className="text-body-sm text-ink-variant">A student-eye view of your courses</p>
      </div>

      {loading ? (
        <p className="text-body-sm text-ink-outline">Loading…</p>
      ) : items.length === 0 ? (
        <EmptyState title="No courses yet" icon="auto_stories" />
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((c) => (
            <Card key={c.id} className="overflow-hidden">
              <div className="h-40 bg-gradient-to-br from-primary-container to-primary-fixed relative">
                {c.banner_url && <img src={c.banner_url} alt={c.title} className="absolute inset-0 w-full h-full object-cover" />}
                <div className="absolute top-3 left-3 right-3 flex items-center justify-between">
                  {c.category && <Badge tone="tertiary">{c.category}</Badge>}
                  <Badge tone={c.is_published ? "success" : "neutral"}>{c.is_published ? "Published" : "Draft"}</Badge>
                </div>
              </div>
              <CardBody>
                <p className="font-display font-semibold text-title-md text-ink">{c.title}</p>
                <p className="text-body-sm text-ink-variant line-clamp-2">{c.description || "—"}</p>
                <div className="flex items-center justify-between mt-3">
                  <span className="text-body-sm text-ink-variant">{c.duration_value} {c.duration_unit}</span>
                  <span className="font-mono font-semibold text-primary">
                    {formatCurrency(Number(c.price) - Number(c.discount || 0))}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant={c.is_published ? "outline" : "primary"}
                  fullWidth
                  className="mt-3"
                  onClick={async () => {
                    try {
                      await togglePublishCourse(c.id);
                      load();
                      toast.success(c.is_published ? "Unpublished" : "Published");
                    } catch (e) {
                      toast.error(extractErrorMessage(e));
                    }
                  }}
                >
                  {c.is_published ? "Unpublish" : "Publish"}
                </Button>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
