import { FormEvent, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { apiUrl, extractErrorCode, extractErrorMessage } from "@/lib/api";
import { useAuthStore } from "@/features/auth/stores/authStore";
import { login as loginApi } from "@/services/auth.service";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const setUser = useAuthStore((s) => s.setUser);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const err = params.get("error");
    if (err) {
      const map: Record<string, string> = {
        oauth_failed: "Google sign-in failed. Please try again.",
        oauth_state_mismatch: "Google sign-in expired. Please try again.",
        oauth_token_failed: "Google sign-in token exchange failed.",
        oauth_userinfo_failed: "Could not read your Google profile.",
        AUTH_002: "This email is registered with email/password. Please sign in with your credentials.",
        AUTH_011: "Your account has been deactivated. Contact support.",
      };
      setErrorMsg(map[err] || "Sign-in failed. Please try again.");
    }
  }, [location.search]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);
    try {
      const res = await loginApi(email.trim(), password);
      console.log("[LOGIN] OK", res.user);
      setUser({ ...res.user, profile_complete: res.profile_complete });
      toast.success("Welcome back!");
      const role = res.user.role;
      if (role === "admin") navigate("/admin/dashboard", { replace: true });
      else if (role === "instructor") navigate("/instructor/dashboard", { replace: true });
      else if (!res.profile_complete) navigate("/portal/profile", { replace: true });
      else navigate("/portal/dashboard", { replace: true });
    } catch (err) {
      const code = extractErrorCode(err);
      const msg = extractErrorMessage(err, "Sign-in failed");
      console.warn("[LOGIN] failed", code, msg);
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] grid place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <h1 className="font-display font-bold text-display-md text-ink mb-1">Welcome back</h1>
          <p className="text-body-sm text-ink-variant">Sign in to continue your learning journey</p>
        </div>
        <Card className="p-7">
          {errorMsg && (
            <div className="mb-4 p-3 rounded-lg bg-danger-container border border-danger/20 text-body-sm text-danger flex gap-2">
              <span className="icon text-[18px] mt-0.5">error</span>
              <p>{errorMsg}</p>
            </div>
          )}
          <form onSubmit={onSubmit} className="space-y-4">
            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              leftIcon="mail"
            />
            <Input
              label="Password"
              type="password"
              placeholder="Enter your password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              leftIcon="lock"
            />
            <Button type="submit" fullWidth size="lg" loading={submitting}>
              Sign In
            </Button>
          </form>

          <div className="my-5 flex items-center gap-3">
            <div className="flex-1 h-px bg-ink-outlineVariant/40" />
            <span className="text-label text-ink-outline">or continue with</span>
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
              Sign in with Google
            </Button>
          </a>

          <p className="text-center text-body-sm text-ink-variant mt-6">
            New student?{" "}
            <Link to="/signup" className="text-primary font-semibold hover:underline">
              Create an account →
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
