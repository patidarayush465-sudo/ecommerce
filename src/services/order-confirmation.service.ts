import Order, { OrderStatus, PaymentMethod, PaymentStatus } from "@/models/Order";
import User from "@/models/User";
import { sendEmail } from "@/services/email.service";
import { sendPushNotificationToUser } from "@/services/notification.service";

type ConfirmedOrder = {
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

function getConfirmationEmail(order: ConfirmedOrder, customer: CustomerContact) {
  const orderNumber = escapeHtml(order.orderNumber);
  const customerName = escapeHtml(customer.name);
  const paymentMethod = escapeHtml(getPaymentMethodLabel(order.paymentMethod));
  const orderDate = escapeHtml(new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(order.createdAt));
  const totalAmount = escapeHtml(new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(order.totalAmount));

  return {
    subject: `Order Confirmed - ${order.orderNumber}`,
    html: `
      <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #111827;">Order Confirmed</h1>
        <p>Hello ${customerName},</p>
        <p>Your order has been confirmed successfully. We will keep you updated as it progresses.</p>
        <div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 24px 0;">
          <p style="margin: 0 0 8px;"><strong>Order number:</strong> ${orderNumber}</p>
          <p style="margin: 0 0 8px;"><strong>Order date:</strong> ${orderDate}</p>
          <p style="margin: 0 0 8px;"><strong>Total amount:</strong> ${totalAmount}</p>
          <p style="margin: 0;"><strong>Payment method:</strong> ${paymentMethod}</p>
        </div>
        <p>Thank you for shopping with us.</p>
      </div>
    `.trim(),
    text: [
      `Hello ${customer.name},`,
      "",
      "Your order has been confirmed successfully.",
      "",
      `Order number: ${order.orderNumber}`,
      `Order date: ${orderDate}`,
      `Total amount: ${totalAmount}`,
      `Payment method: ${getPaymentMethodLabel(order.paymentMethod)}`,
      "",
      "Thank you for shopping with us.",
    ].join("\n"),
  };
}

async function claimOrderConfirmation(orderId: string, customer: CustomerContact) {
  const order = await Order.findOneAndUpdate(
    {
      _id: orderId,
      orderStatus: OrderStatus.CONFIRMED,
      orderConfirmationNotificationSent: { $ne: true },
      $or: [
        { paymentMethod: PaymentMethod.COD, paymentStatus: PaymentStatus.PENDING },
        { paymentMethod: PaymentMethod.ONLINE, paymentStatus: PaymentStatus.PAID },
      ],
    },
    { $set: { orderConfirmationNotificationSent: true } },
    { returnDocument: "after" },
  ).lean() as ConfirmedOrder | null;

  if (!order) {
    console.info("Order confirmation notification claim skipped");
    return;
  }

  console.info("Order confirmation notification claim succeeded");

  const email = getConfirmationEmail(order, customer);
  const pushPromise = sendPushNotificationToUser(order.user.toString(), {
      title: "Order Confirmed",
      body: `Your order ${order.orderNumber} has been confirmed.`,
      data: { type: "ORDER_CONFIRMED", orderNumber: order.orderNumber },
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
      console.error("Order confirmation notification failed", {
        channel: index === 0 ? "push" : "email",
        message: getErrorMessage(result.reason),
      });
    }
  }
}

export async function sendOrderConfirmationNotifications(orderId: string) {
  try {
    const order = await Order.findOne({
      _id: orderId,
      orderStatus: OrderStatus.CONFIRMED,
      $or: [
        { paymentMethod: PaymentMethod.COD, paymentStatus: PaymentStatus.PENDING },
        { paymentMethod: PaymentMethod.ONLINE, paymentStatus: PaymentStatus.PAID },
      ],
    }).select("user orderNumber createdAt totalAmount paymentMethod").lean() as ConfirmedOrder | null;

    if (!order) return;

    const customer = await User.findById(order.user).select("name email").lean() as CustomerContact | null;
    if (!customer) {
      console.error("Order confirmation notification skipped", { message: "Customer contact not found" });
      return;
    }

    await claimOrderConfirmation(orderId, customer);
  } catch (error: unknown) {
    console.error("Order confirmation notification setup failed", {
      message: getErrorMessage(error),
    });
  }
}
