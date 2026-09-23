"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type OrderItem = {
  product: string;
  productName: string;
  productImage: string;
  mrp?: number;
  discountPercent?: number;
  price: number;
  quantity: number;
  subtotal: number;
};
type ShippingAddress = {
  fullName: string;
  mobile: string;
  addressLine: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
};
type Order = {
  id: string;
  orderNumber: string;
  items: OrderItem[];
  shippingAddress: ShippingAddress;
  totalItems: number;
  subtotal: number;
  deliveryCharge?: number;
  totalAmount: number;
  orderStatus: string;
  paymentStatus: string;
  paymentMethod: string;
  createdAt: string;
};
type OrderResponse = { message?: string; data?: Order };
type ProductReviewStatus = {
  productId: string;
  review: { rating: number } | null;
};
type ReviewsLookupResponse = {
  data?: {
    eligibleOrders?: Array<{ id: string; review: { rating: number } | null }>;
  };
};

const CANCELLABLE_STATUSES = new Set(["PENDING", "CONFIRMED"]);
const DELIVERY_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
] as const;

type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

function isDeliveryStatus(status: string): status is DeliveryStatus {
  return DELIVERY_STATUSES.includes(status as DeliveryStatus);
}

function trackingState(status: string, stage: DeliveryStatus) {
  if (!isDeliveryStatus(status)) return "upcoming" as const;
  const currentIndex = DELIVERY_STATUSES.indexOf(status);
  const stageIndex = DELIVERY_STATUSES.indexOf(stage);
  if (stageIndex < currentIndex) return "completed" as const;
  if (stageIndex === currentIndex) return "current" as const;
  return "upcoming" as const;
}

function formatPrice(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
function canCancelOrder(order: Order) {
  return CANCELLABLE_STATUSES.has(order.orderStatus);
}
function isPaidOnlineOrder(order: Order) {
  return order.paymentMethod === "ONLINE" && order.paymentStatus === "PAID";
}

function getPricingSummary(items: OrderItem[]) {
  let totalMRP = 0;
  let totalDiscount = 0;
  let hasHistoricalMRP = false;

  for (const item of items) {
    if (Number.isFinite(item.mrp)) {
      hasHistoricalMRP = true;
      totalMRP += (item.mrp as number) * item.quantity;
      if (item.mrp! > item.price) {
        totalDiscount += (item.mrp! - item.price) * item.quantity;
      }
    }
  }

  return {
    totalMRP: hasHistoricalMRP ? totalMRP : undefined,
    totalDiscount: hasHistoricalMRP ? totalDiscount : undefined,
  };
}

export default function CustomerOrderDetailPage() {
  const router = useRouter();
  const params = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [isCancelling, setIsCancelling] = useState(false);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [reviewStatuses, setReviewStatuses] = useState<ProductReviewStatus[]>(
    [],
  );
  const pricingSummary = order ? getPricingSummary(order.items) : null;

  useEffect(() => {
    const controller = new AbortController();
    async function loadOrder() {
      try {
        const response = await fetch(`/api/customer/orders/${params.orderId}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = (await response.json()) as OrderResponse;
        if (response.status === 401) {
          router.replace("/login");
          return;
        }
        if (!response.ok || !body.data) {
          setErrorMessage(body.message ?? "Order not found");
          return;
        }
        setOrder(body.data);
        setErrorMessage("");
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError")
          return;
        setErrorMessage("Unable to load this order. Please try again.");
      }
    }
    void loadOrder();
    return () => controller.abort();
  }, [params.orderId, router]);

  useEffect(() => {
    if (!order || order.orderStatus !== "DELIVERED") {
      return;
    }
    const currentOrder = order;
    const controller = new AbortController();
    async function loadReviewStatuses() {
      const statuses = await Promise.all(
        currentOrder.items.map(async (item) => {
          try {
            const response = await fetch(
              `/api/customer/products/${item.product}/reviews?page=1&limit=1`,
              { cache: "no-store", signal: controller.signal },
            );
            const body = (await response.json()) as ReviewsLookupResponse;
            const eligible = body.data?.eligibleOrders?.find(
              (eligibleOrder) => eligibleOrder.id === currentOrder.id,
            );
            return {
              productId: item.product,
              review: eligible?.review ?? null,
            };
          } catch {
            return { productId: item.product, review: null };
          }
        }),
      );
      if (!controller.signal.aborted) setReviewStatuses(statuses);
    }
    void loadReviewStatuses();
    return () => controller.abort();
  }, [order]);

  async function handleCancelOrder() {
    if (!order) return;
    setIsCancelling(true);
    setErrorMessage("");

    try {
      const response = await fetch(`/api/customer/orders/${order.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const body = (await response.json()) as { message?: string };

      if (response.status === 401) {
        router.replace("/login");
        return;
      }

      if (!response.ok) {
        setErrorMessage(body.message ?? "Unable to cancel this order.");
        return;
      }

      setSuccessMessage(body.message ?? "Order cancelled successfully.");
      setOrder((currentOrder) =>
        currentOrder
          ? {
              ...currentOrder,
              orderStatus: "CANCELLED",
              paymentStatus: isPaidOnlineOrder(currentOrder)
                ? "REFUNDED"
                : currentOrder.paymentStatus,
            }
          : currentOrder,
      );
      setShowCancelDialog(false);
    } catch {
      setErrorMessage("Unable to cancel this order. Please try again.");
    } finally {
      setIsCancelling(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-50 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/customer/orders"
          className="text-sm text-zinc-400 hover:text-amber-300"
        >
          Back to orders
        </Link>
        {errorMessage ? (
          <p
            className="mt-10 rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200"
            role="alert"
          >
            {errorMessage}
          </p>
        ) : null}
        {successMessage ? (
          <p
            className="mt-6 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-4 py-3 text-sm text-emerald-200"
            role="status"
          >
            {successMessage}
          </p>
        ) : null}
        {!order ? (
          <p className="mt-10 text-zinc-400" role="status">
            Loading order...
          </p>
        ) : (
          <>
            <header className="mt-8 flex flex-col gap-3 border-b border-zinc-800 pb-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.24em] text-amber-300">
                  Order details
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                  {order.orderNumber}
                </h1>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <a
                  href={`/api/customer/orders/${order.id}/invoice`}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-300 hover:bg-amber-300 hover:text-zinc-950"
                >
                  View Invoice
                </a>
                <a
                  href={`/api/customer/orders/${order.id}/invoice?download=1`}
                  className="rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-amber-200"
                >
                  Download Invoice
                </a>
                <Link
                  href={`/customer/support/new?orderId=${encodeURIComponent(order.id)}`}
                  className="rounded-lg border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-300 hover:bg-amber-300 hover:text-zinc-950"
                >
                  Get Support
                </Link>
                <p className="text-sm text-zinc-400">
                  {formatDate(order.createdAt)}
                </p>
              </div>
            </header>
            <section
              className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900 p-5 sm:p-6"
              aria-labelledby="order-tracking-heading"
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.2em] text-amber-300">
                    Shipment progress
                  </p>
                  <h2
                    id="order-tracking-heading"
                    className="mt-2 text-xl font-semibold"
                  >
                    Order Tracking
                  </h2>
                </div>
                <p className="text-sm text-zinc-400">
                  Current status:{" "}
                  <span className="font-semibold text-zinc-200">
                    {order.orderStatus}
                  </span>
                </p>
              </div>
              {order.orderStatus === "CANCELLED" ? (
                <div
                  className="mt-5 flex items-start gap-3 rounded-lg border border-red-400/30 bg-red-400/10 p-4"
                  role="status"
                >
                  <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-400/20 text-red-200"
                    aria-hidden="true"
                  >
                    ×
                  </span>
                  <div>
                    <p className="font-semibold text-red-100">
                      Order Cancelled
                    </p>
                    <p className="mt-1 text-sm leading-6 text-red-200/80">
                      This order will not continue through processing, shipping,
                      or delivery.
                    </p>
                  </div>
                </div>
              ) : (
                <ol
                  className="mt-7 flex flex-col md:flex-row"
                  aria-label="Order delivery progress"
                >
                  {DELIVERY_STATUSES.map((stage, index) => {
                    const state = trackingState(order.orderStatus, stage);
                    return (
                      <li
                        key={stage}
                        className="relative flex min-h-16 flex-1 items-start gap-3 md:min-h-0 md:flex-col md:items-center md:gap-2 md:text-center"
                      >
                        {index > 0 && (
                          <span
                            className={`absolute left-4 top-4 h-[calc(100%-1rem)] w-px md:left-0 md:top-4 md:h-px md:w-1/2 ${state === "upcoming" ? "bg-zinc-700" : "bg-amber-300"}`}
                            aria-hidden="true"
                          />
                        )}
                        {index < DELIVERY_STATUSES.length - 1 && (
                          <span
                            className={`absolute left-4 top-8 h-[calc(100%-1rem)] w-px md:left-1/2 md:top-4 md:h-px md:w-1/2 ${trackingState(order.orderStatus, DELIVERY_STATUSES[index + 1]) === "upcoming" ? "bg-zinc-700" : "bg-amber-300"}`}
                            aria-hidden="true"
                          />
                        )}
                        <span
                          className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-bold ${state === "completed" ? "border-amber-300 bg-amber-300 text-zinc-950" : state === "current" ? "border-amber-300 bg-zinc-950 text-amber-300 ring-4 ring-amber-300/15" : "border-zinc-600 bg-zinc-950 text-zinc-500"}`}
                          aria-hidden="true"
                        >
                          {state === "completed"
                            ? "✓"
                            : state === "current"
                              ? "●"
                              : "○"}
                        </span>
                        <div className="pb-4 md:pb-0">
                          <p
                            className={`text-sm font-semibold ${state === "upcoming" ? "text-zinc-500" : state === "current" ? "text-amber-300" : "text-zinc-100"}`}
                          >
                            {stage}
                          </p>
                          <p className="text-xs text-zinc-500">
                            {state === "completed"
                              ? "Completed"
                              : state === "current"
                                ? "Current"
                                : "Upcoming"}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
            <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="space-y-6">
                <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
                  <h2 className="text-xl font-semibold">Order Information</h2>
                  <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="text-zinc-500">Order date</dt>
                      <dd className="mt-1 text-zinc-100">
                        {formatDate(order.createdAt)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500">Order status</dt>
                      <dd className="mt-1 text-zinc-100">
                        {order.orderStatus}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-zinc-500">Payment status</dt>
                      <dd className="mt-1 text-zinc-100">
                        {order.paymentStatus}
                      </dd>
                    </div>
                  </dl>
                </section>
                <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
                  <h2 className="text-xl font-semibold">Items</h2>
                  <div className="mt-5 divide-y divide-zinc-800">
                    {order.items.map((item) => (
                      <div
                        key={`${item.product}-${item.productName}`}
                        className="flex gap-4 py-4 first:pt-0 last:pb-0"
                      >
                        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-zinc-800">
                          {item.productImage ? (
                            <div
                              role="img"
                              aria-label={item.productName}
                              className="h-full w-full bg-cover bg-center"
                              style={{
                                backgroundImage: `url("${item.productImage}")`,
                              }}
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-xs text-zinc-500">
                              No image
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold">{item.productName}</h3>
                          <div className="mt-2 space-y-1 text-sm">
                            {typeof item.mrp === "number" && (
                              <p className="text-zinc-500">
                                MRP: {formatPrice(item.mrp)}
                              </p>
                            )}
                            {typeof item.discountPercent === "number" &&
                              item.discountPercent > 0 && (
                                <p className="font-medium text-emerald-300">
                                  {item.discountPercent}% OFF
                                </p>
                              )}
                            <p className="text-zinc-300">
                              Selling Price: {formatPrice(item.price)}
                            </p>
                            <p className="text-zinc-400">
                              Qty: {item.quantity}
                            </p>
                          </div>
                        </div>
                        <p className="shrink-0 self-start text-right font-semibold text-amber-300">
                          <span className="block text-xs font-normal text-zinc-500">
                            Item Total
                          </span>
                          {formatPrice(item.subtotal)}
                        </p>
                        {order.orderStatus === "DELIVERED" &&
                          (() => {
                            const reviewStatus = reviewStatuses.find(
                              (status) => status.productId === item.product,
                            );
                            return reviewStatus?.review ? (
                              <span className="text-xs font-semibold text-emerald-300">
                                Reviewed{" "}
                                {"★".repeat(reviewStatus.review.rating)}
                              </span>
                            ) : (
                              <Link
                                href={`/products/${item.product}#reviews`}
                                className="text-xs font-semibold text-amber-300 hover:text-amber-200"
                              >
                                Rate &amp; Review
                              </Link>
                            );
                          })()}
                      </div>
                    ))}
                  </div>
                </section>
                <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5">
                  <h2 className="text-xl font-semibold">Shipping Address</h2>
                  <address className="mt-5 not-italic text-sm leading-7 text-zinc-300">
                    <p className="font-semibold text-zinc-100">
                      {order.shippingAddress.fullName}
                    </p>
                    <p>{order.shippingAddress.mobile}</p>
                    <p>{order.shippingAddress.addressLine}</p>
                    <p>
                      {order.shippingAddress.city},{" "}
                      {order.shippingAddress.state}{" "}
                      {order.shippingAddress.pincode}
                    </p>
                    <p>{order.shippingAddress.country}</p>
                  </address>
                </section>
              </div>
              <aside className="h-fit rounded-xl border border-zinc-800 bg-zinc-900 p-5 lg:sticky lg:top-6">
                <h2 className="text-xl font-semibold">Order Summary</h2>
                <dl className="mt-5 space-y-4 border-y border-zinc-800 py-5 text-sm">
                  <div className="flex justify-between text-zinc-400">
                    <dt>MRP</dt>
                    <dd className="text-zinc-100">
                      {pricingSummary?.totalMRP === undefined
                        ? "Not available"
                        : formatPrice(pricingSummary.totalMRP)}
                    </dd>
                  </div>
                  <div className="flex justify-between text-zinc-400">
                    <dt>Discount</dt>
                    <dd className="text-emerald-300">
                      {pricingSummary?.totalDiscount === undefined
                        ? "Not available"
                        : `-${formatPrice(pricingSummary.totalDiscount)}`}
                    </dd>
                  </div>
                  <div className="flex justify-between text-zinc-400">
                    <dt>Total items</dt>
                    <dd className="text-zinc-100">{order.totalItems}</dd>
                  </div>
                  <div className="flex justify-between text-zinc-400">
                    <dt>Delivery</dt>
                    <dd className="text-zinc-100">
                      {order.deliveryCharge
                        ? formatPrice(order.deliveryCharge)
                        : "FREE"}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-zinc-300">Total amount</dt>
                    <dd className="text-xl font-semibold text-amber-300">
                      {formatPrice(order.totalAmount)}
                    </dd>
                  </div>
                </dl>
                {canCancelOrder(order) && (
                  <div className="mt-5">
                    {showCancelDialog ? (
                      <div className="rounded-lg border border-zinc-700 bg-zinc-950 p-4">
                        <p className="text-sm text-zinc-200">
                          Are you sure you want to cancel this order?
                        </p>
                        {isPaidOnlineOrder(order) && (
                          <p className="mt-2 text-xs text-amber-200">
                            Your payment will be refunded after cancellation.
                          </p>
                        )}
                        <div className="mt-4 flex flex-wrap gap-3">
                          <button
                            type="button"
                            disabled={isCancelling}
                            onClick={() => setShowCancelDialog(false)}
                            className="rounded-lg border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Keep Order
                          </button>
                          <button
                            type="button"
                            disabled={isCancelling}
                            onClick={() => void handleCancelOrder()}
                            className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {isCancelling ? "Cancelling..." : "Cancel Order"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setShowCancelDialog(true)}
                        className="mt-5 block w-full rounded-lg bg-red-500 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-red-400"
                      >
                        Cancel Order
                      </button>
                    )}
                  </div>
                )}
                <Link
                  href="/customer/orders"
                  className="mt-5 block rounded-lg border border-zinc-700 px-4 py-3 text-center text-sm font-semibold hover:border-amber-300"
                >
                  View all orders
                </Link>
              </aside>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
