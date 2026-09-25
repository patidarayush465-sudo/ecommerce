import mongoose from "mongoose";
import { NextResponse } from "next/server";

import {
  AuthenticationError,
  AuthorizationError,
  getAuthUser,
} from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import ReturnRequest, { ReturnStatus } from "@/models/ReturnRequest";
import { UserRole } from "@/models/User";

function authenticateCustomer(request: Request) {
  const authUser = getAuthUser(request);
  if (authUser.role !== UserRole.CUSTOMER) {
    throw new AuthorizationError("Customer access required");
  }
  return authUser.userId;
}

function serializeCustomerReturn(returnRequest: {
  _id: { toString(): string };
  order: { toString(): string };
  status: ReturnStatus;
  reason: string;
  reasonDetails?: string;
  items: Array<{
    product: { toString(): string };
    productName: string;
    productImage?: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
  requestedAt: Date;
  confirmedAt?: Date;
  pickupAt?: Date;
  receivedAt?: Date;
  completedAt?: Date;
  rejectedAt?: Date;
  rejectionReason?: string;
  statusHistory: Array<{
    status: ReturnStatus;
    changedAt: Date;
    note?: string;
  }>;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: returnRequest._id.toString(),
    orderId: returnRequest.order.toString(),
    status: returnRequest.status,
    reason: returnRequest.reason,
    reasonDetails: returnRequest.reasonDetails ?? null,
    items: returnRequest.items.map((item) => ({
      productId: item.product.toString(),
      productName: item.productName,
      productImage: item.productImage ?? null,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: item.subtotal,
    })),
    requestedAt: returnRequest.requestedAt,
    confirmedAt: returnRequest.confirmedAt ?? null,
    pickupAt: returnRequest.pickupAt ?? null,
    receivedAt: returnRequest.receivedAt ?? null,
    completedAt: returnRequest.completedAt ?? null,
    rejectedAt: returnRequest.rejectedAt ?? null,
    rejectionReason: returnRequest.rejectionReason ?? null,
    statusHistory: returnRequest.statusHistory.map((entry) => ({
      status: entry.status,
      changedAt: entry.changedAt,
      note: entry.note ?? null,
    })),
    createdAt: returnRequest.createdAt,
    updatedAt: returnRequest.updatedAt,
  };
}

function handleReturnDetailError(error: unknown) {
  if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: error.status },
    );
  }

  console.error("Customer return detail lookup failed", {
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : String(error),
  });
  return NextResponse.json(
    { success: false, message: "Unable to fetch return request" },
    { status: 500 },
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ returnId: string }> },
) {
  try {
    const userId = authenticateCustomer(request);
    const { returnId } = await params;

    if (!mongoose.Types.ObjectId.isValid(returnId)) {
      return NextResponse.json(
        { success: false, message: "Invalid return ID" },
        { status: 400 },
      );
    }

    await connectToDatabase();

    const returnRequest = await ReturnRequest.findOne({
      _id: returnId,
      user: userId,
    })
      .select("_id order status reason reasonDetails items requestedAt confirmedAt pickupAt receivedAt completedAt rejectedAt rejectionReason statusHistory createdAt updatedAt")
      .lean();

    if (!returnRequest) {
      return NextResponse.json(
        { success: false, message: "Return request not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      return: serializeCustomerReturn(returnRequest),
    });
  } catch (error: unknown) {
    return handleReturnDetailError(error);
  }
}