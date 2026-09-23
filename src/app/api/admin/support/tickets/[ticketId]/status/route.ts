import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { AuthenticationError, AuthorizationError, getAdminUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import SupportTicket from "@/models/SupportTicket";
import { adminSupportStatusSchema } from "@/validations/admin-support.validation";

function handleError(error: unknown) {
  if (error instanceof AuthenticationError || error instanceof AuthorizationError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
  console.error("Admin support status update failed", error);
  return NextResponse.json({ success: false, message: "Unable to update support ticket" }, { status: 500 });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  try {
    getAdminUser(request);
    const { ticketId } = await params;
    if (!mongoose.Types.ObjectId.isValid(ticketId)) return NextResponse.json({ success: false, message: "Invalid ticket ID" }, { status: 400 });
    const validationResult = adminSupportStatusSchema.safeParse(await request.json());
    if (!validationResult.success) return NextResponse.json({ success: false, message: "Invalid support ticket status", errors: validationResult.error.issues }, { status: 400 });
    await connectToDatabase();
    const ticket = await SupportTicket.findByIdAndUpdate(ticketId, { $set: { status: validationResult.data.status } }, { returnDocument: "after" }).select("_id ticketNumber subject category status priority order lastMessageAt createdAt updatedAt");
    if (!ticket) return NextResponse.json({ success: false, message: "Support ticket not found" }, { status: 404 });
    return NextResponse.json({ success: true, message: "Support ticket status updated", data: { id: ticket._id.toString(), status: ticket.status } });
  } catch (error: unknown) {
    if (error instanceof SyntaxError) return NextResponse.json({ success: false, message: "Invalid request body" }, { status: 400 });
    return handleError(error);
  }
}
