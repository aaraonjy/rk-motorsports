"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  PASSWORD_REQUIREMENTS_TEXT,
  validatePasswordComplexity,
} from "@/lib/password-validation";
import { PHONE_COUNTRY_CODES } from "@/lib/phone-country-codes";

type ApiResponse = {
  ok?: boolean;
  error?: string;
  redirectTo?: string;
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [countryCode, setCountryCode] = useState("MY");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isCountryOpen, setIsCountryOpen] = useState(false);

  const countryDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        countryDropdownRef.current &&
        !countryDropdownRef.current.contains(event.target as Node)
      ) {
        setIsCountryOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const selectedCountry =
    PHONE_COUNTRY_CODES.find((item) => item.code === countryCode) ||
    PHONE_COUNTRY_CODES[0];

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSuccess("");

    const normalizedEmail = email.trim().toLowerCase();

    if (!EMAIL_REGEX.test(normalizedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    if (!selectedCountry) {
      setError("Please select a valid country code.");
      return;
    }

    const cleanedPhone = phone.replace(/[^\d]/g, "");
    const normalizedLocalPhone = cleanedPhone.startsWith("0")
      ? cleanedPhone.slice(1)
      : cleanedPhone;

    if (!normalizedLocalPhone) {
      setError("Please enter a valid phone number.");
      return;
    }

    if (normalizedLocalPhone.length < 7 || normalizedLocalPhone.length > 12) {
      setError("Please enter a valid phone number.");
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
      formData.append("countryCode", countryCode);
      formData.append("phone", normalizedLocalPhone);
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

            <div className="flex items-stretch gap-2">
              <div className="relative w-48" ref={countryDropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsCountryOpen((prev) => !prev)}
                  disabled={isSubmitting}
                  className="input-rk flex h-full w-full items-center justify-between gap-3 px-4 text-left disabled:cursor-not-allowed"
                >
                  <span className="truncate">
                    {selectedCountry.label} {selectedCountry.dialCode}
                  </span>
                  <span className="text-white/60">{isCountryOpen ? "▴" : "▾"}</span>
                </button>

                {isCountryOpen ? (
                  <div className="absolute left-0 top-[calc(100%+8px)] z-50 max-h-72 w-full overflow-y-auto rounded-2xl border border-white/10 bg-black/95 shadow-2xl backdrop-blur">
                    {PHONE_COUNTRY_CODES.map((item) => (
                      <button
                        key={item.code}
                        type="button"
                        onClick={() => {
                          setCountryCode(item.code);
                          setIsCountryOpen(false);
                        }}
                        className={`flex w-full items-center justify-between px-4 py-3 text-left text-sm transition hover:bg-white/10 ${
                          item.code === countryCode ? "bg-white/10" : ""
                        }`}
                      >
                        <span className="truncate">{item.label}</span>
                        <span className="ml-3 shrink-0 text-white/70">
                          {item.dialCode}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="relative flex-1">
                <div className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-white/60">
                  {selectedCountry.dialCode}
                </div>
                <input
                  className="input-rk pl-16"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  required
                  inputMode="numeric"
                  placeholder="123456789"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
            </div>
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