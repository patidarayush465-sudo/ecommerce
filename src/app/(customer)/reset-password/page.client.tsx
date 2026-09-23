"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  customerResetPasswordSchema,
  type CustomerResetPasswordInput,
} from "@/validations/auth.validation";

type ResetPasswordResponse = { message?: string; errors?: Array<{ message?: string }> };

export default function ResetPasswordClient() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [serverError, setServerError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<CustomerResetPasswordInput>({
    resolver: zodResolver(customerResetPasswordSchema),
    defaultValues: { token, password: "", confirmPassword: "" },
  });

  async function onSubmit(values: CustomerResetPasswordInput) {
    setServerError("");
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/auth/customer/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, token }),
      });
      const body = (await response.json()) as ResetPasswordResponse;
      if (!response.ok) {
        setServerError(body.errors?.[0]?.message ?? body.message ?? "Unable to reset your password.");
        return;
      }
      setSuccessMessage(body.message ?? "Password reset successfully.");
    } catch {
      setServerError("Unable to reset your password. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-slate-100 sm:px-6">
      <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-black/20 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-400">Customer account</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">Reset Password</h1>
        {successMessage ? (
          <div className="mt-7 space-y-5">
            <p className="rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3.5 py-3 text-sm text-emerald-200" role="status">{successMessage}</p>
            <Link href="/login" className="block rounded-lg bg-cyan-400 px-4 py-3 text-center text-sm font-semibold text-slate-950 hover:bg-cyan-300">Go to Login</Link>
          </div>
        ) : (
          <form className="mt-7 space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
            <div><label htmlFor="password" className="mb-2 block text-sm font-medium text-slate-200">New Password</label><input id="password" type="password" autoComplete="new-password" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-3 text-sm text-white outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20" {...register("password")} />{errors.password && <p className="mt-2 text-sm text-rose-300">{errors.password.message}</p>}</div>
            <div><label htmlFor="confirmPassword" className="mb-2 block text-sm font-medium text-slate-200">Confirm Password</label><input id="confirmPassword" type="password" autoComplete="new-password" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-3 text-sm text-white outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20" {...register("confirmPassword")} />{errors.confirmPassword && <p className="mt-2 text-sm text-rose-300">{errors.confirmPassword.message}</p>}</div>
            {serverError && <p className="rounded-lg border border-rose-400/20 bg-rose-400/10 px-3.5 py-3 text-sm text-rose-200" role="alert">{serverError}</p>}
            <button type="submit" disabled={isSubmitting || !token} aria-busy={isSubmitting} className="w-full rounded-lg bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60">{isSubmitting ? "Resetting..." : "Reset Password"}</button>
          </form>
        )}
        {!successMessage && <p className="mt-7 text-center text-sm text-slate-400"><Link href="/login" className="font-semibold text-cyan-300 hover:text-cyan-200">Back to Sign In</Link></p>}
      </section>
    </main>
  );
}