import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 py-16 text-zinc-50">
      <section className="w-full max-w-2xl text-center">
        <p className="mb-5 text-sm font-medium uppercase tracking-[0.3em] text-amber-300">
          Store foundation
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
          E-commerce Application
        </h1>
        <div className="mt-10 flex flex-col justify-center gap-4 sm:flex-row">
          <Link
            href="/customer"
            className="rounded-lg bg-amber-300 px-6 py-3 font-semibold text-zinc-950 transition-colors hover:bg-amber-200"
          >
            Customer
          </Link>
          <Link
            href="/admin"
            className="rounded-lg border border-zinc-700 px-6 py-3 font-semibold text-zinc-50 transition-colors hover:border-zinc-500 hover:bg-zinc-900"
          >
            Admin Panel
          </Link>
        </div>
      </section>
    </main>
  );
}
