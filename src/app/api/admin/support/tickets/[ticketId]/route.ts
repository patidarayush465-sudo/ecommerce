import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { AuthenticationError, AuthorizationError, getAdminUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import SupportTicket from "@/models/SupportTicket";
import SupportTicketReply from "@/models/SupportTicketReply";

function handleError(error: unknown) {
  if (error instanceof AuthenticationError || error instanceof AuthorizationError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
  console.error("Admin support ticket detail failed", error);
  return NextResponse.json({ success: false, message: "Unable to load support ticket" }, { status: 500 });
}

export async function GET(request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  try {
    getAdminUser(request);
    const { ticketId } = await params;
    if (!mongoose.Types.ObjectId.isValid(ticketId)) return NextResponse.json({ success: false, message: "Invalid ticket ID" }, { status: 400 });
    await connectToDatabase();
    const ticket = await SupportTicket.findById(ticketId).select("_id ticketNumber subject category status priority user order lastMessageAt createdAt updatedAt").populate({ path: "user", select: "_id name email profileImage" }).populate({ path: "order", select: "_id orderNumber" }).lean();
    if (!ticket) return NextResponse.json({ success: false, message: "Support ticket not found" }, { status: 404 });
    const replies = await SupportTicketReply.find({ ticket: ticketId }).select("_id sender senderRole message attachments createdAt updatedAt").populate({ path: "sender", select: "_id name role profileImage" }).sort({ createdAt: 1 }).lean();
    const firstMessage = replies[0]?.message ?? null;
    return NextResponse.json({ success: true, data: { ticket: { id: ticket._id.toString(), ticketNumber: ticket.ticketNumber, subject: ticket.subject, description: firstMessage, category: ticket.category, status: ticket.status, priority: ticket.priority, customer: ticket.user ? { id: ticket.user._id.toString(), name: ticket.user.name, email: ticket.user.email, profileImage: ticket.user.profileImage?.url ?? "" } : null, order: ticket.order ? { id: ticket.order._id.toString(), orderNumber: ticket.order.orderNumber } : null, lastMessageAt: ticket.lastMessageAt, createdAt: ticket.createdAt, updatedAt: ticket.updatedAt }, replies: replies.map((reply) => ({ id: reply._id.toString(), senderRole: reply.senderRole, message: reply.message, attachments: reply.attachments, sender: reply.sender ? { id: reply.sender._id.toString(), name: reply.sender.name, role: reply.sender.role, profileImage: reply.sender.profileImage?.url ?? "" } : null, createdAt: reply.createdAt, updatedAt: reply.updatedAt })) } });
  } catch (error: unknown) {
    return handleError(error);
  }
}
