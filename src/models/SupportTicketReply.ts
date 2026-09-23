import mongoose, { Schema } from "mongoose";
import { UserRole } from "@/models/User";

const AttachmentSchema = new Schema(
  {
    url: { type: String, required: true, trim: true },
    publicId: { type: String, required: true, trim: true },
    resourceType: { type: String, required: true, enum: ["image", "raw"] },
    fileName: { type: String, required: true, trim: true },
    mimeType: { type: String, required: true, trim: true },
    size: { type: Number, required: true, min: 1 },
  },
  { _id: false },
);

const SupportTicketReplySchema = new Schema(
  {
    ticket: {
      type: Schema.Types.ObjectId,
      ref: "SupportTicket",
      required: true,
      index: true,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    senderRole: {
      type: String,
      enum: [UserRole.ADMIN, UserRole.CUSTOMER],
      required: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 3000,
    },
    attachments: {
      type: [AttachmentSchema],
      default: [],
    },
    customerNotificationSent: {
      type: Boolean,
      default: false,
    },
    adminNotificationSent: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

SupportTicketReplySchema.index({ ticket: 1, createdAt: 1 });

const cachedReplyModel = mongoose.models.SupportTicketReply;
const cachedAttachmentSchema = cachedReplyModel?.schema.path("attachments") as
  | { schema?: { path(path: string): unknown } }
  | undefined;
const hasCustomerNotificationSentPath = cachedReplyModel
  ? Boolean(cachedReplyModel.schema.path("customerNotificationSent"))
  : false;
const hasAdminNotificationSentPath = cachedReplyModel
  ? Boolean(cachedReplyModel.schema.path("adminNotificationSent"))
  : false;
const hasAttachmentMetadata = cachedAttachmentSchema?.schema
  ? ["resourceType", "fileName", "mimeType", "size"].every((path) =>
      Boolean(cachedAttachmentSchema.schema?.path(path)),
    )
  : false;

const hasCurrentSchema = hasAttachmentMetadata && hasCustomerNotificationSentPath && hasAdminNotificationSentPath;

if (cachedReplyModel && !hasCurrentSchema) delete mongoose.models.SupportTicketReply;

const SupportTicketReplyModel =
  (hasCurrentSchema ? cachedReplyModel : undefined) ||
  mongoose.model("SupportTicketReply", SupportTicketReplySchema);

const SupportTicketReply = SupportTicketReplyModel as typeof mongoose.models.SupportTicketReply;

export default SupportTicketReply;
