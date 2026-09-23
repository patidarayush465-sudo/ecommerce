import mongoose from "mongoose";
import { NextResponse } from "next/server";

import {
  AuthenticationError,
  AuthorizationError,
  getAuthUser,
} from "@/lib/auth";
import { uploadInvoicePdfToCloudinary } from "@/lib/cloudinary";
import { connectToDatabase } from "@/lib/mongodb";
import Order from "@/models/Order";
import User, { UserRole } from "@/models/User";
import {
  generateCustomerInvoicePdf,
  type CustomerInvoice,
  type CustomerInvoiceOrder,
} from "@/services/invoice.service";

function authenticateCustomer(request: Request) {
  const authUser = getAuthUser(request);
  if (authUser.role !== UserRole.CUSTOMER) throw new AuthorizationError("Customer access required");
  return authUser.userId;
}

function createInvoiceNumber(date: Date) {
  const datePart = date.toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 4).toUpperCase();
  return `INV-${datePart}-${suffix}`;
}

async function ensureInvoiceNumber(order: CustomerInvoiceOrder & { _id: { toString(): string }; invoiceNumber?: string }) {
  if (order.invoiceNumber) return order.invoiceNumber;
  const invoiceNumber = createInvoiceNumber(order.createdAt);
  await Order.updateOne({ _id: order._id, invoiceNumber: { $exists: false } }, { $set: { invoiceNumber } });
  const savedOrder = await Order.findById(order._id).select("invoiceNumber").lean();
  return savedOrder?.invoiceNumber ?? invoiceNumber;
}

async function fetchStoredInvoice(url: string) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Stored invoice fetch failed with status ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

function handleInvoiceError(error: unknown) {
  if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
    return NextResponse.json({ success: false, message: error.message }, { status: error.status });
  }
  console.error("Customer invoice generation failed", error);
  return NextResponse.json({ success: false, message: "Unable to generate invoice" }, { status: 500 });
}

export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  try {
    const userId = authenticateCustomer(request);
    const { orderId } = await params;
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return NextResponse.json({ success: false, message: "Invalid order ID" }, { status: 400 });
    }
    await connectToDatabase();
    const order = await Order.findOne({ _id: orderId, user: userId }).lean() as CustomerInvoiceOrder & { _id: { toString(): string }; invoiceUrl?: string | null; invoicePublicId?: string | null } | null;
    if (!order) return NextResponse.json({ success: false, message: "Order not found" }, { status: 404 });
    const customer = await User.findById(userId).select("name email mobile").lean() as CustomerInvoice | null;
    if (!customer) return NextResponse.json({ success: false, message: "Customer not found" }, { status: 404 });
    const invoiceNumber = await ensureInvoiceNumber(order);
    let pdf: Buffer;
    if (order.invoiceUrl) {
      pdf = await fetchStoredInvoice(order.invoiceUrl);
    } else {
      pdf = await generateCustomerInvoicePdf({ ...order, invoiceNumber }, customer);
      const cloudinaryInvoice = await uploadInvoicePdfToCloudinary(pdf, "ecommerce/invoices", order.orderNumber);
      await Order.updateOne(
        { _id: order._id, user: userId },
        { $set: { invoiceUrl: cloudinaryInvoice.secure_url, invoicePublicId: cloudinaryInvoice.public_id } },
      );
    }
    const download = new URL(request.url).searchParams.get("download") === "1";
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${invoiceNumber}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error: unknown) {
    return handleInvoiceError(error);
  }
}