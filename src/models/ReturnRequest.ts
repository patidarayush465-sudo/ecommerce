import mongoose, { Schema } from "mongoose";

export enum ReturnReason {
  DAMAGED = "DAMAGED",
  DEFECTIVE = "DEFECTIVE",
  WRONG_ITEM = "WRONG_ITEM",
  MISSING_ITEM = "MISSING_ITEM",
  NOT_AS_DESCRIBED = "NOT_AS_DESCRIBED",
  SIZE_OR_FIT = "SIZE_OR_FIT",
  CHANGED_MIND = "CHANGED_MIND",
  OTHER = "OTHER",
}

export enum ReturnStatus {
  REQUESTED = "REQUESTED",
  CONFIRMED = "CONFIRMED",
  PICKUP = "PICKUP",
  RECEIVED = "RECEIVED",
  COMPLETED = "COMPLETED",
  REJECTED = "REJECTED",
}

const ReturnItemSchema = new Schema(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    productName: {
      type: String,
      required: true,
      trim: true,
    },
    productImage: {
      type: String,
      trim: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: "Quantity must be an integer",
      },
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false },
);

const ReturnStatusHistorySchema = new Schema(
  {
    status: {
      type: String,
      enum: Object.values(ReturnStatus),
      required: true,
    },
    changedAt: {
      type: Date,
      required: true,
    },
    note: {
      type: String,
      trim: true,
    },
  },
  { _id: false },
);

const CodRefundDestinationSchema = new Schema(
  {
    refundMethod: {
      type: String,
      enum: ["BANK_ACCOUNT", "UPI"],
      required: true,
    },
    bankAccount: {
      accountHolderName: { type: String, trim: true },
      accountNumber: { type: String, trim: true },
      ifsc: { type: String, trim: true, uppercase: true },
    },
    upiId: { type: String, trim: true, lowercase: true },
  },
  { _id: false, strict: true },
);

const ReturnRequestSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    order: {
      type: Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    items: {
      type: [ReturnItemSchema],
      required: true,
      validate: {
        validator: (items: unknown[]) => items.length > 0,
        message: "A return request must contain at least one item",
      },
    },
    reason: {
      type: String,
      enum: Object.values(ReturnReason),
      required: true,
    },
    reasonDetails: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    codRefundDestination: {
      type: CodRefundDestinationSchema,
    },
    status: {
      type: String,
      enum: Object.values(ReturnStatus),
      default: ReturnStatus.REQUESTED,
      required: true,
    },
    inventoryRestored: {
      type: Boolean,
      default: false,
      required: true,
    },
    requestedAt: {
      type: Date,
      required: true,
    },
    confirmedAt: Date,
    pickupAt: Date,
    receivedAt: Date,
    completedAt: Date,
    rejectedAt: Date,
    rejectionReason: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    pickupAgentName: {
      type: String,
      trim: true,
    },
    pickupAgentPhone: {
      type: String,
      trim: true,
    },
    pickupReference: {
      type: String,
      trim: true,
    },
    statusHistory: {
      type: [ReturnStatusHistorySchema],
      required: true,
      default: [],
    },
    confirmationNotificationSent: {
      type: Boolean,
      default: false,
    },
    confirmationPushNotificationSent: {
      type: Boolean,
      default: false,
    },
    confirmationEmailSent: {
      type: Boolean,
      default: false,
    },
    completionNotificationSent: {
      type: Boolean,
      default: false,
    },
    completionPushNotificationSent: {
      type: Boolean,
      default: false,
    },
    completionEmailSent: {
      type: Boolean,
      default: false,
    },
    rejectionNotificationSent: {
      type: Boolean,
      default: false,
    },
    rejectionPushNotificationSent: {
      type: Boolean,
      default: false,
    },
    rejectionEmailSent: {
      type: Boolean,
      default: false,
    },
    refundRequestId: {
      type: Schema.Types.ObjectId,
    },
  },
  { timestamps: true },
);

ReturnRequestSchema.index({ user: 1, createdAt: -1 });
ReturnRequestSchema.index({ order: 1, createdAt: -1 });
ReturnRequestSchema.index({ status: 1, createdAt: -1 });

const ReturnRequest =
  mongoose.models.ReturnRequest || mongoose.model("ReturnRequest", ReturnRequestSchema);

export default ReturnRequest;