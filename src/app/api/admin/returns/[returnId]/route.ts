import mongoose from "mongoose";
import { NextResponse } from "next/server";

import {
  AuthenticationError,
  AuthorizationError,
  getAdminUser,
} from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import "@/models/Order";
import ReturnRequest, { ReturnStatus } from "@/models/ReturnRequest";

type PopulatedCustomer = {
  _id: { toString(): string };
  name: string;
  email: string;
  mobile?: string;
};

type PopulatedOrder = {
  _id: { toString(): string };
  orderNumber?: string;
};

function serializeReturn(returnRequest: {
  _id: { toString(): string };
  user: PopulatedCustomer | { toString(): string };
  order: PopulatedOrder | { toString(): string };
  items: Array<{
    product: { toString(): string };
    productName: string;
    productImage?: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
  reason: string;
  reasonDetails?: string;
  status: ReturnStatus;
  statusHistory: Array<{
    status: ReturnStatus;
    changedAt: Date;
    note?: string;
  }>;
  requestedAt: Date;
  confirmedAt?: Date;
  pickupAt?: Date;
  receivedAt?: Date;
  completedAt?: Date;
  rejectedAt?: Date;
  rejectionReason?: string;
  pickupAgentName?: string;
  pickupAgentPhone?: string;
  pickupReference?: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  const customer = "name" in returnRequest.user
    ? {
        id: returnRequest.user._id.toString(),
        name: returnRequest.user.name,
        email: returnRequest.user.email,
        ...(returnRequest.user.mobile ? { mobile: returnRequest.user.mobile } : {}),
      }
    : { id: returnRequest.user.toString() };
  const order = "orderNumber" in returnRequest.order
    ? {
        id: returnRequest.order._id.toString(),
        ...(returnRequest.order.orderNumber
          ? { orderNumber: returnRequest.order.orderNumber }
          : {}),
      }
    : { id: returnRequest.order.toString() };

  return {
    id: returnRequest._id.toString(),
    user: customer,
    order,
    items: returnRequest.items.map((item) => ({
      productId: item.product.toString(),
      productName: item.productName,
      productImage: item.productImage ?? null,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: item.subtotal,
    })),
    reason: returnRequest.reason,
    reasonDetails: returnRequest.reasonDetails ?? null,
    status: returnRequest.status,
    statusHistory: returnRequest.statusHistory.map((entry) => ({
      status: entry.status,
      changedAt: entry.changedAt,
      note: entry.note ?? null,
    })),
    requestedAt: returnRequest.requestedAt,
    confirmedAt: returnRequest.confirmedAt ?? null,
    pickupAt: returnRequest.pickupAt ?? null,
    receivedAt: returnRequest.receivedAt ?? null,
    completedAt: returnRequest.completedAt ?? null,
    rejectedAt: returnRequest.rejectedAt ?? null,
    rejectionReason: returnRequest.rejectionReason ?? null,
    pickupAgentName: returnRequest.pickupAgentName ?? null,
    pickupAgentPhone: returnRequest.pickupAgentPhone ?? null,
    pickupReference: returnRequest.pickupReference ?? null,
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

  console.error("Admin return detail lookup failed", {
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
    getAdminUser(request);
    const { returnId } = await params;

    if (!mongoose.Types.ObjectId.isValid(returnId)) {
      return NextResponse.json(
        { success: false, message: "Invalid return ID" },
        { status: 400 },
      );
    }

    await connectToDatabase();
    const returnRequest = await ReturnRequest.findById(returnId)
      .select("_id user order items reason reasonDetails status statusHistory requestedAt confirmedAt pickupAt receivedAt completedAt rejectedAt rejectionReason pickupAgentName pickupAgentPhone pickupReference createdAt updatedAt")
      .populate({ path: "user", select: "_id name email mobile" })
      .populate({ path: "order", select: "_id orderNumber" })
      .lean();

    if (!returnRequest) {
      return NextResponse.json(
        { success: false, message: "Return request not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      return: serializeReturn(returnRequest as unknown as Parameters<typeof serializeReturn>[0]),
    });
  } catch (error: unknown) {
    return handleReturnDetailError(error);
  }
}