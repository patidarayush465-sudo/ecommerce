import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { AuthenticationError, AuthorizationError, getAuthUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import "@/models/Order";
import SupportTicket from "@/models/SupportTicket";
import SupportTicketReply from "@/models/SupportTicketReply";
import { UserRole } from "@/models/User";

function authenticateCustomer(request: Request) {
  const authUser = getAuthUser(request);
  if (authUser.role !== UserRole.CUSTOMER) throw new AuthorizationError("Customer access required");
  return authUser.userId;
}

function handleTicketError(error: unknown, logMessage: string) {
  if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
    return NextResponse.json({ success: false, message: error.message }, { status: error.status });
  }
  console.error(logMessage, error);
  return NextResponse.json({ success: false, message: "Unable to load support ticket" }, { status: 500 });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ ticketId: string }> },
) {
  try {
    const userId = authenticateCustomer(request);
    const { ticketId } = await params;
    if (!mongoose.Types.ObjectId.isValid(ticketId)) {
      return NextResponse.json({ success: false, message: "Invalid ticket ID" }, { status: 400 });
    }

    await connectToDatabase();
    const ticket = await SupportTicket.findOne({ _id: ticketId, user: userId })
      .select("_id ticketNumber subject category status priority order lastMessageAt createdAt updatedAt")
      .populate({ path: "order", select: "_id orderNumber" })
      .lean();
    if (!ticket) return NextResponse.json({ success: false, message: "Support ticket not found" }, { status: 404 });

    const replies = await SupportTicketReply.find({ ticket: ticketId })
      .select("_id sender senderRole message attachments createdAt updatedAt")
      .populate({ path: "sender", select: "_id name email role profileImage" })
      .sort({ createdAt: 1 })
      .lean();

    return NextResponse.json({
      success: true,
      data: {
        ticket: {
          id: ticket._id.toString(),
          ticketNumber: ticket.ticketNumber,
          subject: ticket.subject,
          category: ticket.category,
          status: ticket.status,
          priority: ticket.priority,
          order: ticket.order ? { id: ticket.order._id.toString(), orderNumber: ticket.order.orderNumber } : null,
          lastMessageAt: ticket.lastMessageAt,
          createdAt: ticket.createdAt,
          updatedAt: ticket.updatedAt,
        },
        replies: replies.map((reply) => ({
          id: reply._id.toString(),
          senderRole: reply.senderRole,
          message: reply.message,
          attachments: reply.attachments,
          sender: reply.sender
            ? {
                id: reply.sender._id.toString(),
                name: reply.sender.name,
                email: reply.sender.email,
                role: reply.sender.role,
                profileImage: reply.sender.profileImage,
              }
            : null,
          createdAt: reply.createdAt,
          updatedAt: reply.updatedAt,
        })),
      },
    });
  } catch (error: unknown) {
    return handleTicketError(error, "Customer support ticket detail fetch failed");
  }
}
