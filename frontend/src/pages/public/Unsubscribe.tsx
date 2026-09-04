import { FormEvent, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { MetaTags } from "@/components/shared/MetaTags";
import { extractErrorMessage } from "@/lib/api";
import {
  checkUnsubscribeStatus,
  unsubscribeNewsletter,
} from "@/services/subscriber.service";

export default function Unsubscribe() {
  const [searchParams] = useSearchParams();
  const initialEmail = searchParams.get("email") || "";
  const token = searchParams.get("token") || "";

  const [email, setEmail] = useState(initialEmail);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [unsubscribed, setUnsubscribed] = useState(false);
  const [alreadyUnsubscribed, setAlreadyUnsubscribed] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);

  useEffect(() => {
    if (!initialEmail) return;
    setCheckingStatus(true);
    checkUnsubscribeStatus(initialEmail, token)
      .then((res) => {
        if (res.exists && !res.is_active) {
          setAlreadyUnsubscribed(true);
        }
      })
      .catch(() => {})
      .finally(() => setCheckingStatus(false));
  }, [initialEmail, token]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail) {
      toast.error("Please enter a valid email address");
      return;
    }

    setSubmitting(true);
    try {
      await unsubscribeNewsletter({
        email: cleanEmail,
        reason: reason.trim(),
        token: token || undefined,
      });
      setUnsubscribed(true);
      toast.success("You have been unsubscribed");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Failed to unsubscribe. Please try again."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[75vh] flex items-center justify-center py-12 px-4">
      <MetaTags
        title="Unsubscribe | Silicon Mango Academy"
        description="Manage your email subscription preferences for Silicon Mango Academy."
      />

      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <Link to="/" className="inline-flex items-center gap-2 mb-3">
            <img src="/Logo1.png" alt="Silicon Mango" className="w-10 h-10 object-contain" />
            <span className="font-display font-extrabold text-title-lg text-ink">
              Silicon Mango
            </span>
          </Link>
          <h1 className="font-display font-bold text-headline-sm text-ink">
            Email Unsubscribe
          </h1>
          <p className="text-body-sm text-ink-variant mt-1">
            We're sorry to see you go. Confirm your details below.
          </p>
        </div>

        <Card className="p-6 md:p-8 bg-surface-lowest shadow-modal border border-ink-outlineVariant/40">
          {unsubscribed ? (
            <div className="text-center py-4 space-y-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-[#b3ecf5]/40 text-tertiary flex items-center justify-center">
                <span className="icon text-[32px]">check_circle</span>
              </div>
              <div>
                <h2 className="text-title-md font-display font-bold text-ink">
                  You've been unsubscribed
                </h2>
                <p className="text-body-sm text-ink-variant mt-2">
                  <span className="font-medium text-ink">{email}</span> has been removed from
                  our newsletter and promotional email lists.
                </p>
              </div>
              <div className="pt-2 flex flex-col gap-2">
                <Link to="/">
                  <Button variant="primary" className="w-full">
                    Return to Homepage
                  </Button>
                </Link>
                <Link to="/courses">
                  <Button variant="ghost" className="w-full">
                    Explore Courses
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {alreadyUnsubscribed && !checkingStatus && (
                <div className="p-3 bg-surface-container rounded-xl text-body-sm text-ink-variant flex items-start gap-2">
                  <span className="icon text-primary text-[20px] shrink-0 mt-0.5">info</span>
                  <span>
                    This email is currently marked as unsubscribed. You can still submit feedback
                    below if you'd like to share why.
                  </span>
                </div>
              )}

              <Input
                label="Your Email Address"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                leftIcon="mail"
                disabled={submitting}
              />

              {/* Single short textbox for Reason */}
              <Input
                label="Reason for unsubscribing (optional)"
                placeholder="e.g., Too many emails, Not relevant to me, etc."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={200}
                disabled={submitting}
                hint="A short note helps us improve our emails."
              />

              <div className="pt-2 space-y-2">
                <Button
                  type="submit"
                  variant="primary"
                  loading={submitting}
                  className="w-full justify-center bg-danger hover:bg-danger/90 text-white border-none"
                >
                  Unsubscribe Me
                </Button>

                <Link to="/" className="block text-center">
                  <Button variant="ghost" size="sm" type="button" className="w-full">
                    Keep My Subscription
                  </Button>
                </Link>
              </div>
            </form>
          )}
        </Card>
      </div>
    </div>
  );
}
