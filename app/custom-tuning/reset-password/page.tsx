"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  PASSWORD_REQUIREMENTS_TEXT,
  validatePasswordComplexity,
} from "@/lib/password-validation";

type ApiResponse = {
  ok?: boolean;
  error?: string;
  redirectTo?: string;
  retryAfterSeconds?: number;
  retryAfterText?: string;
};

function ResetPasswordForm() {
  const params = useSearchParams();
  const token = useMemo(() => params.get("token") || "", [params]);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!token) {
      setError("Reset token is missing or invalid.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Password confirmation does not match.");
      return;
    }

    const passwordError = validatePasswordComplexity(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("token", token);
      formData.append("password", password);
      formData.append("confirmPassword", confirmPassword);

      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        body: formData,
      });

      const data = (await response.json()) as ApiResponse;

      if (!response.ok || !data.ok) {
        setError(data.error || "Unable to reset password.");
        return;
      }

      setSuccess("Password reset successfully. Redirecting to login...");
      window.location.href = data.redirectTo || "/login";
    } catch {
      setError("Unable to reset password right now. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="section-pad">
      <div className="container-rk max-w-md">
        <h1 className="text-4xl font-bold">Reset Password</h1>

        <form onSubmit={handleSubmit} className="card-rk mt-8 space-y-5 p-6">
          <input type="hidden" name="token" value={token} />

          <div>
            <label className="label-rk">New Password</label>
            <div className="relative">
              <input className="input-rk pr-20" name="password" type={showPassword ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)} disabled={isSubmitting} />
              <button type="button" onClick={() => setShowPassword((prev) => !prev)} className="absolute inset-y-0 right-3 my-auto h-fit rounded-lg px-2 py-1 text-xs text-white/60 transition hover:bg-white/10 hover:text-white">
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            <p className="mt-2 text-xs text-white/50">{PASSWORD_REQUIREMENTS_TEXT}</p>
          </div>

          <div>
            <label className="label-rk">Confirm New Password</label>
            <div className="relative">
              <input className="input-rk pr-20" name="confirmPassword" type={showConfirmPassword ? "text" : "password"} required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={isSubmitting} />
              <button type="button" onClick={() => setShowConfirmPassword((prev) => !prev)} className="absolute inset-y-0 right-3 my-auto h-fit rounded-lg px-2 py-1 text-xs text-white/60 transition hover:bg-white/10 hover:text-white">
                {showConfirmPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {error ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
              <div className="font-semibold uppercase tracking-[0.18em] text-red-300/80">Reset Failed</div>
              <p className="mt-2 leading-6">{error}</p>
            </div>
          ) : null}

          {success ? (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
              <div className="font-semibold uppercase tracking-[0.18em] text-emerald-300/80">Success</div>
              <p className="mt-2 leading-6">{success}</p>
            </div>
          ) : null}

          <button className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60" disabled={isSubmitting}>
            {isSubmitting ? "Resetting Password..." : "Reset Password"}
          </button>
        </form>
      </div>
    </section>
  );
}

function ResetPasswordFallback() {
  return (
    <section className="section-pad">
      <div className="container-rk max-w-md">
        <h1 className="text-4xl font-bold">Reset Password</h1>
        <div className="card-rk mt-8 p-6 text-white/70">Loading...</div>
      </div>
    </section>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordFallback />}>
      <ResetPasswordForm />
    </Suspense>
  );
}
