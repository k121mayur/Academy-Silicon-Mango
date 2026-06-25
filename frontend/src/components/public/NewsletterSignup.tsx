/**
 * Newsletter subscription with double opt-in.
 *
 * Flow: enter email → backend emails a 6-digit OTP → enter OTP → confirmed.
 * Styled for the dark footer it lives in. Self-contained state machine so it can
 * be dropped anywhere a "Subscribe" widget is wanted.
 */
import { FormEvent, useState } from "react";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/Button";
import { extractErrorMessage } from "@/lib/api";
import { requestNewsletterOtp, verifyNewsletter } from "@/services/newsletter.service";

type Phase = "idle" | "otp" | "done";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const inputClass =
  "w-full h-11 rounded-xl bg-white/10 border border-white/20 px-4 text-white placeholder:text-white/45 " +
  "focus:outline-none focus:ring-2 focus:ring-primary-fill/60 focus:border-transparent transition-colors";

export function NewsletterSignup() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const sendOtp = async () => {
    const value = email.trim();
    if (!EMAIL_RE.test(value)) {
      toast.error("Please enter a valid email address");
      return;
    }
    setSubmitting(true);
    try {
      const res = await requestNewsletterOtp(value);
      if (res.already_subscribed) {
        setPhase("done");
        toast.success("You're already subscribed!");
      } else {
        setPhase("otp");
        toast.success("We've emailed you a confirmation code");
      }
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const onSubmitEmail = (e: FormEvent) => {
    e.preventDefault();
    sendOtp();
  };

  const onSubmitOtp = async (e: FormEvent) => {
    e.preventDefault();
    if (otp.trim().length !== 6) {
      toast.error("Enter the 6-digit code from your email");
      return;
    }
    setSubmitting(true);
    try {
      await verifyNewsletter(email.trim(), otp.trim());
      setPhase("done");
      toast.success("Subscribed successfully");
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (phase === "done") {
    return (
      <div
        className="flex items-center gap-2.5 rounded-xl bg-success/15 border border-success/40 px-4 py-3 text-success w-full md:w-auto"
        role="status"
      >
        <span className="icon text-[20px]">check_circle</span>
        <span className="font-semibold text-body-sm">Subscribed successfully</span>
      </div>
    );
  }

  if (phase === "otp") {
    return (
      <form onSubmit={onSubmitOtp} className="w-full md:w-auto">
        <div className="flex flex-col sm:flex-row gap-2.5 sm:items-center">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            placeholder="6-digit code"
            aria-label="Confirmation code"
            className={`${inputClass} sm:w-40 tracking-[0.3em] text-center`}
            autoFocus
          />
          <Button type="submit" loading={submitting} className="shrink-0">
            Confirm
          </Button>
        </div>
        <p className="text-label text-surface-containerHigh/60 mt-2">
          Sent to {email}.{" "}
          <button
            type="button"
            onClick={sendOtp}
            disabled={submitting}
            className="underline underline-offset-2 hover:text-white disabled:opacity-50"
          >
            Resend
          </button>{" "}
          ·{" "}
          <button
            type="button"
            onClick={() => { setPhase("idle"); setOtp(""); }}
            className="underline underline-offset-2 hover:text-white"
          >
            Change email
          </button>
        </p>
      </form>
    );
  }

  return (
    <form onSubmit={onSubmitEmail} className="w-full md:w-auto">
      <div className="flex flex-col sm:flex-row gap-2.5 sm:items-center">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          aria-label="Email address"
          className={`${inputClass} sm:w-64`}
        />
        <Button type="submit" loading={submitting} className="shrink-0">
          Subscribe
        </Button>
      </div>
    </form>
  );
}
