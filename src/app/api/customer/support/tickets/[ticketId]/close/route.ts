import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { AuthenticationError, AuthorizationError, getAuthUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import SupportTicket, { SupportTicketStatus } from "@/models/SupportTicket";
import { UserRole } from "@/models/User";

function authenticateCustomer(request: Request) {
  const authUser = getAuthUser(request);
  if (authUser.role !== UserRole.CUSTOMER) throw new AuthorizationError("Customer access required");
  return authUser.userId;
}

function handleCloseError(error: unknown) {
  if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
    return NextResponse.json({ success: false, message: error.message }, { status: error.status });
  }
  console.error("Customer support ticket close failed", error);
  return NextResponse.json({ success: false, message: "Unable to close support ticket" }, { status: 500 });
}

export async function PATCH(
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
    const ticket = await SupportTicket.findOneAndUpdate(
      { _id: ticketId, user: userId, status: SupportTicketStatus.RESOLVED },
      { $set: { status: SupportTicketStatus.CLOSED } },
      { returnDocument: "after" },
    ).select("_id ticketNumber subject category status priority order lastMessageAt createdAt updatedAt");

    if (!ticket) {
      const existingTicket = await SupportTicket.findOne({ _id: ticketId, user: userId }).select("status").lean();
      if (!existingTicket) return NextResponse.json({ success: false, message: "Support ticket not found" }, { status: 404 });
      return NextResponse.json({ success: false, message: "Only resolved tickets can be closed" }, { status: 409 });
    }

    return NextResponse.json({
      success: true,
      message: "Support ticket closed successfully",
      data: ticket,
    });
  } catch (error: unknown) {
    return handleCloseError(error);
  }
}
