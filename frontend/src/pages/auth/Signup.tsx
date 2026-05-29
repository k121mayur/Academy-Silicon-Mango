import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { OTPInput } from "@/components/shared/OTPInput";
import { apiUrl, extractErrorMessage } from "@/lib/api";
import { useAuthStore } from "@/features/auth/stores/authStore";
import { requestSignupOtp, verifySignup } from "@/services/auth.service";

type Step = "email" | "otp" | "password";

function passwordStrength(pwd: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pwd.length >= 8) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  if (pwd.length >= 12) score++;
  const labels = ["Too short", "Weak", "Fair", "Good", "Strong"];
  const colors = ["#ba1a1a", "#ba1a1a", "#ffba20", "#7c5800", "#00687b"];
  return { score, label: labels[Math.min(score, 4)], color: colors[Math.min(score, 4)] };
}

export default function Signup() {
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [otpExpiresIn, setOtpExpiresIn] = useState(0);
  const [resendIn, setResendIn] = useState(0);

  useEffect(() => {
    if (otpExpiresIn <= 0) return;
    const t = setInterval(() => setOtpExpiresIn((s) => Math.max(s - 1, 0)), 1000);
    return () => clearInterval(t);
  }, [otpExpiresIn]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn((s) => Math.max(s - 1, 0)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  const sendOtp = async () => {
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const res = await requestSignupOtp(email.trim());
      console.log("[SIGNUP] OTP requested", res);
      setOtpExpiresIn(res.expires_in || 300);
      setResendIn(60);
      setStep("otp");
      toast.success("OTP sent — check your email (or backend console in dev mode).");
    } catch (e) {
      setErrorMsg(extractErrorMessage(e, "Could not send OTP"));
    } finally {
      setSubmitting(false);
    }
  };

  const verifyAndCreate = async () => {
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const res = await verifySignup({
        email: email.trim(),
        otp,
        password,
        display_name: displayName.trim() || email.split("@")[0],
      });
      console.log("[SIGNUP] OK", res.user);
      setUser({ ...res.user, profile_complete: res.profile_complete });
      toast.success("Account created. Welcome!");
      navigate(res.profile_complete ? "/portal/dashboard" : "/portal/profile", { replace: true });
    } catch (e) {
      const msg = extractErrorMessage(e, "Verification failed");
      setOtpError(msg);
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const onEmailSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!email) return;
    sendOtp();
  };

  const onOtpSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) {
      setOtpError("Enter the 6-digit code");
      return;
    }
    setStep("password");
  };

  const onPasswordSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setErrorMsg("Password must be at least 8 characters");
      return;
    }
    if (!/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
      setErrorMsg("Password must include 1 uppercase letter and 1 number");
      return;
    }
    if (password !== confirm) {
      setErrorMsg("Passwords do not match");
      return;
    }
    if (!displayName.trim()) {
      setErrorMsg("Please enter your full name");
      return;
    }
    verifyAndCreate();
  };

  const strength = passwordStrength(password);
  const minutes = Math.floor(otpExpiresIn / 60);
  const seconds = otpExpiresIn % 60;

  return (
    <div className="min-h-[calc(100vh-4rem)] grid place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="font-display font-bold text-display-md text-ink mb-1">Create your account</h1>
          <p className="text-body-sm text-ink-variant">Join Silicon Mango Academy in 3 quick steps</p>
        </div>

        <div className="flex items-center justify-center gap-2 mb-5">
          {(["email", "otp", "password"] as Step[]).map((s, i) => {
            const active = step === s;
            const done = ["email", "otp", "password"].indexOf(step) > i;
            return (
              <div key={s} className="flex items-center gap-2">
                <div
                  className={`w-7 h-7 rounded-full grid place-items-center text-label font-semibold ${
                    active
                      ? "bg-primary text-white"
                      : done
                      ? "bg-tertiary text-white"
                      : "bg-surface-container text-ink-outline"
                  }`}
                >
                  {done ? <span className="icon text-[14px]">check</span> : i + 1}
                </div>
                {i < 2 && <div className={`w-8 h-px ${done ? "bg-tertiary" : "bg-ink-outlineVariant/40"}`} />}
              </div>
            );
          })}
        </div>

        <Card className="p-7">
          {errorMsg && (
            <div className="mb-4 p-3 rounded-lg bg-danger-container border border-danger/20 text-body-sm text-danger flex gap-2">
              <span className="icon text-[18px] mt-0.5">error</span>
              <p>{errorMsg}</p>
            </div>
          )}

          {step === "email" && (
            <form onSubmit={onEmailSubmit} className="space-y-4">
              <Input
                label="Email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
                required
                leftIcon="mail"
                hint="We'll send you a 6-digit verification code"
              />
              <Button type="submit" fullWidth size="lg" loading={submitting}>
                Send OTP
              </Button>

              <div className="my-2 flex items-center gap-3">
                <div className="flex-1 h-px bg-ink-outlineVariant/40" />
                <span className="text-label text-ink-outline">or sign up with</span>
                <div className="flex-1 h-px bg-ink-outlineVariant/40" />
              </div>

              <a href={apiUrl("/auth/google/authorize")}>
                <Button type="button" variant="outline" fullWidth size="lg">
                  <svg width="18" height="18" viewBox="0 0 18 18" className="mr-1">
                    <g>
                      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.79 2.71v2.26h2.9c1.7-1.57 2.69-3.88 2.69-6.61z"/>
                      <path fill="#34A853" d="M9 18c2.43 0 4.47-.81 5.95-2.18l-2.9-2.26c-.8.54-1.83.86-3.05.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A8.99 8.99 0 0 0 9 18z"/>
                      <path fill="#FBBC05" d="M3.97 10.71A5.4 5.4 0 0 1 3.68 9c0-.59.1-1.17.29-1.71V4.96H.96A8.99 8.99 0 0 0 0 9c0 1.45.35 2.83.96 4.04l3.01-2.33z"/>
                      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A8.99 8.99 0 0 0 .96 4.96L3.97 7.3C4.68 5.18 6.66 3.58 9 3.58z"/>
                    </g>
                  </svg>
                  Continue with Google
                </Button>
              </a>
            </form>
          )}

          {step === "otp" && (
            <form onSubmit={onOtpSubmit} className="space-y-5">
              <p className="text-body-sm text-ink-variant">
                Enter the 6-digit code sent to <strong className="text-ink">{email}</strong>
              </p>
              <OTPInput value={otp} onChange={(v) => { setOtp(v); setOtpError(null); }} autoFocus error={!!otpError} />
              {otpError && <p className="text-label text-danger">{otpError}</p>}
              <div className="flex items-center justify-between text-body-sm">
                <span className="text-ink-variant">
                  {otpExpiresIn > 0 ? (
                    <>Expires in <span className="font-mono font-semibold">{minutes}:{String(seconds).padStart(2, "0")}</span></>
                  ) : (
                    <span className="text-danger">Code expired</span>
                  )}
                </span>
                <button
                  type="button"
                  disabled={resendIn > 0 || submitting}
                  onClick={sendOtp}
                  className="text-primary font-semibold disabled:text-ink-outline disabled:cursor-not-allowed hover:underline"
                >
                  {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend OTP"}
                </button>
              </div>
              <Button type="submit" fullWidth size="lg" disabled={otp.length !== 6}>
                Continue
              </Button>
              <button
                type="button"
                className="text-body-sm text-ink-variant hover:text-ink mx-auto block"
                onClick={() => setStep("email")}
              >
                ← Use different email
              </button>
            </form>
          )}

          {step === "password" && (
            <form onSubmit={onPasswordSubmit} className="space-y-4">
              <Input
                label="Full name"
                placeholder="Your name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                autoFocus
                required
                leftIcon="person"
              />
              <Input
                label="Password"
                type="password"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                leftIcon="lock"
              />
              {password && (
                <div className="space-y-1">
                  <div className="h-1.5 rounded-full bg-surface-container overflow-hidden">
                    <div
                      className="h-full transition-all"
                      style={{ width: `${(strength.score / 5) * 100}%`, background: strength.color }}
                    />
                  </div>
                  <p className="text-label" style={{ color: strength.color }}>
                    {strength.label}
                  </p>
                </div>
              )}
              <Input
                label="Confirm password"
                type="password"
                placeholder="Re-enter password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                required
                leftIcon="lock"
              />
              <Button type="submit" fullWidth size="lg" loading={submitting}>
                Create Account
              </Button>
            </form>
          )}

          <p className="text-center text-body-sm text-ink-variant mt-6">
            Already have an account?{" "}
            <Link to="/login" className="text-primary font-semibold hover:underline">
              Sign in
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
