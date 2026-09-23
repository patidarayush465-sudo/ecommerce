import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  AuthenticationError,
  AuthorizationError,
  getAuthUser,
} from "@/lib/auth";
import {
  RazorpayConfigurationError,
  verifyRazorpaySignature,
} from "@/lib/razorpay";
import { connectToDatabase } from "@/lib/mongodb";
import Order, {
  PaymentMethod,
} from "@/models/Order";
import { UserRole } from "@/models/User";
import {
  PaymentProcessingError,
  processSuccessfulRazorpayPayment,
} from "@/services/payment.service";
import { InventoryError } from "@/services/inventory.service";

const verifyPaymentSchema = z.object({
  orderId: z.string().min(1),
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
}).strict();

function authenticateCustomer(request: Request) {
  const authUser = getAuthUser(request);

  if (authUser.role !== UserRole.CUSTOMER) {
    throw new AuthorizationError("Customer access required");
  }

  return authUser.userId;
}

function handleVerificationError(error: unknown) {
  if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: error.status },
    );
  }

  if (error instanceof InventoryError) {
    return NextResponse.json(
      {
        success: false,
        message: "Payment was verified, but stock could not be reserved. Please contact support.",
      },
      { status: 409 },
    );
  }

  if (error instanceof PaymentProcessingError) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: error.status },
    );
  }

  if (error instanceof RazorpayConfigurationError) {
    return NextResponse.json(
      { success: false, message: "Payment verification is not configured" },
      { status: 503 },
    );
  }

  if (error instanceof SyntaxError) {
    return NextResponse.json(
      { success: false, message: "Invalid request body" },
      { status: 400 },
    );
  }

  console.error("Razorpay payment verification failed", error);

  return NextResponse.json(
    { success: false, message: "Unable to verify payment" },
    { status: 500 },
  );
}

export async function POST(request: Request) {
  try {
    const userId = authenticateCustomer(request);
    const body: unknown = await request.json();
    const validationResult = verifyPaymentSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, message: "Invalid payment verification data" },
        { status: 400 },
      );
    }

    const {
      orderId,
      razorpay_order_id: razorpayOrderId,
      razorpay_payment_id: razorpayPaymentId,
      razorpay_signature: razorpaySignature,
    } = validationResult.data;

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

    if (order.razorpayOrderId !== razorpayOrderId) {
      return NextResponse.json(
        { success: false, message: "Razorpay order does not match the application order" },
        { status: 400 },
      );
    }

    if (!verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
      return NextResponse.json(
        { success: false, message: "Invalid payment signature" },
        { status: 400 },
      );
    }

    const { order: processedOrder, alreadyProcessed } =
      await processSuccessfulRazorpayPayment(
        order._id.toString(),
        razorpayPaymentId,
        userId,
      );

    return NextResponse.json({
      success: true,
      message: alreadyProcessed ? "Payment already verified." : "Payment verified successfully",
      orderId: processedOrder._id.toString(),
      paymentStatus: processedOrder.paymentStatus,
      orderStatus: processedOrder.orderStatus,
    });
  } catch (error: unknown) {
    return handleVerificationError(error);
  }
}