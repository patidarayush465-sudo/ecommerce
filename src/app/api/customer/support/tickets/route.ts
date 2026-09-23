import { NextResponse } from "next/server";

import { AuthenticationError, AuthorizationError, getAuthUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Order from "@/models/Order";
import SupportTicket, {
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketStatus,
} from "@/models/SupportTicket";
import SupportTicketReply from "@/models/SupportTicketReply";
import { deleteSupportAttachments, uploadSupportAttachments } from "@/services/support-upload.service";
import { notifyAdminsOfCreatedSupportTicket } from "@/services/support-ticket-created.service";
import { UserRole } from "@/models/User";
import {
  createSupportTicketSchema,
  supportTicketCategorySchema,
  supportTicketStatusSchema,
} from "@/validations/support.validation";

function authenticateCustomer(request: Request) {
  const authUser = getAuthUser(request);
  if (authUser.role !== UserRole.CUSTOMER) {
    throw new AuthorizationError("Customer access required");
  }
  return authUser.userId;
}

function createTicketNumber() {
  return `TKT-${Date.now()}`;
}

function serializeTicket(ticket: {
  _id: { toString(): string };
  ticketNumber: string;
  subject: string;
  category: SupportTicketCategory;
  status: SupportTicketStatus;
  priority: SupportTicketPriority;
  order?: { _id: { toString(): string }; orderNumber: string } | null;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: ticket._id.toString(),
    ticketNumber: ticket.ticketNumber,
    subject: ticket.subject,
    category: ticket.category,
    status: ticket.status,
    priority: ticket.priority,
    order: ticket.order
      ? { id: ticket.order._id.toString(), orderNumber: ticket.order.orderNumber }
      : null,
    lastMessageAt: ticket.lastMessageAt,
    createdAt: ticket.createdAt,
    updatedAt: ticket.updatedAt,
  };
}

function handleTicketError(error: unknown, logMessage: string) {
  if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
    return NextResponse.json({ success: false, message: error.message }, { status: error.status });
  }
  console.error(logMessage, error);
  return NextResponse.json({ success: false, message: "Unable to process support ticket" }, { status: 500 });
}

export async function POST(request: Request) {
  let uploadedAttachments: Awaited<ReturnType<typeof uploadSupportAttachments>> = [];
  let createdTicketId: unknown;
  try {
    const userId = authenticateCustomer(request);
    const isMultipart = request.headers.get("content-type")?.includes("multipart/form-data") ?? false;
    const formData = isMultipart ? await request.formData() : null;
    const body = formData
      ? {
          subject: String(formData.get("subject") ?? ""),
          category: String(formData.get("category") ?? ""),
          message: String(formData.get("message") ?? ""),
          priority: String(formData.get("priority") ?? "MEDIUM"),
          orderId: String(formData.get("orderId") ?? "") || undefined,
          attachments: [],
        }
      : await request.json();
    const validationResult = createSupportTicketSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json({ success: false, message: "Invalid support ticket data", errors: validationResult.error.issues }, { status: 400 });
    }

    const { subject, category, message, priority, orderId } = validationResult.data;
    await connectToDatabase();

    let order;
    if (orderId) {
      order = await Order.findOne({ _id: orderId, user: userId }).select("_id orderNumber").lean();
      if (!order) return NextResponse.json({ success: false, message: "Order not found" }, { status: 404 });
    }

    if (formData) {
      const files = formData.getAll("attachments").filter((entry): entry is File => entry instanceof File);
      uploadedAttachments = await uploadSupportAttachments(files);
    }

    let ticket;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        ticket = await SupportTicket.create({
          ticketNumber: createTicketNumber(),
          user: userId,
          subject,
          category,
          priority,
          order: order?._id,
          lastMessageAt: new Date(),
        });
        break;
      } catch (error: unknown) {
        if ((error as { code?: number }).code !== 11000 || attempt === 2) throw error;
        await new Promise((resolve) => setTimeout(resolve, 2));
      }
    }

    if (!ticket) throw new Error("Unable to create support ticket");
    createdTicketId = ticket._id;

    const reply = await SupportTicketReply.create({
      ticket: ticket._id,
      sender: userId,
      senderRole: UserRole.CUSTOMER,
      message,
      attachments: uploadedAttachments,
    });

    const response = NextResponse.json({
      success: true,
      message: "Support ticket created successfully",
      data: {
        ticket: serializeTicket({ ...ticket.toObject(), order }),
        firstReply: {
          id: reply._id.toString(),
          message: reply.message,
          senderRole: reply.senderRole,
          attachments: reply.attachments,
          createdAt: reply.createdAt,
        },
      },
    }, { status: 201 });
    void notifyAdminsOfCreatedSupportTicket(ticket._id.toString());
    return response;
  } catch (error: unknown) {
    if (createdTicketId) await SupportTicket.deleteOne({ _id: createdTicketId });
    if (uploadedAttachments.length > 0) await deleteSupportAttachments(uploadedAttachments);
    if (error instanceof SyntaxError) return NextResponse.json({ success: false, message: "Invalid request body" }, { status: 400 });
    return handleTicketError(error, "Customer support ticket creation failed");
  }
}

export async function GET(request: Request) {
  try {
    const userId = authenticateCustomer(request);
    const searchParams = new URL(request.url).searchParams;
    const page = Number(searchParams.get("page") ?? "1");
    const requestedLimit = Number(searchParams.get("limit") ?? "10");
    const search = searchParams.get("search")?.trim() ?? "";
    const status = searchParams.get("status")?.trim() ?? "";
    const category = searchParams.get("category")?.trim() ?? "";

    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(requestedLimit) || requestedLimit < 1) {
      return NextResponse.json({ success: false, message: "Page and limit must be positive integers" }, { status: 400 });
    }
    if (status && !supportTicketStatusSchema.safeParse(status).success) {
      return NextResponse.json({ success: false, message: "Invalid ticket status" }, { status: 400 });
    }
    if (category && !supportTicketCategorySchema.safeParse(category).success) {
      return NextResponse.json({ success: false, message: "Invalid ticket category" }, { status: 400 });
    }

    await connectToDatabase();
    const query: Record<string, unknown> = { user: userId };
    if (status) query.status = status;
    if (category) query.category = category;
    if (search) query.$or = [
      { ticketNumber: new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") },
      { subject: new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") },
    ];

    const limit = Math.min(requestedLimit, 50);
    const [tickets, total] = await Promise.all([
      SupportTicket.find(query)
        .select("_id ticketNumber subject category status priority order lastMessageAt createdAt updatedAt")
        .populate({ path: "order", select: "_id orderNumber" })
        .sort({ lastMessageAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      SupportTicket.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        tickets: tickets.map((ticket) => serializeTicket(ticket as never)),
        pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
      },
    });
  } catch (error: unknown) {
    return handleTicketError(error, "Customer support ticket listing failed");
  }
}
