import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

import { connectToDatabase } from "@/lib/mongodb";
import User, { UserRole } from "@/models/User";

const ADMIN_SALT_ROUNDS = 12;

// Temporary diagnostic endpoint; remove it after the production login diagnosis is complete.
export async function POST(request: Request) {
  const diagnosticSecret = process.env.ADMIN_DIAGNOSTIC_SECRET;
  const providedSecret = request.headers.get("x-admin-diagnostic-secret");

  if (!diagnosticSecret || providedSecret !== diagnosticSecret) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  try {
    const body: unknown = await request.json();

    if (
      typeof body !== "object" ||
      body === null ||
      !("newPassword" in body) ||
      typeof body.newPassword !== "string" ||
      body.newPassword.length < 8
    ) {
      return NextResponse.json(
        { success: false, message: "newPassword must be at least 8 characters" },
        { status: 400 },
      );
    }

    const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();

    if (!adminEmail) {
      return NextResponse.json(
        { success: false, message: "Diagnostic unavailable" },
        { status: 500 },
      );
    }

    await connectToDatabase();

    const adminUser = await User.findOne({ email: adminEmail }).select(
      "_id role",
    );

    if (!adminUser) {
      return NextResponse.json(
        { success: false, message: "Admin user not found" },
        { status: 404 },
      );
    }

    if (adminUser.role !== UserRole.ADMIN) {
      return NextResponse.json(
        { success: false, message: "User is not an admin" },
        { status: 403 },
      );
    }

    const hashedPassword = await bcrypt.hash(
      body.newPassword,
      ADMIN_SALT_ROUNDS,
    );

    await User.updateOne(
      { _id: adminUser._id },
      { $set: { password: hashedPassword } },
      { timestamps: false },
    );

    return NextResponse.json({
      success: true,
      message: "Admin password updated successfully",
    });
  } catch {
    return NextResponse.json(
      { success: false, message: "Diagnostic unavailable" },
      { status: 500 },
    );
  }
}