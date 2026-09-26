import mongoose, { Schema } from "mongoose";

export enum OrderStatus {
  PENDING = "PENDING",
  CONFIRMED = "CONFIRMED",
  PROCESSING = "PROCESSING",
  SHIPPED = "SHIPPED",
  DELIVERED = "DELIVERED",
  CANCELLED = "CANCELLED",
}

export enum PaymentStatus {
  PENDING = "PENDING",
  PAID = "PAID",
  FAILED = "FAILED",
  REFUNDED = "REFUNDED",
}

export enum RefundStatus {
  PENDING = "PENDING",
  PROCESSED = "PROCESSED",
  FAILED = "FAILED",
}

export enum PaymentMethod {
  COD = "COD",
  ONLINE = "ONLINE",
}

const OrderItemSchema = new Schema(
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
      required: true,
      trim: true,
    },
    mrp: {
      type: Number,
      min: 0,
    },
    discountPercent: {
      type: Number,
      min: 0,
      max: 100,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
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
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false },
);

const ShippingAddressSnapshotSchema = new Schema(
  {
    fullName: { type: String, required: true, trim: true },
    mobile: { type: String, required: true },
    addressLine: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    pincode: { type: String, required: true },
    country: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const OrderSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    invoiceNumber: {
      type: String,
      trim: true,
      sparse: true,
    },
    invoiceUrl: { type: String, default: null, trim: true },
    invoicePublicId: { type: String, default: null, trim: true },
    items: {
      type: [OrderItemSchema],
      required: true,
      validate: {
        validator: (items: unknown[]) => items.length > 0,
        message: "An order must contain at least one item",
      },
    },
    shippingAddress: {
      type: ShippingAddressSnapshotSchema,
      required: true,
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    deliveryCharge: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalItems: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: "Total items must be an integer",
      },
    },
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    orderStatus: {
      type: String,
      enum: Object.values(OrderStatus),
      default: OrderStatus.PENDING,
    },
    paymentStatus: {
      type: String,
      enum: Object.values(PaymentStatus),
      default: PaymentStatus.PENDING,
    },
    paymentMethod: {
      type: String,
      enum: Object.values(PaymentMethod),
      default: PaymentMethod.ONLINE,
    },
    razorpayOrderId: {
      type: String,
      trim: true,
      sparse: true,
    },
    razorpayPaymentId: {
      type: String,
      trim: true,
      sparse: true,
    },
    razorpayFee: {
      type: Number,
      min: 0,
    },
    razorpayTax: {
      type: Number,
      min: 0,
    },
    razorpayRefundId: {
      type: String,
      trim: true,
      sparse: true,
    },
    refundStatus: {
      type: String,
      enum: Object.values(RefundStatus),
    },
    stockDeducted: {
      type: Boolean,
      default: false,
    },
    orderConfirmationNotificationSent: {
      type: Boolean,
      default: false,
    },
    orderFailureNotificationSent: {
      type: Boolean,
      default: false,
    },
    orderDeliveredNotificationSent: {
      type: Boolean,
      default: false,
    },
    orderCancellationNotificationSent: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true },
);

const Order = mongoose.models.Order || mongoose.model("Order", OrderSchema);

export default Order;