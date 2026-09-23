"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type OrderStatus = "PENDING" | "CONFIRMED" | "PROCESSING" | "SHIPPED" | "DELIVERED" | "CANCELLED";
type PaymentStatus = "PENDING" | "PAID" | "FAILED" | "REFUNDED";
type PaymentMethod = "COD" | "ONLINE";
type DashboardData = {
  stats: { totalUsers: number; totalProducts: number; totalCategories: number; totalSubcategories: number; totalOrders: number; totalRevenue: number };
  orderStatus: Record<Lowercase<OrderStatus>, number>;
  payments: { paidOnline: number; cod: number; failed: number; refunded: number };
  recentOrders: Array<{ id: string; orderNumber: string; customer: { name: string; email: string }; totalAmount: number; paymentMethod: PaymentMethod; paymentStatus: PaymentStatus; orderStatus: OrderStatus; createdAt: string }>;
  recentUsers: Array<{ id: string; name: string; email: string; isEmailVerified: boolean; createdAt: string }>;
  lowStockProducts: Array<{ id: string; name: string; stock: number; sellingPrice: number }>;
};
type DashboardResponse = { data?: DashboardData; message?: string };

const statusItems: Array<{ label: string; key: Lowercase<OrderStatus>; color: string }> = [
  { label: "Pending", key: "pending", color: "bg-amber-500" }, { label: "Confirmed", key: "confirmed", color: "bg-cyan-500" },
  { label: "Processing", key: "processing", color: "bg-blue-500" }, { label: "Shipped", key: "shipped", color: "bg-indigo-500" },
  { label: "Delivered", key: "delivered", color: "bg-emerald-500" }, { label: "Cancelled", key: "cancelled", color: "bg-rose-500" },
];

function formatAmount(value: number) { return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value); }
function formatDate(value: string) { return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(value)); }
function statusClass(status: string) { return status === "DELIVERED" || status === "PAID" ? "bg-emerald-50 text-emerald-700" : status === "CANCELLED" || status === "FAILED" || status === "REFUNDED" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"; }

function StatIcon({ type }: { type: "users" | "products" | "categories" | "orders" | "revenue" }) {
  const common = { className: "h-5 w-5", fill: "none", stroke: "currentColor", strokeWidth: 1.8, viewBox: "0 0 24 24", "aria-hidden": true } as const;
  if (type === "users") return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>;
  if (type === "products") return <svg {...common}><path d="m16.5 9.4-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" /><path d="m3.27 6.96 8.73 5.05 8.73-5.05M12 22.08V12" /></svg>;
  if (type === "categories") return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M17.5 14v7M14 17.5h7" /></svg>;
  if (type === "orders") return <svg {...common}><path d="M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><path d="M8 7h8M8 11h8M8 15h5" /></svg>;
  return <svg {...common}><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7H14a3.5 3.5 0 0 1 0 7H6" /></svg>;
}

function LoadingBlock() { return <div className="animate-pulse space-y-6" aria-label="Loading dashboard" role="status"><div className="h-10 w-64 rounded-lg bg-slate-200" /><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-32 rounded-xl bg-white shadow-sm ring-1 ring-slate-200" />)}</div><div className="h-80 rounded-xl bg-white shadow-sm ring-1 ring-slate-200" /></div>; }

export default function AdminDashboardPage() {
  const router = useRouter();
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function loadDashboard() {
      setLoading(true); setError("");
      try {
        const response = await fetch("/api/admin/dashboard", { cache: "no-store", signal: controller.signal });
        const body = (await response.json()) as DashboardResponse;
        if (response.status === 401 || response.status === 403) { router.replace("/admin/login"); return; }
        if (!response.ok || !body.data) throw new Error(body.message ?? "Unable to load dashboard.");
        setDashboard(body.data);
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) setError(caught instanceof Error ? caught.message : "Unable to load dashboard.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void loadDashboard();
    return () => controller.abort();
  }, [refreshKey, router]);

  if (loading && !dashboard) return <section className="mx-auto max-w-7xl"><LoadingBlock /></section>;
  if (error && !dashboard) return <section className="mx-auto max-w-7xl"><div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-rose-800"><h1 className="text-xl font-semibold">Dashboard unavailable</h1><p className="mt-2 text-sm">{error}</p><button type="button" onClick={() => setRefreshKey((value) => value + 1)} className="mt-5 rounded-lg bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800">Try again</button></div></section>;
  if (!dashboard) return null;

  const statCards = [
    { label: "Total Users", value: dashboard.stats.totalUsers.toLocaleString("en-IN"), icon: "users" as const, tone: "bg-cyan-50 text-cyan-700" }, { label: "Total Products", value: dashboard.stats.totalProducts.toLocaleString("en-IN"), icon: "products" as const, tone: "bg-blue-50 text-blue-700" }, { label: "Total Categories", value: dashboard.stats.totalCategories.toLocaleString("en-IN"), icon: "categories" as const, tone: "bg-violet-50 text-violet-700" }, { label: "Total Subcategories", value: dashboard.stats.totalSubcategories.toLocaleString("en-IN"), icon: "categories" as const, tone: "bg-indigo-50 text-indigo-700" }, { label: "Total Orders", value: dashboard.stats.totalOrders.toLocaleString("en-IN"), icon: "orders" as const, tone: "bg-amber-50 text-amber-700" }, { label: "Total Revenue", value: formatAmount(dashboard.stats.totalRevenue), icon: "revenue" as const, tone: "bg-emerald-50 text-emerald-700" },
  ];
  const paymentRows: Array<[string, number, string]> = [["Paid online", dashboard.payments.paidOnline, "text-emerald-600"], ["COD orders", dashboard.payments.cod, "text-cyan-600"], ["Failed payments", dashboard.payments.failed, "text-rose-600"], ["Refunded orders", dashboard.payments.refunded, "text-amber-600"]];

  return <section className="mx-auto max-w-7xl space-y-6">
    <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-600">Overview</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Dashboard</h1><p className="mt-2 text-sm text-slate-600">Overview of your store</p></div><button type="button" onClick={() => setRefreshKey((value) => value + 1)} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:border-cyan-500 hover:text-cyan-700 disabled:cursor-not-allowed disabled:opacity-60"><svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8.1 8.1 0 0 0-14.9-4L3 10m0 0V4m0 6h6M4 13a8.1 8.1 0 0 0 14.9 4L21 14m0 0v6m0-6h-6" /></svg>{loading ? "Refreshing..." : "Refresh"}</button></header>
    {error && <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="alert">{error}</div>}
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{statCards.map((card) => <div key={card.label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><div><p className="text-sm font-medium text-slate-500">{card.label}</p><p className="mt-3 text-2xl font-semibold tracking-tight text-slate-950">{card.value}</p></div><span className={`rounded-lg p-2.5 ${card.tone}`}><StatIcon type={card.icon} /></span></div></div>)}</div>
    <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]"><div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><h2 className="font-semibold text-slate-950">Order status</h2><p className="mt-1 text-sm text-slate-500">Current fulfillment pipeline</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{dashboard.stats.totalOrders} total</span></div><div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">{statusItems.map((item) => <div key={item.key} className="rounded-lg bg-slate-50 p-4"><div className="flex items-center gap-2 text-sm text-slate-600"><span className={`h-2 w-2 rounded-full ${item.color}`} />{item.label}</div><p className="mt-2 text-2xl font-semibold text-slate-950">{dashboard.orderStatus[item.key]}</p></div>)}</div></div><div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold text-slate-950">Payment summary</h2><p className="mt-1 text-sm text-slate-500">Payment health at a glance</p><div className="mt-5 divide-y divide-slate-100">{paymentRows.map(([label, value, tone]) => <div key={label} className="flex items-center justify-between py-3 text-sm"><span className="text-slate-600">{label}</span><span className={`text-lg font-semibold ${tone}`}>{value}</span></div>)}</div></div></div>
    <div className="grid gap-6 xl:grid-cols-[1.55fr_1fr]"><div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-200 p-5"><div><h2 className="font-semibold text-slate-950">Recent orders</h2><p className="mt-1 text-sm text-slate-500">Latest customer activity</p></div><Link href="/admin/orders" className="text-sm font-semibold text-cyan-700 hover:text-cyan-900">View All Orders</Link></div>{dashboard.recentOrders.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No orders yet.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Order</th><th className="px-5 py-3">Customer</th><th className="px-5 py-3">Total</th><th className="px-5 py-3">Payment</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Created</th></tr></thead><tbody className="divide-y divide-slate-100">{dashboard.recentOrders.map((order) => <tr key={order.id}><td className="whitespace-nowrap px-5 py-4 font-semibold text-slate-950">{order.orderNumber}</td><td className="px-5 py-4"><p className="font-medium text-slate-900">{order.customer.name}</p><p className="text-xs text-slate-500">{order.customer.email}</p></td><td className="whitespace-nowrap px-5 py-4 font-semibold text-slate-950">{formatAmount(order.totalAmount)}</td><td className="px-5 py-4"><p>{order.paymentMethod}</p><span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${statusClass(order.paymentStatus)}`}>{order.paymentStatus}</span></td><td className="px-5 py-4"><span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${statusClass(order.orderStatus)}`}>{order.orderStatus}</span></td><td className="whitespace-nowrap px-5 py-4 text-slate-500">{formatDate(order.createdAt)}</td></tr>)}</tbody></table></div>}</div><div className="rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-200 p-5"><div><h2 className="font-semibold text-slate-950">Recent users</h2><p className="mt-1 text-sm text-slate-500">Newest customer accounts</p></div><Link href="/admin/users" className="text-sm font-semibold text-cyan-700 hover:text-cyan-900">View All Users</Link></div>{dashboard.recentUsers.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">No customers yet.</p> : <div className="divide-y divide-slate-100">{dashboard.recentUsers.map((user) => <div key={user.id} className="flex items-center justify-between gap-3 p-4"><div className="min-w-0"><p className="truncate font-medium text-slate-900">{user.name}</p><p className="truncate text-xs text-slate-500">{user.email}</p><p className="mt-1 text-xs text-slate-400">{formatDate(user.createdAt)}</p></div><span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-semibold ${user.isEmailVerified ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{user.isEmailVerified ? "Verified" : "Pending"}</span></div>)}</div>}</div></div>
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-200 p-5"><div><h2 className="font-semibold text-slate-950">Low stock products</h2><p className="mt-1 text-sm text-slate-500">Active products with five or fewer units</p></div><Link href="/admin/products" className="text-sm font-semibold text-cyan-700 hover:text-cyan-900">View All Products</Link></div>{dashboard.lowStockProducts.length === 0 ? <p className="p-8 text-center text-sm text-slate-500">All active products have healthy stock.</p> : <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">{dashboard.lowStockProducts.map((product) => <div key={product.id} className="rounded-lg border border-slate-200 p-4"><p className="truncate font-medium text-slate-900">{product.name}</p><div className="mt-3 flex items-end justify-between"><span className={`text-sm font-semibold ${product.stock === 0 ? "text-rose-600" : "text-amber-600"}`}>{product.stock} left</span><span className="text-sm font-semibold text-slate-700">{formatAmount(product.sellingPrice)}</span></div></div>)}</div>}</div>
  </section>;
}
