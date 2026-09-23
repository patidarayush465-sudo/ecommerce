import { connectToDatabase } from "@/lib/mongodb";
import SupportTicketReply from "@/models/SupportTicketReply";
import User, { UserRole } from "@/models/User";
import { sendPushNotificationToUsers } from "@/services/notification.service";

type ClaimedReply = {
  _id: { toString(): string };
  ticket: { toString(): string };
};

type AdminNotificationUser = {
  _id: { toString(): string };
  fcmTokens?: Array<{ token: string }>;
};

export async function sendCustomerSupportReplyAdminNotification({
  ticketId,
  ticketNumber,
  replyId,
}: {
  ticketId: string;
  ticketNumber: string;
  replyId: string;
}) {
  await connectToDatabase();

  const reply = await SupportTicketReply.findOneAndUpdate(
    {
      _id: replyId,
      adminNotificationSent: false,
    },
    {
      $set: {
        adminNotificationSent: true,
      },
    },
    {
      returnDocument: "after",
    },
  ).select("_id ticket").lean() as ClaimedReply | null;

  if (!reply) {
    console.info("Customer support reply admin notification already claimed", { replyId });
    return;
  }

  console.info("Customer support reply admin notification claimed", {
    ticketId,
    ticketNumber,
    replyId,
  });

  const admins = await User.find({ role: UserRole.ADMIN })
    .select("_id fcmTokens")
    .lean() as AdminNotificationUser[];
  const adminTokens = admins.flatMap((admin) => (admin.fcmTokens ?? []).map((entry) => entry.token));
  const uniqueAdminTokens = new Set(adminTokens);
  console.info("Customer support reply admin notification recipients", {
    ticketId,
    ticketNumber,
    replyId,
    adminCount: admins.length,
    adminTokenCount: adminTokens.length,
    uniqueAdminTokenCount: uniqueAdminTokens.size,
    duplicateAdminTokenCount: adminTokens.length - uniqueAdminTokens.size,
  });

  if (adminTokens.length === 0) {
    console.info("No admin FCM token available for customer support reply", {
      ticketId,
      ticketNumber,
      replyId,
    });
    return;
  }

  const result = await sendPushNotificationToUsers(
    admins.map((admin) => admin._id.toString()),
    {
      title: "New Support Ticket Reply",
      body: `Customer replied to support ticket ${ticketNumber}.`,
      data: {
        type: "SUPPORT_TICKET_CUSTOMER_REPLY",
        ticketId,
        ticketNumber,
        replyId,
        supportTicketNotificationId: `customer-reply-${replyId}`,
      },
    },
  );
  console.info("Customer support reply admin Firebase delivery", {
    ticketId,
    ticketNumber,
    replyId,
    notificationSendExecuted: true,
    successCount: result.successCount,
    failureCount: result.failureCount,
  });
}