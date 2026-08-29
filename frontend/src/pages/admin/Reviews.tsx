import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { Table, THead, TR, TH, TD } from "@/components/ui/Table";
import { Modal } from "@/components/ui/Modal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { Spinner } from "@/components/ui/Spinner";
import { formatDate } from "@/lib/utils";
import { extractErrorMessage } from "@/lib/api";
import {
  ReviewDTO,
  ReviewCommentDTO,
  listAdminReviews,
  deleteAdminReview,
  addReviewComment,
  deleteReviewComment,
} from "@/services/review.service";

function StarRating({ count = 5 }: { count?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={`icon leading-none text-[15px] ${i < count ? "text-primary-fill" : "text-ink-outlineVariant/40"}`}
          style={{ fontVariationSettings: i < count ? "'FILL' 1" : "'FILL' 0" }}
        >
          star
        </span>
      ))}
    </span>
  );
}

export default function AdminReviews() {
  const [items, setItems] = useState<ReviewDTO[]>([]);
  const [stats, setStats] = useState({
    total_reviews: 0,
    average_rating: 5.0,
    star_counts: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 } as Record<string, number>,
  });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [limit] = useState(20);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const [search, setSearch] = useState("");
  const [ratingFilter, setRatingFilter] = useState("");

  // Modals
  const [selectedReview, setSelectedReview] = useState<ReviewDTO | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ReviewDTO | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);

  // Admin reply in modal
  const [replyText, setReplyText] = useState("");
  const [busyReply, setBusyReply] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params: any = { page, limit };
      if (search.trim()) params.search = search.trim();
      if (ratingFilter) params.rating = Number(ratingFilter);

      const res = await listAdminReviews(params);
      setItems(res.data);
      if (res.stats) {
        setStats(res.stats);
      }
      if (res.meta) {
        setTotalPages(res.meta.pages);
        setTotalItems(res.meta.total);
      }
    } catch (e) {
      toast.error(extractErrorMessage(e, "Failed to load reviews"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, ratingFilter]);

  const onDelete = async () => {
    if (!confirmDelete) return;
    setBusyDelete(true);
    try {
      await deleteAdminReview(confirmDelete.id);
      toast.success("Review deleted successfully");
      setConfirmDelete(null);
      if (selectedReview?.id === confirmDelete.id) {
        setSelectedReview(null);
      }
      fetchData();
    } catch (e) {
      toast.error(extractErrorMessage(e, "Failed to delete review"));
    } finally {
      setBusyDelete(false);
    }
  };

  const onAddReply = async () => {
    if (!selectedReview || !replyText.trim()) return;
    setBusyReply(true);
    try {
      const newComment = await addReviewComment(selectedReview.id, {
        comment_text: replyText.trim(),
      });
      toast.success("Reply added");
      setReplyText("");
      // Update selected review's comment list
      setSelectedReview({
        ...selectedReview,
        comments: [...(selectedReview.comments || []), newComment],
      });
      fetchData();
    } catch (e) {
      toast.error(extractErrorMessage(e, "Failed to add reply"));
    } finally {
      setBusyReply(false);
    }
  };

  const onDeleteComment = async (commentId: string) => {
    if (!selectedReview) return;
    try {
      await deleteReviewComment(selectedReview.id, commentId);
      toast.success("Comment deleted");
      setSelectedReview({
        ...selectedReview,
        comments: selectedReview.comments.filter((c) => c.id !== commentId),
      });
      fetchData();
    } catch (e) {
      toast.error(extractErrorMessage(e, "Failed to delete comment"));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display font-bold text-display-md text-ink">Learner Reviews</h1>
          <p className="text-body-sm text-ink-variant">
            Manage testimonials, filter by star ratings, respond to feedback, and remove reviews
          </p>
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface-lowest p-5 rounded-2xl border border-ink-outlineVariant/30 shadow-card">
          <p className="text-caption text-ink-outline mb-1">TOTAL REVIEWS</p>
          <p className="font-display font-extrabold text-headline text-ink">{stats.total_reviews}</p>
        </div>
        <div className="bg-surface-lowest p-5 rounded-2xl border border-ink-outlineVariant/30 shadow-card">
          <p className="text-caption text-ink-outline mb-1">AVERAGE RATING</p>
          <div className="flex items-center gap-2">
            <p className="font-display font-extrabold text-headline text-ink">
              {stats.average_rating > 0 ? stats.average_rating.toFixed(1) : "5.0"}
            </p>
            <span className="icon text-primary-fill text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              star
            </span>
          </div>
        </div>
        <div className="bg-surface-lowest p-5 rounded-2xl border border-ink-outlineVariant/30 shadow-card">
          <p className="text-caption text-ink-outline mb-1">5-STAR REVIEWS</p>
          <p className="font-display font-extrabold text-headline text-ink">
            {stats.star_counts["5"] || 0}
          </p>
        </div>
        <div className="bg-surface-lowest p-5 rounded-2xl border border-ink-outlineVariant/30 shadow-card">
          <p className="text-caption text-ink-outline mb-1">4-STAR REVIEWS</p>
          <p className="font-display font-extrabold text-headline text-ink">
            {stats.star_counts["4"] || 0}
          </p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-wrap gap-3">
        <Input
          placeholder="Search by reviewer name, designation, company or review content..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          leftIcon="search"
          containerClassName="flex-1 min-w-64"
        />
        <Select
          value={ratingFilter}
          onChange={(e) => {
            setRatingFilter(e.target.value);
            setPage(1);
          }}
          options={[
            { value: "", label: "All ratings" },
            { value: "5", label: "5 Stars (★★★★★)" },
            { value: "4", label: "4 Stars (★★★★)" },
            { value: "3", label: "3 Stars (★★★)" },
            { value: "2", label: "2 Stars (★★)" },
            { value: "1", label: "1 Star (★)" },
          ]}
          containerClassName="w-52"
        />
      </div>

      {/* Table Content */}
      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3">
          <Spinner size={32} />
          <p className="text-body-sm text-ink-outline">Loading reviews...</p>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon="rate_review"
          title="No reviews found"
          description={
            search || ratingFilter
              ? "Try adjusting your search query or filter."
              : "No learner reviews have been submitted yet."
          }
        />
      ) : (
        <div className="bg-surface-lowest rounded-2xl border border-ink-outlineVariant/30 shadow-card overflow-hidden">
          <Table>
            <THead>
              <TR>
                <TH>Reviewer</TH>
                <TH>Rating</TH>
                <TH>Review Excerpt</TH>
                <TH>Responses</TH>
                <TH>Date</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <tbody>
              {items.map((r) => (
                <TR key={r.id}>
                  <TD className="font-medium text-ink">
                    <div>
                      <p className="font-semibold text-ink">{r.name}</p>
                      <p className="text-caption text-ink-variant">{r.designation}</p>
                      <p className="text-caption text-ink-outline flex items-center gap-1">
                        <span className="icon text-[13px]">domain</span>
                        {r.company_or_institution}
                      </p>
                    </div>
                  </TD>
                  <TD>
                    <div className="flex items-center gap-1.5">
                      <StarRating count={r.rating} />
                      <span className="text-caption font-semibold text-ink-variant">
                        {r.rating}/5
                      </span>
                    </div>
                  </TD>
                  <TD className="max-w-md">
                    <p className="line-clamp-2 text-body-sm text-ink-variant">"{r.review_text}"</p>
                  </TD>
                  <TD>
                    <Badge tone={r.comments && r.comments.length > 0 ? "success" : "neutral"}>
                      {r.comments ? r.comments.length : 0} {r.comments?.length === 1 ? "reply" : "replies"}
                    </Badge>
                  </TD>
                  <TD className="text-body-sm text-ink-outline">
                    {r.created_at ? formatDate(r.created_at) : "—"}
                  </TD>
                  <TD className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <Button
                        size="sm"
                        variant="ghost"
                        leftIcon="visibility"
                        onClick={() => setSelectedReview(r)}
                      >
                        View & Reply
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-danger hover:bg-danger-container/20"
                        leftIcon="delete"
                        onClick={() => setConfirmDelete(r)}
                      >
                        Delete
                      </Button>
                    </div>
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>

          {totalPages > 1 && (
            <div className="p-4 border-t border-ink-outlineVariant/20">
              <Pagination
                page={page}
                pages={totalPages}
                total={totalItems}
                limit={limit}
                onPageChange={setPage}
              />
            </div>
          )}
        </div>
      )}

      {/* Review Detail & Reply Modal */}
      {selectedReview && (
        <Modal
          open={!!selectedReview}
          onClose={() => setSelectedReview(null)}
          title="Review Details & Team Responses"
          size="lg"
        >
          <div className="space-y-5">
            {/* Reviewer Header */}
            <div className="bg-surface-containerLow p-4 rounded-xl border border-ink-outlineVariant/20 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid place-items-center w-11 h-11 rounded-full bg-gradient-to-br from-primary-container to-primary-fixed text-primary-on font-display font-bold text-title-md">
                  {selectedReview.name[0]}
                </span>
                <div>
                  <h4 className="font-semibold text-title-sm text-ink">{selectedReview.name}</h4>
                  <p className="text-body-sm text-ink-variant">{selectedReview.designation}</p>
                  <p className="text-caption text-ink-outline flex items-center gap-1">
                    <span className="icon text-[13px]">domain</span>
                    {selectedReview.company_or_institution}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-1 justify-end">
                  <StarRating count={selectedReview.rating} />
                  <span className="font-semibold text-body-sm">{selectedReview.rating}/5</span>
                </div>
                {selectedReview.created_at && (
                  <p className="text-caption text-ink-outline mt-0.5">
                    {formatDate(selectedReview.created_at)}
                  </p>
                )}
              </div>
            </div>

            {/* Review Content */}
            <div className="p-4 bg-surface-lowest rounded-xl border border-ink-outlineVariant/30">
              <p className="text-caption font-semibold text-ink-outline mb-1">REVIEW CONTENT</p>
              <blockquote className="text-body-md text-ink whitespace-pre-line leading-relaxed">
                "{selectedReview.review_text}"
              </blockquote>
            </div>

            {/* Responses List */}
            <div>
              <h4 className="text-title-sm font-semibold text-ink mb-3 flex items-center gap-2">
                <span>Team Responses ({selectedReview.comments?.length || 0})</span>
              </h4>
              {selectedReview.comments && selectedReview.comments.length > 0 ? (
                <div className="space-y-2.5">
                  {selectedReview.comments.map((c: ReviewCommentDTO) => (
                    <div
                      key={c.id}
                      className="bg-surface-containerLow p-3.5 rounded-xl border border-ink-outlineVariant/20"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-ink text-body-sm">{c.user_name}</span>
                          <Badge tone={c.user_role === "admin" ? "warning" : "tertiary"} size="sm">
                            {c.user_role === "admin" ? "Silicon Mango Team" : "Instructor"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          {c.created_at && (
                            <span className="text-caption text-ink-outline">{formatDate(c.created_at)}</span>
                          )}
                          <button
                            onClick={() => onDeleteComment(c.id)}
                            className="text-ink-outline hover:text-danger p-1 rounded"
                            title="Delete reply"
                          >
                            <span className="icon text-[16px]">delete</span>
                          </button>
                        </div>
                      </div>
                      <p className="text-body-sm text-ink-variant whitespace-pre-line">{c.comment_text}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-body-sm text-ink-outline italic">No replies posted yet.</p>
              )}
            </div>

            {/* Add Response Form */}
            <div className="pt-4 border-t border-ink-outlineVariant/20 space-y-2">
              <p className="text-label font-semibold text-ink">Post a response as Silicon Mango Team</p>
              <textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="Write your response to the learner..."
                rows={3}
                className="w-full text-body-sm rounded-xl bg-surface-lowest border border-ink-outlineVariant p-3 text-ink placeholder:text-ink-outline focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <div className="flex justify-between items-center pt-1">
                <Button
                  variant="ghost"
                  className="text-danger hover:bg-danger-container/20"
                  leftIcon="delete"
                  onClick={() => {
                    setConfirmDelete(selectedReview);
                  }}
                >
                  Delete Review
                </Button>
                <Button
                  leftIcon="send"
                  loading={busyReply}
                  disabled={!replyText.trim()}
                  onClick={onAddReply}
                >
                  Post Response
                </Button>
              </div>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Review Confirm Modal */}
      <ConfirmModal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={onDelete}
        title="Delete Review"
        description={`Are you sure you want to permanently delete the review from "${confirmDelete?.name}"? All associated replies will also be deleted.`}
        confirmLabel="Delete Review"
        destructive
        loading={busyDelete}
      />
    </div>
  );
}
