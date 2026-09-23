import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { AuthenticationError, AuthorizationError, getAuthUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { UserRole } from "@/models/User";
import Wishlist from "@/models/Wishlist";

export async function GET(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  try {
    const authUser = getAuthUser(request);
    if (authUser.role !== UserRole.CUSTOMER) throw new AuthorizationError("Customer access required");
    const { productId } = await params;
    if (!mongoose.Types.ObjectId.isValid(productId)) return NextResponse.json({ success: false, message: "Invalid product ID" }, { status: 400 });
    await connectToDatabase();
    const entry = await Wishlist.exists({ user: authUser.userId, product: productId });
    return NextResponse.json({ success: true, isWishlisted: Boolean(entry) });
  } catch (error: unknown) {
    if (error instanceof AuthenticationError || error instanceof AuthorizationError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    console.error("Wishlist check failed", error);
    return NextResponse.json({ success: false, message: "Unable to check wishlist" }, { status: 500 });
  }
}