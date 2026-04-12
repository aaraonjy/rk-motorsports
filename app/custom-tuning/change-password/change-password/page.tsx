"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";

type ApiResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
};

const PASSWORD_REQUIREMENTS_TEXT =
  "Password must be at least 8 characters and include at least 1 uppercase letter, 1 lowercase letter, and 1 number.";

function validatePasswordComplexity(password: string) {
  if (password.length < 8) {
    return "Password must be at least 8 characters.";
  }

  if (!/[a-z]/.test(password)) {
    return "Password must include at least 1 lowercase letter.";
  }

  if (!/[A-Z]/.test(password)) {
    return "Password must include at least 1 uppercase letter.";
  }

  if (!/\d/.test(password)) {
    return "Password must include at least 1 number.";
  }

  return "";
}

export default function ChangePasswordPage() {
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("All password fields are required.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New password confirmation does not match.");
      return;
    }

    if (currentPassword === newPassword) {
      setError("New password must be different from your current password.");
      return;
    }

    const passwordError = validatePasswordComplexity(newPassword);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("currentPassword", currentPassword);
      formData.append("newPassword", newPassword);
      formData.append("confirmPassword", confirmPassword);

      const response = await fetch("/api/auth/change-password", {
        method: "POST",
        body: formData,
      });

      const data = (await response.json()) as ApiResponse;

      if (!response.ok || !data.ok) {
        setError(data.error || "Unable to update password.");
        return;
      }

      setSuccess(data.message || "Password updated successfully.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      window.setTimeout(() => {
        router.push("/dashboard");
        router.refresh();
      }, 1200);
    } catch {
      setError("Unable to update password right now. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="section-pad">
      <div className="container-rk max-w-md">
        <h1 className="text-4xl font-bold">Change Password</h1>
        <p className="mt-3 text-sm leading-6 text-white/60">
          Update your account password securely. After changing it, use your new
          password the next time you log in.
        </p>

        <form onSubmit={handleSubmit} className="card-rk mt-8 space-y-5 p-6">
          <div>
            <label className="label-rk">Current Password</label>
            <div className="relative">
              <input
                className="input-rk pr-20"
                name="currentPassword"
                type={showCurrentPassword ? "text" : "password"}
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={isSubmitting}
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword((prev) => !prev)}
                className="absolute inset-y-0 right-3 my-auto h-fit rounded-lg px-2 py-1 text-xs text-white/60 transition hover:bg-white/10 hover:text-white"
              >
                {showCurrentPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <div>
            <label className="label-rk">New Password</label>
            <div className="relative">
              <input
                className="input-rk pr-20"
                name="newPassword"
                type={showNewPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={isSubmitting}
              />
              <button
                type="button"
                onClick={() => setShowNewPassword((prev) => !prev)}
                className="absolute inset-y-0 right-3 my-auto h-fit rounded-lg px-2 py-1 text-xs text-white/60 transition hover:bg-white/10 hover:text-white"
              >
                {showNewPassword ? "Hide" : "Show"}
              </button>
            </div>
            <p className="mt-2 text-xs text-white/50">
              {PASSWORD_REQUIREMENTS_TEXT}
            </p>
          </div>

          <div>
            <label className="label-rk">Confirm New Password</label>
            <div className="relative">
              <input
                className="input-rk pr-20"
                name="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isSubmitting}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                className="absolute inset-y-0 right-3 my-auto h-fit rounded-lg px-2 py-1 text-xs text-white/60 transition hover:bg-white/10 hover:text-white"
              >
                {showConfirmPassword ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          {error ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
              <div className="font-semibold uppercase tracking-[0.18em] text-red-300/80">
                Update Failed
              </div>
              <p className="mt-2 leading-6">{error}</p>
            </div>
          ) : null}

          {success ? (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-200">
              <div className="font-semibold uppercase tracking-[0.18em] text-emerald-300/80">
                Success
              </div>
              <p className="mt-2 leading-6">{success}</p>
            </div>
          ) : null}

          <button
            type="submit"
            className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Updating Password..." : "Update Password"}
          </button>

          <p className="text-center text-sm text-white/70">
            <Link
              href="/dashboard"
              className="font-medium text-white transition hover:text-white/80"
            >
              Back to Dashboard
            </Link>
          </p>
        </form>
      </div>
    </section>
  );
}
