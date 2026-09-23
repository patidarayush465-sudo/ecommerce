import { NextResponse } from "next/server";

import {
  AuthenticationError,
  AuthorizationError,
  getAdminUser,
} from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Category from "@/models/Category";
import Order, {
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
} from "@/models/Order";
import Product from "@/models/Product";
import SubCategory from "@/models/SubCategory";
import User, { UserRole } from "@/models/User";

const ORDER_STATUS_KEYS = {
  [OrderStatus.PENDING]: "pending",
  [OrderStatus.CONFIRMED]: "confirmed",
  [OrderStatus.PROCESSING]: "processing",
  [OrderStatus.SHIPPED]: "shipped",
  [OrderStatus.DELIVERED]: "delivered",
  [OrderStatus.CANCELLED]: "cancelled",
} as const;

type OrderStatusKey = (typeof ORDER_STATUS_KEYS)[OrderStatus];

type StatusCount = { _id: OrderStatus; count: number };
type RevenueResult = { _id: null; total: number };
type PaymentFacetResult = {
  paidOnline: Array<{ count: number }>;
  cod: Array<{ count: number }>;
  failed: Array<{ count: number }>;
  refunded: Array<{ count: number }>;
};

type RecentOrder = {
  _id: { toString(): string };
  orderNumber: string;
  totalAmount: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  orderStatus: OrderStatus;
  createdAt: Date;
  customer?: { name: string; email: string };
};

type RecentUser = {
  _id: { toString(): string };
  name: string;
  email: string;
  isEmailVerified: boolean;
  createdAt: Date;
};

type LowStockProduct = {
  _id: { toString(): string };
  name: string;
  stock: number;
  sellingPrice?: number;
};

function emptyOrderStatus() {
  return {
    pending: 0,
    confirmed: 0,
    processing: 0,
    shipped: 0,
    delivered: 0,
    cancelled: 0,
  };
}

function handleDashboardError(error: unknown) {
  if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
    return NextResponse.json(
      { success: false, message: error.message },
      { status: error.status },
    );
  }

  console.error("Admin dashboard fetch failed", error);
  return NextResponse.json(
    { success: false, message: "Unable to load dashboard" },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  try {
    getAdminUser(request);
    await connectToDatabase();

    const [
      totalUsers,
      totalProducts,
      totalCategories,
      totalSubcategories,
      totalOrders,
      revenueResult,
      orderStatusCounts,
      paymentCounts,
      recentOrders,
      recentUsers,
      lowStockProducts,
    ] = await Promise.all([
      User.countDocuments({ role: UserRole.CUSTOMER }),
      Product.countDocuments(),
      Category.countDocuments(),
      SubCategory.countDocuments(),
      Order.countDocuments(),
      Order.aggregate<RevenueResult>([
        {
          $match: {
            paymentStatus: PaymentStatus.PAID,
            orderStatus: { $ne: OrderStatus.CANCELLED },
          },
        },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]),
      Order.aggregate<StatusCount>([
        { $group: { _id: "$orderStatus", count: { $sum: 1 } } },
      ]),
      Order.aggregate<PaymentFacetResult>([
        {
          $facet: {
            paidOnline: [
              {
                $match: {
                  paymentMethod: PaymentMethod.ONLINE,
                  paymentStatus: PaymentStatus.PAID,
                },
              },
              { $count: "count" },
            ],
            cod: [
              { $match: { paymentMethod: PaymentMethod.COD } },
              { $count: "count" },
            ],
            failed: [
              { $match: { paymentStatus: PaymentStatus.FAILED } },
              { $count: "count" },
            ],
            refunded: [
              { $match: { paymentStatus: PaymentStatus.REFUNDED } },
              { $count: "count" },
            ],
          },
        },
      ]),
      Order.aggregate<RecentOrder>([
        { $sort: { createdAt: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: "users",
            localField: "user",
            foreignField: "_id",
            as: "customer",
          },
        },
        {
          $unwind: {
            path: "$customer",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            _id: 1,
            orderNumber: 1,
            totalAmount: 1,
            paymentMethod: 1,
            paymentStatus: 1,
            orderStatus: 1,
            createdAt: 1,
            customer: { name: 1, email: 1 },
          },
        },
      ]),
      User.find({ role: UserRole.CUSTOMER })
        .select("_id name email isEmailVerified createdAt")
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      Product.find({ stock: { $lte: 5 }, isActive: true })
        .select("_id name stock sellingPrice")
        .sort({ stock: 1, name: 1 })
        .limit(5)
        .lean(),
    ]);

    const orderStatus = emptyOrderStatus();
    for (const entry of orderStatusCounts) {
      const key = ORDER_STATUS_KEYS[entry._id];
      if (key) orderStatus[key as OrderStatusKey] = entry.count;
    }

    const paymentSummary = paymentCounts[0];

    const getPaymentCount = (entries: Array<{ count: number }> | undefined) => entries?.[0]?.count ?? 0;

    return NextResponse.json({
      success: true,
      data: {
        stats: {
          totalUsers,
          totalProducts,
          totalCategories,
          totalSubcategories,
          totalOrders,
          totalRevenue: revenueResult[0]?.total ?? 0,
        },
        orderStatus,
        payments: {
          paidOnline: getPaymentCount(paymentSummary?.paidOnline),
          cod: getPaymentCount(paymentSummary?.cod),
          failed: getPaymentCount(paymentSummary?.failed),
          refunded: getPaymentCount(paymentSummary?.refunded),
        },
        recentOrders: recentOrders.map((order) => ({
          id: order._id.toString(),
          orderNumber: order.orderNumber,
          customer: order.customer ?? { name: "Unknown customer", email: "" },
          totalAmount: order.totalAmount,
          paymentMethod: order.paymentMethod,
          paymentStatus: order.paymentStatus,
          orderStatus: order.orderStatus,
          createdAt: order.createdAt,
        })),
        recentUsers: (recentUsers as RecentUser[]).map((user) => ({
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          isEmailVerified: user.isEmailVerified,
          createdAt: user.createdAt,
        })),
        lowStockProducts: (lowStockProducts as LowStockProduct[]).map((product) => ({
          id: product._id.toString(),
          name: product.name,
          stock: product.stock,
          sellingPrice: product.sellingPrice ?? 0,
        })),
      },
    });
  } catch (error: unknown) {
    return handleDashboardError(error);
  }
}
