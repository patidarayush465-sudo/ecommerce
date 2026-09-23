import SupportTicket from "@/models/SupportTicket";
import User, { UserRole } from "@/models/User";
import { sendPushNotificationToUsers } from "@/services/notification.service";

export async function notifyAdminsOfCreatedSupportTicket(ticketId: string) {
  try {
    console.info("Support ticket created notification started", { ticketId });
    const ticket = await SupportTicket.findOneAndUpdate(
      {
        _id: ticketId,
        supportTicketCreatedNotificationSent: { $ne: true },
      },
      { $set: { supportTicketCreatedNotificationSent: true } },
      { returnDocument: "after" },
    ).select("ticketNumber").lean() as { ticketNumber: string } | null;

    if (!ticket) {
      console.info("Support ticket created notification claim skipped", { ticketId, claimResult: false });
      return;
    }
    console.info("Support ticket created notification claim succeeded", {
      ticketId,
      ticketNumber: ticket.ticketNumber,
      claimResult: true,
      notificationSendExecuted: true,
    });

    const admins = await User.find({ role: UserRole.ADMIN })
      .select("_id fcmTokens")
      .lean() as Array<{ _id: { toString(): string } }>;
    const adminTokens = admins.flatMap((admin) => (admin as { fcmTokens?: Array<{ token: string }> }).fcmTokens ?? []).map((entry) => entry.token);
    console.info("Support ticket created notification recipients", {
      ticketId,
      ticketNumber: ticket.ticketNumber,
      adminCount: admins.length,
      adminTokenCount: adminTokens.length,
      uniqueAdminTokenCount: new Set(adminTokens).size,
      duplicateAdminTokenCount: adminTokens.length - new Set(adminTokens).size,
      adminTokens: adminTokens.map(maskToken),
    });
    if (admins.length === 0) {
      console.info("Support ticket created notification send skipped", { ticketId, ticketNumber: ticket.ticketNumber, notificationSendExecuted: false });
      return;
    }

    console.info("Support ticket created notification send called", { ticketId, ticketNumber: ticket.ticketNumber });
    const result = await sendPushNotificationToUsers(
      admins.map((admin) => admin._id.toString()),
      {
        title: "New Support Ticket",
        body: `New support ticket ${ticket.ticketNumber} has been created.`,
        data: {
          type: "SUPPORT_TICKET_CREATED",
          ticketNumber: ticket.ticketNumber,
          supportTicketNotificationId: ticketId,
        },
      },
    );
    console.info("Support ticket created Firebase delivery", {
      ticketId,
      ticketNumber: ticket.ticketNumber,
      notificationSendExecuted: true,
      successCount: result.successCount,
      failureCount: result.failureCount,
    });
    if (result.successCount === 0) {
      throw new Error("Firebase push notification delivery returned no successful sends");
    }
  } catch (error: unknown) {
    console.error("Support ticket created push notification failed", {
      code: typeof (error as { code?: unknown }).code === "string" ? (error as { code: string }).code : undefined,
      message: error instanceof Error ? error.message : "Unknown notification error",
    });
  }
}

function maskToken(token: string) {
  if (token.length <= 8) return "********";
  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}