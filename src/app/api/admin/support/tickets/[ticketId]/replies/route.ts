import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { AuthenticationError, AuthorizationError, getAdminUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import SupportTicket, { SupportTicketStatus } from "@/models/SupportTicket";
import SupportTicketReply from "@/models/SupportTicketReply";
import { deleteSupportAttachments, uploadSupportAttachments } from "@/services/support-upload.service";
import { notifyCustomerOfSupportTicketReply } from "@/services/support-ticket-reply.service";
import { UserRole } from "@/models/User";
import { adminSupportReplySchema } from "@/validations/admin-support.validation";

function handleError(error: unknown) {
  if (error instanceof AuthenticationError || error instanceof AuthorizationError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
  console.error("Admin support reply failed", error);
  return NextResponse.json({ success: false, message: "Unable to process support reply" }, { status: 500 });
}

export async function POST(request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  let uploadedAttachments: Awaited<ReturnType<typeof uploadSupportAttachments>> = [];
  try {
    const adminUser = getAdminUser(request);
    const { ticketId } = await params;
    if (!mongoose.Types.ObjectId.isValid(ticketId)) return NextResponse.json({ success: false, message: "Invalid ticket ID" }, { status: 400 });
    const isMultipart = request.headers.get("content-type")?.includes("multipart/form-data") ?? false;
    const formData = isMultipart ? await request.formData() : null;
    const body = formData ? { message: String(formData.get("message") ?? "") } : await request.json();
    const validationResult = adminSupportReplySchema.safeParse(body);
    if (!validationResult.success) return NextResponse.json({ success: false, message: "Invalid support reply data", errors: validationResult.error.issues }, { status: 400 });
    await connectToDatabase();
    const ticket = await SupportTicket.findById(ticketId).select("_id status");
    if (!ticket) return NextResponse.json({ success: false, message: "Support ticket not found" }, { status: 404 });
    if (ticket.status === SupportTicketStatus.CLOSED) return NextResponse.json({ success: false, message: "Closed tickets cannot receive replies" }, { status: 409 });
    uploadedAttachments = formData
      ? await uploadSupportAttachments(formData.getAll("attachments").filter((entry): entry is File => entry instanceof File))
      : [];
    const reply = await SupportTicketReply.create({ ticket: ticketId, sender: adminUser.userId, senderRole: UserRole.ADMIN, message: validationResult.data.message, attachments: uploadedAttachments });
    const nextStatus = ticket.status === SupportTicketStatus.RESOLVED ? SupportTicketStatus.IN_PROGRESS : ticket.status;
    const updatedTicket = await SupportTicket.findOneAndUpdate({ _id: ticketId, status: { $ne: SupportTicketStatus.CLOSED } }, { $set: { lastMessageAt: new Date(), status: nextStatus } }, { returnDocument: "after" }).select("_id ticketNumber subject category status priority order lastMessageAt createdAt updatedAt");
    if (!updatedTicket) { await SupportTicketReply.deleteOne({ _id: reply._id }); await deleteSupportAttachments(uploadedAttachments); return NextResponse.json({ success: false, message: "Support ticket could not be updated" }, { status: 409 }); }
    void notifyCustomerOfSupportTicketReply(reply._id.toString()).catch((error: unknown) => {
      console.error("Support ticket reply notification failed", {
        replyId: reply._id.toString(),
        message: error instanceof Error ? error.message : "Unknown notification error",
      });
    });
    return NextResponse.json({ success: true, message: "Reply added successfully", data: { id: reply._id.toString(), ticketId, senderRole: reply.senderRole, message: reply.message, attachments: reply.attachments, createdAt: reply.createdAt, status: updatedTicket.status } });
  } catch (error: unknown) {
    if (uploadedAttachments.length > 0) await deleteSupportAttachments(uploadedAttachments);
    if (error instanceof SyntaxError) return NextResponse.json({ success: false, message: "Invalid request body" }, { status: 400 });
    return handleError(error);
  }
}
