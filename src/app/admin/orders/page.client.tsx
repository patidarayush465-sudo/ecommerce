"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type OrderStatus = "PENDING" | "CONFIRMED" | "PROCESSING" | "SHIPPED" | "DELIVERED" | "CANCELLED";
type PaymentStatus = "PENDING" | "PAID" | "FAILED" | "REFUNDED";
type Customer = { id: string; name: string; email: string };
type OrderSummary = { id: string; orderNumber: string; customer: Customer; totalItems: number; totalAmount: number; paymentMethod: string; paymentStatus: PaymentStatus; orderStatus: OrderStatus; createdAt: string };
type Pagination = { page: number; limit: number; total: number; totalPages: number };
type OrdersResponse = { message?: string; data?: OrderSummary[]; pagination?: Pagination };

const LIMIT = 10;
const ORDER_STATUSES: Array<OrderStatus | ""> = ["", "PENDING", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"];
const PAYMENT_STATUSES: Array<PaymentStatus | ""> = ["", "PENDING", "PAID", "FAILED", "REFUNDED"];

function formatDate(value: string) { return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(value)); }
function formatAmount(value: number) { return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value); }
function statusClass(status: string) { return status === "CANCELLED" || status === "FAILED" ? "bg-rose-50 text-rose-700" : status === "PAID" || status === "DELIVERED" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"; }

export default function AdminOrdersPage() {
  const router = useRouter();
  const query = useSearchParams();
  const searchParam = query.get("search") ?? "";
  const orderStatus = query.get("orderStatus") ?? "";
  const paymentStatus = query.get("paymentStatus") ?? "";
  const parsedPage = Number(query.get("page") ?? "1");
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const [search, setSearch] = useState(searchParam);
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page, limit: LIMIT, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (search.trim() !== searchParam) {
        const params = new URLSearchParams(query.toString());
        if (search.trim()) params.set("search", search.trim()); else params.delete("search");
        params.delete("page");
        router.replace(`/admin/orders?${params}`, { scroll: false });
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [query, router, search, searchParam]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadOrders() {
      setLoading(true); setError("");
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (searchParam) params.set("search", searchParam);
      if (orderStatus) params.set("orderStatus", orderStatus);
      if (paymentStatus) params.set("paymentStatus", paymentStatus);
      try {
        const response = await fetch(`/api/admin/orders?${params}`, { cache: "no-store", signal: controller.signal });
        const body = (await response.json()) as OrdersResponse;
        if (response.status === 401) { router.replace("/admin/login"); return; }
        if (!response.ok) { setError(body.message ?? "Unable to load orders."); return; }
        setOrders(body.data ?? []); setPagination(body.pagination ?? { page, limit: LIMIT, total: 0, totalPages: 0 });
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) setError("Network error while loading orders.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void loadOrders();
    return () => controller.abort();
  }, [page, orderStatus, paymentStatus, router, searchParam]);

  function updateFilters(next: { search?: string; orderStatus?: string; paymentStatus?: string }) {
    const params = new URLSearchParams();
    const nextSearch = next.search ?? searchParam;
    const nextOrderStatus = next.orderStatus ?? orderStatus;
    const nextPaymentStatus = next.paymentStatus ?? paymentStatus;
    if (nextSearch) params.set("search", nextSearch);
    if (nextOrderStatus) params.set("orderStatus", nextOrderStatus);
    if (nextPaymentStatus) params.set("paymentStatus", nextPaymentStatus);
    router.replace(`/admin/orders${params.toString() ? `?${params}` : ""}`, { scroll: false });
  }

  function changePage(nextPage: number) {
    const params = new URLSearchParams(query.toString());
    if (nextPage > 1) params.set("page", String(nextPage)); else params.delete("page");
    router.replace(`/admin/orders${params.toString() ? `?${params}` : ""}`, { scroll: false });
  }

  return <section className="mx-auto max-w-7xl">
    <div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-600">Operations</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Orders</h1><p className="mt-2 text-sm text-slate-600">Review customer orders and track fulfillment status.</p></div>
    <div className="mt-8 rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="grid gap-4 border-b border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_1fr_1fr_auto] lg:items-end">
        <div><label htmlFor="order-search" className="block text-sm font-medium text-slate-700">Search order number</label><input id="order-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="e.g. ORD-20260920" className="mt-2 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-950 outline-none focus:border-cyan-500" /></div>
        <div><label htmlFor="order-status-filter" className="block text-sm font-medium text-slate-700">Order status</label><select id="order-status-filter" value={orderStatus} onChange={(event) => updateFilters({ orderStatus: event.target.value })} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm"><option value="">All</option>{ORDER_STATUSES.slice(1).map((status) => <option key={status} value={status}>{status}</option>)}</select></div>
        <div><label htmlFor="payment-status-filter" className="block text-sm font-medium text-slate-700">Payment status</label><select id="payment-status-filter" value={paymentStatus} onChange={(event) => updateFilters({ paymentStatus: event.target.value })} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm"><option value="">All</option>{PAYMENT_STATUSES.slice(1).map((status) => <option key={status} value={status}>{status}</option>)}</select></div>
        <button type="button" onClick={() => { setSearch(""); updateFilters({ search: "", orderStatus: "", paymentStatus: "" }); }} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-slate-950">Clear Filters</button>
      </div>
      {error && <p className="m-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">{error}</p>}
      {loading ? <div className="p-10 text-center text-sm text-slate-500" role="status">Loading orders...</div> : orders.length === 0 ? <div className="p-10 text-center"><h2 className="text-lg font-semibold text-slate-900">No orders found</h2><p className="mt-2 text-sm text-slate-500">Try adjusting the search or filters.</p></div> : <><div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Order Number</th><th className="px-5 py-3">Customer</th><th className="px-5 py-3">Items</th><th className="px-5 py-3">Total Amount</th><th className="px-5 py-3">Payment Method</th><th className="px-5 py-3">Payment Status</th><th className="px-5 py-3">Order Status</th><th className="px-5 py-3">Created At</th><th className="px-5 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{orders.map((order) => <tr key={order.id}><td className="px-5 py-4 font-semibold text-slate-950">{order.orderNumber}</td><td className="px-5 py-4"><p className="font-medium text-slate-900">{order.customer.name}</p><p className="text-xs text-slate-500">{order.customer.email}</p></td><td className="px-5 py-4">{order.totalItems}</td><td className="px-5 py-4 font-semibold text-slate-950">{formatAmount(order.totalAmount)}</td><td className="px-5 py-4">{order.paymentMethod}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(order.paymentStatus)}`}>{order.paymentStatus}</span></td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(order.orderStatus)}`}>{order.orderStatus}</span></td><td className="px-5 py-4 whitespace-nowrap text-slate-500">{formatDate(order.createdAt)}</td><td className="px-5 py-4 text-right"><Link href={`/admin/orders/${order.id}`} className="font-semibold text-cyan-700 hover:text-cyan-900">View Order</Link></td></tr>)}</tbody></table></div><div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between"><span>{pagination.total} total orders</span><div className="flex items-center gap-3"><button type="button" disabled={page <= 1} onClick={() => changePage(page - 1)} className="rounded-lg border border-slate-300 px-3 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-40">Previous</button><span>Page {page}{pagination.totalPages ? ` of ${pagination.totalPages}` : ""}</span><button type="button" disabled={!pagination.totalPages || page >= pagination.totalPages} onClick={() => changePage(page + 1)} className="rounded-lg border border-slate-300 px-3 py-2 font-medium disabled:cursor-not-allowed disabled:opacity-40">Next</button></div></div></>}
    </div>
  </section>;
}
