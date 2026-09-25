import Order from "@/models/Order";
import ReturnRefund, {
  RefundPaymentMethod,
  RefundStatus,
} from "@/models/ReturnRefund";
import User from "@/models/User";
import { sendEmail } from "@/services/email.service";
import { sendPushNotificationToUser } from "@/services/notification.service";

type RefundNotificationRecord = {
  _id: { toString(): string };
  user: { toString(): string };
  order: { toString(): string };
  refundAmount: number;
  paymentMethod: RefundPaymentMethod;
  paymentStatus: RefundStatus;
};
type RefundOrder = { orderNumber: string; user: { toString(): string } };
type CustomerContact = { name: string; email: string };
const NOTIFICATION_CLAIM_TIMEOUT_MS = 10 * 60 * 1000;

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character] ?? character);
}

function formatAmount(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown refund notification error";
}

function getRefundEmail(
  refund: RefundNotificationRecord,
  order: RefundOrder,
  customer: CustomerContact,
) {
  const amount = formatAmount(refund.refundAmount);
  const safeName = escapeHtml(customer.name);
  const safeOrderNumber = escapeHtml(order.orderNumber);
  const safeAmount = escapeHtml(amount);
  const html = [
    '<div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6; max-width: 600px; margin: 0 auto;">',
    '<h1 style="color: #111827;">Your refund has been processed</h1>',
    `<p>Hello ${safeName},</p>`,
    `<p>Your refund of ${safeAmount} has been processed successfully.</p>`,
    '<div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 24px 0;">',
    `<p style="margin: 0 0 8px;"><strong>Order number:</strong> ${safeOrderNumber}</p>`,
    `<p style="margin: 0 0 8px;"><strong>Refund amount:</strong> ${safeAmount}</p>`,
    '<p style="margin: 0;"><strong>Payment method:</strong> Online payment</p>',
    '</div>',
    '<p>The refund will appear according to the payment provider or bank processing timeline.</p>',
    '</div>',
  ].join("");
  const text = [
    `Hello ${customer.name},`,
    "",
    `Your refund of ${amount} has been processed successfully.`,
    "",
    `Order number: ${order.orderNumber}`,
    `Refund amount: ${amount}`,
    "Payment method: Online payment",
    "",
    "The refund will appear according to the payment provider or bank processing timeline.",
  ].join("\n");
  return {
    subject: "Your refund has been processed",
    html,
    text,
  };
}

async function claimChannel(
  refundId: string,
  channel: "push" | "email",
) {
  const sentField = channel === "push" ? "refundPushNotificationSent" : "refundEmailSent";
  const claimedField = channel === "push"
    ? "refundPushNotificationClaimedAt"
    : "refundEmailNotificationClaimedAt";
  const staleBefore = new Date(Date.now() - NOTIFICATION_CLAIM_TIMEOUT_MS);
  const claimed = await ReturnRefund.findOneAndUpdate(
    {
      _id: refundId,
      paymentMethod: RefundPaymentMethod.ONLINE,
      paymentStatus: RefundStatus.PROCESSED,
      [sentField]: { $ne: true },
      $or: [
        { [claimedField]: { $exists: false } },
        { [claimedField]: null },
        { [claimedField]: { $lt: staleBefore } },
      ],
    },
    { $set: { [claimedField]: new Date() } },
    { returnDocument: "after" },
  ).select("_id").lean();
  return Boolean(claimed);
}

async function releaseChannel(refundId: string, channel: "push" | "email") {
  const field = channel === "push"
    ? "refundPushNotificationClaimedAt"
    : "refundEmailNotificationClaimedAt";
  await ReturnRefund.updateOne(
    { _id: refundId, [field]: { $exists: true } },
    { $unset: { [field]: "" } },
  );
}

async function completeChannel(refundId: string, channel: "push" | "email") {
  const sentField = channel === "push" ? "refundPushNotificationSent" : "refundEmailSent";
  const claimedField = channel === "push"
    ? "refundPushNotificationClaimedAt"
    : "refundEmailNotificationClaimedAt";
  await ReturnRefund.updateOne(
    { _id: refundId, [claimedField]: { $exists: true } },
    { $set: { [sentField]: true }, $unset: { [claimedField]: "" } },
  );
}

export async function notifyReturnRefundProcessed(refundId: string) {
  const refund = await ReturnRefund.findOne({
    _id: refundId,
    paymentMethod: RefundPaymentMethod.ONLINE,
    paymentStatus: RefundStatus.PROCESSED,
  }).select("_id user order refundAmount paymentMethod paymentStatus").lean() as RefundNotificationRecord | null;
  if (!refund) return { skipped: true, sentPush: false, sentEmail: false };

  const [order, customer] = await Promise.all([
    Order.findById(refund.order).select("orderNumber user").lean() as Promise<RefundOrder | null>,
    User.findById(refund.user).select("name email").lean() as Promise<CustomerContact | null>,
  ]);
  if (!order || !customer || order.user.toString() !== refund.user.toString()) {
    console.error("Refund notification skipped", {
      refundId,
      reason: "Refund contact data not found",
    });
    return { skipped: true, sentPush: false, sentEmail: false };
  }

  const pushPromise = (async () => {
    if (!(await claimChannel(refundId, "push"))) return false;
    try {
      const result = await sendPushNotificationToUser(refund.user.toString(), {
        title: "Refund Processed",
        body: `Your refund of ${formatAmount(refund.refundAmount)} has been processed successfully for order ${order.orderNumber}.`,
        data: { type: "RETURN_REFUND_PROCESSED", orderNumber: order.orderNumber },
      });
      if (result.successCount === 0) {
        throw new Error("Push notification delivery returned no successful sends");
      }
      await completeChannel(refundId, "push");
      return true;
    } catch (error: unknown) {
      await releaseChannel(refundId, "push");
      throw error;
    }
  })();
  const emailPromise = (async () => {
    if (!(await claimChannel(refundId, "email"))) return false;
    try {
      const email = getRefundEmail(refund, order, customer);
      await sendEmail({
        to: customer.email,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
      await completeChannel(refundId, "email");
      return true;
    } catch (error: unknown) {
      await releaseChannel(refundId, "email");
      throw error;
    }
  })();

  const [pushResult, emailResult] = await Promise.allSettled([
    pushPromise,
    emailPromise,
  ]);
  if (pushResult.status === "rejected") {
    console.error("Refund push notification failed", {
      refundId,
      message: getErrorMessage(pushResult.reason),
    });
  }
  if (emailResult.status === "rejected") {
    console.error("Refund email notification failed", {
      refundId,
      message: getErrorMessage(emailResult.reason),
    });
  }
  return {
    skipped: false,
    sentPush: pushResult.status === "fulfilled" && pushResult.value,
    sentEmail: emailResult.status === "fulfilled" && emailResult.value,
  };
}