import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { NextResponse } from "next/server";

import { connectToDatabase } from "@/lib/mongodb";
import User, { UserRole } from "@/models/User";
import { customerResetPasswordSchema } from "@/validations/auth.validation";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const validationResult = customerResetPasswordSchema.safeParse(body);
    if (!validationResult.success) return NextResponse.json({ success: false, message: "Invalid password reset data", errors: validationResult.error.issues }, { status: 400 });

    const { token, password } = validationResult.data;
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    await connectToDatabase();
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.findOneAndUpdate(
      { role: UserRole.CUSTOMER, passwordResetToken: hashedToken, passwordResetExpires: { $gt: new Date() } },
      { $set: { password: passwordHash }, $unset: { passwordResetToken: 1, passwordResetExpires: 1 } },
      { returnDocument: "after" },
    ).select("_id");

    if (!user) return NextResponse.json({ success: false, message: "Invalid or expired password reset link." }, { status: 400 });
    return NextResponse.json({ success: true, message: "Password reset successfully." });
  } catch (error: unknown) {
    if (error instanceof SyntaxError) return NextResponse.json({ success: false, message: "Invalid request body" }, { status: 400 });
    console.error("Customer password reset failed", error);
    return NextResponse.json({ success: false, message: "Unable to reset password right now." }, { status: 500 });
  }
}