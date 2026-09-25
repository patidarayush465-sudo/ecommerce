import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { AuthenticationError, AuthorizationError, getAdminUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import ReturnRefund, { RefundPaymentMethod, RefundStatus } from "@/models/ReturnRefund";
import "@/models/Order";
import "@/models/User";

type AdminRefundDetail = {
  _id: { toString(): string };
  user: { _id: { toString(): string }; name: string; email: string };
  order: { _id: { toString(): string }; orderNumber?: string };
  returnRequest: { toString(): string };
  items: Array<{ productName: string; quantity: number; unitPrice: number; amount: number }>;
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
  failureReason?: string;
  retryCount?: number;
  lastAttemptAt?: Date;
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

function serializeRefund(refund: AdminRefundDetail) {
  const order = refund.order && typeof refund.order === "object" ? refund.order : null;
  const user = refund.user && typeof refund.user === "object" ? refund.user : null;
  return {
    id: refund._id.toString(),
    returnRequestId: refund.returnRequest.toString(),
    order: { id: order ? order._id.toString() : refund.order?.toString() ?? null, orderNumber: order?.orderNumber ?? null },
    customer: user ? { name: user.name, email: user.email } : { name: null, email: null },
    items: refund.items.map((item) => ({ productName: item.productName, quantity: item.quantity, unitPrice: item.unitPrice, amount: item.amount })),
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
    failureReason: refund.failureReason ?? null,
    retryCount: refund.retryCount ?? 0,
    lastAttemptAt: refund.lastAttemptAt ?? null,
  };
}

function handleError(error: unknown) {
  if (error instanceof AuthenticationError || error instanceof AuthorizationError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
  console.error("Admin refund detail failed", { name: error instanceof Error ? error.name : "UnknownError", message: error instanceof Error ? error.message : "Unknown error" });
  return NextResponse.json({ success: false, message: "Unable to load refund" }, { status: 500 });
}

export async function GET(request: Request, { params }: { params: Promise<{ refundId: string }> }) {
  try {
    getAdminUser(request);
    const { refundId } = await params;
    if (!mongoose.Types.ObjectId.isValid(refundId)) return NextResponse.json({ success: false, message: "Invalid refund ID" }, { status: 400 });
    await connectToDatabase();
    const refund = await ReturnRefund.findById(refundId).select("_id user order returnRequest items refundAmount currency paymentMethod refundMethod bankAccount upiId paymentStatus createdAt processedAt failedAt failureReason retryCount lastAttemptAt").populate({ path: "user", select: "_id name email" }).populate({ path: "order", select: "_id orderNumber" }).lean();
    if (!refund) return NextResponse.json({ success: false, message: "Refund not found" }, { status: 404 });
    return NextResponse.json({ success: true, refund: serializeRefund(refund as unknown as AdminRefundDetail) });
  } catch (error: unknown) {
    return handleError(error);
  }
}
