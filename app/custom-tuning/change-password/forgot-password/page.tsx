"use client";

import { useState } from "react";

type ApiResponse = {
  ok?: boolean;
  error?: string;
  message?: string;
  retryAfterSeconds?: number;
  retryAfterText?: string;
};

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");
    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("email", email.trim().toLowerCase());

      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        body: formData,
      });

      const data = (await response.json()) as ApiResponse;

      if (!response.ok || data.ok === false) {
        setError(data.error || "Unable to process your request right now. Please try again.");
        return;
      }

      setSuccess(data.message || "If the email exists, a reset link has been sent.");
    } catch {
      setError("Unable to process your request right now. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="section-pad">
      <div className="container-rk max-w-md">
        <h1 className="text-4xl font-bold">Forgot Password</h1>

        <form onSubmit={handleSubmit} className="card-rk mt-6 space-y-5 p-6">
          <div>
            <label className="label-rk">Email</label>
            <input
              className="input-rk"
              name="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          {error ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
              <div className="font-semibold uppercase tracking-[0.18em] text-red-300/80">Reset Request Failed</div>
              <p className="mt-2 leading-6">{error}</p>
            </div>
          ) : null}

          {success ? (
            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm text-emerald-300">
              <div className="font-semibold uppercase tracking-[0.18em] text-emerald-300/80">Success</div>
              <p className="mt-2 leading-6">{success}</p>
            </div>
          ) : null}

          <button className="btn-primary w-full" disabled={isSubmitting}>
            {isSubmitting ? "Sending Reset Link..." : "Send Reset Link"}
          </button>
        </form>
      </div>
    </section>
  );
}
