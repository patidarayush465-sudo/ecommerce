import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { AuthenticationError, AuthorizationError, getAuthUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import Product from "@/models/Product";
import { UserRole } from "@/models/User";
import Wishlist from "@/models/Wishlist";

function authenticateCustomer(request: Request) {
  const authUser = getAuthUser(request);
  if (authUser.role !== UserRole.CUSTOMER) throw new AuthorizationError("Customer access required");
  return authUser.userId;
}

function handleWishlistError(error: unknown, message: string) {
  if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
    return NextResponse.json({ success: false, message: error.message }, { status: error.status });
  }
  console.error(message, error);
  return NextResponse.json({ success: false, message: "Unable to process wishlist" }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    const userId = authenticateCustomer(request);
    const body = (await request.json()) as { productId?: unknown };
    const productId = typeof body.productId === "string" ? body.productId : "";
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      return NextResponse.json({ success: false, message: "Invalid product ID" }, { status: 400 });
    }
    await connectToDatabase();
    const product = await Product.findOne({ _id: productId, isActive: true }).select("_id").lean();
    if (!product) return NextResponse.json({ success: false, message: "Product not found" }, { status: 404 });
    const existing = await Wishlist.findOne({ user: userId, product: productId }).select("_id").lean();
    if (existing) return NextResponse.json({ success: false, message: "Product is already in your wishlist" }, { status: 409 });
    await Wishlist.create({ user: userId, product: productId });
    return NextResponse.json({ success: true, message: "Product added to wishlist" }, { status: 201 });
  } catch (error: unknown) {
    if (error instanceof SyntaxError) return NextResponse.json({ success: false, message: "Invalid request body" }, { status: 400 });
    if ((error as { code?: number }).code === 11000) return NextResponse.json({ success: false, message: "Product is already in your wishlist" }, { status: 409 });
    return handleWishlistError(error, "Wishlist add failed");
  }
}

export async function GET(request: Request) {
  try {
    const userId = authenticateCustomer(request);
    await connectToDatabase();
    const entries = await Wishlist.find({ user: userId }).sort({ createdAt: -1 }).select("product createdAt").lean();
    const productIds = entries.map((entry) => entry.product);
    const products = await Product.find({ _id: { $in: productIds } }).select("_id name description images mrp discountPercent sellingPrice price stock isActive createdAt").lean();
    const productsById = new Map(products.map((product) => [product._id.toString(), product]));
    return NextResponse.json({
      success: true,
      data: entries.flatMap((entry) => {
        const product = productsById.get(entry.product.toString());
        if (!product) return [];
        return [{ productId: product._id.toString(), name: product.name, description: product.description, images: product.images, mrp: product.mrp, discountPercent: product.discountPercent, sellingPrice: product.sellingPrice ?? product.price, stock: product.stock, isActive: product.isActive, createdAt: product.createdAt, wishlistedAt: entry.createdAt }];
      }),
    });
  } catch (error: unknown) {
    return handleWishlistError(error, "Wishlist fetch failed");
  }
}