import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { AuthenticationError, AuthorizationError, getAuthUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { UserRole } from "@/models/User";
import Wishlist from "@/models/Wishlist";

function authenticateCustomer(request: Request) {
  const authUser = getAuthUser(request);
  if (authUser.role !== UserRole.CUSTOMER) throw new AuthorizationError("Customer access required");
  return authUser.userId;
}

export async function DELETE(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  try {
    const userId = authenticateCustomer(request);
    const { productId } = await params;
    if (!mongoose.Types.ObjectId.isValid(productId)) return NextResponse.json({ success: false, message: "Invalid product ID" }, { status: 400 });
    await connectToDatabase();
    const result = await Wishlist.deleteOne({ user: userId, product: productId });
    if (result.deletedCount === 0) return NextResponse.json({ success: false, message: "Product is not in your wishlist" }, { status: 404 });
    return NextResponse.json({ success: true, message: "Product removed from wishlist" });
  } catch (error: unknown) {
    if (error instanceof AuthenticationError || error instanceof AuthorizationError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    console.error("Wishlist removal failed", error);
    return NextResponse.json({ success: false, message: "Unable to remove product from wishlist" }, { status: 500 });
  }
}