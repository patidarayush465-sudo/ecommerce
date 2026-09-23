"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type ProductImage = {
  url?: string;
  publicId?: string;
};

type CartProduct = {
  _id: string;
  name: string;
  description?: string;
  price: number;
  stock: number;
  images?: ProductImage[];
  isActive: boolean;
};

type CartItem = {
  product: CartProduct | null;
  unavailable?: boolean;
  quantity: number;
  price: number;
  subtotal: number;
};

type CartData = {
  items: CartItem[];
  totalItems: number;
  subtotal: number;
  deliveryCharge: number;
  totalAmount: number;
};

type CartResponse = {
  message?: string;
  cart?: CartData;
};

type BusyAction = {
  productId: string;
  action: "update" | "remove";
};

function formatPrice(price: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(price);
}

function getErrorMessage(status: number, responseBody?: CartResponse) {
  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 403) return "You are not authorized to access this cart.";
  if (status >= 500) return "The server is unavailable. Please try again later.";
  return responseBody?.message ?? "Unable to update your cart. Please try again.";
}

function CartSkeleton() {
  return (
    <div className="mt-8 grid animate-pulse gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className="flex gap-4 rounded-xl border border-zinc-800 bg-zinc-900 p-4"
          >
            <div className="h-28 w-28 shrink-0 rounded-lg bg-zinc-800" />
            <div className="flex-1 space-y-3 py-2">
              <div className="h-5 w-2/3 rounded bg-zinc-800" />
              <div className="h-4 w-1/3 rounded bg-zinc-800" />
              <div className="h-9 w-32 rounded bg-zinc-800" />
            </div>
          </div>
        ))}
      </div>
      <div className="h-56 rounded-xl border border-zinc-800 bg-zinc-900" />
    </div>
  );
}

export default function CustomerCartPage() {
  const router = useRouter();
  const [cart, setCart] = useState<CartData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [busyAction, setBusyAction] = useState<BusyAction | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadCart() {
      setIsLoading(true);
      setErrorMessage("");

      try {
        const response = await fetch("/api/customer/cart", {
          cache: "no-store",
          signal: controller.signal,
        });
        const responseBody = (await response.json()) as CartResponse;

        if (response.status === 401) {
          router.replace("/login");
          return;
        }

        if (!response.ok || !responseBody.cart) {
          setErrorMessage(getErrorMessage(response.status, responseBody));
          return;
        }

        setCart(responseBody.cart);
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setErrorMessage("Unable to connect to the server. Please try again.");
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }

    void loadCart();
    return () => controller.abort();
  }, [router]);

  async function updateQuantity(item: CartItem, quantity: number) {
    const productId = item.product?._id;
    if (!productId || quantity < 1 || busyAction || isClearing) return;

    setErrorMessage("");
    setBusyAction({ productId, action: "update" });

    try {
      const response = await fetch(`/api/customer/cart/${productId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quantity }),
      });
      const responseBody = (await response.json()) as CartResponse;

      if (response.status === 401) {
        router.replace("/login");
        return;
      }

      if (!response.ok || !responseBody.cart) {
        setErrorMessage(getErrorMessage(response.status, responseBody));
        return;
      }

      setCart(responseBody.cart);
    } catch {
      setErrorMessage("Unable to update the quantity. Please try again.");
    } finally {
      setBusyAction(null);
    }
  }

  async function removeItem(item: CartItem) {
    const productId = item.product?._id;
    if (!productId || busyAction || isClearing) return;

    setErrorMessage("");
    setBusyAction({ productId, action: "remove" });

    try {
      const response = await fetch(`/api/customer/cart/${productId}`, {
        method: "DELETE",
      });
      const responseBody = (await response.json()) as CartResponse;

      if (response.status === 401) {
        router.replace("/login");
        return;
      }

      if (!response.ok || !responseBody.cart) {
        setErrorMessage(getErrorMessage(response.status, responseBody));
        return;
      }

      setCart(responseBody.cart);
    } catch {
      setErrorMessage("Unable to remove this product. Please try again.");
    } finally {
      setBusyAction(null);
    }
  }

  async function clearCart() {
    if (isClearing || busyAction || !cart?.items.length) return;
    if (!window.confirm("Clear all products from your cart?")) return;

    setErrorMessage("");
    setIsClearing(true);

    try {
      const response = await fetch("/api/customer/cart", { method: "DELETE" });
      const responseBody = (await response.json()) as CartResponse;

      if (response.status === 401) {
        router.replace("/login");
        return;
      }

      if (!response.ok || !responseBody.cart) {
        setErrorMessage(getErrorMessage(response.status, responseBody));
        return;
      }

      setCart(responseBody.cart);
    } catch {
      setErrorMessage("Unable to clear your cart. Please try again.");
    } finally {
      setIsClearing(false);
    }
  }

  const isMutating = busyAction !== null || isClearing;

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-50 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <header className="flex flex-col gap-5 border-b border-zinc-800 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link
              href="/customer/home"
              className="text-sm text-zinc-400 transition hover:text-amber-300"
            >
              Back to customer home
            </Link>
            <p className="mt-7 text-sm font-medium uppercase tracking-[0.24em] text-amber-300">
              Your selection
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
              Shopping cart
            </h1>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <Link
              href="/products"
              className="text-zinc-400 transition hover:text-amber-300"
            >
              Continue shopping
            </Link>
            <Link
              href="/profile"
              className="text-zinc-400 transition hover:text-amber-300"
            >
              Profile
            </Link>
          </div>
        </header>

        {errorMessage && (
          <div
            className="mt-6 rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200"
            role="alert"
            aria-live="polite"
          >
            {errorMessage}
          </div>
        )}

        {isLoading ? (
          <CartSkeleton />
        ) : cart && cart.items.length === 0 ? (
          <section className="mt-12 rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-16 text-center">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-amber-300">
              Nothing here yet
            </p>
            <h2 className="mt-3 text-2xl font-semibold">Your cart is empty</h2>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-zinc-400">
              Add products from the store to build your order.
            </p>
            <Link
              href="/products"
              className="mt-7 inline-flex rounded-lg bg-amber-300 px-5 py-3 text-sm font-semibold text-zinc-950 transition hover:bg-amber-200"
            >
              Browse products
            </Link>
          </section>
        ) : cart ? (
          <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
            <section aria-label="Cart items" className="space-y-4">
              {cart.items.map((item, index) => {
                const productId = item.product?._id;
                const imageUrl = item.product?.images?.find((image) => image?.url)?.url;
                const isItemBusy = productId === busyAction?.productId;

                return (
                  <article
                    key={productId ?? `unavailable-${index}`}
                    className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 sm:p-5"
                  >
                    <div className="flex flex-col gap-4 sm:flex-row">
                      <div className="h-32 w-full shrink-0 overflow-hidden rounded-lg bg-zinc-800 sm:h-28 sm:w-32">
                        {imageUrl ? (
                          <div
                            role="img"
                            aria-label={item.product?.name ?? "Unavailable product"}
                            className="h-full w-full bg-cover bg-center"
                            style={{ backgroundImage: `url("${imageUrl}")` }}
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center px-3 text-center text-sm text-zinc-500">
                            No image available
                          </div>
                        )}
                      </div>

                      <div className="flex min-w-0 flex-1 flex-col">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <h2 className="text-lg font-semibold">
                              {item.product?.name ?? "Unavailable product"}
                            </h2>
                            {item.product?.isActive === false && (
                              <p className="mt-1 text-sm text-red-300">Currently unavailable</p>
                            )}
                            {!item.product && (
                              <p className="mt-1 text-sm text-red-300">
                                This product is no longer available.
                              </p>
                            )}
                          </div>
                          <p className="text-lg font-semibold text-amber-300">
                            {formatPrice(item.price)}
                          </p>
                        </div>

                        <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <span className="text-sm text-zinc-400">Quantity</span>
                            <div className="flex items-center rounded-lg border border-zinc-700 bg-zinc-950">
                              <button
                                type="button"
                                aria-label={`Decrease quantity of ${item.product?.name ?? "unavailable product"}`}
                                disabled={!productId || isMutating || item.quantity <= 1}
                                onClick={() => void updateQuantity(item, item.quantity - 1)}
                                className="h-9 w-9 text-lg text-zinc-200 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:text-zinc-600"
                              >
                                -
                              </button>
                              <span className="min-w-9 text-center text-sm font-semibold">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                aria-label={`Increase quantity of ${item.product?.name ?? "unavailable product"}`}
                                disabled={!productId || isMutating}
                                onClick={() => void updateQuantity(item, item.quantity + 1)}
                                className="h-9 w-9 text-lg text-zinc-200 transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:text-zinc-600"
                              >
                                +
                              </button>
                            </div>
                            {isItemBusy && busyAction?.action === "update" && (
                              <span className="text-xs text-zinc-500" role="status">
                                Updating...
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-4">
                            <p className="text-sm text-zinc-400">
                              Subtotal <span className="font-semibold text-zinc-100">{formatPrice(item.subtotal)}</span>
                            </p>
                            <button
                              type="button"
                              disabled={!productId || isMutating}
                              onClick={() => void removeItem(item)}
                              className="text-sm font-semibold text-red-300 transition hover:text-red-200 disabled:cursor-not-allowed disabled:text-zinc-600"
                            >
                              {isItemBusy && busyAction?.action === "remove" ? "Removing..." : "Remove"}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>

            <aside className="rounded-xl border border-zinc-800 bg-zinc-900 p-5 lg:sticky lg:top-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Cart summary</h2>
                <span className="text-sm text-zinc-500">{cart.totalItems} items</span>
              </div>
              <dl className="mt-6 space-y-4 border-y border-zinc-800 py-5 text-sm">
                <div className="flex justify-between gap-4 text-zinc-400">
                  <dt>Total items</dt>
                  <dd className="font-medium text-zinc-100">{cart.totalItems}</dd>
                </div>
                <div className="flex justify-between gap-4 text-zinc-400">
                  <dt>Subtotal</dt>
                  <dd className="font-medium text-zinc-100">{formatPrice(cart.subtotal)}</dd>
                </div>
                <div className="flex justify-between gap-4 text-zinc-400">
                  <dt>Delivery</dt>
                  <dd className="font-medium text-zinc-100">{cart.deliveryCharge ? formatPrice(cart.deliveryCharge) : "FREE"}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-zinc-400">Total amount</dt>
                  <dd className="text-xl font-semibold text-amber-300">{formatPrice(cart.totalAmount)}</dd>
                </div>
              </dl>
              <Link
                href="/customer/checkout"
                className="mt-5 block w-full rounded-lg bg-amber-300 px-4 py-3 text-center text-sm font-semibold text-zinc-950 transition hover:bg-amber-200"
              >
                Checkout
              </Link>
              <button
                type="button"
                disabled={isMutating}
                onClick={() => void clearCart()}
                className="mt-5 w-full rounded-lg border border-red-300/40 px-4 py-3 text-sm font-semibold text-red-200 transition hover:bg-red-300/10 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isClearing ? "Clearing cart..." : "Clear cart"}
              </button>
            </aside>
          </div>
        ) : null}
      </div>
    </main>
  );
}