import Order, {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  RefundStatus,
} from "@/models/Order";
import User from "@/models/User";
import { sendEmail } from "@/services/email.service";
import { sendPushNotificationToUser } from "@/services/notification.service";

type CancelledOrder = {
  _id: { toString(): string };
  user: { toString(): string };
  orderNumber: string;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  refundStatus?: RefundStatus;
  razorpayRefundId?: string;
};

type CustomerContact = {
  name: string;
  email: string;
};

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

function getPaymentMethodLabel(paymentMethod: PaymentMethod) {
  return paymentMethod === PaymentMethod.COD ? "Cash on Delivery" : "Online Payment";
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(amount);
}

function getRefundDetails(order: CancelledOrder) {
  const isRefunded = order.paymentMethod === PaymentMethod.ONLINE &&
    order.paymentStatus === PaymentStatus.REFUNDED &&
    order.refundStatus === RefundStatus.PROCESSED;

  if (isRefunded) {
    return {
      pushBody: `Your order ${order.orderNumber} has been cancelled and your refund has been initiated.`,
      emailText: `Refund: ${formatCurrency(order.totalAmount)} has been successfully processed.`,
      emailHtml: `<p><strong>Refund:</strong> ${escapeHtml(formatCurrency(order.totalAmount))} has been successfully processed.</p>${order.razorpayRefundId ? `<p><strong>Refund reference:</strong> ${escapeHtml(order.razorpayRefundId)}</p>` : ""}`,
    };
  }

  if (order.paymentMethod === PaymentMethod.COD) {
    return {
      pushBody: `Your order ${order.orderNumber} has been cancelled.`,
      emailText: "Refund: No payment refund is applicable because this order was Cash on Delivery.",
      emailHtml: "<p><strong>Refund:</strong> No payment refund is applicable because this order was Cash on Delivery.</p>",
    };
  }

  return {
    pushBody: `Your order ${order.orderNumber} has been cancelled.`,
    emailText: "Refund: No refund was processed because the online payment was not completed.",
    emailHtml: "<p><strong>Refund:</strong> No refund was processed because the online payment was not completed.</p>",
  };
}

function getCancellationEmail(order: CancelledOrder, customer: CustomerContact) {
  const refund = getRefundDetails(order);
  const orderNumber = escapeHtml(order.orderNumber);
  const customerName = escapeHtml(customer.name);
  const totalAmount = escapeHtml(formatCurrency(order.totalAmount));
  const paymentMethod = escapeHtml(getPaymentMethodLabel(order.paymentMethod));

  return {
    subject: `Order Cancelled - ${order.orderNumber}`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #991b1b;">Order Cancelled</h1>
        <p>Hello ${customerName},</p>
        <p>Your order cancellation has been confirmed.</p>
        <div style="border: 1px solid #fecaca; border-radius: 8px; padding: 20px; margin: 24px 0;">
          <p style="margin: 0 0 8px;"><strong>Order number:</strong> ${orderNumber}</p>
          <p style="margin: 0 0 8px;"><strong>Cancellation status:</strong> Cancelled</p>
          <p style="margin: 0 0 8px;"><strong>Order total:</strong> ${totalAmount}</p>
          <p style="margin: 0 0 8px;"><strong>Payment method:</strong> ${paymentMethod}</p>
          ${refund.emailHtml}
        </div>
      </div>
    `.trim(),
    text: [
      `Hello ${customer.name},`,
      "",
      "Your order cancellation has been confirmed.",
      "",
      `Order number: ${order.orderNumber}`,
      "Cancellation status: Cancelled",
      `Order total: ${formatCurrency(order.totalAmount)}`,
      `Payment method: ${getPaymentMethodLabel(order.paymentMethod)}`,
      refund.emailText,
    ].join("\n"),
  };
}

function getSafeErrorDetails(error: unknown) {
  if (!(error instanceof Error)) {
    return { message: "Unknown notification error" };
  }

  const errorWithCode = error as Error & { code?: unknown };
  return {
    message: error.message,
    ...(typeof errorWithCode.code === "string" ? { code: errorWithCode.code } : {}),
  };
}

export async function sendOrderCancellationNotifications(orderId: string) {
  try {
    const order = await Order.findOne({
      _id: orderId,
      orderStatus: OrderStatus.CANCELLED,
    }).select("user orderNumber totalAmount paymentMethod paymentStatus refundStatus razorpayRefundId").lean() as CancelledOrder | null;

    if (!order) {
      console.error("Order cancellation notification lookup failed", {
        orderId,
        notificationType: "ORDER_CANCELLED",
        error: "Cancelled order not found",
      });
      return;
    }

    const customer = await User.findById(order.user).select("name email").lean() as CustomerContact | null;
    if (!customer) {
      console.error("Order cancellation notification skipped", {
        orderId,
        orderNumber: order.orderNumber,
        userId: order.user.toString(),
        notificationType: "ORDER_CANCELLED",
        reason: "Customer contact not found",
      });
      return;
    }

    const claimedOrder = await Order.findOneAndUpdate(
      {
        _id: orderId,
        orderStatus: OrderStatus.CANCELLED,
        orderCancellationNotificationSent: { $ne: true },
      },
      { $set: { orderCancellationNotificationSent: true } },
      { returnDocument: "after" },
    ).lean() as CancelledOrder | null;

    if (!claimedOrder) return;

    const refund = getRefundDetails(claimedOrder);
    const email = getCancellationEmail(claimedOrder, customer);
    const pushPromise = sendPushNotificationToUser(claimedOrder.user.toString(), {
      title: "Order Cancelled",
      body: refund.pushBody,
      data: { type: "ORDER_CANCELLED", orderNumber: claimedOrder.orderNumber },
    }).then((result) => {
      if (result.successCount === 0) {
        throw new Error("Firebase push notification delivery returned no successful sends");
      }
      return result;
    });
    const emailPromise = sendEmail({
      to: customer.email,
      subject: email.subject,
      html: email.html,
      text: email.text,
    });

    const results = await Promise.allSettled([pushPromise, emailPromise]);
    for (const [index, result] of results.entries()) {
      if (result.status === "rejected") {
        console.error("Order cancellation notification failed", {
          orderId,
          orderNumber: claimedOrder.orderNumber,
          userId: claimedOrder.user.toString(),
          notificationType: "ORDER_CANCELLED",
          channel: index === 0 ? "push" : "email",
          status: "failure",
          ...getSafeErrorDetails(result.reason),
        });
      }
    }

    if (results.some((result) => result.status === "rejected")) {
      try {
        await Order.updateOne(
          {
            _id: orderId,
            orderStatus: OrderStatus.CANCELLED,
            orderCancellationNotificationSent: true,
          },
          { $set: { orderCancellationNotificationSent: false } },
        );
      } catch (error: unknown) {
        console.error("Order cancellation notification claim release failed", {
          orderId,
          orderNumber: claimedOrder.orderNumber,
          userId: claimedOrder.user.toString(),
          notificationType: "ORDER_CANCELLED",
          ...getSafeErrorDetails(error),
        });
      }
    }
  } catch (error: unknown) {
    console.error("Order cancellation notification setup failed", {
      orderId,
      notificationType: "ORDER_CANCELLED",
      status: "failure",
      ...getSafeErrorDetails(error),
    });
  }
}