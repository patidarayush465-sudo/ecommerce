"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import SupportAttachmentPicker from "@/components/support/SupportAttachmentPicker";
import SupportAttachmentList from "@/components/support/SupportAttachmentList";

type Status = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
type Category =
  | "ORDER"
  | "PAYMENT"
  | "DELIVERY"
  | "PRODUCT"
  | "RETURN_REFUND"
  | "ACCOUNT"
  | "OTHER";
type Priority = "LOW" | "MEDIUM" | "HIGH";
type Ticket = {
  id: string;
  ticketNumber: string;
  subject: string;
  description: string | null;
  category: Category;
  status: Status;
  priority: Priority;
  customer: {
    id: string;
    name: string;
    email: string;
    profileImage: string;
  } | null;
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
  sender: {
    id: string;
    name: string;
    role: string;
    profileImage: string;
  } | null;
};
type DetailResponse = {
  data?: { ticket: Ticket; replies: Reply[] };
  message?: string;
};

const labels = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};
const categories = {
  ORDER: "Order",
  PAYMENT: "Payment",
  DELIVERY: "Delivery",
  PRODUCT: "Product",
  RETURN_REFUND: "Return / Refund",
  ACCOUNT: "Account",
  OTHER: "Other",
};
const priorities = { LOW: "Low", MEDIUM: "Medium", HIGH: "High" };
function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
function statusClass(status: Status) {
  return status === "CLOSED"
    ? "bg-slate-100 text-slate-600"
    : status === "RESOLVED"
      ? "bg-emerald-50 text-emerald-700"
      : status === "IN_PROGRESS"
        ? "bg-blue-50 text-blue-700"
        : "bg-amber-50 text-amber-700";
}

export default function AdminSupportDetailPage() {
  const router = useRouter();
  const params = useParams<{ ticketId: string }>();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [replies, setReplies] = useState<Reply[]>([]);
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<Status | "">("");
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [success, setSuccess] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function loadTicket() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(
          `/api/admin/support/tickets/${params.ticketId}`,
          { cache: "no-store", signal: controller.signal },
        );
        const body = (await response.json()) as DetailResponse;
        if (response.status === 401 || response.status === 403) {
          router.replace("/admin/login");
          return;
        }
        if (response.status === 404) {
          setError("Ticket not found");
          return;
        }
        if (!response.ok || !body.data)
          throw new Error(body.message ?? "Unable to load support ticket.");
        setTicket(body.data.ticket);
        setReplies(body.data.replies);
        setStatus(body.data.ticket.status);
      } catch (caught) {
        if (!(caught instanceof DOMException && caught.name === "AbortError"))
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load support ticket.",
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void loadTicket();
    return () => controller.abort();
  }, [params.ticketId, reloadKey, router]);

  async function sendReply() {
    const trimmed = message.trim();
    if (!trimmed || trimmed.length > 3000 || actionLoading) return;
    setActionLoading(true);
    setActionError("");
    setSuccess("");
    try {
      const formData = new FormData();
      formData.append("message", trimmed);
      files.forEach((file) => formData.append("attachments", file));
      const response = await fetch(
        `/api/admin/support/tickets/${params.ticketId}/replies`,
        {
          method: "POST",
          body: formData,
        },
      );
      const body = (await response.json()) as { message?: string };
      if (response.status === 401 || response.status === 403) {
        router.replace("/admin/login");
        return;
      }
      if (!response.ok) {
        setActionError(body.message ?? "Unable to send reply.");
        return;
      }
      setMessage("");
      setFiles([]);
      setSuccess("Reply sent successfully.");
      setReloadKey((value) => value + 1);
    } catch {
      setActionError("Unable to send reply. Please try again.");
    } finally {
      setActionLoading(false);
    }
  }

  async function updateStatus(nextStatus: Status) {
    if (!ticket || actionLoading || nextStatus === ticket.status) return;
    setActionLoading(true);
    setActionError("");
    setSuccess("");
    try {
      const response = await fetch(
        `/api/admin/support/tickets/${params.ticketId}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: nextStatus }),
        },
      );
      const body = (await response.json()) as { message?: string };
      if (response.status === 401 || response.status === 403) {
        router.replace("/admin/login");
        return;
      }
      if (!response.ok) {
        setActionError(body.message ?? "Unable to update status.");
        return;
      }
      setTicket((current) =>
        current
          ? {
              ...current,
              status: nextStatus,
              updatedAt: new Date().toISOString(),
            }
          : current,
      );
      setStatus(nextStatus);
      setSuccess("Status updated successfully.");
    } catch {
      setActionError("Unable to update status. Please try again.");
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <section className="mx-auto max-w-5xl">
      <Link
        href="/admin/support"
        className="text-sm font-semibold text-cyan-700 hover:text-cyan-900"
      >
        Back to Support
      </Link>
      {loading ? (
        <div
          className="mt-8 rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500"
          role="status"
        >
          Loading support ticket...
        </div>
      ) : error || !ticket ? (
        <div className="mt-8 rounded-xl border border-rose-200 bg-rose-50 p-6 text-rose-800">
          <h1 className="text-xl font-semibold">Ticket not found</h1>
          <p className="mt-2 text-sm">
            {error || "This ticket is unavailable."}
          </p>
          <Link
            href="/admin/support"
            className="mt-5 inline-flex rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold text-white"
          >
            Back to Support
          </Link>
        </div>
      ) : (
        <>
          <header className="mt-6 flex flex-col gap-5 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-600">
                Support ticket
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                {ticket.ticketNumber}
              </h1>
              <p className="mt-2 text-lg text-slate-700">{ticket.subject}</p>
            </div>
            <select
              value={status}
              onChange={(event) =>
                void updateStatus(event.target.value as Status)
              }
              disabled={actionLoading}
              className="rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-60"
            >
              {Object.entries(labels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </header>
          {actionError && (
            <p
              className="mt-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
              role="alert"
            >
              {actionError}
            </p>
          )}
          {success && (
            <p
              className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
              role="status"
            >
              {success}
            </p>
          )}
          <div className="mt-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="space-y-6">
              <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                <h2 className="text-lg font-semibold text-slate-950">
                  Conversation
                </h2>
                <div className="mt-5 space-y-4">
                  {replies.map((reply) => (
                    <article
                      key={reply.id}
                      className={`max-w-3xl rounded-xl border p-4 ${reply.senderRole === "ADMIN" ? "ml-auto border-cyan-200 bg-cyan-50" : "border-slate-200 bg-slate-50"}`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span
                          className={`font-semibold ${reply.senderRole === "ADMIN" ? "text-cyan-700" : "text-slate-700"}`}
                        >
                          {reply.senderRole === "ADMIN"
                            ? "Admin"
                            : (reply.sender?.name ?? "Customer")}
                        </span>
                        <time className="text-slate-500">
                          {formatDate(reply.createdAt)}
                        </time>
                      </div>
                      <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                        {reply.message}
                      </p>
                      <SupportAttachmentList attachments={reply.attachments} />
                    </article>
                  ))}
                </div>
              </section>
              {ticket.status === "CLOSED" ? (
                <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  Closed tickets cannot receive replies.
                </p>
              ) : (
                <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-slate-950">
                      Reply
                    </h2>
                    <span className="text-xs text-slate-500">
                      {message.length}/3000
                    </span>
                  </div>
                  <textarea
                    value={message}
                    onChange={(event) => setMessage(event.target.value)}
                    maxLength={3000}
                    rows={6}
                    placeholder="Write your reply..."
                    className="mt-4 w-full resize-y rounded-lg border border-slate-300 px-3.5 py-3 text-sm text-slate-950 outline-none placeholder:text-slate-400 focus:border-cyan-500"
                  />
                  <SupportAttachmentPicker files={files} onChange={setFiles} disabled={actionLoading} />
                  <div className="mt-4 flex justify-end">
                    <button
                      type="button"
                      onClick={() => void sendReply()}
                      disabled={!message.trim() || actionLoading}
                      className="rounded-lg bg-cyan-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {actionLoading ? "Sending..." : "Send Reply"}
                    </button>
                  </div>
                </section>
              )}
            </div>
            <aside className="h-fit rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-semibold text-slate-950">Ticket details</h2>
              <dl className="mt-5 space-y-4 text-sm">
                <div>
                  <dt className="text-slate-500">Customer</dt>
                  <dd className="mt-1 font-medium text-slate-900">
                    {ticket.customer?.name ?? "Unknown customer"}
                    <br />
                    <span className="font-normal text-slate-500">
                      {ticket.customer?.email}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Category</dt>
                  <dd className="mt-1 text-slate-900">
                    {categories[ticket.category]}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Priority</dt>
                  <dd className="mt-1 text-slate-900">
                    {priorities[ticket.priority]}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Status</dt>
                  <dd className="mt-1">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(ticket.status)}`}
                    >
                      {labels[ticket.status]}
                    </span>
                  </dd>
                </div>
                {ticket.order && (
                  <div>
                    <dt className="text-slate-500">Related order</dt>
                    <dd className="mt-1 text-cyan-700">
                      {ticket.order.orderNumber}
                    </dd>
                  </div>
                )}
                <div>
                  <dt className="text-slate-500">Created</dt>
                  <dd className="mt-1 text-slate-900">
                    {formatDate(ticket.createdAt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500">Updated</dt>
                  <dd className="mt-1 text-slate-900">
                    {formatDate(ticket.updatedAt)}
                  </dd>
                </div>
              </dl>
            </aside>
          </div>
        </>
      )}
    </section>
  );
}
