import { NextResponse } from "next/server";

import {
  AuthenticationError,
  AuthorizationError,
  getAdminUser,
} from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Order, {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from "@/models/Order";
import User from "@/models/User";

const ORDER_STATUSES = Object.values(OrderStatus);
const PAYMENT_STATUSES = Object.values(PaymentStatus);

type CustomerRecord = {
  _id: { toString(): string };
  name: string;
  email: string;
};

type OrderSummaryRecord = {
  _id: { toString(): string };
  orderNumber: string;
  user: CustomerRecord;
  totalItems: number;
  subtotal: number;
  deliveryCharge?: number;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  createdAt: Date;
};

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function serializeCustomer(user: CustomerRecord) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
  };
}

function serializeOrderSummary(order: OrderSummaryRecord) {
  return {
    id: order._id.toString(),
    orderNumber: order.orderNumber,
    customer: serializeCustomer(order.user),
    totalItems: order.totalItems,
    subtotal: order.subtotal,
    deliveryCharge: order.deliveryCharge ?? 0,
    totalAmount: order.totalAmount,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    orderStatus: order.orderStatus,
    createdAt: order.createdAt,
  };
}

function handleOrderError(error: unknown, logMessage: string) {
  if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: error.status },
    );
  }

  console.error(logMessage, error);
  return NextResponse.json(
    { success: false, message: "Internal server error" },
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
    const search = searchParams.get("search")?.trim() ?? "";
    const orderStatus = searchParams.get("orderStatus")?.trim() ?? "";
    const paymentStatus = searchParams.get("paymentStatus")?.trim() ?? "";

    if (orderStatus && !ORDER_STATUSES.includes(orderStatus as OrderStatus)) {
      return NextResponse.json(
        { success: false, message: "Invalid order status" },
        { status: 400 },
      );
    }

    if (
      paymentStatus &&
      !PAYMENT_STATUSES.includes(paymentStatus as PaymentStatus)
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid payment status" },
        { status: 400 },
      );
    }

    await connectToDatabase();

    const query: Record<string, unknown> = {};

    if (orderStatus) {
      query.orderStatus = orderStatus;
    }

    if (paymentStatus) {
      query.paymentStatus = paymentStatus;
    }

    if (search) {
      const searchRegex = new RegExp(escapeRegex(search), "i");
      const matchingCustomers = await User.find({
        role: "CUSTOMER",
        $or: [{ name: searchRegex }, { email: searchRegex }],
      })
        .select("_id")
        .lean();

      query.$or = [
        { orderNumber: searchRegex },
        { user: { $in: matchingCustomers.map((customer) => customer._id) } },
      ];
    }

    const skip = (page - 1) * limit;
    const [orders, total] = await Promise.all([
      Order.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate({ path: "user", select: "_id name email" })
        .lean(),
      Order.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      message: "Orders fetched successfully",
      data: orders.map((order) => serializeOrderSummary(order as OrderSummaryRecord)),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: unknown) {
    return handleOrderError(error, "Admin order listing failed");
  }
}
