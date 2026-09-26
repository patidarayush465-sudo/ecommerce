import mongoose from "mongoose";
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

type CustomerRecord = {
  _id?: { toString(): string } | null;
  name?: string | null;
  email?: string | null;
  mobile?: string;
  profileImage?: { url?: string; publicId?: string };
  role?: string;
};

type OrderRecord = {
  _id: { toString(): string };
  orderNumber: string;
  user: CustomerRecord | null;
  items: Array<{
    product?: { toString(): string } | string | null;
    productName?: string | null;
    productImage?: string | null;
    mrp?: number;
    discountPercent?: number;
    price: number;
    quantity: number;
    subtotal: number;
  }>;
  shippingAddress: {
    fullName: string;
    mobile: string;
    addressLine: string;
    city: string;
    state: string;
    pincode: string;
    country: string;
  };
  subtotal: number;
  deliveryCharge?: number;
  totalItems: number;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  stockDeducted: boolean;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpayFee?: number;
  razorpayTax?: number;
  razorpayRefundId?: string;
  refundStatus?: string;
  createdAt: Date;
  updatedAt: Date;
};

function getSafeObjectId(value: unknown) {
  if (value == null) return null;

  if (typeof value === "object") {
    const objectValue = value as { _id?: { toString(): string } | null };
    if (objectValue._id && typeof objectValue._id.toString === "function") {
      return objectValue._id.toString();
    }
  }

  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  return null;
}

function serializeCustomer(user: CustomerRecord | null | undefined) {
  const id = user ? getSafeObjectId(user._id) ?? null : null;

  return {
    id,
    name: user?.name ?? "Unknown customer",
    email: user?.email ?? "Unavailable",
    mobile: user?.mobile ?? null,
    profileImage: user?.profileImage ?? null,
    role: user?.role ?? null,
  };
}

function serializeOrder(order: OrderRecord) {
  return {
    id: order._id.toString(),
    orderNumber: order.orderNumber,
    customer: serializeCustomer(order.user),
    items: order.items.map((item) => ({
      product: getSafeObjectId(item.product) ?? null,
      productName: item.productName ?? "Unknown product",
      productImage: item.productImage ?? null,
      mrp: item.mrp,
      discountPercent: item.discountPercent,
      price: item.price,
      quantity: item.quantity,
      subtotal: item.subtotal,
    })),
    shippingAddress: order.shippingAddress,
    subtotal: order.subtotal,
    deliveryCharge: order.deliveryCharge ?? 0,
    totalItems: order.totalItems,
    totalAmount: order.totalAmount,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    orderStatus: order.orderStatus,
    stockDeducted: order.stockDeducted,
    razorpayOrderId: order.razorpayOrderId,
    razorpayPaymentId: order.razorpayPaymentId,
    razorpayFee: order.razorpayFee,
    razorpayTax: order.razorpayTax,
    razorpayRefundId: order.razorpayRefundId,
    refundStatus: order.refundStatus,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  try {
    getAdminUser(request);
    const { orderId } = await params;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return NextResponse.json(
        { success: false, message: "Invalid order ID" },
        { status: 400 },
      );
    }

    await connectToDatabase();
    const order = await Order.findById(orderId)
      .populate({
        path: "user",
        select: "_id name email mobile profileImage role",
      })
      .lean();

    if (!order) {
      return NextResponse.json(
        { success: false, message: "Order not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Order fetched successfully",
      data: serializeOrder(order as unknown as OrderRecord),
    });
  } catch (error: unknown) {
    return handleOrderError(error, "Admin order fetch failed");
  }
}
