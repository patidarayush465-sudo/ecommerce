"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  customerResendVerificationSchema,
  type CustomerResendVerificationInput,
} from "@/validations/auth.validation";

type ResendResponse = {
  message?: string;
  errors?: Array<{ message?: string }>;
};

export default function ResendVerificationPage() {
  const [serverError, setServerError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CustomerResendVerificationInput>({
    resolver: zodResolver(customerResendVerificationSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: CustomerResendVerificationInput) {
    setServerError("");
    setSuccessMessage("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const responseBody = (await response.json()) as ResendResponse;

      if (!response.ok) {
        setServerError(
          response.status >= 500
            ? "Something went wrong. Please try again."
            : responseBody.message ??
                responseBody.errors?.[0]?.message ??
                "Unable to resend the verification email.",
        );
        return;
      }

      setSuccessMessage(
        "Verification email sent successfully. Please check your inbox.",
      );
    } catch {
      setServerError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-slate-100 sm:px-6">
      <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-black/20 sm:p-8">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-400">
            Customer account
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
            Resend verification email
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Enter your email address and we&apos;ll send you a new verification link.
          </p>
        </div>

        {successMessage ? (
          <div className="space-y-5">
            <p
              className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3.5 py-3 text-sm leading-6 text-emerald-200"
              role="status"
              aria-live="polite"
            >
              {successMessage}
            </p>
            <Link
              href="/login"
              className="block w-full rounded-lg bg-cyan-400 px-4 py-3 text-center text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
            >
              Go to Sign In
            </Link>
          </div>
        ) : (
          <form className="space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
            <div>
              <label
                className="mb-2 block text-sm font-medium text-slate-200"
                htmlFor="email"
              >
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                aria-invalid={errors.email ? "true" : "false"}
                aria-describedby={errors.email ? "email-error" : undefined}
                className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
                placeholder="you@example.com"
                {...register("email")}
              />
              {errors.email && (
                <p id="email-error" className="mt-2 text-sm text-rose-300">
                  {errors.email.message}
                </p>
              )}
            </div>

            {serverError && (
              <p
                className="rounded-lg border border-rose-400/20 bg-rose-400/10 px-3.5 py-3 text-sm text-rose-200"
                role="alert"
                aria-live="polite"
              >
                {serverError}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              aria-busy={isSubmitting}
              className="w-full rounded-lg bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Sending..." : "Resend Verification Email"}
            </button>
          </form>
        )}

        {!successMessage && (
          <p className="mt-7 text-center text-sm text-slate-400">
            Ready to sign in?{" "}
            <Link
              href="/login"
              className="font-semibold text-cyan-300 transition hover:text-cyan-200"
            >
              Go to Sign In
            </Link>
          </p>
        )}
      </section>
    </main>
  );
}
