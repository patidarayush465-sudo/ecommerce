import { NextResponse } from "next/server";

import { AuthenticationError, AuthorizationError, getAdminUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import "@/models/Order";
import SupportTicket, { SupportTicketCategory, SupportTicketPriority, SupportTicketStatus } from "@/models/SupportTicket";
import { UserRole } from "@/models/User";
import User from "@/models/User";
import { supportTicketCategorySchema } from "@/validations/support.validation";

const statusValues = new Set(Object.values(SupportTicketStatus));
const priorityValues = new Set(Object.values(SupportTicketPriority));

type AdminTicket = {
  _id: { toString(): string };
  ticketNumber: string;
  subject: string;
  category: SupportTicketCategory;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  user?: { _id: { toString(): string }; name: string; email: string; profileImage?: { url?: string } } | null;
  order?: { _id: { toString(): string }; orderNumber: string } | null;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

function escapeRegex(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function serializeTicket(ticket: AdminTicket) {
  return { id: ticket._id.toString(), ticketNumber: ticket.ticketNumber, subject: ticket.subject, category: ticket.category, status: ticket.status, priority: ticket.priority, customer: ticket.user ? { id: ticket.user._id.toString(), name: ticket.user.name, email: ticket.user.email, profileImage: ticket.user.profileImage?.url ?? "" } : null, order: ticket.order ? { id: ticket.order._id.toString(), orderNumber: ticket.order.orderNumber } : null, lastMessageAt: ticket.lastMessageAt, createdAt: ticket.createdAt, updatedAt: ticket.updatedAt };
}
function handleError(error: unknown) {
  if (error instanceof AuthenticationError || error instanceof AuthorizationError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
  console.error("Admin support ticket listing failed", error);
  return NextResponse.json({ success: false, message: "Unable to load support tickets" }, { status: 500 });
}

export async function GET(request: Request) {
  try {
    getAdminUser(request);
    const searchParams = new URL(request.url).searchParams;
    const page = Number(searchParams.get("page") ?? "1");
    const requestedLimit = Number(searchParams.get("limit") ?? "10");
    const search = searchParams.get("search")?.trim() ?? "";
    const status = searchParams.get("status")?.trim() ?? "";
    const priority = searchParams.get("priority")?.trim() ?? "";
    const category = searchParams.get("category")?.trim() ?? "";
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(requestedLimit) || requestedLimit < 1) return NextResponse.json({ success: false, message: "Page and limit must be positive integers" }, { status: 400 });
    if (status && !statusValues.has(status as SupportTicketStatus)) return NextResponse.json({ success: false, message: "Invalid ticket status" }, { status: 400 });
    if (priority && !priorityValues.has(priority as SupportTicketPriority)) return NextResponse.json({ success: false, message: "Invalid ticket priority" }, { status: 400 });
    if (category && !supportTicketCategorySchema.safeParse(category).success) return NextResponse.json({ success: false, message: "Invalid ticket category" }, { status: 400 });

    await connectToDatabase();
    const query: Record<string, unknown> = {};
    if (status) query.status = status;
    if (priority) query.priority = priority;
    if (category) query.category = category;
    if (search) {
      const regex = new RegExp(escapeRegex(search), "i");
      const matchingUsers = await User.find({ role: UserRole.CUSTOMER, $or: [{ name: regex }, { email: regex }] }).select("_id").lean();
      query.$or = [{ ticketNumber: regex }, { subject: regex }, { user: { $in: matchingUsers.map((user) => user._id) } }];
    }

    const limit = Math.min(requestedLimit, 50);
    const [tickets, total, totalTickets, open, inProgress, resolved, closed] = await Promise.all([
      SupportTicket.find(query).select("_id ticketNumber subject category status priority user order lastMessageAt createdAt updatedAt").populate({ path: "user", select: "_id name email profileImage" }).populate({ path: "order", select: "_id orderNumber" }).sort({ lastMessageAt: -1, updatedAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      SupportTicket.countDocuments(query),
      SupportTicket.countDocuments(),
      SupportTicket.countDocuments({ status: SupportTicketStatus.OPEN }),
      SupportTicket.countDocuments({ status: SupportTicketStatus.IN_PROGRESS }),
      SupportTicket.countDocuments({ status: SupportTicketStatus.RESOLVED }),
      SupportTicket.countDocuments({ status: SupportTicketStatus.CLOSED }),
    ]);

    return NextResponse.json({ success: true, data: { tickets: tickets.map((ticket) => serializeTicket(ticket as unknown as AdminTicket)), pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }, stats: { total: totalTickets, open, inProgress, resolved, closed } } });
  } catch (error: unknown) {
    return handleError(error);
  }
}
