import { connectToDatabase } from "@/lib/mongodb";
import SupportTicket from "@/models/SupportTicket";
import SupportTicketReply from "@/models/SupportTicketReply";
import User, { UserRole } from "@/models/User";
import { sendPushNotificationToUsers } from "@/services/notification.service";

type ClaimedReply = {
  _id: { toString(): string };
  ticket: { toString(): string };
};

type SupportTicketNotification = {
  _id: { toString(): string };
  ticketNumber: string;
  user: { toString(): string };
};

type CustomerNotificationUser = {
  _id: { toString(): string };
  fcmTokens?: Array<{ token: string }>;
};

export async function notifyCustomerOfSupportTicketReply(replyId: string) {
  await connectToDatabase();

  const reply = await SupportTicketReply.findOneAndUpdate(
    {
      _id: replyId,
      customerNotificationSent: false,
    },
    {
      $set: {
        customerNotificationSent: true,
      },
    },
    {
      returnDocument: "after",
    },
  ).select("_id ticket").lean() as ClaimedReply | null;

  if (!reply) {
    console.info("Support ticket reply notification already claimed", { replyId });
    return;
  }

  const ticket = await SupportTicket.findById(reply.ticket)
    .select("_id ticketNumber user")
    .lean() as SupportTicketNotification | null;
  if (!ticket) throw new Error("Support ticket not found for reply notification");

  const customer = await User.findOne({ _id: ticket.user, role: UserRole.CUSTOMER })
    .select("_id fcmTokens")
    .lean() as CustomerNotificationUser | null;
  if (!customer) throw new Error("Customer not found for support ticket reply notification");

  const ticketId = ticket._id.toString();
  const ticketNumber = ticket.ticketNumber;
  const customerId = customer._id.toString();
  console.info("Support ticket reply notification claimed", {
    ticketId,
    ticketNumber,
    replyId,
    customerId,
  });

  if (!customer.fcmTokens?.some((entry) => Boolean(entry.token))) {
    console.info("No customer FCM token available for support ticket reply", {
      ticketId,
      ticketNumber,
      replyId,
      customerId,
    });
    return;
  }

  const result = await sendPushNotificationToUsers([customerId], {
    title: "Support Ticket Update",
    body: `Admin replied to your support ticket ${ticketNumber}.`,
    data: {
      type: "SUPPORT_TICKET_REPLY",
      ticketId,
      ticketNumber,
      replyId,
      supportTicketNotificationId: `${ticketId}-${replyId}`,
    },
  });
  console.info("Support ticket reply Firebase delivery", {
    ticketId,
    ticketNumber,
    replyId,
    notificationSendExecuted: true,
    successCount: result.successCount,
    failureCount: result.failureCount,
  });
}