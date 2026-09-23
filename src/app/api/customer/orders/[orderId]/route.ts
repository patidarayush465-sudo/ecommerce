import mongoose from "mongoose";
import { NextResponse } from "next/server";

import {
  AuthenticationError,
  AuthorizationError,
  getAuthUser,
} from "@/lib/auth";
import Order, {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from "@/models/Order";
import { UserRole } from "@/models/User";

type OrderAddress = {
  fullName: string;
  mobile: string;
  addressLine: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
};

type OrderRecord = {
  _id: { toString(): string };
  orderNumber: string;
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
  shippingAddress: OrderAddress;
  totalItems: number;
  subtotal: number;
  deliveryCharge?: number;
  totalAmount: number;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  stockDeducted: boolean;
  createdAt: Date;
};

function authenticateCustomer(request: Request) {
  const authUser = getAuthUser(request);

  if (authUser.role !== UserRole.CUSTOMER) {
    throw new AuthorizationError("Customer access required");
  }

  return authUser.userId;
}

function serializeOrder(order: OrderRecord) {
  return {
    id: order._id.toString(),
    orderNumber: order.orderNumber,
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
    totalItems: order.totalItems,
    subtotal: order.subtotal,
    deliveryCharge: order.deliveryCharge ?? 0,
    totalAmount: order.totalAmount,
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    stockDeducted: order.stockDeducted,
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orderId: string }> },
) {
  try {
    const userId = authenticateCustomer(request);
    const { orderId } = await params;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return NextResponse.json(
        { success: false, message: "Invalid order ID" },
        { status: 400 },
      );
    }

    const { connectToDatabase } = await import("@/lib/mongodb");
    await connectToDatabase();

    const order = await Order.findOne({ _id: orderId, user: userId }).lean();

    if (!order) {
      return NextResponse.json(
        { success: false, message: "Order not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      message: "Order fetched successfully",
      data: serializeOrder(order),
    });
  } catch (error: unknown) {
    return handleOrderError(error, "Order fetch failed");
  }
}
