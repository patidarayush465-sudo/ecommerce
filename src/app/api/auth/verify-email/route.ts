import crypto from "node:crypto";
import { NextResponse } from "next/server";

import User from "@/models/User";

export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token");

    if (!token) {
      return NextResponse.json(
        {
          success: false,
          message: "Verification token is required",
        },
        { status: 400 },
      );
    }

    const hashedToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const { connectToDatabase } = await import("@/lib/mongodb");
    await connectToDatabase();

    const user = await User.findOne({
      emailVerificationToken: hashedToken,
    }).select("+emailVerificationToken +emailVerificationExpires");

    if (
      !user ||
      !user.emailVerificationExpires ||
      user.emailVerificationExpires.getTime() < Date.now()
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid or expired verification link",
        },
        { status: 400 },
      );
    }

    user.isEmailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    return NextResponse.json(
      {
        success: true,
        message: "Email verified successfully",
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    console.error("Email verification failed", error);

    return NextResponse.json(
      {
        success: false,
        message: "Internal server error",
      },
      { status: 500 },
    );
  }
}
