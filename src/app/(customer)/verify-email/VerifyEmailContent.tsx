"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type VerificationState = "loading" | "success" | "error" | "missing";

type VerificationResponse = {
  message?: string;
};

export default function VerifyEmailContent({ token }: { token?: string }) {
  const [state, setState] = useState<VerificationState>(
    token ? "loading" : "missing",
  );
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!token) {
      return;
    }

    const verificationToken = token;
    let isCurrent = true;

    async function verifyEmail() {
      try {
        const response = await fetch(
          `/api/auth/verify-email?token=${encodeURIComponent(verificationToken)}`,
          { method: "GET", cache: "no-store" },
        );
        const responseBody = (await response.json()) as VerificationResponse;

        if (!isCurrent) {
          return;
        }

        if (response.ok) {
          setState("success");
          return;
        }

        setState("error");
        setErrorMessage(
          responseBody.message?.toLowerCase().includes("already")
            ? "Your email is already verified. You can sign in."
            : "Invalid or expired verification link.",
        );
      } catch {
        if (isCurrent) {
          setState("error");
          setErrorMessage("Something went wrong. Please try again.");
        }
      }
    }

    void verifyEmail();

    return () => {
      isCurrent = false;
    };
  }, [token]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-slate-100 sm:px-6">
      <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 text-center shadow-2xl shadow-black/20 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-400">
          Customer account
        </p>

        {state === "loading" && (
          <div className="mt-7" role="status" aria-live="polite">
            <h1 className="text-3xl font-semibold tracking-tight text-white">
              Verifying your email
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Please wait while we verify your email address.
            </p>
          </div>
        )}

        {state === "success" && (
          <div className="mt-7">
            <h1 className="text-3xl font-semibold tracking-tight text-white">
              Email verified successfully!
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-400">
              Your email has been verified. You can now sign in.
            </p>
            <Link
              href="/login"
              className="mt-7 block rounded-lg bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
            >
              Go to Sign In
            </Link>
          </div>
        )}

        {(state === "missing" || state === "error") && (
          <div className="mt-7">
            <h1 className="text-3xl font-semibold tracking-tight text-white">
              Verification unsuccessful
            </h1>
            <p
              className="mt-3 rounded-lg border border-rose-400/20 bg-rose-400/10 px-3.5 py-3 text-sm leading-6 text-rose-200"
              role="alert"
              aria-live="polite"
            >
              {state === "missing"
                ? "Invalid verification link."
                : errorMessage}
            </p>
            <div className="mt-7 space-y-3">
              <Link
                href="/resend-verification"
                className="block rounded-lg bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
              >
                Resend Verification Email
              </Link>
              <Link
                href="/login"
                className="block text-sm font-semibold text-cyan-300 transition hover:text-cyan-200"
              >
                Go to Sign In
              </Link>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
