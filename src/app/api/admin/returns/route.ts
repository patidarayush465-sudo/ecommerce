import mongoose from "mongoose";
import { NextResponse } from "next/server";

import {
  AuthenticationError,
  AuthorizationError,
  getAdminUser,
} from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import ReturnRequest, { ReturnStatus } from "@/models/ReturnRequest";
import User, { UserRole } from "@/models/User";

type SafeCustomer = {
  _id: { toString(): string };
  name: string;
  email: string;
  mobile?: string;
};

type SafeOrder = {
  _id: { toString(): string };
  orderNumber?: string;
};

type ReturnListRecord = {
  _id: { toString(): string };
  user: SafeCustomer | { toString(): string };
  order: SafeOrder | { toString(): string };
  items: Array<{
    product: { toString(): string };
    productName: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
  }>;
  reason: string;
  reasonDetails?: string;
  status: ReturnStatus;
  requestedAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function serializeCustomer(user: SafeCustomer | { toString(): string }) {
  if ("name" in user) {
    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      ...(user.mobile ? { mobile: user.mobile } : {}),
    };
  }

  return { id: user.toString() };
}

function serializeOrder(order: SafeOrder | { toString(): string }) {
  if ("orderNumber" in order) {
    return {
      id: order._id.toString(),
      ...(order.orderNumber ? { orderNumber: order.orderNumber } : {}),
    };
  }

  return { id: order.toString() };
}

function serializeReturn(returnRequest: ReturnListRecord) {
  return {
    id: returnRequest._id.toString(),
    user: serializeCustomer(returnRequest.user),
    order: serializeOrder(returnRequest.order),
    items: returnRequest.items.map((item) => ({
      productId: item.product.toString(),
      productName: item.productName,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: item.subtotal,
    })),
    reason: returnRequest.reason,
    reasonDetails: returnRequest.reasonDetails ?? null,
    status: returnRequest.status,
    requestedAt: returnRequest.requestedAt,
    createdAt: returnRequest.createdAt,
    updatedAt: returnRequest.updatedAt,
  };
}

function handleReturnListError(error: unknown) {
  if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: error.status },
    );
  }

  console.error("Admin return listing failed", {
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : String(error),
  });
  return NextResponse.json(
    { success: false, message: "Unable to fetch returns" },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  try {
    getAdminUser(request);

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
    const search = searchParams.get("search")?.trim() ?? "";

    if (status && !Object.values(ReturnStatus).includes(status as ReturnStatus)) {
      return NextResponse.json(
        { success: false, message: "Invalid return status" },
        { status: 400 },
      );
    }

    await connectToDatabase();

    const query: Record<string, unknown> = {};
    if (status) query.status = status;

    if (search) {
      const searchRegex = new RegExp(escapeRegex(search), "i");
      const matchingUsers = await User.find({
        role: UserRole.CUSTOMER,
        $or: [{ name: searchRegex }, { email: searchRegex }],
      })
        .select("_id")
        .limit(100)
        .lean();
      const matchingIds: Record<string, unknown>[] = [];

      if (mongoose.Types.ObjectId.isValid(search)) {
        matchingIds.push({ _id: search }, { order: search });
      }

      matchingIds.push({
        user: { $in: matchingUsers.map((user) => user._id) },
      });
      query.$or = matchingIds;
    }

    const skip = (page - 1) * limit;
    const [returns, total] = await Promise.all([
      ReturnRequest.find(query)
        .select("_id user order items reason reasonDetails status requestedAt createdAt updatedAt")
        .populate({ path: "user", select: "_id name email mobile" })
        .populate({ path: "order", select: "_id orderNumber" })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      ReturnRequest.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      returns: returns.map((returnRequest) =>
        serializeReturn(returnRequest as unknown as ReturnListRecord),
      ),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: unknown) {
    return handleReturnListError(error);
  }
}