import { NextResponse } from "next/server";
import { z } from "zod";

import { generateEmailVerificationToken } from "@/lib/token";
import User from "@/models/User";
import { sendEmail } from "@/services/email.service";

const resendVerificationSchema = z
  .object({
    email: z.string().trim().email(),
  })
  .strict();

const VERIFICATION_EXPIRATION_MS = 24 * 60 * 60 * 1000;

function getVerificationUrl(rawToken: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");

  if (!appUrl) {
    throw new Error("NEXT_PUBLIC_APP_URL is not configured");
  }

  return `${appUrl}/api/auth/verify-email?token=${encodeURIComponent(rawToken)}`;
}

function getVerificationEmailHtml(name: string, verificationUrl: string): string {
  return `
    <h1>Welcome to E-commerce Application, ${name}!</h1>
    <p>Please verify your email address to activate your account.</p>
    <p><a href="${verificationUrl}">Verify Email</a></p>
    <p>This verification link expires in 24 hours.</p>
  `;
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const validationResult = resendVerificationSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid email address",
          errors: validationResult.error.issues,
        },
        { status: 400 },
      );
    }

    const email = validationResult.data.email.toLowerCase();
    const { connectToDatabase } = await import("@/lib/mongodb");
    await connectToDatabase();

    const user = await User.findOne({ email });

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: "User not found",
        },
        { status: 404 },
      );
    }

    if (user.isEmailVerified) {
      return NextResponse.json(
        {
          success: false,
          message: "Email is already verified",
        },
        { status: 400 },
      );
    }

    const { rawToken, hashedToken } = generateEmailVerificationToken();
    user.emailVerificationToken = hashedToken;
    user.emailVerificationExpires = new Date(
      Date.now() + VERIFICATION_EXPIRATION_MS,
    );
    await user.save();

    const verificationUrl = getVerificationUrl(rawToken);
    await sendEmail({
      to: user.email,
      subject: "Verify your email address",
      html: getVerificationEmailHtml(user.name, verificationUrl),
    });

    return NextResponse.json(
      {
        success: true,
        message: "Verification email sent successfully",
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid request body",
        },
        { status: 400 },
      );
    }

    console.error("Resend verification email failed", error);

    return NextResponse.json(
      {
        success: false,
        message: "Internal server error",
      },
      { status: 500 },
    );
  }
}
