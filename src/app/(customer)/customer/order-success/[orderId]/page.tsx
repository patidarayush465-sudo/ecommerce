"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type OrderSummary = {
  id: string;
  orderNumber: string;
  totalItems: number;
  subtotal: number;
  deliveryCharge?: number;
  totalAmount: number;
  orderStatus: string;
  paymentStatus: string;
  createdAt: string;
};

type OrderResponse = { message?: string; data?: OrderSummary };

function formatPrice(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default function OrderSuccessPage() {
  const router = useRouter();
  const params = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<OrderSummary | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const controller = new AbortController();

    async function loadOrder() {
      try {
        const response = await fetch(`/api/customer/orders/${params.orderId}`, { cache: "no-store", signal: controller.signal });
        const body = (await response.json()) as OrderResponse;
        if (response.status === 401) { router.replace("/login"); return; }
        if (!response.ok || !body.data) { setErrorMessage(body.message ?? "Unable to load your order."); return; }
        setOrder(body.data);
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setErrorMessage("Unable to load your order. Please try again.");
      }
    }

    void loadOrder();
    return () => controller.abort();
  }, [params.orderId, router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-4 py-10 text-zinc-50 sm:px-6">
      <section className="w-full max-w-2xl rounded-xl border border-zinc-800 bg-zinc-900 p-6 text-center shadow-2xl shadow-black/20 sm:p-10">
        {errorMessage ? <p className="text-red-300" role="alert">{errorMessage}</p> : !order ? <p className="text-zinc-400" role="status">Loading your order...</p> : (
          <>
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-emerald-300">Thank you for your order</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">Order Placed Successfully</h1>
            <p className="mt-3 text-sm text-zinc-400">We have received your order and will keep its status updated.</p>
            <dl className="mx-auto mt-8 grid max-w-lg gap-4 text-left sm:grid-cols-2">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4"><dt className="text-xs uppercase tracking-wide text-zinc-500">Order number</dt><dd className="mt-1 font-semibold text-amber-300">{order.orderNumber}</dd></div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4"><dt className="text-xs uppercase tracking-wide text-zinc-500">Order date</dt><dd className="mt-1 text-sm text-zinc-200">{formatDate(order.createdAt)}</dd></div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4"><dt className="text-xs uppercase tracking-wide text-zinc-500">Order status</dt><dd className="mt-1 font-semibold text-zinc-100">{order.orderStatus}</dd></div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4"><dt className="text-xs uppercase tracking-wide text-zinc-500">Payment status</dt><dd className="mt-1 font-semibold text-zinc-100">{order.paymentStatus}</dd></div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4"><dt className="text-xs uppercase tracking-wide text-zinc-500">Total items</dt><dd className="mt-1 font-semibold text-zinc-100">{order.totalItems}</dd></div>
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4"><dt className="text-xs uppercase tracking-wide text-zinc-500">Total amount</dt><dd className="mt-1 font-semibold text-amber-300">{formatPrice(order.totalAmount)}</dd></div>
            </dl>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href={`/customer/orders/${order.id}`} className="rounded-lg bg-amber-300 px-5 py-3 text-sm font-semibold text-zinc-950 hover:bg-amber-200">View Order</Link>
              <Link href="/customer/orders" className="rounded-lg border border-zinc-700 px-5 py-3 text-sm font-semibold text-zinc-100 hover:border-amber-300">View Orders</Link>
              <Link href="/products" className="rounded-lg border border-zinc-700 px-5 py-3 text-sm font-semibold text-zinc-100 hover:border-amber-300">Continue Shopping</Link>
            </div>
          </>
        )}
      </section>
    </main>
  );
}