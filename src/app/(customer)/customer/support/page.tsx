"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

type TicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
type TicketCategory = "ORDER" | "PAYMENT" | "DELIVERY" | "PRODUCT" | "RETURN_REFUND" | "ACCOUNT" | "OTHER";
type Ticket = { id: string; ticketNumber: string; subject: string; category: TicketCategory; status: TicketStatus; priority: "LOW" | "MEDIUM" | "HIGH"; order: { id: string; orderNumber: string } | null; lastMessageAt: string; createdAt: string; updatedAt: string };
type TicketResponse = { data?: { tickets: Ticket[]; pagination: { page: number; limit: number; total: number; totalPages: number } }; message?: string };

const categoryLabels: Record<TicketCategory, string> = { ORDER: "Order", PAYMENT: "Payment", DELIVERY: "Delivery", PRODUCT: "Product", RETURN_REFUND: "Return / Refund", ACCOUNT: "Account", OTHER: "Other" };
const statusLabels: Record<TicketStatus, string> = { OPEN: "Open", IN_PROGRESS: "In Progress", RESOLVED: "Resolved", CLOSED: "Closed" };
const priorityLabels = { LOW: "Low", MEDIUM: "Medium", HIGH: "High" };

function formatDate(value: string) { return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function statusClass(status: TicketStatus) { return status === "CLOSED" ? "border-zinc-600 bg-zinc-800 text-zinc-300" : status === "RESOLVED" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200" : status === "IN_PROGRESS" ? "border-blue-400/30 bg-blue-400/10 text-blue-200" : "border-amber-400/30 bg-amber-400/10 text-amber-200"; }
function priorityClass(priority: keyof typeof priorityLabels) { return priority === "HIGH" ? "text-red-300" : priority === "LOW" ? "text-zinc-400" : "text-amber-300"; }

function SupportTicketsContent() {
  const router = useRouter();
  const pathname = usePathname();
  const query = useSearchParams();
  const page = Math.max(1, Number(query.get("page") ?? "1"));
  const searchParam = query.get("search") ?? "";
  const status = query.get("status") ?? "";
  const category = query.get("category") ?? "";
  const [search, setSearch] = useState(searchParam);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [pagination, setPagination] = useState<TicketResponse["data"] extends infer T ? T extends { pagination: infer P } ? P : undefined : undefined>();
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
      if (category) params.set("category", category);
      try {
        const response = await fetch(`/api/customer/support/tickets?${params}`, { cache: "no-store", signal: controller.signal });
        const body = (await response.json()) as TicketResponse;
        if (response.status === 401) { router.replace("/login"); return; }
        if (!response.ok || !body.data) throw new Error(body.message ?? "Unable to load support tickets.");
        setTickets(body.data.tickets); setPagination(body.data.pagination);
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) setError(caught instanceof Error ? caught.message : "Unable to load support tickets.");
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void loadTickets();
    return () => controller.abort();
  }, [category, page, retryKey, router, searchParam, status]);

  function updateFilter(key: "status" | "category", value: string) {
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

  return <main className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-50 sm:px-6 lg:px-10"><div className="mx-auto max-w-5xl"><Link href="/customer/home" className="text-sm text-zinc-400 hover:text-amber-300">Back to customer home</Link><header className="mt-8 flex flex-col gap-4 border-b border-zinc-800 pb-6 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-medium uppercase tracking-[0.24em] text-amber-300">Customer account</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Customer Support</h1><p className="mt-3 text-sm text-zinc-400">Need help? Create a support ticket and we&apos;ll get back to you.</p></div><Link href="/customer/support/new" className="inline-flex rounded-lg bg-amber-300 px-4 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-amber-200">+ Create Ticket</Link></header><section className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900 p-4"><div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_190px_190px]"><label className="text-sm text-zinc-300"><span className="sr-only">Search tickets</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tickets..." className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3.5 py-2.5 text-zinc-100 outline-none placeholder:text-zinc-500 focus:border-amber-300" /></label><label className="text-sm text-zinc-300"><span className="sr-only">Status</span><select value={status} onChange={(event) => updateFilter("status", event.target.value)} className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3.5 py-2.5 text-zinc-100 outline-none focus:border-amber-300"><option value="">All statuses</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-sm text-zinc-300"><span className="sr-only">Category</span><select value={category} onChange={(event) => updateFilter("category", event.target.value)} className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3.5 py-2.5 text-zinc-100 outline-none focus:border-amber-300"><option value="">All categories</option>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div></section>{error && <div className="mt-6 rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200" role="alert">{error}<button type="button" onClick={() => setRetryKey((value) => value + 1)} className="ml-3 font-semibold underline">Retry</button></div>}{loading ? <div className="mt-8 space-y-3" role="status">{Array.from({ length: 4 }, (_, index) => <div key={index} className="h-32 animate-pulse rounded-xl bg-zinc-900" />)}</div> : tickets.length === 0 ? <section className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900 px-6 py-14 text-center"><h2 className="text-2xl font-semibold">No support tickets yet.</h2><p className="mt-3 text-sm text-zinc-400">You haven&apos;t created any support tickets.</p><Link href="/customer/support/new" className="mt-6 inline-flex rounded-lg bg-amber-300 px-5 py-3 text-sm font-semibold text-zinc-950 hover:bg-amber-200">Create Your First Ticket</Link></section> : <section className="mt-8 space-y-4" aria-label="Support tickets">{tickets.map((ticket) => <article key={ticket.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-5"><div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="text-sm font-medium text-amber-300">{ticket.ticketNumber}</p><h2 className="mt-1 truncate text-lg font-semibold">{ticket.subject}</h2><p className="mt-2 text-sm text-zinc-500">{categoryLabels[ticket.category]} · Created {formatDate(ticket.createdAt)}</p></div><Link href={`/customer/support/${ticket.id}`} className="rounded-lg border border-zinc-700 px-4 py-2 text-center text-sm font-semibold hover:border-amber-300">View</Link></div><div className="mt-5 flex flex-wrap items-center gap-2 border-t border-zinc-800 pt-4 text-xs"><span className={`rounded-full border px-2.5 py-1 font-semibold ${statusClass(ticket.status)}`}>{statusLabels[ticket.status]}</span><span className={`font-semibold ${priorityClass(ticket.priority)}`}>{priorityLabels[ticket.priority]} priority</span><span className="text-zinc-500">Last updated {formatDate(ticket.updatedAt)}</span></div></article>)}</section>}{pagination && pagination.totalPages > 1 && <nav className="mt-6 flex items-center justify-between border-t border-zinc-800 pt-6"><button type="button" disabled={page <= 1 || loading} onClick={() => changePage(page - 1)} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40">Previous</button><span className="text-sm text-zinc-400">Page {pagination.page} of {pagination.totalPages}</span><button type="button" disabled={page >= pagination.totalPages || loading} onClick={() => changePage(page + 1)} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40">Next</button></nav>}</div></main>;
}

export default function CustomerSupportPage() {
  return <Suspense fallback={<main className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-50"><div className="mx-auto max-w-5xl text-zinc-400" role="status">Loading support...</div></main>}><SupportTicketsContent /></Suspense>;
}
