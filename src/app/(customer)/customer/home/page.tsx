"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import CustomerLogoutButton from "./CustomerLogoutButton";
import NotificationRegistrationButton from "./NotificationRegistrationButton";

type ProductImage = {
  url: string;
  publicId: string;
};

type ProductReference = {
  _id: string;
  name: string;
};

type CustomerProduct = {
  _id: string;
  name: string;
  description: string;
  price: number;
  mrp: number;
  discountPercent?: number;
  sellingPrice: number;
  stock: number;
  images: ProductImage[];
  category: ProductReference;
  subcategory: ProductReference;
};

type ProductsResponse = {
  message?: string;
  data?: CustomerProduct[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

const FEATURED_LIMIT = 4;

export default function CustomerHomePage() {
  const router = useRouter();
  const [products, setProducts] = useState<CustomerProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [wishlistedProductIds, setWishlistedProductIds] = useState<Set<string>>(
    new Set(),
  );

  useEffect(() => {
    const controller = new AbortController();

    async function loadProducts() {
      setLoading(true);
      setErrorMessage("");

      try {
        const response = await fetch(
          `/api/customer/products?page=1&limit=${FEATURED_LIMIT}&sortBy=sellingPrice&sortOrder=desc`,
          {
            cache: "no-store",
            credentials: "same-origin",
            signal: controller.signal,
          },
        );

        if (response.status === 401) {
          router.replace("/login");
          return;
        }

        const responseBody = (await response.json()) as ProductsResponse;

        if (!response.ok) {
          setErrorMessage(
            responseBody.message ?? "Unable to load featured products right now.",
          );
          setProducts([]);
          return;
        }

        setProducts(responseBody.data ?? []);
        setErrorMessage("");

        try {
          const wishlistResponse = await fetch("/api/customer/wishlist", {
            cache: "no-store",
            credentials: "same-origin",
            signal: controller.signal,
          });

          if (wishlistResponse.status === 401) {
            router.replace("/login");
            return;
          }

          if (wishlistResponse.ok) {
            const wishlistBody = (await wishlistResponse.json()) as {
              data?: Array<{ productId: string }>;
            };

            setWishlistedProductIds(
              new Set((wishlistBody.data ?? []).map((item) => item.productId)),
            );
          }
        } catch (wishlistError) {
          if (
            wishlistError instanceof DOMException &&
            wishlistError.name === "AbortError"
          ) {
            return;
          }
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setErrorMessage("Unable to connect to the server. Please try again.");
        setProducts([]);
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void loadProducts();

    return () => {
      controller.abort();
    };
  }, [router]);

  const statusText = loading
    ? "Loading products"
    : errorMessage
      ? errorMessage
      : `${products.length} products loaded`;

  const hasWishlistState = wishlistedProductIds.size > 0;

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 py-16 text-zinc-50">
      <div className="sr-only" aria-live="polite">
        {statusText}
        {hasWishlistState ? " Wishlist ready." : ""}
      </div>

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
