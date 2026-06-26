import { FormEvent, useCallback, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Card, CardBody } from "@/components/ui/Card";
import { Spinner } from "@/components/ui/Spinner";
import { EmptyState } from "@/components/ui/EmptyState";
import { MetaTags } from "@/components/shared/MetaTags";
import { Turnstile, TURNSTILE_ENABLED } from "@/components/shared/Turnstile";
import { extractErrorCode, extractErrorMessage } from "@/lib/api";
import { qk } from "@/lib/queryKeys";
import {
  getPublicWebinar,
  registerForWebinar,
  resendWebinarVerification,
  GENDER_OPTIONS,
  PROFESSION_OPTIONS,
  formatWebinarWhen,
} from "@/services/webinar.service";

type Phase = "form" | "submitted" | "duplicate";

export default function WebinarRegister() {
  const { idOrSlug } = useParams<{ idOrSlug: string }>();
  const { data: w, isLoading, isError } = useQuery({
    queryKey: qk.public.webinar(idOrSlug || ""),
    queryFn: () => getPublicWebinar(idOrSlug as string),
    enabled: !!idOrSlug,
    retry: false,
  });

  const [phase, setPhase] = useState<Phase>("form");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("");
  const [profession, setProfession] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [waitlisted, setWaitlisted] = useState(false);
  const [captchaFailed, setCaptchaFailed] = useState(false);
  // Bumping this key remounts the Turnstile widget to re-attempt a failed load.
  const [captchaKey, setCaptchaKey] = useState(0);

  const onToken = useCallback((t: string) => setCaptcha(t), []);
  const onCaptchaError = useCallback(() => setCaptchaFailed(true), []);
  const retryCaptcha = () => {
    setCaptchaFailed(false);
    setCaptcha("");
    setCaptchaKey((k) => k + 1);
  };

  if (isLoading) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <Spinner size={28} className="text-primary" />
      </div>
    );
  }
  if (isError || !w) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16">
        <EmptyState
          title="Webinar not found"
          icon="videocam_off"
          action={
            <Link to="/webinars">
              <Button leftIcon="arrow_back">Browse webinars</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!fullName.trim()) e.full_name = "Full name is required";
    if (!email.trim()) e.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) e.email = "Enter a valid email";
    if (!dob) e.date_of_birth = "Date of birth is required";
    if (!gender) e.gender = "Please select";
    if (!profession) e.profession = "Please select";
    setErrors(e);
    if (Object.keys(e).length) toast.error(Object.values(e)[0]);
    return Object.keys(e).length === 0;
  };

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    if (TURNSTILE_ENABLED && !captcha) {
      toast.error("Please complete the CAPTCHA.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await registerForWebinar(w.id, {
        full_name: fullName.trim(),
        email: email.trim(),
        date_of_birth: dob,
        gender,
        profession,
        captcha_token: captcha || undefined,
      });
      setWaitlisted(!!res.data?.will_waitlist);
      setPhase("submitted");
      toast.success(res.message || "Check your inbox to confirm your registration.");
    } catch (err) {
      const code = extractErrorCode(err);
      if (code === "WEBINAR_DUP") {
        setPhase("duplicate");
      } else {
        toast.error(extractErrorMessage(err, "Could not register. Please try again."));
      }
    } finally {
      setSubmitting(false);
    }
  };

  const resend = async () => {
    setResending(true);
    try {
      const res = await resendWebinarVerification(w.id, email.trim(), captcha || undefined);
      toast.success(res.message || "If a pending registration exists, we've re-sent the link.");
      setPhase("submitted");
    } catch (err) {
      toast.error(extractErrorMessage(err));
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 md:px-6 py-10">
      <MetaTags title={`Register — ${w.title}`} />

      <Link to={`/webinars/${w.slug}`} className="text-body-sm text-primary hover:underline inline-flex items-center gap-1 mb-4">
        <span className="icon text-[16px]">arrow_back</span> Back to webinar
      </Link>

      <Card>
        <CardBody className="space-y-5">
          <div>
            <p className="text-caption text-tertiary uppercase tracking-wide">{w.is_free ? "Free webinar" : "Paid webinar"}</p>
            <h1 className="font-display font-bold text-headline text-ink">{w.title}</h1>
            <p className="text-body-sm text-ink-variant mt-1 flex items-center gap-1">
              <span className="icon text-[16px]">event</span>
              {formatWebinarWhen(w.start_at, w.timezone)}
            </p>
          </div>

          {phase === "submitted" && (
            <div className="text-center py-6">
              <div className="w-14 h-14 mx-auto rounded-full bg-tertiary/10 text-tertiary grid place-items-center mb-3">
                <span className="icon text-[32px]">mark_email_unread</span>
              </div>
              <h2 className="font-display font-semibold text-title-md text-ink">Almost there!</h2>
              <p className="text-body-sm text-ink-variant mt-1 max-w-sm mx-auto">
                We've sent a confirmation link to <strong>{email}</strong>. Click it to secure your{" "}
                {waitlisted ? "waitlist spot" : "spot"}. Don't forget to check spam.
              </p>
              <Link to={`/webinars/${w.slug}`}>
                <Button variant="ghost" className="mt-4" leftIcon="arrow_back">
                  Back to webinar
                </Button>
              </Link>
            </div>
          )}

          {phase === "duplicate" && (
            <div className="text-center py-6">
              <div className="w-14 h-14 mx-auto rounded-full bg-[#fff1c2] text-[#6b4c00] grid place-items-center mb-3">
                <span className="icon text-[32px]">info</span>
              </div>
              <h2 className="font-display font-semibold text-title-md text-ink">You're already registered</h2>
              <p className="text-body-sm text-ink-variant mt-1 max-w-sm mx-auto">
                <strong>{email}</strong> is already registered for this webinar. Need the confirmation email again?
              </p>
              <div className="flex items-center justify-center gap-2 mt-4">
                <Button variant="ghost" onClick={() => setPhase("form")}>
                  Use another email
                </Button>
                <Button onClick={resend} loading={resending} leftIcon="forward_to_inbox">
                  Resend confirmation
                </Button>
              </div>
            </div>
          )}

          {phase === "form" && (
            <form onSubmit={submit} className="space-y-4">
              <Input
                label="Full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                leftIcon="person"
                error={errors.full_name}
                placeholder="Jane Doe"
              />
              <Input
                label="Email address"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                leftIcon="mail"
                error={errors.email}
                placeholder="you@example.com"
              />
              <div className="grid sm:grid-cols-2 gap-4">
                <Input
                  label="Date of birth"
                  type="date"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  error={errors.date_of_birth}
                />
                <Select
                  label="Gender"
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  error={errors.gender}
                  options={[{ value: "", label: "Select…" }, ...GENDER_OPTIONS]}
                />
              </div>
              <Select
                label="Profession"
                value={profession}
                onChange={(e) => setProfession(e.target.value)}
                error={errors.profession}
                options={[{ value: "", label: "Select…" }, ...PROFESSION_OPTIONS.map((p) => ({ value: p, label: p }))]}
              />

              <Turnstile key={captchaKey} onToken={onToken} onLoadError={onCaptchaError} />
              {captchaFailed && (
                <div className="rounded-xl border border-danger/30 bg-danger/5 p-3 text-body-sm text-ink">
                  <p>Couldn't load the verification widget. Check your connection or disable ad-blockers, then try again.</p>
                  <button
                    type="button"
                    onClick={retryCaptcha}
                    className="mt-2 inline-flex items-center gap-1 text-primary font-medium hover:underline"
                  >
                    <span className="icon text-[18px]">refresh</span> Retry verification
                  </button>
                </div>
              )}

              <Button type="submit" fullWidth loading={submitting} leftIcon="how_to_reg">
                {w.registration_state === "waitlist" ? "Join waitlist" : "Register"}
              </Button>
              <p className="text-label text-ink-outline text-center">
                We'll email you a confirmation link. Your details are only used for this webinar.
              </p>
            </form>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
