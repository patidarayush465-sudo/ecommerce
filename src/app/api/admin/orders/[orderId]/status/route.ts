import mongoose from "mongoose";
import { NextResponse } from "next/server";

import {
  AuthenticationError,
  AuthorizationError,
  getAdminUser,
} from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Order, { OrderStatus, PaymentMethod, PaymentStatus } from "@/models/Order";
import { sendOrderDeliveredNotifications } from "@/services/order-delivered.service";
import { updateAdminOrderStatusSchema } from "@/validations/admin-order.validation";

const FORWARD_TRANSITIONS: Record<OrderStatus, OrderStatus | null> = {
  [OrderStatus.PENDING]: OrderStatus.CONFIRMED,
  [OrderStatus.CONFIRMED]: OrderStatus.PROCESSING,
  [OrderStatus.PROCESSING]: OrderStatus.SHIPPED,
  [OrderStatus.SHIPPED]: OrderStatus.DELIVERED,
  [OrderStatus.DELIVERED]: null,
  [OrderStatus.CANCELLED]: null,
};

class StatusTransitionError extends Error {
  status = 409;
}

function handleStatusError(error: unknown, logMessage: string) {
  if (
    error instanceof AuthenticationError ||
    error instanceof AuthorizationError ||
    error instanceof StatusTransitionError
  ) {
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

export async function PATCH(
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

    let body: unknown;
    try {
      body = await request.json();
    } catch (error: unknown) {
      if (error instanceof SyntaxError) {
        return NextResponse.json(
          { success: false, message: "Invalid request body" },
          { status: 400 },
        );
      }
      throw error;
    }

    const validationResult = updateAdminOrderStatusSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid order status data",
          errors: validationResult.error.issues,
        },
        { status: 400 },
      );
    }

    const requestedStatus = validationResult.data.orderStatus as OrderStatus;

    if (requestedStatus === OrderStatus.CANCELLED) {
      throw new StatusTransitionError(
        "Admin order cancellation and refund flow is not implemented",
      );
    }

    await connectToDatabase();
    const order = await Order.findById(orderId).select(
      "_id orderNumber orderStatus paymentStatus paymentMethod stockDeducted",
    );

    if (!order) {
      return NextResponse.json(
        { success: false, message: "Order not found" },
        { status: 404 },
      );
    }

    if (order.orderStatus === requestedStatus) {
      return NextResponse.json({
        success: true,
        message: "Order status is already set",
        data: {
          id: order._id.toString(),
          orderNumber: order.orderNumber,
          orderStatus: order.orderStatus,
          paymentStatus: order.paymentStatus,
          paymentMethod: order.paymentMethod,
          stockDeducted: order.stockDeducted,
        },
      });
    }

    const allowedNextStatus = FORWARD_TRANSITIONS[order.orderStatus as OrderStatus];

    if (allowedNextStatus !== requestedStatus) {
      throw new StatusTransitionError(
        `Cannot change order status from ${order.orderStatus} to ${requestedStatus}`,
      );
    }

    const statusUpdate = {
      orderStatus: requestedStatus,
      ...(requestedStatus === OrderStatus.DELIVERED && order.paymentMethod === PaymentMethod.COD
        ? { paymentStatus: PaymentStatus.PAID }
        : {}),
    };
    const updatedOrder = await Order.findOneAndUpdate(
      { _id: orderId, orderStatus: order.orderStatus },
      { $set: statusUpdate },
      { returnDocument: "after" },
    ).select(
      "_id orderNumber orderStatus paymentStatus paymentMethod stockDeducted",
    );

    if (!updatedOrder) {
      throw new StatusTransitionError(
        "Order status changed before this update could be applied",
      );
    }

    if (requestedStatus === OrderStatus.DELIVERED) {
      await sendOrderDeliveredNotifications(updatedOrder._id.toString());
    }

    return NextResponse.json({
      success: true,
      message: "Order status updated successfully",
      data: {
        id: updatedOrder._id.toString(),
        orderNumber: updatedOrder.orderNumber,
        orderStatus: updatedOrder.orderStatus,
        paymentStatus: updatedOrder.paymentStatus,
        paymentMethod: updatedOrder.paymentMethod,
        stockDeducted: updatedOrder.stockDeducted,
      },
    });
  } catch (error: unknown) {
    return handleStatusError(error, "Admin order status update failed");
  }
}
