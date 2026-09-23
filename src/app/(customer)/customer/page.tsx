import Link from "next/link";

export default function CustomerEntryPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 py-16 text-zinc-50">
      <section className="w-full max-w-xl text-center">
        <p className="mb-5 text-sm font-medium uppercase tracking-[0.3em] text-amber-300">
          Customer account
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Customer
        </h1>
        <p className="mx-auto mt-4 max-w-md text-base leading-7 text-zinc-400">
          Welcome back. Sign in to your account or create a new one to get
          started.
        </p>
        <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row">
          <Link
            href="/login"
            className="rounded-lg bg-amber-300 px-6 py-3 font-semibold text-zinc-950 transition-colors hover:bg-amber-200"
          >
            Sign In
          </Link>
          <Link
            href="/signup"
            className="rounded-lg border border-zinc-700 px-6 py-3 font-semibold text-zinc-50 transition-colors hover:border-zinc-500 hover:bg-zinc-900"
          >
            Sign Up
          </Link>
        </div>
        <Link
          href="/"
          className="mt-8 inline-block text-sm font-medium text-zinc-400 transition-colors hover:text-zinc-100"
        >
          Back to Home
        </Link>
      </section>
    </main>
  );
}
