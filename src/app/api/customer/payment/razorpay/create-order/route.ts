import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  AuthenticationError,
  AuthorizationError,
  getAuthUser,
} from "@/lib/auth";
import {
  getRazorpayClient,
  getRazorpayKeyId,
  RazorpayConfigurationError,
} from "@/lib/razorpay";
import { connectToDatabase } from "@/lib/mongodb";
import Order, {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from "@/models/Order";
import { UserRole } from "@/models/User";

const createRazorpayOrderSchema = z.object({
  orderId: z.string().min(1),
}).strict();

function authenticateCustomer(request: Request) {
  const authUser = getAuthUser(request);

  if (authUser.role !== UserRole.CUSTOMER) {
    throw new AuthorizationError("Customer access required");
  }

  return authUser.userId;
}

function handleCreateRazorpayOrderError(error: unknown) {
  if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
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

  if (error instanceof RazorpayConfigurationError) {
    console.error("Razorpay order creation unavailable: credentials are not configured");
    return NextResponse.json(
      { success: false, message: error.message },
      { status: error.status },
    );
  }

  console.error("Razorpay order creation failed", error);

  return NextResponse.json(
    { success: false, message: "Unable to create Razorpay order" },
    { status: 500 },
  );
}

export async function POST(request: Request) {
  try {
    const userId = authenticateCustomer(request);
    const body: unknown = await request.json();
    const validationResult = createRazorpayOrderSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, message: "Invalid payment order data" },
        { status: 400 },
      );
    }

    const { orderId } = validationResult.data;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return NextResponse.json(
        { success: false, message: "Invalid order ID" },
        { status: 400 },
      );
    }

    await connectToDatabase();

    const order = await Order.findOne({ _id: orderId, user: userId });

    if (!order) {
      return NextResponse.json(
        { success: false, message: "Order not found" },
        { status: 404 },
      );
    }

    if (order.paymentMethod !== PaymentMethod.ONLINE) {
      return NextResponse.json(
        { success: false, message: "This order is not an online payment order" },
        { status: 400 },
      );
    }

    if (order.paymentStatus !== PaymentStatus.PENDING) {
      return NextResponse.json(
        { success: false, message: "This order is no longer payable" },
        { status: 400 },
      );
    }

    if (order.orderStatus === OrderStatus.CANCELLED) {
      return NextResponse.json(
        { success: false, message: "Cancelled orders cannot be paid" },
        { status: 400 },
      );
    }

    if (!Number.isFinite(order.totalAmount) || order.totalAmount <= 0) {
      return NextResponse.json(
        { success: false, message: "Invalid order amount" },
        { status: 400 },
      );
    }

    const amount = Math.round(order.totalAmount * 100);

    if (!Number.isSafeInteger(amount) || amount <= 0) {
      return NextResponse.json(
        { success: false, message: "Invalid order amount" },
        { status: 400 },
      );
    }

    const keyId = getRazorpayKeyId();

    if (order.razorpayOrderId) {
      return NextResponse.json({
        success: true,
        message: "Razorpay order created successfully",
        data: {
          razorpayOrderId: order.razorpayOrderId,
          amount,
          currency: "INR",
          keyId,
          orderId: order._id.toString(),
          orderNumber: order.orderNumber,
        },
      });
    }

    const razorpayOrder = await getRazorpayClient().orders.create({
      amount,
      currency: "INR",
      receipt: order.orderNumber,
      notes: {
        orderId: order._id.toString(),
        orderNumber: order.orderNumber,
        userId,
      },
    });

    order.razorpayOrderId = razorpayOrder.id;
    await order.save();

    return NextResponse.json({
      success: true,
      message: "Razorpay order created successfully",
      data: {
        razorpayOrderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        keyId,
        orderId: order._id.toString(),
        orderNumber: order.orderNumber,
      },
    });
  } catch (error: unknown) {
    return handleCreateRazorpayOrderError(error);
  }
}