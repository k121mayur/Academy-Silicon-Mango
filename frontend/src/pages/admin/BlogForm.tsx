import { FormEvent, KeyboardEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Spinner } from "@/components/ui/Spinner";
import { FileUpload } from "@/components/shared/FileUpload";
import { RichTextEditor } from "@/components/shared/RichTextEditor";
import { extractErrorMessage, absoluteApiUrl } from "@/lib/api";
import { normalizeImageUrl } from "@/lib/media";
import {
  BlogFormPayload,
  createBlog,
  getBlog,
  updateBlog,
  uploadBlogImage,
} from "@/services/blog.service";

/** Frontend mirror of the backend slugify — preview only; the server is authoritative. */
function slugifyPreview(s: string): string {
  return (
    s
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .toLowerCase()
      .replace(/[-\s]+/g, "-") || "untitled"
  );
}

const isEmptyHtml = (html: string) => !html.trim() || html.trim() === "<p></p>";

export default function BlogForm() {
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;
  const nav = useNavigate();

  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [excerpt, setExcerpt] = useState("");
  const [content, setContent] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [thumbnailUrl, setThumbnailUrl] = useState("");
  const [isPublished, setIsPublished] = useState(false);
  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [uploadingThumb, setUploadingThumb] = useState(false);

  useEffect(() => {
    if (!isEdit || !id) return;
    setLoading(true);
    getBlog(id)
      .then((b) => {
        setTitle(b.title);
        setAuthor(b.author);
        setExcerpt(b.excerpt || "");
        setContent(b.content || "");
        setTags(b.tags || []);
        setThumbnailUrl(b.thumbnail_url || "");
        setIsPublished(b.is_published);
      })
      .catch((e) => toast.error(extractErrorMessage(e, "Failed to load post")))
      .finally(() => setLoading(false));
  }, [id, isEdit]);

  const addTag = (raw: string) => {
    const t = raw.trim().replace(/,$/, "").trim();
    if (!t) return;
    setTags((prev) => (prev.some((x) => x.toLowerCase() === t.toLowerCase()) ? prev : [...prev, t]));
    setTagInput("");
  };

  const onTagKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagInput);
    } else if (e.key === "Backspace" && !tagInput && tags.length) {
      setTags((prev) => prev.slice(0, -1));
    }
  };

  const handleThumbFile = async (file: File) => {
    setUploadingThumb(true);
    try {
      const url = await uploadBlogImage(file);
      setThumbnailUrl(url);
      toast.success("Thumbnail uploaded");
    } catch (e) {
      toast.error(extractErrorMessage(e, "Upload failed"));
    } finally {
      setUploadingThumb(false);
    }
  };

  const validate = (): boolean => {
    const fail = (msg: string) => {
      toast.error(msg);
      return false;
    };
    if (!title.trim()) return fail("Title is required");
    if (!author.trim()) return fail("Author is required");
    if (isEmptyHtml(content)) return fail("Content is required");
    return true;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const payload: BlogFormPayload = {
        title: title.trim(),
        author: author.trim(),
        excerpt: excerpt.trim() || null,
        content,
        tags,
        thumbnail_url: thumbnailUrl.trim() || null,
        is_published: isPublished,
      };
      if (isEdit && id) {
        await updateBlog(id, payload);
      } else {
        await createBlog(payload);
      }
      toast.success(isEdit ? "Post saved" : "Post created");
      nav("/admin/blog");
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[40vh] grid place-items-center">
        <Spinner size={28} className="text-primary" />
      </div>
    );
  }

  const thumbPreview = thumbnailUrl ? absoluteApiUrl(normalizeImageUrl(thumbnailUrl)) : null;

  return (
    <form onSubmit={submit} className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <Link to="/admin/blog" className="text-body-sm text-primary hover:underline inline-flex items-center gap-1">
            <span className="icon text-[16px]">arrow_back</span> Blog Posts
          </Link>
          <h1 className="font-display font-bold text-display-md text-ink">{isEdit ? "Edit post" : "New post"}</h1>
        </div>
        <Button type="submit" loading={saving} leftIcon="save">
          {isEdit ? "Save changes" : "Create post"}
        </Button>
      </div>

      {/* Basics */}
      <Card>
        <CardHeader>
          <h2 className="font-display font-semibold text-title-lg text-ink">Post details</h2>
        </CardHeader>
        <CardBody className="space-y-4">
          <div>
            <Input
              label="Title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="How we built our video pipeline"
            />
            {title.trim() && (
              <p className="text-label text-ink-outline mt-1">
                Slug preview: <span className="font-mono text-ink-variant">/{slugifyPreview(title)}</span>
              </p>
            )}
          </div>

          <Input
            label="Author"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Jane Doe"
            leftIcon="person"
          />

          <Input
            label="Excerpt / introduction (optional)"
            value={excerpt}
            onChange={(e) => setExcerpt(e.target.value)}
            placeholder="A short summary shown on blog cards"
            hint="Shown on the blog listing cards. If left blank, only the title is shown."
          />

          {/* Tags */}
          <div className="flex flex-col gap-1.5">
            <label className="text-label text-ink-variant font-medium">Tags (optional)</label>
            <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-ink-outlineVariant bg-surface-lowest px-2.5 py-2 focus-within:border-primary focus-within:ring-4 focus-within:ring-primary-container/30 transition-colors">
              {tags.map((t) => (
                <Badge key={t} tone="primary" className="gap-1">
                  {t}
                  <button
                    type="button"
                    onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
                    className="grid place-items-center hover:text-danger"
                    aria-label={`Remove ${t}`}
                  >
                    <span className="icon text-[14px]">close</span>
                  </button>
                </Badge>
              ))}
              <input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={onTagKeyDown}
                onBlur={() => addTag(tagInput)}
                placeholder={tags.length ? "Add another…" : "Type a tag and press Enter"}
                className="flex-1 min-w-[8rem] bg-transparent text-body-sm text-ink placeholder:text-ink-outline focus:outline-none h-7"
              />
            </div>
            <p className="text-label text-ink-outline">Press Enter or comma to add. Tags are searchable on the public blog.</p>
          </div>
        </CardBody>
      </Card>

      {/* Thumbnail */}
      <Card>
        <CardHeader>
          <h2 className="font-display font-semibold text-title-lg text-ink">Thumbnail</h2>
        </CardHeader>
        <CardBody className="space-y-4">
          <Input
            label="Image link (optional)"
            value={thumbnailUrl}
            onChange={(e) => setThumbnailUrl(e.target.value)}
            placeholder="Paste any image link (incl. a Google Drive share link)"
            leftIcon="link"
          />
          <div className="flex items-center gap-2">
            <div className="flex-1 h-px bg-ink-outlineVariant/40" />
            <span className="text-label text-ink-outline">or upload</span>
            <div className="flex-1 h-px bg-ink-outlineVariant/40" />
          </div>
          <FileUpload
            label={uploadingThumb ? "Uploading…" : "Upload an image"}
            accept="image/*"
            preview={false}
            onChange={handleThumbFile}
          />
          {thumbPreview && (
            <div className="space-y-2">
              <p className="text-label text-ink-variant font-medium">Preview</p>
              <div className="relative inline-block">
                <img
                  src={thumbPreview}
                  alt="Thumbnail preview"
                  referrerPolicy="no-referrer"
                  className="max-h-48 rounded-xl border border-ink-outlineVariant/40 object-cover"
                />
                <button
                  type="button"
                  onClick={() => setThumbnailUrl("")}
                  title="Remove thumbnail"
                  className="absolute -top-2 -right-2 w-7 h-7 grid place-items-center rounded-full bg-surface-lowest border border-ink-outlineVariant shadow-card text-ink-outline hover:text-danger"
                >
                  <span className="icon text-[16px]">close</span>
                </button>
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      {/* Content */}
      <Card>
        <CardHeader>
          <h2 className="font-display font-semibold text-title-lg text-ink">Content</h2>
        </CardHeader>
        <CardBody>
          <RichTextEditor
            value={content}
            onChange={setContent}
            enableMedia
            onImageUpload={uploadBlogImage}
            placeholder="Write your post… use the toolbar to add images and YouTube videos."
            minHeight={320}
          />
        </CardBody>
      </Card>

      {/* Publish */}
      <Card>
        <CardBody>
          <label className="flex items-center gap-2 text-body-sm text-ink">
            <input
              type="checkbox"
              checked={isPublished}
              onChange={(e) => setIsPublished(e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            Publish now (visible on the public blog). Leave unchecked to save as a draft.
          </label>
        </CardBody>
      </Card>

      <div className="flex justify-end gap-2">
        <Link to="/admin/blog">
          <Button type="button" variant="ghost">Cancel</Button>
        </Link>
        <Button type="submit" loading={saving} leftIcon="save">
          {isEdit ? "Save changes" : "Create post"}
        </Button>
      </div>
    </form>
  );
}
