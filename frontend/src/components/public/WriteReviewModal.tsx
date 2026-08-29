import { useState, useEffect } from "react";
import toast from "react-hot-toast";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Input";
import { submitReview } from "@/services/review.service";
import { extractErrorMessage } from "@/lib/api";
import { useAuthStore } from "@/features/auth/stores/authStore";

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const RATING_LABELS: Record<number, string> = {
  1: "Needs Improvement",
  2: "Fair",
  3: "Good",
  4: "Very Good",
  5: "Outstanding / Highly Recommended",
};

export function WriteReviewModal({ open, onClose, onSuccess }: Props) {
  const currentUser = useAuthStore((s) => s.user);

  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [designation, setDesignation] = useState("");
  const [companyOrInstitution, setCompanyOrInstitution] = useState("");
  const [reviewText, setReviewText] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Initialize name if user is logged in
  useEffect(() => {
    if (open) {
      if (currentUser?.display_name && !name) {
        setName(currentUser.display_name);
      }
      setErrors({});
    }
  }, [open, currentUser, name]);

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!rating || rating < 1 || rating > 5) {
      errs.rating = "Please select a star rating (1 to 5 stars)";
    }
    if (!name.trim()) {
      errs.name = "Full name is compulsory";
    }
    if (!designation.trim()) {
      errs.designation = "Designation / Role is compulsory";
    }
    if (!companyOrInstitution.trim()) {
      errs.companyOrInstitution = "Company or Institution is compulsory";
    }
    if (!reviewText.trim()) {
      errs.reviewText = "Review text is compulsory";
    } else if (reviewText.trim().length < 10) {
      errs.reviewText = "Please write at least 10 characters in your review";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSubmitting(true);
    try {
      await submitReview({
        rating,
        name: name.trim(),
        designation: designation.trim(),
        company_or_institution: companyOrInstitution.trim(),
        review_text: reviewText.trim(),
      });
      toast.success("Thank you! Your review has been submitted successfully.");
      // Reset form
      setReviewText("");
      setCompanyOrInstitution("");
      setDesignation("");
      onSuccess?.();
      onClose();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Failed to submit review. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  const currentDisplayRating = hoverRating ?? rating;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Write a Review"
      description="Share your honest learning journey and feedback with the community"
      size="md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Star Rating Selection (Compulsory) */}
        <div>
          <label className="block text-label text-ink-variant font-medium mb-1.5">
            Star Rating <span className="text-danger">*</span>
          </label>
          <div className="flex items-center gap-3">
            <div
              className="flex items-center gap-1 cursor-pointer"
              onMouseLeave={() => setHoverRating(null)}
              role="radiogroup"
              aria-label="Star Rating"
            >
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  type="button"
                  key={star}
                  onClick={() => {
                    setRating(star);
                    setErrors((prev) => ({ ...prev, rating: "" }));
                  }}
                  onMouseEnter={() => setHoverRating(star)}
                  className="p-1 -m-1 focus:outline-none transition-transform hover:scale-110 active:scale-95"
                  aria-label={`${star} star${star > 1 ? "s" : ""}`}
                >
                  <span
                    className={`icon text-[28px] leading-none transition-colors ${
                      star <= currentDisplayRating
                        ? "text-primary-fill"
                        : "text-ink-outlineVariant/50"
                    }`}
                    style={{ fontVariationSettings: star <= currentDisplayRating ? "'FILL' 1" : "'FILL' 0" }}
                  >
                    star
                  </span>
                </button>
              ))}
            </div>
            {currentDisplayRating > 0 && (
              <span className="text-body-sm font-medium text-ink-variant animate-fade-in">
                {rating} / 5 · {RATING_LABELS[currentDisplayRating]}
              </span>
            )}
          </div>
          {errors.rating && (
            <p className="text-label text-danger mt-1 flex items-center gap-1">
              <span className="icon text-[14px]">error</span>
              {errors.rating}
            </p>
          )}
        </div>

        {/* Full Name (Compulsory) */}
        <Input
          label="Your Full Name *"
          placeholder="e.g. Swapna Ghormode"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (errors.name) setErrors((prev) => ({ ...prev, name: "" }));
          }}
          error={errors.name}
          leftIcon="person"
        />

        {/* Designation (Compulsory) */}
        <Input
          label="Designation / Role *"
          placeholder="e.g. Process Engineer, Student, Data Analyst"
          value={designation}
          onChange={(e) => {
            setDesignation(e.target.value);
            if (errors.designation) setErrors((prev) => ({ ...prev, designation: "" }));
          }}
          error={errors.designation}
          leftIcon="badge"
        />

        {/* Company or Institution (Compulsory) */}
        <Input
          label="Company or Institution *"
          placeholder="e.g. Praj Industries, COEP Technological University"
          value={companyOrInstitution}
          onChange={(e) => {
            setCompanyOrInstitution(e.target.value);
            if (errors.companyOrInstitution) setErrors((prev) => ({ ...prev, companyOrInstitution: "" }));
          }}
          error={errors.companyOrInstitution}
          leftIcon="domain"
        />

        {/* Review Text (Compulsory) */}
        <Textarea
          label="Review / Feedback *"
          placeholder="What did you learn? How was your experience with the curriculum, mentors, or real-world projects?"
          value={reviewText}
          onChange={(e) => {
            setReviewText(e.target.value);
            if (errors.reviewText) setErrors((prev) => ({ ...prev, reviewText: "" }));
          }}
          rows={4}
          error={errors.reviewText}
        />

        <div className="pt-3 border-t border-ink-outlineVariant/20 flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" loading={submitting} leftIcon="rate_review">
            Submit Review
          </Button>
        </div>
      </form>
    </Modal>
  );
}
