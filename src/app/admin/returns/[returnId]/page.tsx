"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type ReturnStatus = "REQUESTED" | "CONFIRMED" | "PICKUP" | "RECEIVED" | "COMPLETED" | "REJECTED";
type Customer = { id: string; name: string; email: string; mobile?: string };
type Order = { id: string; orderNumber?: string };
type ReturnItem = { productId: string; productName: string; productImage: string | null; quantity: number; unitPrice: number; subtotal: number };
type HistoryEntry = { status: ReturnStatus; changedAt: string; note: string | null };
type ReturnDetail = {
  id: string;
  user: Customer;
  order: Order;
  items: ReturnItem[];
  reason: string;
  reasonDetails: string | null;
  status: ReturnStatus;
  statusHistory: HistoryEntry[];
  requestedAt: string;
  confirmedAt: string | null;
  pickupAt: string | null;
  receivedAt: string | null;
  completedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  pickupAgentName: string | null;
  pickupAgentPhone: string | null;
  pickupReference: string | null;
  createdAt: string;
  updatedAt: string;
};
type ReturnResponse = { message?: string; return?: ReturnDetail };
type StatusAction = { status: ReturnStatus; note: string; label: string };

const STATUS_LABELS: Record<ReturnStatus, string> = { REQUESTED: "Return Requested", CONFIRMED: "Return Confirmed", PICKUP: "Agent Pickup", RECEIVED: "Return Received", COMPLETED: "Return Completed", REJECTED: "Return Rejected" };
const NORMAL_STAGES: ReturnStatus[] = ["REQUESTED", "CONFIRMED", "PICKUP", "RECEIVED", "COMPLETED"];

function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Not set"; }
function formatAmount(value: number) { return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value); }
function statusClass(status: ReturnStatus) { return status === "REJECTED" ? "bg-rose-50 text-rose-700" : status === "COMPLETED" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"; }

export default function AdminReturnDetailPage() {
  const router = useRouter();
  const params = useParams<{ returnId: string }>();
  const [returnRequest, setReturnRequest] = useState<ReturnDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [pickupAgentName, setPickupAgentName] = useState("");
  const [pickupAgentPhone, setPickupAgentPhone] = useState("");
  const [pickupReference, setPickupReference] = useState("");

  async function loadReturn(signal?: AbortSignal) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/returns/${params.returnId}`, { cache: "no-store", signal });
      const body = (await response.json()) as ReturnResponse;
      if (response.status === 401) { router.replace("/admin/login"); return; }
      if (!response.ok || !body.return) { setError(body.message ?? "Unable to load this return."); return; }
      setReturnRequest(body.return);
      setPickupAgentName(body.return.pickupAgentName ?? "");
      setPickupAgentPhone(body.return.pickupAgentPhone ?? "");
      setPickupReference(body.return.pickupReference ?? "");
    } catch (caught) {
      if (!(caught instanceof DOMException && caught.name === "AbortError")) setError("Network error while loading the return.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    async function loadInitialReturn() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`/api/admin/returns/${params.returnId}`, { cache: "no-store", signal: controller.signal });
        const body = (await response.json()) as ReturnResponse;
        if (response.status === 401) { router.replace("/admin/login"); return; }
        if (!response.ok || !body.return) { setError(body.message ?? "Unable to load this return."); return; }
        setReturnRequest(body.return);
        setPickupAgentName(body.return.pickupAgentName ?? "");
        setPickupAgentPhone(body.return.pickupAgentPhone ?? "");
        setPickupReference(body.return.pickupReference ?? "");
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) setError("Network error while loading the return.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadInitialReturn();
    return () => controller.abort();
  }, [params.returnId, router]);

  async function updateStatus(action: StatusAction, extra: Record<string, string> = {}) {
    if (!returnRequest || saving) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      const response = await fetch(`/api/admin/returns/${returnRequest.id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: action.status, note: action.note, ...extra }) });
      const body = (await response.json()) as ReturnResponse;
      if (response.status === 401) { router.replace("/admin/login"); return; }
      if (!response.ok) { setError(body.message ?? "Unable to update return status."); if (response.status === 409) await loadReturn(); return; }
      setSuccess(body.message ?? "Return status updated successfully.");
      await loadReturn();
    } catch { setError("Network error while updating return status."); } finally { setSaving(false); }
  }

  function confirmAction(action: StatusAction, extra?: Record<string, string>) {
    if (window.confirm(`${action.label}?`)) void updateStatus(action, extra);
  }

  function rejectReturn() {
    const reason = rejectionReason.trim();
    if (!reason) { setError("A rejection reason is required."); return; }
    void updateStatus({ status: "REJECTED", note: reason, label: "Reject Return" }, { rejectionReason: reason });
  }

  const actions: StatusAction[] = returnRequest?.status === "REQUESTED" ? [{ status: "CONFIRMED", note: "Return approved.", label: "Confirm Return" }] : returnRequest?.status === "CONFIRMED" ? [{ status: "PICKUP", note: "Pickup assigned.", label: "Assign Pickup" }] : returnRequest?.status === "PICKUP" ? [{ status: "RECEIVED", note: "Return received.", label: "Mark Return Received" }] : returnRequest?.status === "RECEIVED" ? [{ status: "COMPLETED", note: "Return completed.", label: "Complete Return" }] : [];
  const timeline = returnRequest?.status === "REJECTED" ? ["REQUESTED", "REJECTED"] as ReturnStatus[] : NORMAL_STAGES;
  const historyStatuses = new Set(returnRequest?.statusHistory.map((entry) => entry.status));

  return <section className="mx-auto max-w-6xl">
    <Link href="/admin/returns" className="text-sm font-medium text-cyan-700 hover:text-cyan-900">Back to returns</Link>
    {loading ? <p className="mt-10 text-sm text-slate-500" role="status">Loading return...</p> : error && !returnRequest ? <p className="mt-8 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">{error}</p> : returnRequest ? <>
      <header className="mt-6 flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-600">Return details</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{returnRequest.id}</h1><p className="mt-2 text-sm text-slate-600">Order {returnRequest.order.orderNumber ?? returnRequest.order.id}</p></div><span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${statusClass(returnRequest.status)}`}>{STATUS_LABELS[returnRequest.status]}</span></header>
      {error && <p className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">{error}</p>}{success && <p className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700" role="status">{success}</p>}
      <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]"><div className="space-y-6">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold text-slate-950">Return information</h2><dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-slate-500">Return ID</dt><dd className="mt-1 break-all font-medium text-slate-950">{returnRequest.id}</dd></div><div><dt className="text-slate-500">Order ID</dt><dd className="mt-1 break-all text-slate-950">{returnRequest.order.id}</dd></div><div><dt className="text-slate-500">Requested</dt><dd className="mt-1 text-slate-950">{formatDate(returnRequest.requestedAt)}</dd></div><div><dt className="text-slate-500">Reason</dt><dd className="mt-1 text-slate-950">{returnRequest.reason}</dd></div><div className="sm:col-span-2"><dt className="text-slate-500">Reason details</dt><dd className="mt-1 text-slate-950">{returnRequest.reasonDetails ?? "No additional details."}</dd></div></dl></section>
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold text-slate-950">Customer</h2><dl className="mt-5 grid gap-4 text-sm sm:grid-cols-3"><div><dt className="text-slate-500">Name</dt><dd className="mt-1 text-slate-950">{returnRequest.user.name}</dd></div><div><dt className="text-slate-500">Email</dt><dd className="mt-1 break-all text-slate-950">{returnRequest.user.email}</dd></div><div><dt className="text-slate-500">Mobile</dt><dd className="mt-1 text-slate-950">{returnRequest.user.mobile ?? "Not provided"}</dd></div></dl></section>
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold text-slate-950">Return items</h2><div className="mt-5 space-y-4">{returnRequest.items.map((item) => <div key={item.productId} className="flex gap-4 border-b border-slate-100 pb-4 last:border-0 last:pb-0">{item.productImage ? <img src={item.productImage} alt="" className="h-16 w-16 rounded-lg object-cover" /> : <div className="h-16 w-16 rounded-lg bg-slate-100" />}<div className="min-w-0 flex-1"><p className="font-medium text-slate-950">{item.productName}</p><p className="mt-1 text-sm text-slate-500">Quantity: {item.quantity} · Unit price: {formatAmount(item.unitPrice)}</p><p className="mt-1 text-sm font-semibold text-slate-900">Subtotal: {formatAmount(item.subtotal)}</p></div></div>)}</div></section>
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold text-slate-950">Pickup information</h2>{returnRequest.pickupAgentName || returnRequest.pickupAgentPhone || returnRequest.pickupReference ? <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-3"><div><dt className="text-slate-500">Agent name</dt><dd className="mt-1 text-slate-950">{returnRequest.pickupAgentName ?? "Not assigned"}</dd></div><div><dt className="text-slate-500">Agent phone</dt><dd className="mt-1 text-slate-950">{returnRequest.pickupAgentPhone ?? "Not assigned"}</dd></div><div><dt className="text-slate-500">Reference</dt><dd className="mt-1 break-all text-slate-950">{returnRequest.pickupReference ?? "Not assigned"}</dd></div></dl> : <p className="mt-3 text-sm text-slate-500">Pickup has not been assigned.</p>}</section>
        {returnRequest.status === "REJECTED" && <section className="rounded-xl border border-rose-200 bg-rose-50 p-5"><h2 className="text-lg font-semibold text-rose-900">Rejection information</h2><p className="mt-3 text-sm text-rose-800">{returnRequest.rejectionReason ?? "No rejection reason provided."}</p></section>}
      </div><aside className="space-y-6">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold text-slate-950">Status timeline</h2><ol className="mt-5 space-y-0">{timeline.map((stage, index) => { const isCurrent = stage === returnRequest.status; const isComplete = historyStatuses.has(stage); return <li key={stage} className="relative flex gap-3 pb-6 last:pb-0"><span className={`relative z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${isCurrent ? "bg-cyan-600 text-white" : isComplete ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"}`}>{isComplete ? "✓" : index + 1}</span>{index < timeline.length - 1 && <span className="absolute left-3 top-6 h-full w-px bg-slate-200" />}<span className={isCurrent ? "font-semibold text-slate-950" : isComplete ? "text-slate-700" : "text-slate-400"}>{STATUS_LABELS[stage]}{isCurrent && <span className="ml-2 text-xs font-normal text-cyan-700">Current</span>}</span></li>; })}</ol></section>
        {actions.length > 0 && <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold text-slate-950">Status actions</h2><div className="mt-4 space-y-3">{actions.map((action) => action.status === "PICKUP" ? <div key={action.status} className="space-y-3"><input value={pickupAgentName} onChange={(event) => setPickupAgentName(event.target.value)} placeholder="Agent name (optional)" className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" /><input value={pickupAgentPhone} onChange={(event) => setPickupAgentPhone(event.target.value)} placeholder="Agent phone (optional)" className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" /><input value={pickupReference} onChange={(event) => setPickupReference(event.target.value)} placeholder="Pickup reference (optional)" className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" /><button type="button" disabled={saving} onClick={() => confirmAction(action, { pickupAgentName, pickupAgentPhone, pickupReference })} className="w-full rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-60">{saving ? "Updating..." : action.label}</button></div> : <button key={action.status} type="button" disabled={saving} onClick={() => confirmAction(action)} className="w-full rounded-lg bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-700 disabled:opacity-60">{saving ? "Updating..." : action.label}</button>)}{returnRequest.status === "REQUESTED" && <div className="border-t border-slate-200 pt-4"><label htmlFor="rejection-reason" className="block text-sm font-medium text-slate-700">Rejection reason</label><textarea id="rejection-reason" value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} rows={3} placeholder="Explain why this return is rejected" className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" /><button type="button" disabled={saving} onClick={rejectReturn} className="mt-3 w-full rounded-lg border border-rose-300 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60">Reject Return</button></div>}{returnRequest.status === "CONFIRMED" && <div className="border-t border-slate-200 pt-4"><label htmlFor="rejection-reason-confirmed" className="block text-sm font-medium text-slate-700">Rejection reason</label><textarea id="rejection-reason-confirmed" value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} rows={3} placeholder="Explain why this return is rejected" className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" /><button type="button" disabled={saving} onClick={rejectReturn} className="mt-3 w-full rounded-lg border border-rose-300 px-4 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-60">Reject Return</button></div>}</div></section>}
      </aside></div>
    </> : null}
  </section>;
}