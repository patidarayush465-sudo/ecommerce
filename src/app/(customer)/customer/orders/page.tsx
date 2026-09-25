"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { isActiveReturn, type CustomerReturn } from "@/components/customer/return-data";

type OrderSummary = {
  id: string;
  orderNumber: string;
  totalItems: number;
  totalAmount: number;
  orderStatus: string;
  paymentStatus: string;
  paymentMethod: string;
  createdAt: string;
};

type OrdersResponse = {
  message?: string;
  data?: OrderSummary[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

function formatPrice(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(
    new Date(value),
  );
}
function canCancelOrder(order: OrderSummary) {
  return order.orderStatus === "PENDING" || order.orderStatus === "CONFIRMED";
}
function isPaidOnlineOrder(order: OrderSummary) {
  return order.paymentMethod === "ONLINE" && order.paymentStatus === "PAID";
}

export default function CustomerOrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [pagination, setPagination] = useState<OrdersResponse["pagination"]>();
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [cancelOrderId, setCancelOrderId] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const [activeReturnIds, setActiveReturnIds] = useState<Record<string, string>>({});

  useEffect(() => {
    const controller = new AbortController();
    async function loadOrders() {
      setIsLoading(true);
      try {
        const response = await fetch(
          `/api/customer/orders?page=${page}&limit=10`,
          { cache: "no-store", signal: controller.signal },
        );
        const body = (await response.json()) as OrdersResponse;
        if (response.status === 401) {
          router.replace("/login");
          return;
        }
        if (!response.ok) {
          setErrorMessage(body.message ?? "Unable to load your orders.");
          return;
        }
        setOrders(body.data ?? []);
        setPagination(body.pagination);
        const returnsResponse = await fetch("/api/customer/returns?page=1&limit=50", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (returnsResponse.status === 401) {
          router.replace("/login");
          return;
        }
        if (returnsResponse.ok) {
          const returnsBody = (await returnsResponse.json()) as { returns?: CustomerReturn[] };
          setActiveReturnIds(
            Object.fromEntries(
              (returnsBody.returns ?? [])
                .filter((returnRequest) => isActiveReturn(returnRequest.status))
                .map((returnRequest) => [returnRequest.orderId, returnRequest.id]),
            ),
          );
        }
        setErrorMessage("");
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setErrorMessage("Unable to load your orders. Please try again.");
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }
    void loadOrders();
    return () => controller.abort();
  }, [page, router]);

  async function handleCancelOrder() {
    if (!cancelOrderId || isCancelling) return;
    setIsCancelling(true);
    setErrorMessage("");
    try {
      const response = await fetch(
        `/api/customer/orders/${cancelOrderId}/cancel`,
        { method: "POST" },
      );
      const body = (await response.json()) as { message?: string };
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok) {
        setErrorMessage(body.message ?? "Unable to cancel this order.");
        return;
      }
      setOrders((currentOrders) =>
        currentOrders.map((order) =>
          order.id === cancelOrderId
            ? {
                ...order,
                orderStatus: "CANCELLED",
                paymentStatus: isPaidOnlineOrder(order)
                  ? "REFUNDED"
                  : order.paymentStatus,
              }
            : order,
        ),
      );
      setCancelOrderId(null);
      setSuccessMessage(body.message ?? "Order cancelled successfully.");
    } catch {
      setErrorMessage("Unable to cancel this order. Please try again.");
    } finally {
      setIsCancelling(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-50 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/customer/home"
          className="text-sm text-zinc-400 hover:text-amber-300"
        >
          Back to customer home
        </Link>
        <header className="mt-8 border-b border-zinc-800 pb-6">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-amber-300">
            Customer account
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            My Orders
          </h1>
        </header>
        {errorMessage && (
          <p
            className="mt-6 rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200"
            role="alert"
          >
            {errorMessage}
          </p>
        )}
        {successMessage && (
          <p
            className="mt-6 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200"
            role="status"
          >
            {successMessage}
          </p>
        )}
        {isLoading ? (
          <p className="mt-10 text-zinc-400" role="status">
            Loading your orders...
          </p>
        ) : orders.length === 0 ? (
          <section className="mt-10 rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-14 text-center">
            <h2 className="text-2xl font-semibold">No orders yet</h2>
            <p className="mt-3 text-sm text-zinc-400">
              Your completed orders will appear here.
            </p>
            <Link
              href="/products"
              className="mt-6 inline-flex rounded-lg bg-amber-300 px-5 py-3 text-sm font-semibold text-zinc-950 hover:bg-amber-200"
            >
              Start Shopping
            </Link>
          </section>
        ) : (
          <section className="mt-8 space-y-4" aria-label="Order history">
            {orders.map((order) => (
              <article
                key={order.id}
                className="rounded-xl border border-zinc-800 bg-zinc-900 p-5"
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-zinc-500">
                      {formatDate(order.createdAt)}
                    </p>
                    <h2 className="mt-1 font-semibold text-amber-300">
                      {order.orderNumber}
                    </h2>
                  </div>
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <Link
                      href={`/customer/orders/${order.id}`}
                      className="rounded-lg border border-zinc-700 px-4 py-2 text-center text-sm font-semibold hover:border-amber-300"
                    >
                      View Order
                    </Link>
                    <Link
                      href={`/customer/support/new?orderId=${encodeURIComponent(order.id)}`}
                      className="rounded-lg border border-amber-300 px-4 py-2 text-center text-sm font-semibold text-amber-300 hover:bg-amber-300 hover:text-zinc-950"
                    >
                      Get Support
                    </Link>
                    {order.orderStatus === "DELIVERED" && (
                      <Link
                        href={
                          activeReturnIds[order.id]
                            ? `/customer/returns/${activeReturnIds[order.id]}`
                            : `/customer/orders/${order.id}/return`
                        }
                        className="rounded-lg border border-amber-300 px-4 py-2 text-center text-sm font-semibold text-amber-300 hover:bg-amber-300 hover:text-zinc-950"
                      >
                        {activeReturnIds[order.id] ? "View Return" : "Return"}
                      </Link>
                    )}
                    {canCancelOrder(order) &&
                      (cancelOrderId === order.id ? (
                        <div className="rounded-lg border border-zinc-700 p-3">
                          <p className="text-sm text-zinc-200">
                            Are you sure you want to cancel this order?
                          </p>
                          {isPaidOnlineOrder(order) && (
                            <p className="mt-2 text-xs text-amber-200">
                              Your payment will be refunded after cancellation.
                            </p>
                          )}
                          <div className="mt-3 flex gap-2">
                            <button
                              type="button"
                              disabled={isCancelling}
                              onClick={() => setCancelOrderId(null)}
                              className="rounded-lg border border-zinc-700 px-3 py-2 text-sm disabled:opacity-50"
                            >
                              Keep Order
                            </button>
                            <button
                              type="button"
                              disabled={isCancelling}
                              onClick={() => void handleCancelOrder()}
                              className="rounded-lg bg-red-500 px-3 py-2 text-sm font-semibold disabled:opacity-50"
                            >
                              {isCancelling ? "Cancelling..." : "Cancel Order"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setCancelOrderId(order.id)}
                          className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold hover:bg-red-400"
                        >
                          Cancel Order
                        </button>
                      ))}
                  </div>
                </div>
                <dl className="mt-5 grid gap-4 border-t border-zinc-800 pt-4 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-zinc-500">Items</dt>
                    <dd className="mt-1 text-zinc-100">{order.totalItems}</dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Total</dt>
                    <dd className="mt-1 font-semibold text-zinc-100">
                      {formatPrice(order.totalAmount)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Order status</dt>
                    <dd className="mt-1 text-zinc-100">{order.orderStatus}</dd>
                  </div>
                  <div>
                    <dt className="text-zinc-500">Payment</dt>
                    <dd className="mt-1 text-zinc-100">
                      {order.paymentStatus}
                    </dd>
                  </div>
                </dl>
              </article>
            ))}
            {pagination && pagination.totalPages > 1 && (
              <nav className="flex items-center justify-between border-t border-zinc-800 pt-6">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => current - 1)}
                  className="rounded-lg border border-zinc-700 px-4 py-2 text-sm disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="text-sm text-zinc-400">
                  Page {page} of {pagination.totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((current) => current + 1)}
                  className="rounded-lg border border-zinc-700 px-4 py-2 text-sm disabled:opacity-40"
                >
                  Next
                </button>
              </nav>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
