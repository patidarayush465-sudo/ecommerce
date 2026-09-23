import mongoose from "mongoose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  AuthenticationError,
  AuthorizationError,
  getAuthUser,
} from "@/lib/auth";
import Address from "@/models/Address";
import Cart from "@/models/Cart";
import Order, {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from "@/models/Order";
import Product from "@/models/Product";
import { deductOrderStock, InventoryError, restoreOrderStock } from "@/services/inventory.service";
import { sendOrderConfirmationNotifications } from "@/services/order-confirmation.service";
import { calculateDeliveryCharge, getProductPricing } from "@/services/pricing.service";
import { UserRole } from "@/models/User";
import { createOrderSchema } from "@/validations/order.validation";

const SHIPPING_ADDRESS_COOKIE = "customer_shipping_address";

type OrderProduct = {
  _id: mongoose.Types.ObjectId;
  name: string;
  price?: number;
  mrp?: number;
  discountPercent?: number;
  sellingPrice?: number;
  stock: number;
  images: Array<{ url: string; publicId: string }>;
  isActive: boolean;
};

type OrderAddress = {
  _id: { toString(): string };
  fullName: string;
  mobile: string;
  addressLine: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
};

function authenticateCustomer(request: Request) {
  const authUser = getAuthUser(request);

  if (authUser.role !== UserRole.CUSTOMER) {
    throw new AuthorizationError("Customer access required");
  }

  return authUser.userId;
}

function handleOrderError(error: unknown, logMessage: string) {
  if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: error.status },
    );
  }

  if (error instanceof InventoryError) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: error.status },
    );
  }

  if (error instanceof SyntaxError) {
    return NextResponse.json(
      { success: false, message: "Invalid request body" },
      { status: 400 },
    );
  }

  console.error(logMessage, error);

  return NextResponse.json(
    { success: false, message: "Internal server error" },
    { status: 500 },
  );
}

function generateOrderNumber() {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  return `ORD-${date}-${suffix}`;
}

function serializeOrder(order: {
  _id: { toString(): string };
  orderNumber: string;
  items: Array<{
    product: { toString(): string };
    productName: string;
    productImage: string;
    price: number;
    quantity: number;
    subtotal: number;
  }>;
  shippingAddress: OrderAddress;
  totalItems: number;
  subtotal: number;
  deliveryCharge?: number;
  totalAmount: number;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  stockDeducted: boolean;
  createdAt: Date;
}) {
  return {
    id: order._id.toString(),
    orderNumber: order.orderNumber,
    items: order.items.map((item) => ({
      product: item.product.toString(),
      productName: item.productName,
      productImage: item.productImage,
      price: item.price,
      quantity: item.quantity,
      subtotal: item.subtotal,
    })),
    shippingAddress: {
      fullName: order.shippingAddress.fullName,
      mobile: order.shippingAddress.mobile,
      addressLine: order.shippingAddress.addressLine,
      city: order.shippingAddress.city,
      state: order.shippingAddress.state,
      pincode: order.shippingAddress.pincode,
      country: order.shippingAddress.country,
    },
    totalItems: order.totalItems,
    subtotal: order.subtotal,
    deliveryCharge: order.deliveryCharge ?? 0,
    totalAmount: order.totalAmount,
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    stockDeducted: order.stockDeducted,
    createdAt: order.createdAt,
  };
}

function serializeOrderSummary(order: {
  _id: { toString(): string };
  orderNumber: string;
  totalItems: number;
  totalAmount: number;
  subtotal?: number;
  deliveryCharge?: number;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod: PaymentMethod;
  createdAt: Date;
}) {
  return {
    id: order._id.toString(),
    orderNumber: order.orderNumber,
    totalItems: order.totalItems,
    totalAmount: order.totalAmount,
    subtotal: order.subtotal,
    deliveryCharge: order.deliveryCharge ?? 0,
    orderStatus: order.orderStatus,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    createdAt: order.createdAt,
  };
}

async function findSelectedShippingAddress(userId: string) {
  const cookieStore = await cookies();
  const selectedAddressId = cookieStore.get(SHIPPING_ADDRESS_COOKIE)?.value;
  const validAddressId = selectedAddressId &&
    mongoose.Types.ObjectId.isValid(selectedAddressId)
    ? selectedAddressId
    : null;

  const selectedAddress = validAddressId
    ? await Address.findOne({ _id: validAddressId, user: userId })
    : null;

  return selectedAddress ?? Address.findOne({ user: userId, isDefault: true });
}

export async function POST(request: Request) {
  let createdOrderId: string | undefined;

  try {
    const userId = authenticateCustomer(request);
    const body: unknown = await request.json();
    const validationResult = createOrderSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid order data",
          errors: validationResult.error.issues,
        },
        { status: 400 },
      );
    }

    const { paymentMethod } = validationResult.data;
    const { connectToDatabase } = await import("@/lib/mongodb");
    await connectToDatabase();

    const cart = await Cart.findOne({ user: userId });

    if (!cart || cart.items.length === 0) {
      return NextResponse.json(
        { success: false, message: "Cart is empty" },
        { status: 400 },
      );
    }

    const shippingAddress = await findSelectedShippingAddress(userId);

    if (!shippingAddress) {
      return NextResponse.json(
        { success: false, message: "Please select a shipping address first" },
        { status: 400 },
      );
    }

    const productIds = cart.items.map(
      (item: { product: { toString(): string }; quantity: number }) =>
        item.product.toString(),
    );
    const products = await Product.find({ _id: { $in: productIds } }).select(
      "_id name mrp discountPercent sellingPrice price stock images isActive",
    );
    const productsById = new Map(products.map((product) => [product._id.toString(), product]));
    const orderItems: Array<{
      product: mongoose.Types.ObjectId;
      productName: string;
      productImage: string;
      mrp: number;
      discountPercent: number;
      price: number;
      quantity: number;
      subtotal: number;
    }> = [];

    let totalItems = 0;
    let subtotal = 0;

    for (const cartItem of cart.items) {
      const product = productsById.get(cartItem.product.toString()) as OrderProduct | undefined;

      if (!product) {
        return NextResponse.json(
          { success: false, message: `Product ${cartItem.product.toString()} is no longer available` },
          { status: 400 },
        );
      }

      if (!product.isActive) {
        return NextResponse.json(
          { success: false, message: `Product ${product.name} is inactive` },
          { status: 400 },
        );
      }

      if (product.stock < cartItem.quantity) {
        return NextResponse.json(
          { success: false, message: `Insufficient stock for ${product.name}` },
          { status: 400 },
        );
      }

      const pricing = getProductPricing(product);
      const sellingPrice = pricing.sellingPrice;
      const itemSubtotal = sellingPrice * cartItem.quantity;
      orderItems.push({
        product: product._id,
        productName: product.name,
        productImage: product.images[0]?.url ?? "",
        mrp: pricing.mrp,
        discountPercent: pricing.discountPercent,
        price: sellingPrice,
        quantity: cartItem.quantity,
        subtotal: itemSubtotal,
      });
      totalItems += cartItem.quantity;
      subtotal += itemSubtotal;
    }

    const deliveryCharge = calculateDeliveryCharge(subtotal);
    const totalAmount = subtotal + deliveryCharge;

    const order = await Order.create({
      user: userId,
      orderNumber: generateOrderNumber(),
      items: orderItems,
      shippingAddress: {
        fullName: shippingAddress.fullName,
        mobile: shippingAddress.mobile,
        addressLine: shippingAddress.addressLine,
        city: shippingAddress.city,
        state: shippingAddress.state,
        pincode: shippingAddress.pincode,
        country: shippingAddress.country,
      },
      subtotal,
      deliveryCharge,
      totalItems,
      totalAmount,
      orderStatus:
        paymentMethod === PaymentMethod.COD
          ? OrderStatus.CONFIRMED
          : OrderStatus.PENDING,
      paymentStatus: PaymentStatus.PENDING,
      paymentMethod,
      stockDeducted: false,
    });
    const orderId = order._id.toString();
    createdOrderId = orderId;

    if (paymentMethod === PaymentMethod.COD) {
      try {
        await deductOrderStock(orderId);
        order.stockDeducted = true;
      } catch (stockError: unknown) {
        await Order.deleteOne({ _id: createdOrderId, user: userId });
        throw stockError;
      }
    }

    try {
      cart.items = [];
      await cart.save();
    } catch (clearError: unknown) {
      if (paymentMethod === PaymentMethod.COD && order.stockDeducted) {
        try {
          await restoreOrderStock(orderId);
        } catch (restoreError: unknown) {
          console.error("Order stock restoration after cart clear failure failed", restoreError);
        }
      }

      try {
        await Order.deleteOne({ _id: createdOrderId, user: userId });
      } catch (rollbackError: unknown) {
        console.error("Order rollback after cart clear failure failed", rollbackError);
      }

      console.error("Cart clear after order creation failed", clearError);
      return NextResponse.json(
        { success: false, message: "Unable to complete order creation" },
        { status: 500 },
      );
    }

    if (paymentMethod === PaymentMethod.COD) {
      await sendOrderConfirmationNotifications(orderId);
    }

    return NextResponse.json(
      {
        success: true,
        message: "Order created successfully",
        data: serializeOrder(order),
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    return handleOrderError(error, "Order creation failed");
  }
}

export async function GET(request: Request) {
  try {
    const userId = authenticateCustomer(request);
    const searchParams = new URL(request.url).searchParams;
    const requestedPage = Number(searchParams.get("page") ?? "1");
    const requestedLimit = Number(searchParams.get("limit") ?? "10");

    if (
      !Number.isInteger(requestedPage) ||
      requestedPage < 1 ||
      !Number.isInteger(requestedLimit) ||
      requestedLimit < 1
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid pagination parameters" },
        { status: 400 },
      );
    }

    const limit = Math.min(requestedLimit, 100);
    const skip = (requestedPage - 1) * limit;
    const { connectToDatabase } = await import("@/lib/mongodb");
    await connectToDatabase();

    const [orders, total] = await Promise.all([
      Order.find({ user: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select("_id orderNumber totalItems subtotal deliveryCharge totalAmount orderStatus paymentStatus paymentMethod createdAt")
        .lean(),
      Order.countDocuments({ user: userId }),
    ]);

    return NextResponse.json({
      success: true,
      message: "Orders fetched successfully",
      data: orders.map(serializeOrderSummary),
      pagination: {
        page: requestedPage,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error: unknown) {
    return handleOrderError(error, "Order listing failed");
  }
}