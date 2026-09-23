"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import {
  adminLoginSchema,
  type AdminLoginInput,
} from "@/validations/auth.validation";

type LoginResponse = { message?: string };

export default function AdminLoginPage() {
  const router = useRouter();
  const [serverError, setServerError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AdminLoginInput>({
    resolver: zodResolver(adminLoginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: AdminLoginInput) {
    setServerError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/admin/login-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const responseBody = (await response.json()) as LoginResponse;

      if (!response.ok) {
        setServerError(
          response.status >= 500
            ? "Something went wrong. Please try again."
            : responseBody.message ?? "Invalid email or password.",
        );
        return;
      }

      router.push("/admin");
    } catch {
      setServerError("Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 px-4 py-10 text-slate-100 sm:px-6">
      <section className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl shadow-black/20 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-cyan-400">
          E-Commerce Admin
        </p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">
          Admin Login
        </h1>

        <form className="mt-8 space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
          <div>
            <label className="mb-2 block text-sm font-medium" htmlFor="email">
              Email address
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-3 text-sm outline-none focus:border-cyan-400"
              {...register("email")}
            />
            {errors.email && (
              <p className="mt-2 text-sm text-rose-300">{errors.email.message}</p>
            )}
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-3 text-sm outline-none focus:border-cyan-400"
              {...register("password")}
            />
            {errors.password && (
              <p className="mt-2 text-sm text-rose-300">{errors.password.message}</p>
            )}
          </div>
          {serverError && (
            <p className="rounded-lg border border-rose-400/20 bg-rose-400/10 px-3.5 py-3 text-sm text-rose-200" role="alert">
              {serverError}
            </p>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Logging in..." : "Admin Login"}
          </button>
        </form>
      </section>
    </main>
  );
}