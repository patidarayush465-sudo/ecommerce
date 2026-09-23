import { getRazorpayClient } from "@/lib/razorpay";
import Order, { OrderStatus, PaymentMethod, PaymentStatus } from "@/models/Order";
import { deductOrderStock } from "@/services/inventory.service";
import { sendOrderConfirmationNotifications } from "@/services/order-confirmation.service";
import { sendOrderFailureNotifications } from "@/services/order-failure.service";

export class PaymentProcessingError extends Error {
  status = 409;

  constructor(message: string) {
    super(message);
    this.name = "PaymentProcessingError";
  }
}

type PaymentProcessResult = {
  order: {
    _id: { toString(): string };
    paymentStatus: PaymentStatus;
    orderStatus: OrderStatus;
  };
  alreadyProcessed: boolean;
};

async function storeRazorpayPaymentCharges(orderId: string, paymentId: string) {
  try {
    const payment = await getRazorpayClient().payments.fetch(paymentId);
    const charges: { razorpayFee?: number; razorpayTax?: number } = {};

    if (Number.isSafeInteger(payment.fee) && payment.fee >= 0) {
      charges.razorpayFee = payment.fee;
    }
    if (Number.isSafeInteger(payment.tax) && payment.tax >= 0) {
      charges.razorpayTax = payment.tax;
    }

    if (Object.keys(charges).length > 0) {
      await Order.updateOne(
        { _id: orderId, razorpayPaymentId: paymentId },
        { $set: charges },
      );
    }
  } catch (error: unknown) {
    console.error("Unable to store Razorpay payment charges", {
      orderId,
      paymentId,
      error,
    });
  }
}

export async function processSuccessfulRazorpayPayment(
  orderId: string,
  razorpayPaymentId: string,
  userId?: string,
): Promise<PaymentProcessResult> {
  const order = await Order.findOne({
    _id: orderId,
    ...(userId ? { user: userId } : {}),
  });

  if (!order) {
    throw new PaymentProcessingError("Order not found");
  }

  if (order.paymentMethod !== PaymentMethod.ONLINE) {
    throw new PaymentProcessingError("This order is not an online payment order");
  }

  if (order.paymentStatus === PaymentStatus.PAID) {
    if (order.razorpayPaymentId !== razorpayPaymentId) {
      throw new PaymentProcessingError("Payment does not match the paid order");
    }

    if (order.razorpayFee === undefined || order.razorpayTax === undefined) {
      await storeRazorpayPaymentCharges(order._id.toString(), razorpayPaymentId);
    }

    return { order, alreadyProcessed: true };
  }

  if (order.paymentStatus !== PaymentStatus.PENDING) {
    throw new PaymentProcessingError("This payment is no longer pending");
  }

  if (order.razorpayPaymentId && order.razorpayPaymentId !== razorpayPaymentId) {
    throw new PaymentProcessingError("Payment does not match the pending order");
  }

  if (order.razorpayPaymentId !== razorpayPaymentId) {
    order.razorpayPaymentId = razorpayPaymentId;
    await order.save();
  }

  await deductOrderStock(order._id.toString());

  const updatedOrder = await Order.findOneAndUpdate(
    {
      _id: order._id,
      paymentStatus: PaymentStatus.PENDING,
    },
    {
      $set: {
        paymentStatus: PaymentStatus.PAID,
        orderStatus: OrderStatus.CONFIRMED,
        razorpayPaymentId,
      },
    },
    { returnDocument: "after" },
  );

  if (updatedOrder) {
    await storeRazorpayPaymentCharges(updatedOrder._id.toString(), razorpayPaymentId);
    await sendOrderConfirmationNotifications(updatedOrder._id.toString());
    return { order: updatedOrder, alreadyProcessed: false };
  }

  const currentOrder = await Order.findById(order._id);

  if (
    currentOrder?.paymentStatus === PaymentStatus.PAID &&
    currentOrder.razorpayPaymentId === razorpayPaymentId
  ) {
    return { order: currentOrder, alreadyProcessed: true };
  }

  throw new PaymentProcessingError("Payment could not be finalized");
}

export async function processFailedRazorpayPayment(
  orderId: string,
  razorpayPaymentId: string,
) {
  const order = await Order.findById(orderId);

  if (!order || order.paymentMethod !== PaymentMethod.ONLINE) {
    return null;
  }

  if (order.paymentStatus !== PaymentStatus.PENDING) {
    if (order.paymentStatus === PaymentStatus.FAILED) {
      await sendOrderFailureNotifications(order._id.toString());
    }
    return order;
  }

  const updatedOrder = await Order.findOneAndUpdate(
    { _id: order._id, paymentStatus: PaymentStatus.PENDING },
    {
      $set: {
        paymentStatus: PaymentStatus.FAILED,
        razorpayPaymentId,
      },
    },
    { returnDocument: "after" },
  );

  if (updatedOrder) {
    await sendOrderFailureNotifications(updatedOrder._id.toString());
  }

  return updatedOrder;
}