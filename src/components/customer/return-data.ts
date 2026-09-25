export type ReturnStatus = "REQUESTED" | "CONFIRMED" | "PICKUP" | "RECEIVED" | "COMPLETED" | "REJECTED";
export type ReturnReason = "DAMAGED" | "DEFECTIVE" | "WRONG_ITEM" | "MISSING_ITEM" | "NOT_AS_DESCRIBED" | "SIZE_OR_FIT" | "CHANGED_MIND" | "OTHER";
export type CustomerReturnItem = { productId: string; productName: string; productImage: string | null; quantity: number; unitPrice: number; subtotal: number };
export type CustomerReturn = { id: string; orderId: string; status: ReturnStatus; reason: ReturnReason; reasonDetails?: string | null; items: CustomerReturnItem[]; requestedAt: string; confirmedAt?: string | null; pickupAt?: string | null; receivedAt?: string | null; completedAt?: string | null; rejectedAt?: string | null; rejectionReason?: string | null; statusHistory?: Array<{ status: ReturnStatus; changedAt: string; note?: string | null }> };

export const RETURN_REASONS: Array<{ value: ReturnReason; label: string }> = [
  { value: "DAMAGED", label: "Damaged Product" }, { value: "DEFECTIVE", label: "Defective Product" }, { value: "WRONG_ITEM", label: "Wrong Item" }, { value: "MISSING_ITEM", label: "Missing Item" },
  { value: "NOT_AS_DESCRIBED", label: "Not as Described" }, { value: "SIZE_OR_FIT", label: "Size/Fit Issue" }, { value: "CHANGED_MIND", label: "Changed My Mind" }, { value: "OTHER", label: "Other" },
];
export const RETURN_STATUS_LABELS: Record<ReturnStatus, string> = { REQUESTED: "Return Requested", CONFIRMED: "Return Confirmed", PICKUP: "Agent Pickup", RECEIVED: "Return Received", COMPLETED: "Return Completed", REJECTED: "Return Rejected" };
export const ACTIVE_RETURN_STATUSES: ReturnStatus[] = ["REQUESTED", "CONFIRMED", "PICKUP", "RECEIVED"];
export function isActiveReturn(status: ReturnStatus) { return ACTIVE_RETURN_STATUSES.includes(status); }
export function formatReturnDate(value: string) { return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
export function formatReturnPrice(value: number) { return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value); }
export function customerErrorMessage(status: number, fallback: string) {
  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 403) return "You do not have access to this return.";
  if (status === 404) return "The requested order or return was not found.";
  if (status === 409) return "This order already has an active return. Refresh to view it.";
  if (status === 422 || status === 400) return "Please check the return details and try again.";
  return status >= 500 ? "Something went wrong. Please try again." : fallback;
}