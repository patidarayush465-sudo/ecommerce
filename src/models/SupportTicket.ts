import mongoose, { Schema } from "mongoose";

export enum SupportTicketCategory {
  ORDER = "ORDER",
  PAYMENT = "PAYMENT",
  DELIVERY = "DELIVERY",
  PRODUCT = "PRODUCT",
  RETURN_REFUND = "RETURN_REFUND",
  ACCOUNT = "ACCOUNT",
  OTHER = "OTHER",
}

export enum SupportTicketStatus {
  OPEN = "OPEN",
  IN_PROGRESS = "IN_PROGRESS",
  RESOLVED = "RESOLVED",
  CLOSED = "CLOSED",
}

export enum SupportTicketPriority {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
}

const SupportTicketSchema = new Schema(
  {
    ticketNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 150,
    },
    category: {
      type: String,
      enum: Object.values(SupportTicketCategory),
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(SupportTicketStatus),
      default: SupportTicketStatus.OPEN,
      index: true,
    },
    priority: {
      type: String,
      enum: Object.values(SupportTicketPriority),
      default: SupportTicketPriority.MEDIUM,
    },
    order: {
      type: Schema.Types.ObjectId,
      ref: "Order",
    },
    supportTicketCreatedNotificationSent: {
      type: Boolean,
      default: false,
    },
    lastMessageAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true },
);

SupportTicketSchema.index({ user: 1, lastMessageAt: -1 });

const cachedSupportTicketModel = mongoose.models.SupportTicket;
const hasCreatedNotificationPath = cachedSupportTicketModel
  ? Boolean(cachedSupportTicketModel.schema.path("supportTicketCreatedNotificationSent"))
  : false;

if (cachedSupportTicketModel && !hasCreatedNotificationPath) {
  delete mongoose.models.SupportTicket;
}

const SupportTicketModel =
  (hasCreatedNotificationPath ? cachedSupportTicketModel : undefined) ||
  mongoose.model("SupportTicket", SupportTicketSchema);

const SupportTicket = SupportTicketModel as typeof mongoose.models.SupportTicket;

export default SupportTicket;
