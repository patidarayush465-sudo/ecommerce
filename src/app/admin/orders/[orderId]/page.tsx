"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type OrderStatus =
  | "PENDING"
  | "CONFIRMED"
  | "PROCESSING"
  | "SHIPPED"
  | "DELIVERED"
  | "CANCELLED";
type Customer = {
  id: string;
  name: string;
  email: string;
  mobile?: string;
  role?: string;
};
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
type Address = {
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
  customer: Customer;
  items: OrderItem[];
  shippingAddress: Address;
  subtotal: number;
  deliveryCharge?: number;
  totalItems: number;
  totalAmount: number;
  paymentMethod: string;
  paymentStatus: string;
  orderStatus: OrderStatus;
  stockDeducted: boolean;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpayFee?: number;
  razorpayTax?: number;
  razorpayRefundId?: string;
  refundStatus?: string;
  createdAt: string;
  updatedAt: string;
};
type OrderResponse = { message?: string; data?: Order };

const NEXT_STATUS: Partial<Record<OrderStatus, OrderStatus>> = {
  PENDING: "CONFIRMED",
  CONFIRMED: "PROCESSING",
  PROCESSING: "SHIPPED",
  SHIPPED: "DELIVERED",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
function formatAmount(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}
function statusClass(status: string) {
  return status === "CANCELLED" || status === "FAILED"
    ? "bg-rose-50 text-rose-700"
    : status === "PAID" || status === "DELIVERED"
      ? "bg-emerald-50 text-emerald-700"
      : "bg-amber-50 text-amber-700";
}

function getProductDiscountAmount(item: OrderItem) {
  const mrp = item.mrp;
  return typeof mrp === "number" && Number.isFinite(mrp) && mrp > item.price
    ? (mrp - item.price) * item.quantity
    : undefined;
}

function getPricingSummary(items: OrderItem[]) {
  let totalMRP = 0;
  let totalDiscount = 0;
  let hasHistoricalMRP = false;

  for (const item of items) {
    if (Number.isFinite(item.mrp)) {
      hasHistoricalMRP = true;
      totalMRP += (item.mrp as number) * item.quantity;
      totalDiscount += getProductDiscountAmount(item) ?? 0;
    }
  }

  return {
    totalMRP: hasHistoricalMRP ? totalMRP : undefined,
    totalDiscount: hasHistoricalMRP ? totalDiscount : undefined,
  };
}

export default function AdminOrderDetailsPage() {
  const router = useRouter();
  const params = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const pricingSummary = order ? getPricingSummary(order.items) : null;

  useEffect(() => {
    const controller = new AbortController();
    async function loadOrder() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/admin/orders/${params.orderId}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = (await response.json()) as OrderResponse;
        if (response.status === 401) {
          router.replace("/admin/login");
          return;
        }
        if (!response.ok || !body.data) {
          setError(body.message ?? "Unable to load this order.");
          return;
        }
        setOrder(body.data);
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === "AbortError"))
          setError("Network error while loading the order.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadOrder();
    return () => controller.abort();
  }, [params.orderId, router]);

  async function updateStatus(nextStatus: string) {
    if (!order || saving) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const response = await fetch(`/api/admin/orders/${order.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderStatus: nextStatus }),
      });
      const body = (await response.json()) as OrderResponse;
      if (response.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (!response.ok) {
        setError(body.message ?? "Unable to update order status.");
        return;
      }
      setOrder((current) =>
        current
          ? { ...current, orderStatus: nextStatus as OrderStatus }
          : current,
      );
      setSuccess(body.message ?? "Order status updated successfully.");
    } catch {
      setError("Network error while updating order status.");
    } finally {
      setSaving(false);
    }
  }

  const nextStatus = order ? NEXT_STATUS[order.orderStatus] : undefined;

  return (
    <section className="mx-auto max-w-6xl">
      <Link
        href="/admin/orders"
        className="text-sm font-medium text-cyan-700 hover:text-cyan-900"
      >
        Back to orders
      </Link>
      {loading ? (
        <p className="mt-10 text-sm text-slate-500" role="status">
          Loading order...
        </p>
      ) : error && !order ? (
        <p
          className="mt-8 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
          role="alert"
        >
          {error}
        </p>
      ) : order ? (
        <>
          <header className="mt-6 flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-600">
                Order details
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                {order.orderNumber}
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <span
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${statusClass(order.orderStatus)}`}
              >
                {order.orderStatus}
              </span>
              {nextStatus && (
                <select
                  aria-label="Update order status"
                  value={order.orderStatus}
                  onChange={(event) => void updateStatus(event.target.value)}
                  disabled={saving}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 disabled:opacity-60"
                >
                  <option value={order.orderStatus}>
                    {saving ? "Updating..." : `Move to ${nextStatus}`}
                  </option>
                  <option value={nextStatus}>{nextStatus}</option>
                </select>
              )}
            </div>
          </header>
          {error && (
            <p
              className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
              role="alert"
            >
              {error}
            </p>
          )}
          {success && (
            <p
              className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
              role="status"
            >
              {success}
            </p>
          )}
          <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-6">
              <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-950">
                  Order Information
                </h2>
                <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-slate-500">Order number</dt>
                    <dd className="mt-1 font-medium text-slate-950">
                      {order.orderNumber}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Order status</dt>
                    <dd className="mt-1">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(order.orderStatus)}`}
                      >
                        {order.orderStatus}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Payment status</dt>
                    <dd className="mt-1 text-slate-950">
                      {order.paymentStatus}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Payment method</dt>
                    <dd className="mt-1 text-slate-950">
                      {order.paymentMethod}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Created at</dt>
                    <dd className="mt-1 text-slate-950">
                      {formatDate(order.createdAt)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Updated at</dt>
                    <dd className="mt-1 text-slate-950">
                      {formatDate(order.updatedAt)}
                    </dd>
                  </div>
                </dl>
              </section>
              <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-950">
                  Customer
                </h2>
                <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-slate-500">Name</dt>
                    <dd className="mt-1 text-slate-950">
                      {order.customer.name}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-slate-500">Email</dt>
                    <dd className="mt-1 text-slate-950">
                      {order.customer.email}
                    </dd>
                  </div>
                  {order.customer.mobile && (
                    <div>
                      <dt className="text-slate-500">Mobile</dt>
                      <dd className="mt-1 text-slate-950">
                        {order.customer.mobile}
                      </dd>
                    </div>
                  )}
                </dl>
              </section>
              <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-950">
                  Shipping Address
                </h2>
                <address className="mt-5 not-italic text-sm leading-7 text-slate-700">
                  <p className="font-semibold text-slate-950">
                    {order.shippingAddress.fullName}
                  </p>
                  <p>{order.shippingAddress.mobile}</p>
                  <p>{order.shippingAddress.addressLine}</p>
                  <p>
                    {order.shippingAddress.city}, {order.shippingAddress.state}
                  </p>
                  <p>{order.shippingAddress.pincode}</p>
                  <p>{order.shippingAddress.country}</p>
                </address>
              </section>
              <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-950">
                  Order Items
                </h2>
                <div className="mt-5 divide-y divide-slate-100">
                  {order.items.map((item) => (
                    <div
                      key={`${item.product}-${item.productName}`}
                      className="flex gap-4 py-4 first:pt-0 last:pb-0"
                    >
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                        {item.productImage ? (
                          <div
                            role="img"
                            aria-label={item.productName}
                            className="h-full w-full bg-cover bg-center"
                            style={{
                              backgroundImage: `url("${item.productImage}")`,
                            }}
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-950">
                          {item.productName}
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                          {item.mrp !== undefined && item.mrp > item.price && (
                            <span className="text-slate-400 line-through">
                              MRP {formatAmount(item.mrp)}
                            </span>
                          )}
                          {item.discountPercent !== undefined && item.mrp !== undefined && item.mrp > item.price && (
                            <span className="font-semibold text-emerald-700">
                              {item.discountPercent}% OFF
                            </span>
                          )}
                          <span className="text-slate-500">
                            {formatAmount(item.price)} x {item.quantity}
                          </span>
                        </div>
                      </div>
                      <p className="font-semibold text-slate-950">
                        {formatAmount(item.subtotal)}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
            <aside className="h-fit rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-6">
              <h2 className="text-lg font-semibold text-slate-950">
                Payment &amp; Charges
              </h2>
              <dl className="mt-5 space-y-4 border-y border-slate-200 py-5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">MRP</dt>
                  <dd className="text-slate-950">
                    {pricingSummary?.totalMRP === undefined
                      ? "Not available"
                      : formatAmount(pricingSummary.totalMRP)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Product discount</dt>
                  <dd className="text-right text-emerald-700">
                    {pricingSummary?.totalDiscount === undefined
                      ? "Not available"
                      : `-${formatAmount(pricingSummary.totalDiscount)}`}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Delivery charge</dt>
                  <dd className="text-slate-950">
                    {formatAmount(order.deliveryCharge ?? 0)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Total items</dt>
                  <dd className="text-slate-950">{order.totalItems}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="font-medium text-slate-700">Total order amount</dt>
                  <dd className="text-xl font-semibold text-slate-950">
                    {formatAmount(order.totalAmount)}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Payment method</dt>
                  <dd className="text-slate-950">{order.paymentMethod}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Payment status</dt>
                  <dd className="text-slate-950">{order.paymentStatus}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-slate-500">Order status</dt>
                  <dd className="text-slate-950">{order.orderStatus}</dd>
                </div>
              </dl>
              <div className="mt-6 border-t border-slate-200 pt-5">
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                  Razorpay Payment Charges
                </h3>
                {order.paymentMethod !== "ONLINE" ? (
                  <p className="mt-4 text-sm text-slate-500">
                    Not applicable for COD
                  </p>
                ) : (
                  <dl className="mt-4 space-y-4 text-sm">
                    <div>
                      <dt className="text-slate-500">Razorpay order ID</dt>
                      <dd className="mt-1 break-all text-xs text-slate-950">
                        {order.razorpayOrderId ?? "Not available"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Razorpay payment ID</dt>
                      <dd className="mt-1 break-all text-xs text-slate-950">
                        {order.razorpayPaymentId ?? "Not available"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">Razorpay payment fee</dt>
                      <dd className="text-right text-slate-950">
                        {order.razorpayFee === undefined
                          ? "Not available"
                          : formatAmount(order.razorpayFee / 100)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">Razorpay GST / Tax</dt>
                      <dd className="text-right text-slate-950">
                        {order.razorpayTax === undefined
                          ? "Not available"
                          : formatAmount(order.razorpayTax / 100)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4 border-t border-slate-100 pt-4">
                      <dt className="font-medium text-slate-700">
                        Total Razorpay charges
                      </dt>
                      <dd className="font-semibold text-slate-950">
                        {order.razorpayFee === undefined || order.razorpayTax === undefined
                          ? "Not available"
                          : formatAmount((order.razorpayFee + order.razorpayTax) / 100)}
                      </dd>
                    </div>
                  </dl>
                )}
              </div>
              {order.paymentStatus === "REFUNDED" && (
                <div className="mt-6 border-t border-slate-200 pt-5">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                    Refund
                  </h3>
                  <dl className="mt-4 space-y-4 text-sm">
                    <div className="flex justify-between gap-4">
                      <dt className="text-slate-500">Refund ID</dt>
                      <dd className="break-all text-right text-xs text-slate-950">
                        {order.razorpayRefundId ?? "Not available"}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Refund amount</dt>
                      <dd className="text-slate-950">{formatAmount(order.totalAmount)}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-500">Refund status</dt>
                      <dd className="text-slate-950">{order.refundStatus ?? "Not available"}</dd>
                    </div>
                  </dl>
                </div>
              )}
              <dl className="space-y-4 border-t border-slate-200 pt-5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-slate-500">Stock deducted</dt>
                  <dd className="font-medium text-slate-950">
                    {order.stockDeducted ? "Yes" : "No"}
                  </dd>
                </div>
              </dl>
            </aside>
          </div>
        </>
      ) : null}
    </section>
  );
}
