import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { MetaTags } from "@/components/shared/MetaTags";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { WriteReviewModal } from "@/components/public/WriteReviewModal";
import {
  ReviewDTO,
  ReviewCommentDTO,
  listPublicReviews,
  addReviewComment,
  deleteReviewComment,
  deleteAdminReview,
} from "@/services/review.service";
import { qk } from "@/lib/queryKeys";
import { useAuthStore } from "@/features/auth/stores/authStore";
import { formatDate } from "@/lib/utils";
import { extractErrorMessage } from "@/lib/api";

function StarRating({ count = 5, size = 16, className = "text-primary-fill" }: { count?: number; size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} aria-hidden>
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={`icon leading-none ${i < count ? "text-primary-fill" : "text-ink-outlineVariant/40"}`}
          style={{
            fontSize: size,
            fontVariationSettings: i < count ? "'FILL' 1" : "'FILL' 0",
          }}
        >
          star
        </span>
      ))}
    </span>
  );
}

export default function ReviewsListing() {
  const queryClient = useQueryClient();
  const currentUser = useAuthStore((s) => s.user);

  const [selectedRating, setSelectedRating] = useState<number | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [isWriteModalOpen, setIsWriteModalOpen] = useState(false);

  // Comment input state per review { [reviewId]: text }
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});
  const [submittingComment, setSubmittingComment] = useState<Record<string, boolean>>({});

  // Delete review modal state (for admins)
  const [deleteTarget, setDeleteTarget] = useState<ReviewDTO | null>(null);
  const [isDeletingReview, setIsDeletingReview] = useState(false);

  const isStaff = currentUser?.role === "admin" || currentUser?.role === "instructor";
  const isAdmin = currentUser?.role === "admin";

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: qk.public.reviews(selectedRating, search),
    queryFn: () => listPublicReviews({ rating: selectedRating, search: search.trim() || undefined }),
  });

  const reviews = data?.data || [];
  const stats = data?.stats || {
    total_reviews: 0,
    average_rating: 5.0,
    star_counts: { "1": 0, "2": 0, "3": 0, "4": 0, "5": 0 },
  };

  const handlePostComment = async (reviewId: string) => {
    const text = commentInputs[reviewId]?.trim();
    if (!text) {
      toast.error("Please write a comment first");
      return;
    }

    setSubmittingComment((prev) => ({ ...prev, [reviewId]: true }));
    try {
      await addReviewComment(reviewId, { comment_text: text });
      toast.success("Response posted successfully");
      setCommentInputs((prev) => ({ ...prev, [reviewId]: "" }));
      queryClient.invalidateQueries({ queryKey: ["public", "reviews"] });
    } catch (err) {
      toast.error(extractErrorMessage(err, "Failed to post response"));
    } finally {
      setSubmittingComment((prev) => ({ ...prev, [reviewId]: false }));
    }
  };

  const handleDeleteComment = async (reviewId: string, commentId: string) => {
    try {
      await deleteReviewComment(reviewId, commentId);
      toast.success("Comment deleted");
      queryClient.invalidateQueries({ queryKey: ["public", "reviews"] });
    } catch (err) {
      toast.error(extractErrorMessage(err, "Failed to delete comment"));
    }
  };

  const handleDeleteReview = async () => {
    if (!deleteTarget) return;
    setIsDeletingReview(true);
    try {
      await deleteAdminReview(deleteTarget.id);
      toast.success("Review deleted successfully");
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ["public", "reviews"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "reviews"] });
    } catch (err) {
      toast.error(extractErrorMessage(err, "Failed to delete review"));
    } finally {
      setIsDeletingReview(false);
    }
  };

  return (
    <>
      <MetaTags
        title="Learner Reviews & Ratings · Silicon Mango"
        description="Read verified reviews, experiences, and feedback from students and professionals who completed cohorts at Silicon Mango."
      />

      <div className="bg-surface min-h-screen py-10 md:py-16">
        <div className="max-w-7xl mx-auto px-4 md:px-6 space-y-10">
          {/* Header & Overview Card */}
          <div className="bg-surface-lowest rounded-3xl p-6 md:p-10 border border-ink-outlineVariant/30 shadow-card">
            <div className="grid lg:grid-cols-12 gap-8 items-center">
              {/* Left Column: Heading & CTA */}
              <div className="lg:col-span-6 space-y-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-container/30 text-primary-onContainer text-caption font-semibold">
                  <span className="icon text-[16px]">verified</span>
                  VERIFIED LEARNER FEEDBACK
                </div>
                <h1 className="font-display font-bold text-display-md md:text-display-lg text-ink">
                  Real Reviews from Real Learners
                </h1>
                <p className="text-body-lg text-ink-variant">
                  Hear directly from professionals, engineers, and students who transformed their technical and analytical skills with Silicon Mango.
                </p>
                <div className="pt-2 flex flex-wrap items-center gap-3">
                  <Button
                    size="lg"
                    leftIcon="rate_review"
                    onClick={() => setIsWriteModalOpen(true)}
                    className="shadow-glow"
                  >
                    Write a Review
                  </Button>
                </div>
              </div>

              {/* Right Column: Rating Summary Box */}
              <div className="lg:col-span-6 bg-surface-containerLow/70 rounded-2xl p-6 md:p-8 border border-ink-outlineVariant/20">
                <div className="flex flex-col sm:flex-row sm:items-center gap-6">
                  <div className="text-center sm:text-left shrink-0">
                    <p className="font-display font-extrabold text-[56px] leading-none text-ink">
                      {stats.average_rating > 0 ? stats.average_rating.toFixed(1) : "5.0"}
                    </p>
                    <div className="mt-2 flex items-center justify-center sm:justify-start gap-1">
                      <StarRating count={Math.round(stats.average_rating || 5)} size={20} />
                    </div>
                    <p className="text-body-sm text-ink-outline mt-1">
                      Based on {stats.total_reviews} {stats.total_reviews === 1 ? "review" : "reviews"}
                    </p>
                  </div>

                  {/* Rating Breakdown Bars */}
                  <div className="flex-1 space-y-2 border-t sm:border-t-0 sm:border-l border-ink-outlineVariant/30 sm:pl-6 pt-4 sm:pt-0">
                    {[5, 4, 3, 2, 1].map((star) => {
                      const count = stats.star_counts[String(star)] || 0;
                      const percentage = stats.total_reviews > 0 ? (count / stats.total_reviews) * 100 : 0;
                      return (
                        <button
                          key={star}
                          onClick={() => setSelectedRating(selectedRating === star ? undefined : star)}
                          className="w-full flex items-center gap-2 text-label text-ink-variant hover:text-ink group"
                        >
                          <span className="w-12 text-left font-medium">{star} star</span>
                          <div className="flex-1 h-2.5 rounded-full bg-surface-container overflow-hidden">
                            <div
                              className="h-full bg-primary-fill rounded-full transition-all duration-300 group-hover:bg-primary-fillHover"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          <span className="w-8 text-right font-mono text-ink-outline">{count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Filter & Search Bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Star Filters */}
            <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-none">
              <button
                onClick={() => setSelectedRating(undefined)}
                className={`px-4 py-2 rounded-xl text-body-sm font-medium transition-all shrink-0 ${
                  selectedRating === undefined
                    ? "bg-primary-fill text-primary-on shadow-sm font-semibold"
                    : "bg-surface-lowest border border-ink-outlineVariant/40 text-ink-variant hover:bg-surface-containerLow"
                }`}
              >
                All Reviews ({stats.total_reviews})
              </button>
              {[5, 4, 3, 2, 1].map((star) => {
                const count = stats.star_counts[String(star)] || 0;
                const isSelected = selectedRating === star;
                return (
                  <button
                    key={star}
                    onClick={() => setSelectedRating(isSelected ? undefined : star)}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-body-sm font-medium transition-all shrink-0 ${
                      isSelected
                        ? "bg-primary-fill text-primary-on shadow-sm font-semibold"
                        : "bg-surface-lowest border border-ink-outlineVariant/40 text-ink-variant hover:bg-surface-containerLow"
                    }`}
                  >
                    <span>{star}</span>
                    <span
                      className={`icon text-[16px] leading-none ${isSelected ? "text-primary-on" : "text-primary-fill"}`}
                      style={{ fontVariationSettings: "'FILL' 1" }}
                    >
                      star
                    </span>
                    <span className="opacity-75 text-caption">({count})</span>
                  </button>
                );
              })}
            </div>

            {/* Search Input */}
            <div className="w-full md:w-80">
              <Input
                placeholder="Search reviews by keyword..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                leftIcon="search"
              />
            </div>
          </div>

          {/* Reviews List */}
          {isLoading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-3">
              <Spinner size={32} />
              <p className="text-body-sm text-ink-outline">Loading reviews...</p>
            </div>
          ) : isError ? (
            <div className="py-16 text-center bg-surface-lowest rounded-2xl p-8 border border-danger/20">
              <span className="icon text-[40px] text-danger mb-2">error</span>
              <h3 className="font-display font-semibold text-title-md text-ink">Failed to load reviews</h3>
              <p className="text-body-sm text-ink-variant mt-1 mb-4">Please check your connection and try again.</p>
              <Button variant="outline" onClick={() => refetch()}>
                Retry
              </Button>
            </div>
          ) : reviews.length === 0 ? (
            <EmptyState
              icon="rate_review"
              title={selectedRating ? `No ${selectedRating}-star reviews found` : "No reviews found"}
              description="Be the first to share your experience with Silicon Mango Academy!"
              action={
                <Button leftIcon="rate_review" onClick={() => setIsWriteModalOpen(true)}>
                  Write a Review
                </Button>
              }
            />
          ) : (
            <div className="grid md:grid-cols-2 gap-6 items-start">
              {reviews.map((review) => (
                <ReviewCard
                  key={review.id}
                  review={review}
                  isStaff={isStaff}
                  isAdmin={isAdmin}
                  commentInput={commentInputs[review.id] || ""}
                  isSubmittingComment={submittingComment[review.id] || false}
                  onCommentInputChange={(val) =>
                    setCommentInputs((prev) => ({ ...prev, [review.id]: val }))
                  }
                  onPostComment={() => handlePostComment(review.id)}
                  onDeleteComment={(commentId) => handleDeleteComment(review.id, commentId)}
                  onDeleteReview={() => setDeleteTarget(review)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Write Review Modal */}
      <WriteReviewModal
        open={isWriteModalOpen}
        onClose={() => setIsWriteModalOpen(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ["public", "reviews"] });
        }}
      />

      {/* Admin Delete Review Confirm Modal */}
      <ConfirmModal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteReview}
        title="Delete Review"
        description={`Are you sure you want to permanently delete the review from "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete Review"
        destructive
        loading={isDeletingReview}
      />
    </>
  );
}

interface ReviewCardProps {
  review: ReviewDTO;
  isStaff: boolean;
  isAdmin: boolean;
  commentInput: string;
  isSubmittingComment: boolean;
  onCommentInputChange: (val: string) => void;
  onPostComment: () => void;
  onDeleteComment: (commentId: string) => void;
  onDeleteReview: () => void;
}

function ReviewCard({
  review,
  isStaff,
  isAdmin,
  commentInput,
  isSubmittingComment,
  onCommentInputChange,
  onPostComment,
  onDeleteComment,
  onDeleteReview,
}: ReviewCardProps) {
  const [showReplyForm, setShowReplyForm] = useState(false);
  const currentUser = useAuthStore((s) => s.user);

  return (
    <div className="bg-surface-lowest rounded-2xl p-6 shadow-card border border-ink-outlineVariant/30 flex flex-col justify-between h-full relative transition-all duration-200 hover:border-ink-outlineVariant/60">
      {/* Top quote icon */}
      <span
        className="icon text-primary-container/40 text-[40px] absolute top-4 right-5 leading-none select-none pointer-events-none"
        aria-hidden
        style={{ fontVariationSettings: "'FILL' 1" }}
      >
        format_quote
      </span>

      <div>
        {/* Rating and Admin Actions */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <StarRating count={review.rating} size={18} />
          <div className="flex items-center gap-2">
            {review.created_at && (
              <span className="text-label text-ink-outline">
                {formatDate(review.created_at)}
              </span>
            )}
            {isAdmin && (
              <button
                onClick={onDeleteReview}
                className="w-7 h-7 grid place-items-center rounded-lg text-ink-outline hover:text-danger hover:bg-danger-container/20 transition-colors"
                title="Delete this review (Admin)"
              >
                <span className="icon text-[18px]">delete</span>
              </button>
            )}
          </div>
        </div>

        {/* Review Content */}
        <blockquote className="text-ink text-body-md leading-relaxed mb-5 whitespace-pre-line font-normal">
          "{review.review_text}"
        </blockquote>
      </div>

      <div>
        {/* Author Details */}
        <div className="pt-4 border-t border-ink-outlineVariant/20 flex items-center gap-3.5">
          <span className="grid place-items-center w-11 h-11 rounded-full bg-gradient-to-br from-primary-container to-primary-fixed text-primary-on font-display font-bold text-title-md shrink-0 shadow-sm">
            {review.name ? review.name[0].toUpperCase() : "U"}
          </span>
          <div className="leading-tight min-w-0">
            <p className="font-semibold text-ink truncate text-title-sm">{review.name}</p>
            <p className="text-body-sm text-ink-variant truncate">{review.designation}</p>
            {review.company_or_institution && (
              <p className="text-caption text-ink-outline truncate flex items-center gap-1 mt-0.5">
                <span className="icon text-[13px]">domain</span>
                {review.company_or_institution}
              </p>
            )}
          </div>
        </div>

        {/* Comment Thread (Replies) */}
        {(review.comments && review.comments.length > 0) || isStaff ? (
          <div className="mt-5 pt-4 border-t border-ink-outlineVariant/20 space-y-3">
            {review.comments && review.comments.length > 0 && (
              <div className="space-y-2.5">
                {review.comments.map((comment: ReviewCommentDTO) => {
                  const canDelete = isAdmin || (currentUser?.id && comment.user_id === currentUser.id);
                  return (
                    <div
                      key={comment.id}
                      className="bg-surface-containerLow/80 rounded-xl p-3.5 border border-ink-outlineVariant/20 text-body-sm"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-ink text-label">
                            {comment.user_name}
                          </span>
                          <Badge
                            tone={comment.user_role === "admin" ? "warning" : "tertiary"}
                            size="sm"
                          >
                            {comment.user_role === "admin" ? "Silicon Mango Team" : "Instructor"}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {comment.created_at && (
                            <span className="text-caption text-ink-outline">
                              {formatDate(comment.created_at)}
                            </span>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => onDeleteComment(comment.id)}
                              className="w-5 h-5 grid place-items-center text-ink-outline hover:text-danger rounded"
                              title="Delete response"
                            >
                              <span className="icon text-[14px]">close</span>
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-ink-variant whitespace-pre-line">{comment.comment_text}</p>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Staff Reply Section */}
            {isStaff && (
              <div className="pt-2">
                {!showReplyForm ? (
                  <button
                    type="button"
                    onClick={() => setShowReplyForm(true)}
                    className="text-label font-medium text-primary hover:text-primary-onContainer flex items-center gap-1.5 transition-colors"
                  >
                    <span className="icon text-[16px]">reply</span>
                    Reply as {currentUser?.role === "admin" ? "Silicon Mango Team" : "Instructor"}
                  </button>
                ) : (
                  <div className="space-y-2 bg-surface-containerLow p-3 rounded-xl border border-ink-outlineVariant/30 animate-fade-in">
                    <p className="text-caption font-semibold text-ink-variant flex items-center gap-1">
                      <span className="icon text-[14px] text-primary">edit_note</span>
                      Respond to this review ({currentUser?.display_name || currentUser?.role})
                    </p>
                    <textarea
                      value={commentInput}
                      onChange={(e) => onCommentInputChange(e.target.value)}
                      placeholder="Write your response to the learner..."
                      rows={2}
                      className="w-full text-body-sm rounded-lg bg-surface-lowest border border-ink-outlineVariant p-2.5 text-ink placeholder:text-ink-outline focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setShowReplyForm(false);
                          onCommentInputChange("");
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        leftIcon="send"
                        loading={isSubmittingComment}
                        onClick={async () => {
                          await onPostComment();
                          setShowReplyForm(false);
                        }}
                      >
                        Post Reply
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
