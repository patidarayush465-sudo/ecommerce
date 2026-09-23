import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

import { generateEmailVerificationToken } from "@/lib/token";
import User, { UserRole } from "@/models/User";
import { sendWelcomeEmail } from "@/services/email.service";
import { sendPushNotificationToUser } from "@/services/notification.service";
import { customerSignupSchema } from "@/validations/auth.validation";

const SALT_ROUNDS = 12;
const VERIFICATION_EXPIRATION_MS = 24 * 60 * 60 * 1000;

type MongoError = {
  code?: number;
};

function getVerificationUrl(rawToken: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");

  if (!appUrl) {
    throw new Error("NEXT_PUBLIC_APP_URL is not configured");
  }

  return `${appUrl}/api/auth/verify-email?token=${encodeURIComponent(rawToken)}`;
}



export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const validationResult = customerSignupSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid request body",
          errors: validationResult.error.issues,
        },
        { status: 400 },
      );
    }

    const { name, email, password } = validationResult.data;
    const normalizedEmail = email.toLowerCase();
    const { rawToken, hashedToken } = generateEmailVerificationToken();
    const emailVerificationExpires = new Date(
      Date.now() + VERIFICATION_EXPIRATION_MS,
    );

    const { connectToDatabase } = await import("@/lib/mongodb");
    await connectToDatabase();

    const existingUser = await User.findOne({ email: normalizedEmail }).select(
      "_id",
    );

    if (existingUser) {
      return NextResponse.json(
        {
          success: false,
          message: "Email already exists",
        },
        { status: 409 },
      );
    }

    const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await User.create({
      name,
      email: normalizedEmail,
      password: hashedPassword,
      role: UserRole.CUSTOMER,
      isEmailVerified: false,
      emailVerificationToken: hashedToken,
      emailVerificationExpires,
    });

    try {
      const verificationUrl = getVerificationUrl(rawToken);
      await sendWelcomeEmail(user.email, user.name, verificationUrl);
      console.info("Customer registration welcome email sent", { userId: user._id.toString() });
    } catch (error: unknown) {
      console.error("Customer registration welcome email failed", {
        userId: user._id.toString(),
        error: error instanceof Error ? error.message : "Unknown email error",
      });
    }

    try {
      const pushResult = await sendPushNotificationToUser(user._id.toString(), {
        title: "Welcome to E-commerce Application",
        body: "Your account has been created successfully.",
        data: { type: "REGISTRATION", action: "ACCOUNT_CREATED" },
      });
      console.info("Customer registration push processed", {
        userId: user._id.toString(),
        successCount: pushResult.successCount,
        failureCount: pushResult.failureCount,
      });
    } catch (error: unknown) {
      console.error("Customer registration push failed", {
        userId: user._id.toString(),
        error: error instanceof Error ? error.message : "Unknown push error",
      });
    }

    return NextResponse.json(
      {
        success: true,
        message: "Customer registered successfully",
        data: {
          id: user._id.toString(),
          name: user.name,
          email: user.email,
          role: user.role,
          isEmailVerified: user.isEmailVerified,
        },
      },
      { status: 201 },
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

    if ((error as MongoError).code === 11000) {
      return NextResponse.json(
        {
          success: false,
          message: "Email already exists",
        },
        { status: 409 },
      );
    }

    console.error("Customer signup failed", error);

    return NextResponse.json(
      {
        success: false,
        message: "Internal server error",
      },
      { status: 500 },
    );
  }
}
