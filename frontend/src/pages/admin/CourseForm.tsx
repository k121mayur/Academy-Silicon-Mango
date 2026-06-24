import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { extractErrorMessage } from "@/lib/api";
import {
  createCourse,
  updateCourse,
  uploadCourseBanner,
  uploadCourseSyllabus,
  togglePublishCourse,
} from "@/services/admin.service";
import { FileUpload } from "@/components/shared/FileUpload";
import { RichTextEditor } from "@/components/shared/RichTextEditor";
import { formatCurrency } from "@/lib/utils";
import { isYouTubeUrl } from "@/lib/media";

interface CourseFormProps {
  initial?: any;
  isEdit?: boolean;
}

export default function CourseForm({ initial, isEdit }: CourseFormProps) {
  const navigate = useNavigate();
  const [title, setTitle] = useState<string>(initial?.title || "");
  const [description, setDescription] = useState(initial?.description || "");
  const [category, setCategory] = useState(initial?.category || "");
  const [courseType, setCourseType] = useState(initial?.course_type || "live");
  const [durationUnit, setDurationUnit] = useState(initial?.duration_unit || "weeks");
  const [durationValue, setDurationValue] = useState<number>(initial?.duration_value || 4);
  const [price, setPrice] = useState<string>(String(initial?.price ?? ""));
  const [discount, setDiscount] = useState<string>(String(initial?.discount ?? "0"));
  const [tags, setTags] = useState<string[]>(initial?.tags || []);
  const [tagInput, setTagInput] = useState("");
  const [syllabus, setSyllabus] = useState<{ title: string; description?: string }[]>(
    initial?.syllabus_items || []
  );
  const [faqs, setFaqs] = useState<{ question: string; answer: string }[]>(initial?.faqs || []);
  const [criteria, setCriteria] = useState<{ text: string }[]>(initial?.certification_criteria || []);
  const [submitting, setSubmitting] = useState(false);
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [syllabusFile, setSyllabusFile] = useState<File | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(initial?.banner_url || null);
  const [syllabusUrl, setSyllabusUrl] = useState<string | null>(initial?.syllabus_pdf_url || null);
  const [demoUrl, setDemoUrl] = useState<string>(initial?.demo_youtube_url || "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const clearErr = (field: string) => setErrors((prev) => { const n = { ...prev }; delete n[field]; return n; });

  const addTag = () => {
    const t = tagInput.trim();
    if (!t || tags.includes(t)) return;
    setTags([...tags, t]);
    setTagInput("");
  };

  function stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = "Title is required";
    if (!category.trim()) e.category = "Category is required";
    if (!courseType) e.courseType = "Course type is required";
    if (!description || !stripHtml(description)) e.description = "Description is required";
    if (!durationUnit) e.durationUnit = "Duration unit is required";
    if (!durationValue || durationValue < 1) e.durationValue = "Duration must be at least 1";

    if (price === "" || price === null || price === undefined) {
      e.price = "Price is required";
    } else {
      const priceVal = parseFloat(price);
      if (isNaN(priceVal) || priceVal < 0) e.price = "Price must be a valid non-negative number";
    }
    if (discount === "" || discount === null || discount === undefined) {
      e.discount = "Discount is required (use 0 for no discount)";
    } else {
      const discountVal = parseFloat(discount);
      if (isNaN(discountVal) || discountVal < 0 || discountVal > 100) {
        e.discount = "Discount must be between 0 and 100";
      }
    }

    if (!bannerFile && !bannerUrl) e.banner = "Banner image is required";
    if (!syllabusFile && !syllabusUrl) e.syllabusPdf = "Syllabus PDF is required";

    if (demoUrl.trim() && !isYouTubeUrl(demoUrl.trim())) {
      e.demoUrl = "Enter a valid YouTube URL (or leave blank)";
    }

    if (tags.length === 0) e.tags = "At least one tag is required";

    if (syllabus.length === 0) {
      e.syllabusItems = "At least one syllabus item is required";
    } else {
      syllabus.forEach((s, i) => {
        if (!s.title.trim()) e[`syllabus_${i}`] = `Module ${i + 1}: title is required`;
      });
    }

    if (criteria.length === 0) {
      e.criteriaList = "At least one certification criterion is required";
    } else {
      criteria.forEach((c, i) => {
        if (!c.text.trim()) e[`crit_${i}`] = `Criterion ${i + 1}: text is required`;
      });
    }

    faqs.forEach((f, i) => {
      if (!f.question.trim()) e[`faq_q_${i}`] = `FAQ ${i + 1}: question is required`;
      if (!f.answer.trim()) e[`faq_a_${i}`] = `FAQ ${i + 1}: answer is required`;
    });

    setErrors(e);
    if (Object.keys(e).length > 0) {
      const first = Object.values(e)[0];
      toast.error(first);
    }
    return Object.keys(e).length === 0;
  }

  const submit = async (publishAfter: boolean) => {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const payload: any = {
        title,
        description,
        category,
        course_type: courseType,
        duration_unit: durationUnit,
        duration_value: durationValue,
        price: price || "0",
        discount: discount || "0",
        demo_youtube_url: demoUrl.trim() || null,
        tags,
        syllabus_items: syllabus.map((s, i) => ({ order: i, title: s.title, description: s.description || "" })),
        faqs: faqs.map((f, i) => ({ order: i, question: f.question, answer: f.answer })),
        certification_criteria: criteria.map((c, i) => ({ order: i, text: c.text })),
      };
      let course: any;
      if (isEdit && initial?.id) {
        course = await updateCourse(initial.id, payload);
      } else {
        course = await createCourse(payload);
      }

      if (bannerFile) await uploadCourseBanner(course.id, bannerFile);
      if (syllabusFile) await uploadCourseSyllabus(course.id, syllabusFile);
      if (publishAfter && !course.is_published) {
        await togglePublishCourse(course.id);
      }
      toast.success(isEdit ? "Course updated" : publishAfter ? "Course published" : "Course saved");
      navigate("/admin/courses");
    } catch (e) {
      toast.error(extractErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit(false);
  };

  const priceNum = parseFloat(price || "0");
  const discountPct = Math.min(parseFloat(discount || "0"), 100);
  const finalPrice = Math.max(priceNum - (priceNum * discountPct) / 100, 0);

  return (
    <form onSubmit={onSubmit} className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display font-bold text-display-md text-ink">
            {isEdit ? "Edit Course" : "Create Course"}
          </h1>
          <p className="text-body-sm text-ink-variant">Build your course content and publish when ready</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={() => navigate("/admin/courses")}>Cancel</Button>
          <Button type="submit" variant="outline" loading={submitting}>Save as Draft</Button>
          <Button type="button" onClick={() => submit(true)} loading={submitting}>{isEdit ? "Save & Publish" : "Save & Publish"}</Button>
        </div>
      </div>

      <Card>
        <CardHeader><p className="text-title-md font-semibold">Basic Info</p></CardHeader>
        <CardBody className="grid md:grid-cols-2 gap-4">
          <Input label="Title" value={title} onChange={(e) => { setTitle(e.target.value); clearErr("title"); }} containerClassName="md:col-span-2" error={errors.title} />
          <Input label="Category" value={category} onChange={(e) => { setCategory(e.target.value); clearErr("category"); }} placeholder="e.g. Web Development" error={errors.category} />
          <Select
            label="Course Type"
            value={courseType}
            onChange={(e) => { setCourseType(e.target.value); clearErr("courseType"); }}
            options={[{ value: "live", label: "Live cohort" }, { value: "self_paced", label: "Self-paced" }]}
            error={errors.courseType}
          />
          <div className="md:col-span-2">
            <RichTextEditor label="Description" value={description} onChange={(v) => { setDescription(v); clearErr("description"); }} placeholder="Describe what students will learn in this course…" minHeight={160} />
            {errors.description && <p className="text-label text-danger mt-1">{errors.description}</p>}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><p className="text-title-md font-semibold">Duration & Pricing</p></CardHeader>
        <CardBody className="grid md:grid-cols-3 gap-4">
          <Select
            label="Duration Unit"
            value={durationUnit}
            onChange={(e) => { setDurationUnit(e.target.value); clearErr("durationUnit"); }}
            options={[{ value: "weeks", label: "Weeks" }, { value: "days", label: "Days" }]}
            error={errors.durationUnit}
          />
          <Input label="Duration" type="number" min={1} max={104} value={durationValue} onChange={(e) => { setDurationValue(parseInt(e.target.value) || 0); clearErr("durationValue"); }} error={errors.durationValue} />
          <div />
          <Input label="Price (INR)" type="number" min={0} value={price} onChange={(e) => { setPrice(e.target.value); clearErr("price"); }} leftIcon="currency_rupee" error={errors.price} />
          <Input label="Discount (%)" type="number" min={0} max={100} value={discount} onChange={(e) => { setDiscount(e.target.value); clearErr("discount"); }} leftIcon="percent" error={errors.discount} />
          <div className="flex flex-col justify-end">
            <p className="text-label text-ink-outline">Final price</p>
            <p className="font-display font-bold text-title-lg text-primary">{formatCurrency(finalPrice)}</p>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader><p className="text-title-md font-semibold">Media</p></CardHeader>
        <CardBody className="grid md:grid-cols-2 gap-4">
          <div>
            <FileUpload
              label="Banner image"
              accept="image/*"
              value={bannerUrl ? `${bannerUrl}` : null}
              onChange={(f) => { setBannerFile(f); clearErr("banner"); }}
              onClear={() => { setBannerFile(null); setBannerUrl(null); }}
              hint="PNG/JPG · 16:9 recommended"
            />
            {errors.banner && <p className="text-label text-danger mt-1">{errors.banner}</p>}
          </div>
          <div>
            <FileUpload
              label="Syllabus PDF"
              accept="application/pdf"
              value={syllabusUrl}
              onChange={(f) => { setSyllabusFile(f); clearErr("syllabusPdf"); }}
              onClear={() => { setSyllabusFile(null); setSyllabusUrl(null); }}
              hint="PDF only"
              preview={false}
            />
            {errors.syllabusPdf && <p className="text-label text-danger mt-1">{errors.syllabusPdf}</p>}
          </div>
          <Input
            label="Demo Session YouTube URL"
            value={demoUrl}
            onChange={(e) => { setDemoUrl(e.target.value); clearErr("demoUrl"); }}
            placeholder="https://youtu.be/…  (optional course preview)"
            leftIcon="play_circle"
            containerClassName="md:col-span-2"
            hint="Shown as a 'Demo Session' tab on the course page. Leave blank to hide the tab."
            error={errors.demoUrl}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader><p className="text-title-md font-semibold">Tags</p></CardHeader>
        <CardBody className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="Add a tag and press Enter"
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); clearErr("tags"); } }}
              containerClassName="flex-1"
            />
            <Button type="button" onClick={() => { addTag(); clearErr("tags"); }} variant="outline">Add</Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {tags.map((t, i) => (
              <Badge key={i} tone="primary">
                {t}
                <button type="button" onClick={() => setTags(tags.filter((_, j) => j !== i))} className="ml-1 hover:text-danger">
                  <span className="icon text-[14px]">close</span>
                </button>
              </Badge>
            ))}
            {tags.length === 0 && <span className="text-label text-ink-outline">No tags yet</span>}
          </div>
          {errors.tags && <p className="text-label text-danger">{errors.tags}</p>}
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <p className="text-title-md font-semibold">Syllabus</p>
          <Button type="button" size="sm" variant="outline" leftIcon="add" onClick={() => { setSyllabus([...syllabus, { title: "", description: "" }]); clearErr("syllabusItems"); }}>
            Add item
          </Button>
        </CardHeader>
        <CardBody className="space-y-3">
          {syllabus.length === 0 && <p className="text-body-sm text-ink-outline">No items yet — add modules / lessons</p>}
          {errors.syllabusItems && <p className="text-label text-danger">{errors.syllabusItems}</p>}
          {syllabus.map((s, i) => (
            <div key={i} className="bg-surface-containerLow rounded-xl p-3 space-y-2">
              <div className="flex gap-2 items-center">
                <span className="text-label text-ink-outline">{i + 1}.</span>
                <Input
                  value={s.title}
                  onChange={(e) => { setSyllabus(syllabus.map((x, j) => j === i ? { ...x, title: e.target.value } : x)); clearErr(`syllabus_${i}`); }}
                  placeholder="Module title"
                  containerClassName="flex-1"
                  className="font-bold text-[15px]"
                  error={errors[`syllabus_${i}`]}
                />
                <Button type="button" variant="ghost" leftIcon="delete" onClick={() => setSyllabus(syllabus.filter((_, j) => j !== i))} className="text-danger" />
              </div>
              <RichTextEditor
                value={s.description || ""}
                onChange={(html) => setSyllabus(syllabus.map((x, j) => j === i ? { ...x, description: html } : x))}
                placeholder="Brief description (optional)"
                minHeight={80}
              />
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <p className="text-title-md font-semibold">FAQs</p>
          <Button type="button" size="sm" variant="outline" leftIcon="add" onClick={() => setFaqs([...faqs, { question: "", answer: "" }])}>
            Add FAQ
          </Button>
        </CardHeader>
        <CardBody className="space-y-3">
          {faqs.map((f, i) => (
            <div key={i} className="bg-surface-containerLow rounded-xl p-3 space-y-2">
              <div className="flex gap-2">
                <Input value={f.question} onChange={(e) => { setFaqs(faqs.map((x, j) => j === i ? { ...x, question: e.target.value } : x)); clearErr(`faq_q_${i}`); }} placeholder="Question" containerClassName="flex-1" error={errors[`faq_q_${i}`]} />
                <Button type="button" variant="ghost" leftIcon="delete" onClick={() => setFaqs(faqs.filter((_, j) => j !== i))} className="text-danger" />
              </div>
              <Textarea value={f.answer} onChange={(e) => { setFaqs(faqs.map((x, j) => j === i ? { ...x, answer: e.target.value } : x)); clearErr(`faq_a_${i}`); }} placeholder="Answer" rows={2} error={errors[`faq_a_${i}`]} />
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader className="flex items-center justify-between">
          <p className="text-title-md font-semibold">Certification Criteria</p>
          <Button type="button" size="sm" variant="outline" leftIcon="add" onClick={() => { setCriteria([...criteria, { text: "" }]); clearErr("criteriaList"); }}>
            Add criterion
          </Button>
        </CardHeader>
        <CardBody className="space-y-2">
          {criteria.length === 0 && <p className="text-body-sm text-ink-outline">No criteria yet — add at least one</p>}
          {errors.criteriaList && <p className="text-label text-danger">{errors.criteriaList}</p>}
          {criteria.map((c, i) => (
            <div key={i} className="flex gap-2">
              <span className="text-label text-ink-outline pt-3">{i + 1}.</span>
              <Input value={c.text} onChange={(e) => { setCriteria(criteria.map((x, j) => j === i ? { ...x, text: e.target.value } : x)); clearErr(`crit_${i}`); }} placeholder="Criterion text" containerClassName="flex-1" error={errors[`crit_${i}`]} />
              <Button type="button" variant="ghost" leftIcon="delete" onClick={() => setCriteria(criteria.filter((_, j) => j !== i))} className="text-danger" />
            </div>
          ))}
        </CardBody>
      </Card>
    </form>
  );
}
