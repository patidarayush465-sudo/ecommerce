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

const cachedOrderModel = mongoose.models.Order;
const hasDeliveryChargePath = cachedOrderModel
  ? Boolean(cachedOrderModel.schema.path("deliveryCharge"))
  : false;
const hasInvoiceNumberPath = cachedOrderModel
  ? Boolean(cachedOrderModel.schema.path("invoiceNumber"))
  : false;
const hasInvoiceUrlPath = cachedOrderModel
  ? Boolean(cachedOrderModel.schema.path("invoiceUrl"))
  : false;
const hasInvoicePublicIdPath = cachedOrderModel
  ? Boolean(cachedOrderModel.schema.path("invoicePublicId"))
  : false;
const cachedOrderItemsSchema = cachedOrderModel?.schema.path("items") as
  | { schema?: { path(path: string): unknown } }
  | undefined;
const hasOrderItemPricingPaths = cachedOrderItemsSchema?.schema
  ? ["mrp", "discountPercent"].every((path) =>
      Boolean(cachedOrderItemsSchema.schema?.path(path)),
    )
  : false;
const hasRazorpayFeePath = cachedOrderModel
  ? Boolean(cachedOrderModel.schema.path("razorpayFee"))
  : false;
const hasRazorpayTaxPath = cachedOrderModel
  ? Boolean(cachedOrderModel.schema.path("razorpayTax"))
  : false;
const hasOrderConfirmationNotificationSentPath = cachedOrderModel
  ? Boolean(cachedOrderModel.schema.path("orderConfirmationNotificationSent"))
  : false;
const hasOrderFailureNotificationSentPath = cachedOrderModel
  ? Boolean(cachedOrderModel.schema.path("orderFailureNotificationSent"))
  : false;
const hasOrderDeliveredNotificationSentPath = cachedOrderModel
  ? Boolean(cachedOrderModel.schema.path("orderDeliveredNotificationSent"))
  : false;
const hasOrderCancellationNotificationSentPath = cachedOrderModel
  ? Boolean(cachedOrderModel.schema.path("orderCancellationNotificationSent"))
  : false;

if (cachedOrderModel && (!hasDeliveryChargePath || !hasInvoiceNumberPath || !hasInvoiceUrlPath || !hasInvoicePublicIdPath || !hasOrderItemPricingPaths || !hasRazorpayFeePath || !hasRazorpayTaxPath || !hasOrderConfirmationNotificationSentPath || !hasOrderFailureNotificationSentPath || !hasOrderDeliveredNotificationSentPath || !hasOrderCancellationNotificationSentPath)) {
  delete mongoose.models.Order;
}

const Order =
  (hasDeliveryChargePath && hasInvoiceNumberPath && hasInvoiceUrlPath && hasInvoicePublicIdPath && hasOrderItemPricingPaths && hasRazorpayFeePath && hasRazorpayTaxPath && hasOrderConfirmationNotificationSentPath && hasOrderFailureNotificationSentPath && hasOrderDeliveredNotificationSentPath && hasOrderCancellationNotificationSentPath
    ? cachedOrderModel
    : undefined) ??
  mongoose.model("Order", OrderSchema);

const TypedOrder = Order as typeof mongoose.models.Order;

export default TypedOrder;