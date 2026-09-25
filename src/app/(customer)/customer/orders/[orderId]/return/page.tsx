"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  customerErrorMessage,
  formatReturnDate,
  formatReturnPrice,
  RETURN_REASONS,
  type ReturnReason,
} from "@/components/customer/return-data";

type OrderItem = { product: string; productName: string; productImage: string; price: number; quantity: number };
type Order = { id: string; orderNumber: string; items: OrderItem[]; orderStatus: string; paymentMethod: "ONLINE" | "COD"; createdAt: string };
type OrderResponse = { data?: Order; message?: string };
type RefundMethod = "BANK_ACCOUNT" | "UPI";

export default function CustomerReturnRequestPage() {
  const router = useRouter();
  const { orderId } = useParams<{ orderId: string }>();
  const [order, setOrder] = useState<Order | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reason, setReason] = useState<ReturnReason | "">("");
  const [reasonDetails, setReasonDetails] = useState("");
  const [refundMethod, setRefundMethod] = useState<RefundMethod>("BANK_ACCOUNT");
  const [accountHolderName, setAccountHolderName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [ifsc, setIfsc] = useState("");
  const [upiId, setUpiId] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    async function loadOrder() {
      setLoading(true);
      try {
        const response = await fetch(`/api/customer/orders/${orderId}`, { cache: "no-store", signal: controller.signal });
        const body = (await response.json()) as OrderResponse;
        if (response.status === 401) { router.replace("/login"); return; }
        if (!response.ok || !body.data) { setError(customerErrorMessage(response.status, body.message ?? "Unable to load this order.")); return; }
        setOrder(body.data);
        if (body.data.orderStatus !== "DELIVERED") setError("Only delivered orders can be returned.");
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) setError("Unable to load this order. Please try again.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadOrder();
    return () => controller.abort();
  }, [orderId, router]);

  async function submitReturn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!order || order.orderStatus !== "DELIVERED" || submitting) return;
    const items = Object.entries(quantities).filter(([, quantity]) => quantity > 0).map(([productId, quantity]) => ({ productId, quantity }));
    if (items.length === 0) { setError("Select at least one product to return."); return; }
    if (!reason) { setError("Select a return reason."); return; }
    let refundDestination: Record<string, unknown> | undefined;
    if (order.paymentMethod === "COD") {
      if (refundMethod === "BANK_ACCOUNT") {
        if (!accountHolderName.trim() || !/^\d{9,18}$/.test(accountNumber.trim()) || !/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(ifsc.trim())) { setError("Enter a valid account holder name, account number, and IFSC code."); return; }
        refundDestination = { refundMethod, bankAccount: { accountHolderName: accountHolderName.trim(), accountNumber: accountNumber.trim(), ifsc: ifsc.trim().toUpperCase() } };
      } else {
        if (!/^[a-z0-9._-]{2,}@[a-z0-9.-]{2,}$/i.test(upiId.trim())) { setError("Enter a valid UPI ID."); return; }
        refundDestination = { refundMethod, upiId: upiId.trim().toLowerCase() };
      }
    }
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/customer/returns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orderId: order.id, items, reason, ...(reasonDetails.trim() ? { reasonDetails: reasonDetails.trim() } : {}), ...(refundDestination ? { refundDestination } : {}) }) });
      const body = (await response.json()) as { return?: { id: string }; message?: string };
      if (response.status === 401) { router.replace("/login"); return; }
      if (!response.ok || !body.return?.id) { setError(customerErrorMessage(response.status, body.message ?? "Unable to create your return.")); return; }
      router.replace(`/customer/returns/${body.return.id}`);
    } catch {
      setError("Unable to create your return. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return <main className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-50 sm:px-6 lg:px-10"><div className="mx-auto max-w-5xl"><Link href={`/customer/orders/${orderId}`} className="text-sm text-zinc-400 hover:text-amber-300">Back to order</Link><header className="mt-8 border-b border-zinc-800 pb-6"><p className="text-sm font-medium uppercase tracking-[0.24em] text-amber-300">Customer account</p><h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Request a Return</h1></header>{error && <p className="mt-6 rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200" role="alert">{error}</p>}{loading ? <p className="mt-10 text-zinc-400" role="status">Loading order...</p> : !order ? <p className="mt-10 text-zinc-400">This order could not be loaded.</p> : <form onSubmit={submitReturn} className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]"><div className="space-y-6"><section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5"><dl className="grid gap-4 text-sm sm:grid-cols-3"><div><dt className="text-zinc-500">Order number</dt><dd className="mt-1 font-semibold text-amber-300">{order.orderNumber}</dd></div><div><dt className="text-zinc-500">Order date</dt><dd className="mt-1">{formatReturnDate(order.createdAt)}</dd></div><div><dt className="text-zinc-500">Status</dt><dd className="mt-1">{order.orderStatus}</dd></div></dl></section><section className="rounded-xl border border-zinc-800 bg-zinc-900 p-5"><h2 className="text-xl font-semibold">Products to return</h2><div className="mt-5 divide-y divide-zinc-800">{order.items.map((item) => { const selected = quantities[item.product] ?? 0; return <div key={item.product} className="flex gap-4 py-4 first:pt-0 last:pb-0"><div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-zinc-800">{item.productImage ? <div role="img" aria-label={item.productName} className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url("${item.productImage}")` }} /> : <div className="flex h-full items-center justify-center text-xs text-zinc-500">No image</div>}</div><div className="min-w-0 flex-1"><h3 className="font-semibold">{item.productName}</h3><p className="mt-2 text-sm text-zinc-300">Historical selling price: {formatReturnPrice(item.price)}</p><p className="mt-1 text-sm text-zinc-500">Ordered quantity: {item.quantity}</p></div><label className="text-sm text-zinc-300"><span className="block text-zinc-500">Return qty</span><select value={selected} onChange={(event) => setQuantities((current) => ({ ...current, [item.product]: Number(event.target.value) }))} className="mt-2 w-20 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-2 text-zinc-100 focus:border-amber-300" aria-label={`Return quantity for ${item.productName}`}><option value={0}>0</option>{Array.from({ length: item.quantity }, (_, index) => index + 1).map((quantity) => <option key={quantity} value={quantity}>{quantity}</option>)}</select></label></div>; })}</div></section></div><aside className="h-fit rounded-xl border border-zinc-800 bg-zinc-900 p-5 lg:sticky lg:top-6"><h2 className="text-xl font-semibold">Return details</h2><label className="mt-5 block text-sm text-zinc-300">Reason<select required value={reason} onChange={(event) => setReason(event.target.value as ReturnReason)} className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 focus:border-amber-300"><option value="">Select a reason</option>{RETURN_REASONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>{order.paymentMethod === "COD" && <fieldset className="mt-5 border-t border-zinc-800 pt-5"><legend className="text-sm font-semibold text-zinc-200">COD refund destination</legend><p className="mt-1 text-xs text-zinc-500">Choose one destination for your refund.</p><select value={refundMethod} onChange={(event) => setRefundMethod(event.target.value as RefundMethod)} className="mt-3 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 focus:border-amber-300" aria-label="COD refund method"><option value="BANK_ACCOUNT">Bank account</option><option value="UPI">UPI ID</option></select>{refundMethod === "BANK_ACCOUNT" ? <div className="mt-3 space-y-3"><input required value={accountHolderName} onChange={(event) => setAccountHolderName(event.target.value)} placeholder="Account holder name" className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300" /><input required inputMode="numeric" pattern="[0-9]{9,18}" value={accountNumber} onChange={(event) => setAccountNumber(event.target.value)} placeholder="Account number" className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300" /><input required value={ifsc} onChange={(event) => setIfsc(event.target.value)} placeholder="IFSC code" className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300" /></div> : <input required value={upiId} onChange={(event) => setUpiId(event.target.value)} placeholder="UPI ID" className="mt-3 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 placeholder:text-zinc-500 focus:border-amber-300" />}</fieldset>}<label className="mt-5 block text-sm text-zinc-300">Additional details<span className="mt-2 block text-xs text-zinc-500">Optional, up to 500 characters</span><textarea value={reasonDetails} maxLength={500} onChange={(event) => setReasonDetails(event.target.value)} rows={5} className="mt-2 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-zinc-100 outline-none focus:border-amber-300" /></label><button type="submit" disabled={submitting || order.orderStatus !== "DELIVERED"} className="mt-6 w-full rounded-lg bg-amber-300 px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50">{submitting ? "Submitting..." : "Submit Return Request"}</button></aside></form>}</div></main>;
}
