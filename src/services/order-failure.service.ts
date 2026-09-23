import Order, { PaymentMethod, PaymentStatus } from "@/models/Order";
import User from "@/models/User";
import { sendEmail } from "@/services/email.service";
import { sendPushNotificationToUser } from "@/services/notification.service";

type FailedOrder = {
  _id: { toString(): string };
  user: { toString(): string };
  orderNumber: string;
  createdAt: Date;
  totalAmount: number;
  paymentMethod: PaymentMethod;
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

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown notification error";
}

function getFailureEmail(order: FailedOrder, customer: CustomerContact) {
  const orderNumber = escapeHtml(order.orderNumber);
  const customerName = escapeHtml(customer.name);
  const orderDate = escapeHtml(new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(order.createdAt));
  const totalAmount = escapeHtml(new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(order.totalAmount));

  return {
    subject: `Payment Failed - ${order.orderNumber}`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #991b1b;">Payment Failed</h1>
        <p>Hello ${customerName},</p>
        <p>We could not complete the payment for your order. Your order has not been confirmed.</p>
        <div style="border: 1px solid #fecaca; border-radius: 8px; padding: 20px; margin: 24px 0;">
          <p style="margin: 0 0 8px;"><strong>Order number:</strong> ${orderNumber}</p>
          <p style="margin: 0 0 8px;"><strong>Order date:</strong> ${orderDate}</p>
          <p style="margin: 0 0 8px;"><strong>Total amount:</strong> ${totalAmount}</p>
          <p style="margin: 0;"><strong>Payment method:</strong> Online Payment</p>
        </div>
        <p>Please retry payment from your order or checkout flow if available, or contact support for assistance.</p>
      </div>
    `.trim(),
    text: [
      `Hello ${customer.name},`,
      "",
      "We could not complete the payment for your order. Your order has not been confirmed.",
      "",
      `Order number: ${order.orderNumber}`,
      `Order date: ${orderDate}`,
      `Total amount: ${totalAmount}`,
      "Payment method: Online Payment",
      "",
      "Please retry payment from your order or checkout flow if available, or contact support for assistance.",
    ].join("\n"),
  };
}

export async function sendOrderFailureNotifications(orderId: string) {
  try {
    const order = await Order.findOne({
      _id: orderId,
      paymentMethod: PaymentMethod.ONLINE,
      paymentStatus: PaymentStatus.FAILED,
    }).select("user orderNumber createdAt totalAmount paymentMethod").lean() as FailedOrder | null;

    if (!order) return;

    const customer = await User.findById(order.user).select("name email").lean() as CustomerContact | null;
    if (!customer) {
      console.error("Order failure notification skipped", { message: "Customer contact not found" });
      return;
    }

    const claimedOrder = await Order.findOneAndUpdate(
      {
        _id: orderId,
        paymentMethod: PaymentMethod.ONLINE,
        paymentStatus: PaymentStatus.FAILED,
        orderFailureNotificationSent: { $ne: true },
      },
      { $set: { orderFailureNotificationSent: true } },
      { returnDocument: "after" },
    ).lean() as FailedOrder | null;

    if (!claimedOrder) return;

    const email = getFailureEmail(claimedOrder, customer);
    const pushPromise = sendPushNotificationToUser(claimedOrder.user.toString(), {
      title: "Payment Failed",
      body: `Payment failed for order ${claimedOrder.orderNumber}. Please try again.`,
      data: { type: "PAYMENT_FAILED", orderNumber: claimedOrder.orderNumber },
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
        console.error("Order failure notification failed", {
          channel: index === 0 ? "push" : "email",
          message: getErrorMessage(result.reason),
        });
      }
    }
  } catch (error: unknown) {
    console.error("Order failure notification setup failed", {
      message: getErrorMessage(error),
    });
  }
}
