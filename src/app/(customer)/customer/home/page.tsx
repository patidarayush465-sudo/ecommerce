import Link from "next/link";

import CustomerLogoutButton from "./CustomerLogoutButton";
import NotificationRegistrationButton from "./NotificationRegistrationButton";

export default function CustomerHomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 py-16 text-zinc-50">
      <section className="w-full max-w-xl text-center">
        <p className="mb-5 text-sm font-medium uppercase tracking-[0.3em] text-amber-300">
          Customer account
        </p>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
          Customer Home
        </h1>
        <p className="mx-auto mt-4 max-w-md text-base leading-7 text-zinc-400">
          Welcome to E-commerce Application
        </p>
        <div className="mt-10 flex justify-center">
          <div className="flex flex-col gap-4 sm:flex-row">
            <Link
              href="/products"
              className="rounded-lg bg-amber-300 px-6 py-3 font-semibold text-zinc-950 transition-colors hover:bg-amber-200"
            >
              Products
            </Link>
            <Link
              href="/profile"
              className="rounded-lg border border-zinc-700 px-6 py-3 font-semibold text-zinc-50 transition-colors hover:border-zinc-500 hover:bg-zinc-900"
            >
              Profile
            </Link>
            <Link
              href="/customer/cart"
              className="rounded-lg border border-zinc-700 px-6 py-3 font-semibold text-zinc-50 transition-colors hover:border-zinc-500 hover:bg-zinc-900"
            >
              Cart
            </Link>
            <Link
              href="/customer/addresses"
              className="rounded-lg border border-zinc-700 px-6 py-3 font-semibold text-zinc-50 transition-colors hover:border-zinc-500 hover:bg-zinc-900"
            >
              Addresses
            </Link>
            <Link
              href="/customer/orders"
              className="rounded-lg border border-zinc-700 px-6 py-3 font-semibold text-zinc-50 transition-colors hover:border-zinc-500 hover:bg-zinc-900"
            >
              My Orders
            </Link>
            <Link
              href="/customer/support"
              className="rounded-lg border border-zinc-700 px-6 py-3 font-semibold text-zinc-50 transition-colors hover:border-zinc-500 hover:bg-zinc-900"
            >
              Support
            </Link>
            <Link
              href="/customer/returns"
              className="rounded-lg border border-zinc-700 px-6 py-3 font-semibold text-zinc-50 transition-colors hover:border-zinc-500 hover:bg-zinc-900"
            >
              My Returns
            </Link>
            <Link
              href="/customer/wishlist"
              className="rounded-lg border border-zinc-700 px-6 py-3 font-semibold text-zinc-50 transition-colors hover:border-zinc-500 hover:bg-zinc-900"
            >
              Wishlist
            </Link>
          </div>
        </div>
        <CustomerLogoutButton />
        <NotificationRegistrationButton />
      </section>
    </main>
  );
}
