import { NextResponse } from "next/server";

import { AuthenticationError, AuthorizationError, getAdminUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import ReturnRefund, { RefundPaymentMethod, RefundStatus } from "@/models/ReturnRefund";
import "@/models/Order";
import "@/models/User";

type AdminRefund = {
  _id: { toString(): string };
  user: { _id: { toString(): string }; name: string; email: string } | { toString(): string };
  order: { _id: { toString(): string }; orderNumber?: string } | { toString(): string };
  returnRequest: { toString(): string };
  refundAmount: number;
  currency: string;
  paymentMethod: RefundPaymentMethod;
  refundMethod?: "BANK_ACCOUNT" | "UPI";
  bankAccount?: { accountHolderName?: string; accountNumber?: string; ifsc?: string };
  upiId?: string;
  paymentStatus: RefundStatus;
  createdAt: Date;
  processedAt?: Date;
  failedAt?: Date;
  retryCount?: number;
};

function maskAccountNumber(value?: string) {
  if (!value) return null;
  return `${"*".repeat(Math.max(4, value.length - 4))}${value.slice(-4)}`;
}

function maskUpiId(value?: string) {
  if (!value) return null;
  const [localPart, domain] = value.split("@");
  if (!localPart || !domain) return "****";
  return `${localPart.slice(0, 2)}****@${domain}`;
}

function serializeRefund(refund: AdminRefund) {
  const user = refund.user && typeof refund.user === "object" && "name" in refund.user ? refund.user : null;
  const order = refund.order && typeof refund.order === "object" && "orderNumber" in refund.order ? refund.order : null;
  return {
    id: refund._id.toString(),
    returnRequestId: refund.returnRequest.toString(),
    order: order ? { id: order._id.toString(), orderNumber: order.orderNumber ?? null } : { id: refund.order.toString() },
    customer: user ? { name: user.name, email: user.email } : null,
    refundAmount: refund.refundAmount,
    currency: refund.currency,
    paymentMethod: refund.paymentMethod,
    refundMethod: refund.refundMethod ?? null,
    destination: refund.refundMethod === "BANK_ACCOUNT"
      ? { accountHolderName: refund.bankAccount?.accountHolderName ?? null, accountNumber: maskAccountNumber(refund.bankAccount?.accountNumber), ifsc: refund.bankAccount?.ifsc ?? null }
      : refund.refundMethod === "UPI"
        ? { upiId: maskUpiId(refund.upiId) }
        : null,
    paymentStatus: refund.paymentStatus,
    createdAt: refund.createdAt,
    processedAt: refund.processedAt ?? null,
    failedAt: refund.failedAt ?? null,
    retryCount: refund.retryCount ?? 0,
  };
}

function handleError(error: unknown) {
  if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
    return NextResponse.json({ success: false, message: error.message }, { status: error.status });
  }
  console.error("Admin refund list failed", { name: error instanceof Error ? error.name : "UnknownError", message: error instanceof Error ? error.message : "Unknown error" });
  return NextResponse.json({ success: false, message: "Unable to load refunds" }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    getAdminUser(request);
    await connectToDatabase();
    const params = new URL(request.url).searchParams;
    const page = Math.max(1, Number(params.get("page") ?? "1"));
    const limit = Math.min(50, Math.max(1, Number(params.get("limit") ?? "10")));
    const status = params.get("status") ?? "";
    const paymentMethod = params.get("paymentMethod") ?? "";
    const refundMethod = params.get("refundMethod") ?? "";
    if (status && !Object.values(RefundStatus).includes(status as RefundStatus)) return NextResponse.json({ success: false, message: "Invalid refund status" }, { status: 400 });
    if (paymentMethod && !Object.values(RefundPaymentMethod).includes(paymentMethod as RefundPaymentMethod)) return NextResponse.json({ success: false, message: "Invalid payment method" }, { status: 400 });
    if (refundMethod && !["BANK_ACCOUNT", "UPI"].includes(refundMethod)) return NextResponse.json({ success: false, message: "Invalid refund method" }, { status: 400 });

    const query: Record<string, unknown> = {};
    if (status) query.paymentStatus = status;
    if (paymentMethod) query.paymentMethod = paymentMethod;
    if (refundMethod) query.refundMethod = refundMethod;
    const [records, total] = await Promise.all([
      ReturnRefund.find(query).select("_id user order returnRequest refundAmount currency paymentMethod refundMethod bankAccount upiId paymentStatus createdAt processedAt failedAt retryCount").populate({ path: "user", select: "_id name email" }).populate({ path: "order", select: "_id orderNumber" }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      ReturnRefund.countDocuments(query),
    ]);
    return NextResponse.json({ success: true, refunds: (records as unknown as AdminRefund[]).map(serializeRefund), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } });
  } catch (error: unknown) {
    return handleError(error);
  }
}
