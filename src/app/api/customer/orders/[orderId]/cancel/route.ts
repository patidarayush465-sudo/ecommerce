import mongoose from "mongoose";
import { NextResponse } from "next/server";

import {
  AuthenticationError,
  AuthorizationError,
  getAuthUser,
} from "@/lib/auth";
import { RazorpayConfigurationError } from "@/lib/razorpay";
import { connectToDatabase } from "@/lib/mongodb";
import Order, {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  RefundStatus,
} from "@/models/Order";
import { UserRole } from "@/models/User";
import {
  InventoryError,
  restoreOrderStock,
} from "@/services/inventory.service";
import {
  createFullRazorpayRefund,
  RefundProcessingError,
} from "@/services/refund.service";

class CancellationError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "CancellationError";
  }
}

function authenticateCustomer(request: Request) {
  const authUser = getAuthUser(request);

  if (authUser.role !== UserRole.CUSTOMER) {
    throw new AuthorizationError("Customer access required");
  }

  return authUser.userId;
}

function handleCancellationError(error: unknown) {
  if (
    error instanceof AuthenticationError ||
    error instanceof AuthorizationError ||
    error instanceof InventoryError ||
    error instanceof CancellationError ||
    error instanceof RazorpayConfigurationError ||
    error instanceof RefundProcessingError
  ) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: error.status },
    );
  }

  console.error("Order cancellation failed", {
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  return NextResponse.json(
    { success: false, message: "Unable to cancel the order right now" },
    { status: 500 },
  );
}

async function cancelPaidOnlineOrder(orderId: string, userId: string) {
  const claimSession = await mongoose.startSession();
  let paymentId: string | undefined;
  let refundAmountInPaise = 0;

  try {
    await claimSession.withTransaction(async () => {
      const order = await Order.findOne({ _id: orderId, user: userId }).session(
        claimSession,
      );

      if (!order) {
        throw new CancellationError("Order not found", 404);
      }

      if (order.orderStatus === OrderStatus.CANCELLED) {
        throw new CancellationError("Order is already cancelled", 409);
      }

      if (
        order.orderStatus !== OrderStatus.PENDING &&
        order.orderStatus !== OrderStatus.CONFIRMED
      ) {
        throw new CancellationError(
          "This order cannot be cancelled after processing has started",
          409,
        );
      }

      if (
        order.paymentMethod !== PaymentMethod.ONLINE ||
        order.paymentStatus !== PaymentStatus.PAID
      ) {
        throw new CancellationError("This order is not eligible for a paid refund", 409);
      }

      if (order.paymentStatus === PaymentStatus.REFUNDED || order.refundStatus === RefundStatus.PROCESSED) {
        throw new CancellationError("Order has already been refunded", 409);
      }

      if (order.refundStatus === RefundStatus.PENDING) {
        throw new CancellationError("A refund is already being processed for this order", 409);
      }

      if (!order.razorpayPaymentId) {
        throw new CancellationError(
          "This paid online order cannot be cancelled because its Razorpay payment ID is missing",
          409,
        );
      }

      if (!Number.isFinite(order.totalAmount) || order.totalAmount <= 0) {
        throw new CancellationError("This order has an invalid refund amount", 409);
      }

      const claimedOrder = await Order.findOneAndUpdate(
        {
          _id: orderId,
          user: userId,
          paymentStatus: PaymentStatus.PAID,
          orderStatus: { $in: [OrderStatus.PENDING, OrderStatus.CONFIRMED] },
          razorpayPaymentId: order.razorpayPaymentId,
          $or: [
            { refundStatus: { $exists: false } },
            { refundStatus: RefundStatus.FAILED },
          ],
        },
        { $set: { refundStatus: RefundStatus.PENDING } },
        { returnDocument: "after", session: claimSession },
      );

      if (!claimedOrder) {
        throw new CancellationError(
          "A refund is already being processed for this order",
          409,
        );
      }

      paymentId = order.razorpayPaymentId;
      refundAmountInPaise = Math.round(order.totalAmount * 100);
    });
  } finally {
    await claimSession.endSession();
  }

  let refund;

  try {
    refund = await createFullRazorpayRefund(paymentId as string, refundAmountInPaise);
  } catch (error: unknown) {
    await Order.updateOne(
      { _id: orderId, user: userId, refundStatus: RefundStatus.PENDING },
      { $set: { refundStatus: RefundStatus.FAILED } },
    );
    throw error;
  }

  const finalizeSession = await mongoose.startSession();

  try {
    await finalizeSession.withTransaction(async () => {
      const order = await Order.findOne({
        _id: orderId,
        user: userId,
        paymentStatus: PaymentStatus.PAID,
        refundStatus: RefundStatus.PENDING,
      }).session(finalizeSession);

      if (!order) {
        throw new CancellationError("Unable to finalize the refunded order", 409);
      }

      if (order.stockDeducted) {
        await restoreOrderStock(orderId, finalizeSession);
      }

      order.orderStatus = OrderStatus.CANCELLED;
      order.paymentStatus = PaymentStatus.REFUNDED;
      order.stockDeducted = false;
      order.razorpayRefundId = refund.id;
      order.refundStatus = RefundStatus.PROCESSED;
      await order.save({ session: finalizeSession });
    });
  } catch (error: unknown) {
    console.error("Refund succeeded but order finalization failed", {
      orderId,
      refundId: refund.id,
      name: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : String(error),
    });
    throw new CancellationError(
      "Refund succeeded, but the order could not be finalized. Please contact support.",
      500,
    );
  } finally {
    await finalizeSession.endSession();
  }
}

export async function POST(
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

    await connectToDatabase();

    const currentOrder = await Order.findOne({ _id: orderId, user: userId });

    if (!currentOrder) {
      throw new CancellationError("Order not found", 404);
    }

    if (
      currentOrder.paymentMethod === PaymentMethod.ONLINE &&
      currentOrder.paymentStatus === PaymentStatus.PAID
    ) {
      await cancelPaidOnlineOrder(orderId, userId);

      return NextResponse.json({
        success: true,
        message: "Order cancelled successfully and payment refunded",
      });
    }

    const session = await mongoose.startSession();

    try {
      await session.withTransaction(async () => {
        const order = await Order.findOne({ _id: orderId, user: userId }).session(
          session,
        );

        if (!order) {
          throw new CancellationError("Order not found", 404);
        }

        if (order.orderStatus === OrderStatus.CANCELLED) {
          throw new CancellationError("Order is already cancelled", 409);
        }

        if (
          order.orderStatus !== OrderStatus.PENDING &&
          order.orderStatus !== OrderStatus.CONFIRMED
        ) {
          throw new CancellationError(
            "This order cannot be cancelled after processing has started",
            409,
          );
        }

        if (order.stockDeducted) {
          await restoreOrderStock(orderId, session);
        }

        order.orderStatus = OrderStatus.CANCELLED;
        order.stockDeducted = false;
        await order.save({ session });
      });
    } finally {
      await session.endSession();
    }

    return NextResponse.json({
      success: true,
      message: "Order cancelled successfully",
    });
  } catch (error: unknown) {
    return handleCancellationError(error);
  }
}
