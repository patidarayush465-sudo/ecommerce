import mongoose, { Schema } from "mongoose";

export enum RefundPaymentMethod {
  ONLINE = "ONLINE",
  COD = "COD",
}

export enum RefundStatus {
  PENDING = "PENDING",
  PROCESSING = "PROCESSING",
  PROCESSED = "PROCESSED",
  FAILED = "FAILED",
}

const ReturnRefundItemSchema = new Schema(
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
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false },
);

const ReturnRefundSchema = new Schema(
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
    returnRequest: {
      type: Schema.Types.ObjectId,
      ref: "ReturnRequest",
      required: true,
    },
    items: {
      type: [ReturnRefundItemSchema],
      required: true,
      validate: {
        validator: (items: unknown[]) => items.length > 0,
        message: "A refund must contain at least one item",
      },
    },
    refundAmount: {
      type: Number,
      required: true,
      min: 0.01,
    },
    currency: {
      type: String,
      required: true,
      default: "INR",
      uppercase: true,
      trim: true,
    },
    paymentMethod: {
      type: String,
      enum: Object.values(RefundPaymentMethod),
      required: true,
    },
    refundMethod: {
      type: String,
      enum: ["BANK_ACCOUNT", "UPI"],
    },
    bankAccount: {
      accountHolderName: { type: String, trim: true },
      accountNumber: { type: String, trim: true },
      ifsc: { type: String, trim: true, uppercase: true },
    },
    upiId: {
      type: String,
      trim: true,
      lowercase: true,
    },
    paymentStatus: {
      type: String,
      enum: Object.values(RefundStatus),
      default: RefundStatus.PENDING,
      required: true,
    },
    razorpayPaymentId: {
      type: String,
      trim: true,
    },
    razorpayRefundId: {
      type: String,
      trim: true,
    },
    processedAt: Date,
    failedAt: Date,
    failureReason: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    retryCount: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: "Retry count must be an integer",
      },
    },
    lastAttemptAt: Date,
    processingKey: {
      type: String,
      required: true,
      trim: true,
    },
    refundPushNotificationSent: {
      type: Boolean,
      default: false,
    },
    refundPushNotificationClaimedAt: Date,
    refundEmailSent: {
      type: Boolean,
      default: false,
    },
    refundEmailNotificationClaimedAt: Date,
  },
  { timestamps: true },
);

ReturnRefundSchema.index({ user: 1, createdAt: -1 });
ReturnRefundSchema.index({ order: 1, createdAt: -1 });
ReturnRefundSchema.index({ returnRequest: 1 }, { unique: true });
ReturnRefundSchema.index({ paymentStatus: 1, createdAt: -1 });
ReturnRefundSchema.index({ processingKey: 1 }, { unique: true });

const ReturnRefund =
  mongoose.models.ReturnRefund || mongoose.model("ReturnRefund", ReturnRefundSchema);

export default ReturnRefund;
