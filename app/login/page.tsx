"use client";

import Link from "next/link";
import { useState } from "react";

type ApiResponse = {
  ok?: boolean;
  error?: string;
  redirectTo?: string;
};

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const formData = new FormData();
      formData.append("email", email);
      formData.append("password", password);

      const response = await fetch("/api/auth/login", {
        method: "POST",
        body: formData,
      });

      const data = (await response.json()) as ApiResponse;

      if (!response.ok || !data.ok) {
        setError(data.error || "Invalid email or password.");
        return;
      }

      window.location.href = data.redirectTo || "/dashboard";
    } catch {
      setError("Unable to login right now. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="section-pad">
      <div className="container-rk max-w-md">
        <h1 className="text-4xl font-bold">Login</h1>

        <form onSubmit={handleSubmit} className="card-rk mt-8 space-y-5 p-6">
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
            <div className="mb-2 flex items-center justify-between">
              <label className="label-rk mb-0">Password</label>
              <Link
                href="/forgot-password"
                className="text-sm text-white/60 transition hover:text-white"
              >
                Forgot password?
              </Link>
            </div>

            <div className="relative">
              <input
                className="input-rk pr-20"
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
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
          </div>

          {error ? (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
              <div className="font-semibold uppercase tracking-[0.18em] text-red-300/80">
                Login Failed
              </div>
              <p className="mt-2 leading-6">{error}</p>
            </div>
          ) : null}

          <button
            type="submit"
            className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Signing In..." : "Login"}
          </button>

          <p className="text-center text-sm text-white/70">
            Don&apos;t have an account?{" "}
            <Link
              href="/register"
              className="font-medium text-white transition hover:text-white/80"
            >
              Register
            </Link>
          </p>
        </form>
      </div>
    </section>
  );
}
