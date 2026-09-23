"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import SupportAttachmentPicker from "@/components/support/SupportAttachmentPicker";
import SupportAttachmentList from "@/components/support/SupportAttachmentList";

type TicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
type TicketCategory =
  | "ORDER"
  | "PAYMENT"
  | "DELIVERY"
  | "PRODUCT"
  | "RETURN_REFUND"
  | "ACCOUNT"
  | "OTHER";
type Ticket = {
  id: string;
  ticketNumber: string;
  subject: string;
  category: TicketCategory;
  status: TicketStatus;
  priority: "LOW" | "MEDIUM" | "HIGH";
  order: { id: string; orderNumber: string } | null;
  lastMessageAt: string;
  createdAt: string;
  updatedAt: string;
};
type Reply = {
  id: string;
  senderRole: "ADMIN" | "CUSTOMER";
  message: string;
  attachments: Array<{
    url: string;
    publicId: string;
    resourceType: string;
    fileName: string;
    mimeType: string;
    size: number;
  }>;
  createdAt: string;
};
type DetailResponse = {
  data?: { ticket: Ticket; replies: Reply[] };
  message?: string;
};

const categoryLabels: Record<TicketCategory, string> = {
  ORDER: "Order",
  PAYMENT: "Payment",
  DELIVERY: "Delivery",
  PRODUCT: "Product",
  RETURN_REFUND: "Return / Refund",
  ACCOUNT: "Account",
  OTHER: "Other",
};
const statusLabels: Record<TicketStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};
const priorityLabels = { LOW: "Low", MEDIUM: "Medium", HIGH: "High" };

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
function statusClass(status: TicketStatus) {
  return status === "CLOSED"
    ? "border-zinc-600 bg-zinc-800 text-zinc-300"
    : status === "RESOLVED"
      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
      : status === "IN_PROGRESS"
        ? "border-blue-400/30 bg-blue-400/10 text-blue-200"
        : "border-amber-400/30 bg-amber-400/10 text-amber-200";
}
function priorityClass(priority: keyof typeof priorityLabels) {
  return priority === "HIGH"
    ? "text-red-300"
    : priority === "LOW"
      ? "text-zinc-400"
      : "text-amber-300";
}

export default function CustomerSupportDetailPage() {
  const router = useRouter();
  const params = useParams<{ ticketId: string }>();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [showCloseConfirmation, setShowCloseConfirmation] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function loadTicket() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(
          `/api/customer/support/tickets/${params.ticketId}`,
          { cache: "no-store", signal: controller.signal },
        );
        const body = (await response.json()) as DetailResponse;
        if (response.status === 401) {
          router.replace("/login");
          return;
        }
        if (response.status === 404) {
          setError("Ticket not found");
          return;
        }
        if (!response.ok || !body.data)
          throw new Error(body.message ?? "Unable to load this ticket.");
        setTicket(body.data.ticket);
        setReplies(body.data.replies);
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === "AbortError"))
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load this ticket.",
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadTicket();
    return () => controller.abort();
  }, [params.ticketId, reloadKey, router]);

  async function sendReply() {
    const trimmedMessage = message.trim();
    if (!trimmedMessage || trimmedMessage.length > 3000 || actionLoading)
      return;
    setActionLoading(true);
    setActionError("");
    try {
      const formData = new FormData();
      formData.append("message", trimmedMessage);
      files.forEach((file) => formData.append("attachments", file));
      const response = await fetch(
        `/api/customer/support/tickets/${params.ticketId}/replies`,
        { method: "POST", body: formData },
      );
      const body = (await response.json()) as { message?: string };
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok) {
        setActionError(body.message ?? "Unable to send reply.");
        return;
      }
      setMessage("");
      setFiles([]);
      setReloadKey((value) => value + 1);
    } catch {
      setActionError("Unable to send reply. Please try again.");
    } finally {
      setActionLoading(false);
    }
  }

  async function closeTicket() {
    if (actionLoading) return;
    setActionLoading(true);
    setActionError("");
    try {
      const response = await fetch(
        `/api/customer/support/tickets/${params.ticketId}/close`,
        { method: "PATCH" },
      );
      const body = (await response.json()) as { message?: string };
      if (response.status === 401) {
        router.replace("/login");
        return;
      }
      if (!response.ok) {
        setActionError(body.message ?? "Unable to close ticket.");
        return;
      }
      setShowCloseConfirmation(false);
      setReloadKey((value) => value + 1);
    } catch {
      setActionError("Unable to close ticket. Please try again.");
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-4 py-8 text-zinc-50 sm:px-6 lg:px-10">
      <div className="mx-auto max-w-4xl">
        <Link
          href="/customer/support"
          className="text-sm text-zinc-400 hover:text-amber-300"
        >
          Back to Support
        </Link>
        {loading ? (
          <p className="mt-10 text-zinc-400" role="status">
            Loading ticket...
          </p>
        ) : error || !ticket ? (
          <section className="mt-8 rounded-xl border border-red-400/30 bg-red-400/10 p-6 text-red-200">
            <h1 className="text-xl font-semibold">Ticket not found</h1>
            <p className="mt-2 text-sm">
              {error || "This ticket is unavailable."}
            </p>
            <Link
              href="/customer/support"
              className="mt-5 inline-flex rounded-lg bg-amber-300 px-4 py-2 text-sm font-semibold text-zinc-950"
            >
              Back to Support
            </Link>
          </section>
        ) : (
          <>
            <header className="mt-8 border-b border-zinc-800 pb-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-medium uppercase tracking-[0.24em] text-amber-300">
                    {ticket.ticketNumber}
                  </p>
                  <h1 className="mt-2 text-3xl font-semibold tracking-tight">
                    {ticket.subject}
                  </h1>
                </div>
                {ticket.status === "RESOLVED" && (
                  <button
                    type="button"
                    onClick={() => setShowCloseConfirmation(true)}
                    className="rounded-lg border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-300 hover:bg-amber-300 hover:text-zinc-950"
                  >
                    Close Ticket
                  </button>
                )}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                <span
                  className={`rounded-full border px-2.5 py-1 font-semibold ${statusClass(ticket.status)}`}
                >
                  {statusLabels[ticket.status]}
                </span>
                <span
                  className={`font-semibold ${priorityClass(ticket.priority)}`}
                >
                  {priorityLabels[ticket.priority]} priority
                </span>
                <span className="text-zinc-500">
                  {categoryLabels[ticket.category]} · Created{" "}
                  {formatDate(ticket.createdAt)} · Updated{" "}
                  {formatDate(ticket.updatedAt)}
                </span>
              </div>
            </header>
            {ticket.order && (
              <section className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900 p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-[0.2em] text-zinc-500">
                      Order
                    </p>
                    <p className="mt-1 font-semibold text-amber-300">
                      {ticket.order.orderNumber}
                    </p>
                  </div>
                  <Link
                    href={`/customer/orders/${ticket.order.id}`}
                    className="rounded-lg border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-300 hover:bg-amber-300 hover:text-zinc-950"
                  >
                    View Order
                  </Link>
                </div>
              </section>
            )}
            {actionError && (
              <p
                className="mt-5 rounded-lg border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200"
                role="alert"
              >
                {actionError}
              </p>
            )}
            <section className="mt-8 rounded-xl border border-zinc-800 bg-zinc-900 p-5 sm:p-7">
              <h2 className="text-xl font-semibold">Conversation</h2>
              <div className="mt-6 space-y-4">
                {replies.length === 0 ? (
                  <p className="text-sm text-zinc-500">No messages yet.</p>
                ) : (
                  replies.map((reply) => (
                    <article
                      key={reply.id}
                      className={`max-w-3xl rounded-xl border p-4 ${reply.senderRole === "CUSTOMER" ? "ml-auto border-amber-400/20 bg-amber-300/10" : "border-zinc-700 bg-zinc-950"}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span
                          className={
                            reply.senderRole === "CUSTOMER"
                              ? "font-semibold text-amber-300"
                              : "font-semibold text-cyan-300"
                          }
                        >
                          {reply.senderRole === "CUSTOMER"
                            ? "You"
                            : "Support team"}
                        </span>
                        <time className="text-zinc-500">
                          {formatDate(reply.createdAt)}
                        </time>
                      </div>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-zinc-200">
                        {reply.message}
                      </p>
                      <SupportAttachmentList attachments={reply.attachments} dark />
                    </article>
                  ))
                )}
              </div>
            </section>
            {ticket.status === "CLOSED" ? (
              <p className="mt-6 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm text-zinc-400">
                This ticket is closed.
              </p>
            ) : (
              <section className="mt-6 rounded-xl border border-zinc-800 bg-zinc-900 p-5 sm:p-7">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xl font-semibold">
                    Reply to this ticket
                  </h2>
                  {ticket.status === "RESOLVED" && (
                    <span className="text-xs text-amber-300">
                      Replying will reopen this ticket.
                    </span>
                  )}
                </div>
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  maxLength={3000}
                  rows={5}
                  placeholder="Write your reply..."
                  className="mt-5 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 px-3.5 py-3 text-sm outline-none placeholder:text-zinc-500 focus:border-amber-300"
                />
                <SupportAttachmentPicker files={files} onChange={setFiles} dark disabled={actionLoading} />
                <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
                  <span>{message.length}/3000</span>
                  <button
                    type="button"
                    onClick={() => void sendReply()}
                    disabled={
                      !message.trim() ||
                      message.trim().length > 3000 ||
                      actionLoading
                    }
                    className="rounded-lg bg-amber-300 px-5 py-2.5 text-sm font-semibold text-zinc-950 hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {actionLoading ? "Sending..." : "Send Reply"}
                  </button>
                </div>
              </section>
            )}
            {showCloseConfirmation && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
                role="dialog"
                aria-modal="true"
                aria-labelledby="close-ticket-title"
              >
                <div className="w-full max-w-md rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
                  <h2 id="close-ticket-title" className="text-lg font-semibold">
                    Are you sure you want to close this ticket?
                  </h2>
                  <div className="mt-6 flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => setShowCloseConfirmation(false)}
                      disabled={actionLoading}
                      className="rounded-lg border border-zinc-700 px-4 py-2.5 text-sm font-semibold text-zinc-200 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => void closeTicket()}
                      disabled={actionLoading}
                      className="rounded-lg bg-amber-300 px-4 py-2.5 text-sm font-semibold text-zinc-950 disabled:opacity-50"
                    >
                      {actionLoading ? "Closing..." : "Close Ticket"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
