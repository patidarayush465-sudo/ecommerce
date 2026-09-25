import mongoose from "mongoose";
import { NextResponse } from "next/server";

import {
  AuthenticationError,
  AuthorizationError,
  getAuthUser,
} from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Order from "@/models/Order";
import ReturnRequest, { ReturnReason, ReturnStatus } from "@/models/ReturnRequest";
import { UserRole } from "@/models/User";
import {
  createReturnRequest,
  ReturnRefundDestinationError,
  ReturnQuantityError,
} from "@/services/return.service";
import { createReturnRequestSchema } from "@/validations/return.validation";

class ReturnRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ReturnRequestError";
  }
}

function authenticateCustomer(request: Request) {
  const authUser = getAuthUser(request);
  if (authUser.role !== UserRole.CUSTOMER) {
    throw new AuthorizationError("Customer access required");
  }
  return authUser.userId;
}

function serializeReturnRequest(returnRequest: {
  _id: { toString(): string };
  order: { toString(): string };
  status: ReturnStatus;
  reason: string;
  items: Array<{
    product: { toString(): string };
    productName: string;
    productImage?: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
  requestedAt: Date;
}) {
  return {
    id: returnRequest._id.toString(),
    orderId: returnRequest.order.toString(),
    status: returnRequest.status,
    reason: returnRequest.reason,
    items: returnRequest.items.map((item) => ({
      productId: item.product.toString(),
      productName: item.productName,
      ...(item.productImage ? { productImage: item.productImage } : {}),
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: item.subtotal,
    })),
    requestedAt: returnRequest.requestedAt,
  };
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
    createdAt: returnRequest.createdAt,
    updatedAt: returnRequest.updatedAt,
  };
}

function handleReturnRequestError(error: unknown) {
  if (
    error instanceof AuthenticationError ||
    error instanceof AuthorizationError ||
    error instanceof ReturnRequestError ||
      error instanceof ReturnQuantityError ||
      error instanceof ReturnRefundDestinationError
  ) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: error.status },
    );
  }

  if (error instanceof SyntaxError) {
    return NextResponse.json(
      { success: false, message: "Invalid request body" },
      { status: 400 },
    );
  }

  console.error("Customer return request creation failed", {
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : String(error),
  });
  return NextResponse.json(
    { success: false, message: "Unable to create return request" },
    { status: 500 },
  );
}

export async function POST(request: Request) {
  try {
    const userId = authenticateCustomer(request);
    const body = await request.json();
    const validationResult = createReturnRequestSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid return request data",
          errors: validationResult.error.issues,
        },
        { status: 400 },
      );
    }

      const { orderId, items, reason, reasonDetails, refundDestination } = validationResult.data;
    await connectToDatabase();
    const session = await mongoose.startSession();
    let createdReturnRequest;
    try {
      createdReturnRequest = await session.withTransaction(async () => {
        await Order.updateOne(
          { _id: orderId, user: userId, orderStatus: "DELIVERED" },
          { $set: { updatedAt: new Date() } },
          { session },
        );
        const order = await Order.findOne({
          _id: orderId,
          user: userId,
        })
            .select("_id user orderStatus paymentMethod items")
          .session(session)
          .lean();

        if (!order) {
          throw new ReturnRequestError("Order not found", 404);
        }

        return createReturnRequest({
          order,
          userId,
          items,
          reason: reason as ReturnReason,
          reasonDetails,
            refundDestination,
          session,
        });
      });
    } finally {
      await session.endSession();
    }

    return NextResponse.json(
      {
        success: true,
        message: "Return request created successfully.",
        return: serializeReturnRequest(createdReturnRequest),
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    return handleReturnRequestError(error);
  }
}

export async function GET(request: Request) {
  try {
    const userId = authenticateCustomer(request);
    const searchParams = new URL(request.url).searchParams;
    const pageValue = searchParams.get("page");
    const limitValue = searchParams.get("limit");
    const page = pageValue === null ? 1 : Number(pageValue);
    const requestedLimit = limitValue === null ? 10 : Number(limitValue);

    if (!Number.isInteger(page) || page < 1) {
      return NextResponse.json(
        { success: false, message: "Page must be a positive integer" },
        { status: 400 },
      );
    }

    if (!Number.isInteger(requestedLimit) || requestedLimit < 1) {
      return NextResponse.json(
        { success: false, message: "Limit must be a positive integer" },
        { status: 400 },
      );
    }

    const limit = Math.min(requestedLimit, 50);
    const status = searchParams.get("status")?.trim() ?? "";

    if (status && !Object.values(ReturnStatus).includes(status as ReturnStatus)) {
      return NextResponse.json(
        { success: false, message: "Invalid return status" },
        { status: 400 },
      );
    }

    await connectToDatabase();

    const query: Record<string, unknown> = { user: userId };
    if (status) query.status = status;

    const skip = (page - 1) * limit;
    const [returns, total] = await Promise.all([
      ReturnRequest.find(query)
        .select("_id order status reason reasonDetails items requestedAt confirmedAt pickupAt receivedAt completedAt rejectedAt rejectionReason createdAt updatedAt")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ReturnRequest.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      returns: returns.map((returnRequest) =>
        serializeCustomerReturn(returnRequest as typeof returns[number]),
      ),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: unknown) {
    return handleReturnRequestError(error);
  }
}