import Order from "@/models/Order";
import ReturnRequest, { ReturnStatus } from "@/models/ReturnRequest";
import User from "@/models/User";
import { sendEmail } from "@/services/email.service";
import { sendPushNotificationToUser } from "@/services/notification.service";

type NotificationChannel = "push" | "email";
type ReturnNotification = {
  status: ReturnStatus;
  title: string;
  body: string;
  legacyFlag: string;
  pushFlag: string;
  emailFlag: string;
  emailSubject: string;
  explanation: string;
};
type ReturnNotificationRecord = {
  _id: { toString(): string };
  user: { toString(): string };
  order: { toString(): string };
  items: Array<{ productName: string; quantity: number; unitPrice: number }>;
  rejectionReason?: string;
};
type CustomerContact = { name: string; email: string };
type ReturnOrder = { orderNumber: string };

const NOTIFICATIONS: Record<ReturnStatus, ReturnNotification | undefined> = {
  [ReturnStatus.REQUESTED]: undefined,
  [ReturnStatus.CONFIRMED]: {
    status: ReturnStatus.CONFIRMED,
    title: "Return Confirmed",
    body: "Your return request has been confirmed.",
    legacyFlag: "confirmationNotificationSent",
    pushFlag: "confirmationPushNotificationSent",
    emailFlag: "confirmationEmailSent",
    emailSubject: "Return Confirmed",
    explanation: "Your return request has been confirmed.",
  },
  [ReturnStatus.PICKUP]: {
    status: ReturnStatus.PICKUP,
    title: "Return Pickup Started",
    body: "Pickup for your return has started.",
    legacyFlag: "",
    pushFlag: "",
    emailFlag: "",
    emailSubject: "",
    explanation: "",
  },
  [ReturnStatus.RECEIVED]: {
    status: ReturnStatus.RECEIVED,
    title: "Return Received",
    body: "We have received your returned items.",
    legacyFlag: "",
    pushFlag: "",
    emailFlag: "",
    emailSubject: "",
    explanation: "",
  },
  [ReturnStatus.COMPLETED]: {
    status: ReturnStatus.COMPLETED,
    title: "Return Completed",
    body: "Your return process has been completed.",
    legacyFlag: "completionNotificationSent",
    pushFlag: "completionPushNotificationSent",
    emailFlag: "completionEmailSent",
    emailSubject: "Return Completed",
    explanation: "Your return process has been completed.",
  },
  [ReturnStatus.REJECTED]: {
    status: ReturnStatus.REJECTED,
    title: "Return Rejected",
    body: "Your return request has been rejected.",
    legacyFlag: "rejectionNotificationSent",
    pushFlag: "rejectionPushNotificationSent",
    emailFlag: "rejectionEmailSent",
    emailSubject: "Return Rejected",
    explanation: "Your return request has been rejected.",
  },
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

function getItemSummary(items: ReturnNotificationRecord["items"]) {
  return items
    .map(
      (item) =>
        `${item.productName} x ${item.quantity} (unit price: ${new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(item.unitPrice)})`,
    )
    .join(", ");
}

function getEmail(
  notification: ReturnNotification,
  returnRequest: ReturnNotificationRecord,
  order: ReturnOrder,
  customer: CustomerContact,
) {
  const itemSummary = getItemSummary(returnRequest.items);
  const rejection = returnRequest.rejectionReason
    ? ` Rejection reason: ${returnRequest.rejectionReason}`
    : "";
  const safeName = escapeHtml(customer.name);
  const safeReturnId = escapeHtml(returnRequest._id.toString());
  const safeOrderNumber = escapeHtml(order.orderNumber);
  const safeItems = escapeHtml(itemSummary);
  const safeExplanation = escapeHtml(`${notification.explanation}${rejection}`);
  const html = [
    '<div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6; max-width: 600px; margin: 0 auto;">',
    `<h1 style="color: #111827;">${escapeHtml(notification.title)}</h1>`,
    `<p>Hello ${safeName},</p>`,
    `<p>${safeExplanation}</p>`,
    '<div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 24px 0;">',
    `<p style="margin: 0 0 8px;"><strong>Return ID:</strong> ${safeReturnId}</p>`,
    `<p style="margin: 0 0 8px;"><strong>Order number:</strong> ${safeOrderNumber}</p>`,
    `<p style="margin: 0 0 8px;"><strong>Returned items:</strong> ${safeItems}</p>`,
    `<p style="margin: 0;"><strong>Status:</strong> ${escapeHtml(notification.title)}</p>`,
    "</div>",
    "<p>Thank you for shopping with us.</p>",
    "</div>",
  ].join("");
  const text = [
    `Hello ${customer.name},`,
    "",
    `${notification.explanation}${rejection}`,
    "",
    `Return ID: ${returnRequest._id.toString()}`,
    `Order number: ${order.orderNumber}`,
    `Returned items: ${itemSummary}`,
    `Status: ${notification.title}`,
    "",
    "Thank you for shopping with us.",
  ].join("\n");

  return {
    subject: `${notification.emailSubject} - ${order.orderNumber}`,
    html,
    text,
  };
}

async function claimChannel(
  returnId: string,
  notification: ReturnNotification,
  channel: NotificationChannel,
) {
  const channelFlag = channel === "push" ? notification.pushFlag : notification.emailFlag;
  if (!channelFlag) return false;
  const claimed = await ReturnRequest.findOneAndUpdate(
    {
      _id: returnId,
      status: notification.status,
      [channelFlag]: { $ne: true },
      ...(notification.legacyFlag ? { [notification.legacyFlag]: { $ne: true } } : {}),
    },
    { $set: { [channelFlag]: true } },
    { returnDocument: "after" },
  ).select("_id").lean();
  return Boolean(claimed);
}

async function releaseChannel(returnId: string, channelFlag: string) {
  await ReturnRequest.updateOne(
    { _id: returnId, [channelFlag]: true },
    { $set: { [channelFlag]: false } },
  );
}

async function markLegacyFlagIfComplete(
  returnId: string,
  notification: ReturnNotification,
) {
  if (!notification.legacyFlag) return;
  await ReturnRequest.updateOne(
    {
      _id: returnId,
      status: notification.status,
      [notification.pushFlag]: true,
      [notification.emailFlag]: true,
    },
    { $set: { [notification.legacyFlag]: true } },
  );
}

async function sendPush(
  returnId: string,
  notification: ReturnNotification,
  returnRequest: ReturnNotificationRecord,
  order: ReturnOrder,
) {
  if (!(await claimChannel(returnId, notification, "push"))) return;
  try {
    const result = await sendPushNotificationToUser(returnRequest.user.toString(), {
      title: notification.title,
      body: `${notification.body} Return ID: ${returnId}.`,
      data: { type: `RETURN_${notification.status}`, route: `/customer/returns/${returnId}`, orderNumber: order.orderNumber },
    });
    if (result.successCount === 0) throw new Error("Push notification delivery returned no successful sends");
  } catch (error: unknown) {
    await releaseChannel(returnId, notification.pushFlag);
    throw error;
  }
}

async function sendEmailNotification(
  returnId: string,
  notification: ReturnNotification,
  returnRequest: ReturnNotificationRecord,
  order: ReturnOrder,
  customer: CustomerContact,
) {
  if (!(await claimChannel(returnId, notification, "email"))) return;
  try {
    const email = getEmail(notification, returnRequest, order, customer);
    await sendEmail({ to: customer.email, subject: email.subject, html: email.html, text: email.text });
  } catch (error: unknown) {
    await releaseChannel(returnId, notification.emailFlag);
    throw error;
  }
}

export async function sendReturnStatusNotifications(returnId: string, status: ReturnStatus) {
  const notification = NOTIFICATIONS[status];
  if (!notification) return;
  try {
    const returnRequest = await ReturnRequest.findById(returnId).select("_id user order items rejectionReason status").lean() as ReturnNotificationRecord | null;
    if (!returnRequest) return;
    const [order, customer] = await Promise.all([
      Order.findById(returnRequest.order).select("orderNumber").lean() as Promise<ReturnOrder | null>,
      User.findById(returnRequest.user).select("name email").lean() as Promise<CustomerContact | null>,
    ]);
    if (!order || !customer) {
      console.error("Return notification skipped", { returnId, status, reason: "Return contact data not found" });
      return;
    }

    const pushPromise = sendPush(returnId, notification, returnRequest, order);
    const emailPromise = notification.emailFlag
      ? sendEmailNotification(returnId, notification, returnRequest, order, customer)
      : Promise.resolve();
    const results = await Promise.allSettled([pushPromise, emailPromise]);
    for (const [index, result] of results.entries()) {
      if (result.status === "rejected") {
        console.error("Return notification failed", { returnId, status, channel: index === 0 ? "push" : "email", message: getErrorMessage(result.reason) });
      }
    }
    if (results.every((result) => result.status === "fulfilled")) {
      await markLegacyFlagIfComplete(returnId, notification);
    }
  } catch (error: unknown) {
    console.error("Return notification setup failed", { returnId, status, message: getErrorMessage(error) });
  }
}