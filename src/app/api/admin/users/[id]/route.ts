import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { AuthenticationError, AuthorizationError, getAdminUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import User, { UserRole } from "@/models/User";

type SafeUser = {
  _id: { toString(): string };
  name: string;
  email: string;
  mobile?: string;
  role: UserRole;
  isEmailVerified: boolean;
  profileImage?: { url?: string; publicId?: string };
  dateOfBirth?: Date;
  createdAt: Date;
  updatedAt: Date;
};

function serializeUser(user: SafeUser) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    mobile: user.mobile ?? "",
    role: user.role,
    isEmailVerified: user.isEmailVerified,
    profileImage: user.profileImage?.url ?? "",
    dateOfBirth: user.dateOfBirth ?? null,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function handleUserError(error: unknown) {
  if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
    return NextResponse.json({ success: false, message: error.message }, { status: error.status });
  }

  console.error("Admin user detail fetch failed", error);
  return NextResponse.json({ success: false, message: "Unable to load user" }, { status: 500 });
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    getAdminUser(request);
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ success: false, message: "Invalid user ID" }, { status: 400 });
    }

    await connectToDatabase();
    const user = await User.findById(id)
      .select("_id name email mobile role isEmailVerified profileImage dateOfBirth createdAt updatedAt")
      .lean() as SafeUser | null;

    if (!user) return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: serializeUser(user) });
  } catch (error: unknown) {
    return handleUserError(error);
  }
}
