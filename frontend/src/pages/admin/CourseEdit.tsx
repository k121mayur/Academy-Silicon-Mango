import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import CourseForm from "./CourseForm";
import { getCourse } from "@/services/admin.service";
import toast from "react-hot-toast";
import { extractErrorMessage } from "@/lib/api";

export default function CourseEdit() {
  const { id } = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    getCourse(id)
      .then(setData)
      .catch((e) => toast.error(extractErrorMessage(e)))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <p className="text-body-sm text-ink-outline">Loading…</p>;
  if (!data) return <p>Course not found</p>;
  return <CourseForm initial={data} isEdit />;
}
