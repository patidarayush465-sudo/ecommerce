import Order, { PaymentMethod, OrderStatus } from "@/models/Order";
import User from "@/models/User";
import { sendEmail } from "@/services/email.service";
import { sendPushNotificationToUser } from "@/services/notification.service";

type DeliveredOrder = {
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

function getPaymentMethodLabel(paymentMethod: PaymentMethod) {
  return paymentMethod === PaymentMethod.COD ? "Cash on Delivery" : "Online Payment";
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown notification error";
}

function getDeliveryEmail(order: DeliveredOrder, customer: CustomerContact) {
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
  const paymentMethod = escapeHtml(getPaymentMethodLabel(order.paymentMethod));

  return {
    subject: `Order Delivered - ${order.orderNumber}`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #166534;">Order Delivered</h1>
        <p>Hello ${customerName},</p>
        <p>Your order has been delivered successfully. We hope you enjoy your purchase.</p>
        <div style="border: 1px solid #bbf7d0; border-radius: 8px; padding: 20px; margin: 24px 0;">
          <p style="margin: 0 0 8px;"><strong>Order number:</strong> ${orderNumber}</p>
          <p style="margin: 0 0 8px;"><strong>Order date:</strong> ${orderDate}</p>
          <p style="margin: 0 0 8px;"><strong>Status:</strong> Delivered</p>
          <p style="margin: 0 0 8px;"><strong>Total amount:</strong> ${totalAmount}</p>
          <p style="margin: 0;"><strong>Payment method:</strong> ${paymentMethod}</p>
        </div>
        <p>Thank you for shopping with us.</p>
      </div>
    `.trim(),
    text: [
      `Hello ${customer.name},`,
      "",
      "Your order has been delivered successfully. We hope you enjoy your purchase.",
      "",
      `Order number: ${order.orderNumber}`,
      `Order date: ${orderDate}`,
      "Status: Delivered",
      `Total amount: ${totalAmount}`,
      `Payment method: ${getPaymentMethodLabel(order.paymentMethod)}`,
      "",
      "Thank you for shopping with us.",
    ].join("\n"),
  };
}

export async function sendOrderDeliveredNotifications(orderId: string) {
  try {
    const order = await Order.findOne({
      _id: orderId,
      orderStatus: OrderStatus.DELIVERED,
    }).select("user orderNumber createdAt totalAmount paymentMethod").lean() as DeliveredOrder | null;

    if (!order) return;

    const customer = await User.findById(order.user).select("name email").lean() as CustomerContact | null;
    if (!customer) {
      console.error("Order delivered notification skipped", { message: "Customer contact not found" });
      return;
    }

    const claimedOrder = await Order.findOneAndUpdate(
      {
        _id: orderId,
        orderStatus: OrderStatus.DELIVERED,
        orderDeliveredNotificationSent: { $ne: true },
      },
      { $set: { orderDeliveredNotificationSent: true } },
      { returnDocument: "after" },
    ).lean() as DeliveredOrder | null;

    if (!claimedOrder) return;

    const email = getDeliveryEmail(claimedOrder, customer);
    const pushPromise = sendPushNotificationToUser(claimedOrder.user.toString(), {
      title: "Order Delivered",
      body: `Your order ${claimedOrder.orderNumber} has been delivered.`,
      data: { type: "ORDER_DELIVERED", orderNumber: claimedOrder.orderNumber },
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
        console.error("Order delivered notification failed", {
          channel: index === 0 ? "push" : "email",
          message: getErrorMessage(result.reason),
        });
      }
    }
  } catch (error: unknown) {
    console.error("Order delivered notification setup failed", {
      message: getErrorMessage(error),
    });
  }
}
