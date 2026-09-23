"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  customerLoginSchema,
  customerResendVerificationSchema,
  type CustomerLoginInput,
} from "@/validations/auth.validation";

type LoginResponse = {
  message?: string;
  isEmailVerified?: boolean;
  data?: {
    user?: {
      name: string;
    };
  };
  errors?: Array<{ message?: string }>;
};

const RESEND_COOLDOWN_SECONDS = 60;
const UNVERIFIED_EMAIL_MESSAGE = "Please verify your email before login";

export default function CustomerLoginPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState("");
  const [showResendVerification, setShowResendVerification] = useState(false);
  const [resendError, setResendError] = useState("");
  const [resendSuccess, setResendSuccess] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isResending, setIsResending] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<CustomerLoginInput>({
    resolver: zodResolver(customerLoginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  useEffect(() => {
    if (!showResendVerification || resendCooldown <= 0) return;

    const intervalId = window.setInterval(() => {
      setResendCooldown((currentCooldown) =>
        currentCooldown > 0 ? currentCooldown - 1 : 0,
      );
    }, 1000);

    return () => window.clearInterval(intervalId);
  }, [resendCooldown, showResendVerification]);

  async function resendVerificationEmail() {
    if (resendCooldown > 0 || isResending) return;

    setResendError("");
    setResendSuccess("");
    const emailResult = customerResendVerificationSchema.safeParse({
      email: getValues("email"),
    });

    if (!emailResult.success) {
      setResendError("Enter a valid email address before resending.");
      return;
    }

    setIsResending(true);

    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(emailResult.data),
      });
      const responseBody = (await response.json()) as LoginResponse;

      if (!response.ok) {
        setResendError(
          response.status >= 500
            ? "Something went wrong. Please try again."
            : responseBody.message ??
                responseBody.errors?.[0]?.message ??
                "Unable to resend the verification email.",
        );
        return;
      }

      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      setResendSuccess("Verification email sent. Please check your inbox.");
    } catch {
      setResendError("Something went wrong. Please try again.");
    } finally {
      setIsResending(false);
    }
  }

  async function onSubmit(values: CustomerLoginInput) {
    setServerError("");
    setShowResendVerification(false);
    setResendCooldown(0);
    setResendError("");
    setResendSuccess("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/customer/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
      });
      const responseBody = (await response.json()) as LoginResponse;

      if (!response.ok) {
        const isUnverifiedEmailError =
          response.status === 403 &&
          responseBody.isEmailVerified === false &&
          responseBody.message === UNVERIFIED_EMAIL_MESSAGE;

        if (isUnverifiedEmailError) {
          setServerError(responseBody.message ?? UNVERIFIED_EMAIL_MESSAGE);
          setShowResendVerification(true);
          setResendCooldown(RESEND_COOLDOWN_SECONDS);
        } else if (response.status === 403) {
          setServerError(
            responseBody.message ?? "This account cannot use customer login.",
          );
        } else if (response.status === 401) {
          setServerError("Invalid email or password.");
        } else {
          setServerError("Something went wrong. Please try again.");
        }

        return;
      }

      setShowResendVerification(false);
      setResendCooldown(0);
      router.push("/customer/home");
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
            Welcome back
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            Log in to continue shopping.
          </p>
        </div>

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

          <div>
            <label
              className="mb-2 block text-sm font-medium text-slate-200"
              htmlFor="password"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={errors.password ? "true" : "false"}
              aria-describedby={errors.password ? "password-error" : undefined}
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-3 text-sm text-white outline-none transition placeholder:text-slate-600 focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20"
              placeholder="Enter your password"
              {...register("password")}
            />
            {errors.password && (
              <p id="password-error" className="mt-2 text-sm text-rose-300">
                {errors.password.message}
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
            {isSubmitting ? "Logging in..." : "Log in"}
          </button>
        </form>

        <div className="mt-5 text-center">
          <Link
            href="/forgot-password"
            className="text-sm font-medium text-cyan-300 transition hover:text-cyan-200"
          >
            Forgot Password?
          </Link>
        </div>

        {showResendVerification && (
          <div className="mt-5 text-center" aria-live="polite">
            {resendCooldown > 0 ? (
              <p className="text-sm text-slate-500">
                Resend verification email in {resendCooldown}s
              </p>
            ) : (
              <button
                type="button"
                onClick={() => void resendVerificationEmail()}
                disabled={isResending}
                className="text-sm font-medium text-cyan-300 transition hover:text-cyan-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isResending ? "Sending..." : "Resend verification email"}
              </button>
            )}
            {resendError && (
              <p className="mt-2 text-sm text-rose-300" role="alert">
                {resendError}
              </p>
            )}
            {resendSuccess && (
              <p className="mt-2 text-sm text-emerald-300" role="status">
                {resendSuccess}
              </p>
            )}
          </div>
        )}

        <p className="mt-7 text-center text-sm text-slate-400">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="font-semibold text-cyan-300 transition hover:text-cyan-200"
          >
            Create Account
          </Link>
        </p>
      </section>
    </main>
  );
}
