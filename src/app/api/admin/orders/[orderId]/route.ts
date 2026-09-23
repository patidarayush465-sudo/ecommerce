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
  _id: { toString(): string };
  name: string;
  email: string;
  mobile?: string;
  profileImage?: { url?: string; publicId?: string };
  role: string;
};

type OrderRecord = {
  _id: { toString(): string };
  orderNumber: string;
  user: CustomerRecord;
  items: Array<{
    product: { toString(): string };
    productName: string;
    productImage: string;
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

function serializeCustomer(user: CustomerRecord) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    mobile: user.mobile,
    profileImage: user.profileImage,
    role: user.role,
  };
}

function serializeOrder(order: OrderRecord) {
  return {
    id: order._id.toString(),
    orderNumber: order.orderNumber,
    customer: serializeCustomer(order.user),
    items: order.items.map((item) => ({
      product: item.product.toString(),
      productName: item.productName,
      productImage: item.productImage,
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
