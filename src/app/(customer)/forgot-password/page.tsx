"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  customerForgotPasswordSchema,
  type CustomerForgotPasswordInput,
} from "@/validations/auth.validation";

type ForgotPasswordResponse = { message?: string; errors?: Array<{ message?: string }> };

export default function ForgotPasswordPage() {
  const [serverError, setServerError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<CustomerForgotPasswordInput>({
    resolver: zodResolver(customerForgotPasswordSchema),
    defaultValues: { email: "" },
  });

  async function onSubmit(values: CustomerForgotPasswordInput) {
    setServerError("");
    setSuccessMessage("");
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/customer/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = (await response.json()) as ForgotPasswordResponse;
      if (!response.ok) {
        setServerError(body.errors?.[0]?.message ?? body.message ?? "Unable to send the reset link.");
        return;
      }
      setSuccessMessage(body.message ?? "If an account exists with this email, a password reset link has been sent.");
    } catch {
      setServerError("Unable to send the reset link. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-slate-100 sm:px-6">
      <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-black/20 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-400">Customer account</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">Forgot Password?</h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">Enter your email and we&apos;ll send a password reset link if an account exists.</p>
        {successMessage ? (
          <div className="mt-7 space-y-5">
            <p className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3.5 py-3 text-sm leading-6 text-emerald-200" role="status">{successMessage}</p>
            <Link href="/login" className="block rounded-lg bg-cyan-400 px-4 py-3 text-center text-sm font-semibold text-slate-950 hover:bg-cyan-300">Go to Sign In</Link>
          </div>
        ) : (
          <form className="mt-7 space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-medium text-slate-200">Email address</label>
              <input id="email" type="email" autoComplete="email" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-3 text-sm text-white outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20" {...register("email")} />
              {errors.email && <p className="mt-2 text-sm text-rose-300">{errors.email.message}</p>}
            </div>
            {serverError && <p className="rounded-lg border border-rose-400/20 bg-rose-400/10 px-3.5 py-3 text-sm text-rose-200" role="alert">{serverError}</p>}
            <button type="submit" disabled={isSubmitting} aria-busy={isSubmitting} className="w-full rounded-lg bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60">{isSubmitting ? "Sending..." : "Send Reset Link"}</button>
          </form>
        )}
        <p className="mt-7 text-center text-sm text-slate-400"><Link href="/login" className="font-semibold text-cyan-300 hover:text-cyan-200">Back to Sign In</Link></p>
      </section>
    </main>
  );
}