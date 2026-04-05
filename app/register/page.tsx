"use client";

import Link from "next/link";
import { useState } from "react";
import {
  PASSWORD_REQUIREMENTS_TEXT,
  validatePasswordComplexity,
} from "@/lib/password-validation";

type ApiResponse = {
  ok?: boolean;
  error?: string;
  redirectTo?: string;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+?[0-9]{10,15}$/;

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
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

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPhone = phone.trim();

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    if (!PHONE_REGEX.test(normalizedPhone)) {
      setError("Please enter a valid phone number (10 to 15 digits, optional +).");
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
      formData.append("name", name);
      formData.append("email", normalizedEmail);
      formData.append("phone", normalizedPhone);
      formData.append("password", password);
      formData.append("confirmPassword", confirmPassword);

      const response = await fetch("/api/auth/register", {
        method: "POST",
        body: formData,
      });

      const data = (await response.json()) as ApiResponse;

      if (!response.ok || !data.ok) {
        setError(data.error || "Unable to create account.");
        return;
      }

      setSuccess("Account created successfully. Redirecting...");
      window.location.href = data.redirectTo || "/dashboard";
    } catch {
      setError("Unable to create account right now. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="section-pad">
      <div className="container-rk max-w-md">
        <h1 className="text-4xl font-bold">Register</h1>

        <form onSubmit={handleSubmit} className="card-rk mt-8 space-y-4 p-6">
          <div>
            <label className="label-rk">Name</label>
            <input
              className="input-rk"
              name="name"
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className="label-rk">Email</label>
            <input
              className="input-rk"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className="label-rk">Phone Number</label>
            <input
              className="input-rk"
              name="phone"
              type="tel"
              autoComplete="tel"
              required
              inputMode="tel"
              placeholder="e.g. +60123456789"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className="label-rk">Password</label>
            <div className="relative">
              <input
                className="input-rk pr-20"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute inset-y-0 right-3 my-auto h-fit rounded-lg px-2 py-1 text-xs text-white/60 transition hover:bg-white/10 hover:text-white"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            <p className="mt-2 text-xs text-white/50">
              {PASSWORD_REQUIREMENTS_TEXT}
            </p>
          </div>

          <div>
            <label className="label-rk">Confirm Password</label>
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
                Registration Failed
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
            {isSubmitting ? "Creating Account..." : "Create account"}
          </button>

          <p className="text-center text-sm text-white/70">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium text-white transition hover:text-white/80"
            >
              Login
            </Link>
          </p>
        </form>
      </div>
    </section>
  );
}