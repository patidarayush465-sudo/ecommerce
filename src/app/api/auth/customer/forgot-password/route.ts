import { NextResponse } from "next/server";

import { connectToDatabase } from "@/lib/mongodb";
import { generatePasswordResetToken } from "@/lib/token";
import User, { UserRole } from "@/models/User";
import { sendPasswordResetEmail } from "@/services/email.service";
import { customerForgotPasswordSchema } from "@/validations/auth.validation";

const GENERIC_MESSAGE = "If an account exists with this email, a password reset link has been sent.";
const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

function getResetUrl(rawToken: string) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (!appUrl) throw new Error("NEXT_PUBLIC_APP_URL is not configured");
  return `${appUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const validationResult = customerForgotPasswordSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json({ success: false, message: "Invalid email address", errors: validationResult.error.issues }, { status: 400 });
    }

    await connectToDatabase();
    const user = await User.findOne({ email: validationResult.data.email.toLowerCase(), role: UserRole.CUSTOMER }).select("_id email");
    if (user) {
      const { rawToken, hashedToken } = generatePasswordResetToken();
      const passwordResetExpires = new Date(Date.now() + RESET_TOKEN_TTL_MS);
      await User.updateOne({ _id: user._id, role: UserRole.CUSTOMER }, { $set: { passwordResetToken: hashedToken, passwordResetExpires } });
      try {
        await sendPasswordResetEmail(user.email, getResetUrl(rawToken));
      } catch (error: unknown) {
        await User.updateOne({ _id: user._id, passwordResetToken: hashedToken }, { $unset: { passwordResetToken: 1, passwordResetExpires: 1 } });
        console.error("Password reset email failed", error instanceof Error ? error.message : "Unknown email error");
      }
    }

    return NextResponse.json({ success: true, message: GENERIC_MESSAGE });
  } catch (error: unknown) {
    if (error instanceof SyntaxError) return NextResponse.json({ success: false, message: "Invalid request body" }, { status: 400 });
    console.error("Customer forgot-password request failed", error);
    return NextResponse.json({ success: true, message: GENERIC_MESSAGE });
  }
}