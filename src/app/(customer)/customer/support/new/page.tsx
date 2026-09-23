"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import SupportAttachmentPicker from "@/components/support/SupportAttachmentPicker";
import { validateSupportAttachmentFiles } from "@/lib/support-attachments";

const categories = [
  "ORDER",
  "PAYMENT",
  "DELIVERY",
  "PRODUCT",
  "RETURN_REFUND",
  "ACCOUNT",
  "OTHER",
] as const;
const priorities = ["LOW", "MEDIUM", "HIGH"] as const;

function NewCustomerSupportTicketContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedOrderId = searchParams.get("orderId")?.trim() ?? "";
  const [subject, setSubject] = useState("");
  const [category, setCategory] =
    useState<(typeof categories)[number]>("OTHER");
  const [priority, setPriority] =
    useState<(typeof priorities)[number]>("MEDIUM");
  const [verifiedOrder, setVerifiedOrder] = useState<{ id: string; orderNumber: string } | null>(null);
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!selectedOrderId) return;

    const controller = new AbortController();
    async function loadSelectedOrder() {
      setError("");
      try {
        const response = await fetch(`/api/customer/orders/${selectedOrderId}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = (await response.json()) as { data?: { orderNumber: string }; message?: string };
        if (response.status === 401) {
          router.replace("/login");
          return;
        }
        if (!response.ok || !body.data) {
          setError(body.message ?? "Order not found.");
          return;
        }
        setVerifiedOrder({ id: selectedOrderId, orderNumber: body.data.orderNumber });
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === "AbortError")) {
          setError("Unable to verify the selected order.");
        }
      }
    }
    void loadSelectedOrder();
    return () => controller.abort();
  }, [router, selectedOrderId]);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fileError = validateSupportAttachmentFiles(files);
    if (fileError) {
      setError(fileError);
      return;
    }
    if (subject.trim().length < 3 || !message.trim()) {
      setError("Subject and message are required.");
      return;
    }
    if (selectedOrderId && verifiedOrder?.id !== selectedOrderId) {
      setError("Please wait while the selected order is verified.");
      return;
    }
    setLoading(true);
    setError("");
    const formData = new FormData();
    formData.append("subject", subject);
    formData.append("category", category);
    formData.append("priority", priority);
    formData.append("message", message);
    if (selectedOrderId) formData.append("orderId", selectedOrderId);
    files.forEach((file) => formData.append("attachments", file));
    try {
      const response = await fetch("/api/customer/support/tickets", {
        method: "POST",
        body: formData,
      });
      const body = (await response.json()) as {
        message?: string;
        data?: { ticket: { id: string } };
      };
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok || !body.data) {
        setError(body.message ?? "Unable to create ticket.");
        return;
      }
      router.replace(`/customer/support/${body.data.ticket.id}`);
    } catch {
      setError("Unable to create ticket. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-50 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/customer/support"
          className="text-sm text-zinc-400 hover:text-amber-300"
        >
          Back to Support
        </Link>
        <header className="mt-8 border-b border-zinc-800 pb-6">
          <p className="text-sm font-medium uppercase tracking-[0.24em] text-amber-300">
            Customer account
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Create Support Ticket
          </h1>
        </header>
        <form
          onSubmit={submit}
          className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900 p-5 sm:p-7"
        >
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="text-sm text-zinc-300 sm:col-span-2">
              Subject
              <input
                value={subject}
                onChange={(event) => setSubject(event.target.value)}
                maxLength={150}
                className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3.5 py-2.5 text-zinc-100 outline-none focus:border-amber-300"
              />
            </label>
            <label className="text-sm text-zinc-300">
              Category
              <select
                value={category}
                onChange={(event) =>
                  setCategory(event.target.value as typeof category)
                }
                className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3.5 py-2.5 text-zinc-100 outline-none focus:border-amber-300"
              >
                {categories.map((value) => (
                  <option key={value}>{value.replace("_", " / ")}</option>
                ))}
              </select>
            </label>
            <label className="text-sm text-zinc-300">
              Priority
              <select
                value={priority}
                onChange={(event) =>
                  setPriority(event.target.value as typeof priority)
                }
                className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3.5 py-2.5 text-zinc-100 outline-none focus:border-amber-300"
              >
                {priorities.map((value) => (
                  <option key={value}>{value}</option>
                ))}
              </select>
            </label>
            {selectedOrderId && (
              <div className="sm:col-span-2">
                <p className="text-sm text-zinc-300">Order ID</p>
                <p className="mt-2 rounded-lg border border-zinc-700 bg-zinc-950 px-3.5 py-2.5 text-zinc-100">
                  {verifiedOrder?.id === selectedOrderId ? verifiedOrder.orderNumber : "Verifying order..."}
                </p>
              </div>
            )}
            <label className="text-sm text-zinc-300 sm:col-span-2">
              Message
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                maxLength={3000}
                rows={7}
                className="mt-2 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 px-3.5 py-3 text-zinc-100 outline-none focus:border-amber-300"
              />
            </label>
          </div>
          <SupportAttachmentPicker
            files={files}
            onChange={setFiles}
            dark
            disabled={loading}
          />
          {error && (
            <p className="mt-4 text-sm text-red-300" role="alert">
              {error}
            </p>
          )}
          <div className="mt-6 flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="rounded-lg bg-amber-300 px-5 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Uploading..." : "Create Ticket"}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}

export default function NewCustomerSupportTicketPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-50"><div className="mx-auto max-w-3xl text-zinc-400" role="status">Loading support form...</div></main>}>
      <NewCustomerSupportTicketContent />
    </Suspense>
  );
}
