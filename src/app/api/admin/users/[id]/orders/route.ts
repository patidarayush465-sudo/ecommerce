import mongoose from "mongoose";
import { NextResponse } from "next/server";

import {
  AuthenticationError,
  AuthorizationError,
  getAdminUser,
} from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Order from "@/models/Order";
import User from "@/models/User";

type OrderRecord = {
  _id: { toString(): string };
  orderNumber: string;
  invoiceNumber?: string;
  totalItems: number;
  subtotal: number;
  deliveryCharge?: number;
  totalAmount: number;
  orderStatus: string;
  paymentStatus: string;
  paymentMethod: string;
  items: Array<{ productName: string; quantity: number; price: number }>;
  createdAt: Date;
  updatedAt: Date;
};

function handleError(error: unknown) {
  if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
    return NextResponse.json({ success: false, message: error.message }, { status: error.status });
  }

  console.error("Admin user orders fetch failed", error);
  return NextResponse.json({ success: false, message: "Unable to load orders" }, { status: 500 });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    getAdminUser(request);
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid user ID" }, { status: 400 });
    }

    const searchParams = new URL(request.url).searchParams;
    const page = Number(searchParams.get("page") ?? "1");
    const requestedLimit = Number(searchParams.get("limit") ?? "10");
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(requestedLimit) || requestedLimit < 1) {
      return NextResponse.json({ success: false, message: "Page and limit must be positive integers" }, { status: 400 });
    }

    const limit = Math.min(requestedLimit, 50);
    await connectToDatabase();
    const userExists = await User.exists({ _id: id });
    if (!userExists) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }

    const query = { user: new mongoose.Types.ObjectId(id) };
    const [orders, total] = await Promise.all([
      Order.find(query)
        .select("_id orderNumber invoiceNumber totalItems subtotal deliveryCharge totalAmount orderStatus paymentStatus paymentMethod items createdAt updatedAt")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Order.countDocuments(query),
    ]);

    return NextResponse.json({
      success: true,
      data: orders.map((order) => {
        const record = order as unknown as OrderRecord;
        return {
          _id: record._id.toString(),
          orderNumber: record.orderNumber,
          invoiceNumber: record.invoiceNumber ?? null,
          totalItems: record.totalItems,
          subtotal: record.subtotal,
          deliveryCharge: record.deliveryCharge ?? 0,
          totalAmount: record.totalAmount,
          orderStatus: record.orderStatus,
          paymentStatus: record.paymentStatus,
          paymentMethod: record.paymentMethod,
          items: record.items.map((item) => ({
            productName: item.productName,
            quantity: item.quantity,
            price: item.price,
          })),
          createdAt: record.createdAt,
          updatedAt: record.updatedAt,
        };
      }),
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error: unknown) {
    return handleError(error);
  }
}