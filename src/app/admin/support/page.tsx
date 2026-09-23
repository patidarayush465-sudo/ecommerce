"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

type Status = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
type Category = "ORDER" | "PAYMENT" | "DELIVERY" | "PRODUCT" | "RETURN_REFUND" | "ACCOUNT" | "OTHER";
type Priority = "LOW" | "MEDIUM" | "HIGH";
type Ticket = { id: string; ticketNumber: string; subject: string; category: Category; status: Status; priority: Priority; customer: { id: string; name: string; email: string; profileImage: string } | null; lastMessageAt: string; createdAt: string; updatedAt: string };
type ResponseBody = { data?: { tickets: Ticket[]; pagination: { page: number; limit: number; total: number; totalPages: number }; stats: { total: number; open: number; inProgress: number; resolved: number; closed: number } }; message?: string };

const labels = { OPEN: "Open", IN_PROGRESS: "In Progress", RESOLVED: "Resolved", CLOSED: "Closed" };
const categories = { ORDER: "Order", PAYMENT: "Payment", DELIVERY: "Delivery", PRODUCT: "Product", RETURN_REFUND: "Return / Refund", ACCOUNT: "Account", OTHER: "Other" };
const priorities = { LOW: "Low", MEDIUM: "Medium", HIGH: "High" };
function formatDate(value: string) { return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function statusClass(status: Status) { return status === "CLOSED" ? "bg-slate-100 text-slate-600" : status === "RESOLVED" ? "bg-emerald-50 text-emerald-700" : status === "IN_PROGRESS" ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"; }
function priorityClass(priority: Priority) { return priority === "HIGH" ? "text-rose-600" : priority === "LOW" ? "text-slate-500" : "text-amber-600"; }

function AdminSupportContent() {
  const router = useRouter();
  const pathname = usePathname();
  const query = useSearchParams();
  const page = Math.max(1, Number(query.get("page") ?? "1"));
  const searchParam = query.get("search") ?? "";
  const status = query.get("status") ?? "";
  const priority = query.get("priority") ?? "";
  const category = query.get("category") ?? "";
  const [search, setSearch] = useState(searchParam);
  const [data, setData] = useState<ResponseBody["data"]>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (search.trim() === searchParam) return;
      const params = new URLSearchParams(query.toString());
      if (search.trim()) params.set("search", search.trim()); else params.delete("search");
      params.delete("page");
      router.replace(`${pathname}?${params}`, { scroll: false });
    }, 400);
    return () => window.clearTimeout(timer);
  }, [pathname, query, router, search, searchParam]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadTickets() {
      setLoading(true); setError("");
      const params = new URLSearchParams({ page: String(page), limit: "10" });
      if (searchParam) params.set("search", searchParam);
      if (status) params.set("status", status);
      if (priority) params.set("priority", priority);
      if (category) params.set("category", category);
      try {
        const response = await fetch(`/api/admin/support/tickets?${params}`, { cache: "no-store", signal: controller.signal });
        const body = (await response.json()) as ResponseBody;
        if (response.status === 401 || response.status === 403) { router.replace("/admin/login"); return; }
        if (!response.ok || !body.data) throw new Error(body.message ?? "Unable to load support tickets.");
        setData(body.data);
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) setError(caught instanceof Error ? caught.message : "Unable to load support tickets.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void loadTickets();
    return () => controller.abort();
  }, [category, page, priority, retryKey, router, searchParam, status]);

  function updateFilter(key: "status" | "priority" | "category", value: string) {
    const params = new URLSearchParams(query.toString());
    if (value) params.set(key, value); else params.delete(key);
    params.delete("page");
    router.replace(`${pathname}?${params}`, { scroll: false });
  }
  function changePage(nextPage: number) {
    const params = new URLSearchParams(query.toString());
    if (nextPage > 1) params.set("page", String(nextPage)); else params.delete("page");
    router.replace(`${pathname}?${params}`, { scroll: false });
  }

  return <section className="mx-auto max-w-7xl space-y-6"><header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-600">Operations</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Support Tickets</h1><p className="mt-2 text-sm text-slate-600">Manage customer questions and conversations.</p></div><button type="button" onClick={() => setRetryKey((value) => value + 1)} disabled={loading} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:border-cyan-500 hover:text-cyan-700 disabled:opacity-60">{loading ? "Refreshing..." : "Refresh"}</button></header>{data && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{[["Total Tickets", data.stats.total], ["Open", data.stats.open], ["In Progress", data.stats.inProgress], ["Resolved", data.stats.resolved], ["Closed", data.stats.closed]].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-3 text-2xl font-semibold text-slate-950">{value}</p></div>)}</div>}<div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_1fr_1fr_1fr]"><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search ticket, subject, customer..." className="rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-950 outline-none focus:border-cyan-500" /><select value={status} onChange={(event) => updateFilter("status", event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm"><option value="">All statuses</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select value={priority} onChange={(event) => updateFilter("priority", event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm"><option value="">All priorities</option>{Object.entries(priorities).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select value={category} onChange={(event) => updateFilter("category", event.target.value)} className="rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm"><option value="">All categories</option>{Object.entries(categories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div></div>{error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">{error}<button type="button" onClick={() => setRetryKey((value) => value + 1)} className="ml-3 font-semibold underline">Retry</button></div>}<div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">{loading && !data ? <div className="space-y-3 p-6" role="status">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-12 animate-pulse rounded-lg bg-slate-100" />)}</div> : !data || data.tickets.length === 0 ? <div className="p-12 text-center"><h2 className="text-lg font-semibold text-slate-900">No support tickets found</h2><p className="mt-2 text-sm text-slate-500">Try adjusting your search or filters.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Ticket</th><th className="px-5 py-3">Customer</th><th className="px-5 py-3">Subject</th><th className="px-5 py-3">Category</th><th className="px-5 py-3">Priority</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Last Updated</th><th className="px-5 py-3 text-right">Action</th></tr></thead><tbody className="divide-y divide-slate-100">{data.tickets.map((ticket) => <tr key={ticket.id}><td className="px-5 py-4 font-semibold text-cyan-700">{ticket.ticketNumber}</td><td className="px-5 py-4"><p className="font-medium text-slate-900">{ticket.customer?.name ?? "Unknown customer"}</p><p className="text-xs text-slate-500">{ticket.customer?.email ?? ""}</p></td><td className="max-w-[220px] truncate px-5 py-4 text-slate-800">{ticket.subject}</td><td className="px-5 py-4">{categories[ticket.category]}</td><td className={`px-5 py-4 font-semibold ${priorityClass(ticket.priority)}`}>{priorities[ticket.priority]}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(ticket.status)}`}>{labels[ticket.status]}</span></td><td className="whitespace-nowrap px-5 py-4 text-slate-500">{formatDate(ticket.lastMessageAt)}</td><td className="px-5 py-4 text-right"><Link href={`/admin/support/${ticket.id}`} className="font-semibold text-cyan-700 hover:text-cyan-900">View</Link></td></tr>)}</tbody></table></div>}{data && <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><span className="text-sm text-slate-500">Page {data.pagination.page} of {Math.max(data.pagination.totalPages, 1)}</span><div className="flex gap-2"><button type="button" onClick={() => changePage(page - 1)} disabled={page <= 1 || loading} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium disabled:opacity-40">Previous</button><button type="button" onClick={() => changePage(page + 1)} disabled={page >= data.pagination.totalPages || loading} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium disabled:opacity-40">Next</button></div></div>}</div></section>;
}

export default function AdminSupportPage() { return <Suspense fallback={<section className="mx-auto max-w-7xl"><div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500" role="status">Loading support tickets...</div></section>}><AdminSupportContent /></Suspense>; }
