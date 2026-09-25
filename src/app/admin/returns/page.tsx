"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

type ReturnStatus = "REQUESTED" | "CONFIRMED" | "PICKUP" | "RECEIVED" | "COMPLETED" | "REJECTED";
type ReturnItem = { productId: string; productName: string; quantity: number; unitPrice: number; subtotal: number };
type Customer = { id: string; name: string; email: string; mobile?: string };
type Order = { id: string; orderNumber?: string };
type ReturnSummary = {
  id: string;
  user: Customer;
  order: Order;
  items: ReturnItem[];
  reason: string;
  reasonDetails: string | null;
  status: ReturnStatus;
  requestedAt: string;
  createdAt: string;
  updatedAt: string;
};
type Pagination = { page: number; limit: number; total: number; totalPages: number };
type ReturnsResponse = { message?: string; returns?: ReturnSummary[]; pagination?: Pagination };

const LIMIT = 10;
const RETURN_STATUSES: Array<ReturnStatus | ""> = ["", "REQUESTED", "CONFIRMED", "PICKUP", "RECEIVED", "COMPLETED", "REJECTED"];
const STATUS_LABELS: Record<ReturnStatus, string> = {
  REQUESTED: "Return Requested",
  CONFIRMED: "Return Confirmed",
  PICKUP: "Agent Pickup",
  RECEIVED: "Return Received",
  COMPLETED: "Return Completed",
  REJECTED: "Return Rejected",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(new Date(value));
}

function statusClass(status: ReturnStatus) {
  if (status === "REJECTED") return "bg-rose-50 text-rose-700";
  if (status === "COMPLETED") return "bg-emerald-50 text-emerald-700";
  return "bg-amber-50 text-amber-700";
}

export default function AdminReturnsPage() {
  const router = useRouter();
  const query = useSearchParams();
  const searchParam = query.get("search") ?? "";
  const status = query.get("status") ?? "";
  const parsedPage = Number(query.get("page") ?? "1");
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const [search, setSearch] = useState(searchParam);
  const [returns, setReturns] = useState<ReturnSummary[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page, limit: LIMIT, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (search.trim() !== searchParam) {
        const params = new URLSearchParams(query.toString());
        if (search.trim()) params.set("search", search.trim()); else params.delete("search");
        params.delete("page");
        router.replace(`/admin/returns${params.toString() ? `?${params}` : ""}`, { scroll: false });
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [query, router, search, searchParam]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadReturns() {
      setLoading(true);
      setError("");
      const params = new URLSearchParams({ page: String(page), limit: String(LIMIT) });
      if (searchParam) params.set("search", searchParam);
      if (status) params.set("status", status);
      try {
        const response = await fetch(`/api/admin/returns?${params}`, { cache: "no-store", signal: controller.signal });
        const body = (await response.json()) as ReturnsResponse;
        if (response.status === 401) { router.replace("/admin/login"); return; }
        if (!response.ok) { setError(body.message ?? "Unable to load returns."); return; }
        setReturns(body.returns ?? []);
        setPagination(body.pagination ?? { page, limit: LIMIT, total: 0, totalPages: 0 });
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) setError("Network error while loading returns.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadReturns();
    return () => controller.abort();
  }, [page, refreshKey, router, searchParam, status]);

  function updateFilters(nextStatus: string) {
    const params = new URLSearchParams(query.toString());
    if (nextStatus) params.set("status", nextStatus); else params.delete("status");
    params.delete("page");
    router.replace(`/admin/returns${params.toString() ? `?${params}` : ""}`, { scroll: false });
  }

  function changePage(nextPage: number) {
    const params = new URLSearchParams(query.toString());
    if (nextPage > 1) params.set("page", String(nextPage)); else params.delete("page");
    router.replace(`/admin/returns${params.toString() ? `?${params}` : ""}`, { scroll: false });
  }

  function reload() {
    setRefreshKey((current) => current + 1);
  }

  return (
    <section className="mx-auto max-w-7xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-600">Operations</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Returns</h1>
          <p className="mt-2 text-sm text-slate-600">Review and manage customer return requests.</p>
        </div>
        <button type="button" onClick={reload} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:border-slate-950">Refresh</button>
      </div>

      <div className="mt-8 rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="grid gap-4 border-b border-slate-200 p-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_1fr] lg:items-end">
          <div>
            <label htmlFor="return-search" className="block text-sm font-medium text-slate-700">Search returns</label>
            <input id="return-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Return ID, order ID, customer name or email" className="mt-2 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-slate-950 outline-none focus:border-cyan-500" />
          </div>
          <div>
            <label htmlFor="return-status-filter" className="block text-sm font-medium text-slate-700">Return status</label>
            <select id="return-status-filter" value={status} onChange={(event) => updateFilters(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm">
              <option value="">All</option>
              {RETURN_STATUSES.slice(1).map((value) => <option key={value} value={value}>{STATUS_LABELS[value]}</option>)}
            </select>
          </div>
        </div>

        {error && <p className="m-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">{error}</p>}
        {loading ? <div className="p-10 text-center text-sm text-slate-500" role="status">Loading returns...</div> : returns.length === 0 ? <div className="p-10 text-center"><h2 className="text-lg font-semibold text-slate-900">No returns found</h2><p className="mt-2 text-sm text-slate-500">Try adjusting the search or status filter.</p></div> : <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[950px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-5 py-3">Return ID</th><th className="px-5 py-3">Order ID</th><th className="px-5 py-3">Customer</th><th className="px-5 py-3">Items</th><th className="px-5 py-3">Reason</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Requested</th><th className="px-5 py-3 text-right">Action</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{returns.map((returnRequest) => <tr key={returnRequest.id}><td className="px-5 py-4 font-semibold text-slate-950">{returnRequest.id}</td><td className="px-5 py-4 text-slate-700">{returnRequest.order.orderNumber ?? returnRequest.order.id}</td><td className="px-5 py-4"><p className="font-medium text-slate-900">{returnRequest.user.name}</p><p className="text-xs text-slate-500">{returnRequest.user.email}</p></td><td className="px-5 py-4">{returnRequest.items.reduce((total, item) => total + item.quantity, 0)}</td><td className="px-5 py-4">{returnRequest.reason}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(returnRequest.status)}`}>{STATUS_LABELS[returnRequest.status]}</span></td><td className="whitespace-nowrap px-5 py-4 text-slate-500">{formatDate(returnRequest.requestedAt)}</td><td className="px-5 py-4 text-right"><Link href={`/admin/returns/${returnRequest.id}`} className="font-semibold text-cyan-700 hover:text-cyan-900">View Details</Link></td></tr>)}</tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between"><span>{pagination.total} return{pagination.total === 1 ? "" : "s"} found</span><div className="flex items-center gap-3"><button type="button" onClick={() => changePage(page - 1)} disabled={page <= 1} className="rounded-lg border border-slate-300 px-3 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-40">Previous</button><span>Page {pagination.page} of {Math.max(pagination.totalPages, 1)}</span><button type="button" onClick={() => changePage(page + 1)} disabled={page >= pagination.totalPages} className="rounded-lg border border-slate-300 px-3 py-2 font-semibold disabled:cursor-not-allowed disabled:opacity-40">Next</button></div></div>
        </>}
      </div>
    </section>
  );
}