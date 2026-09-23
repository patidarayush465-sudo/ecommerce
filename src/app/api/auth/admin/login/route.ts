import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

import { generateAccessToken } from "@/lib/jwt";
import User, { UserRole } from "@/models/User";
import { adminLoginSchema } from "@/validations/auth.validation";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const validationResult = adminLoginSchema.safeParse(body);

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

    const { email, password } = validationResult.data;
    const normalizedEmail = email.toLowerCase();
    const { connectToDatabase } = await import("@/lib/mongodb");

    await connectToDatabase();

    const user = await User.findOne({ email: normalizedEmail }).select(
      "+password",
    );

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid email or password",
        },
        { status: 401 },
      );
    }

    if (user.role === UserRole.CUSTOMER) {
      return NextResponse.json(
        {
          success: false,
          message: "Please use the customer login",
        },
        { status: 403 },
      );
    }

    const passwordMatches = await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid email or password",
        },
        { status: 401 },
      );
    }

    if (!user.isEmailVerified) {
      return NextResponse.json(
        {
          success: false,
          message: "Admin email is not verified",
        },
        { status: 403 },
      );
    }

    const accessToken = generateAccessToken({
      userId: user._id.toString(),
      email: user.email,
      role: UserRole.ADMIN,
    });

    return NextResponse.json(
      {
        success: true,
        message: "Admin login successful",
        data: {
          user: {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
            role: user.role,
          },
          accessToken,
        },
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

    console.error("Admin login failed", error);

    return NextResponse.json(
      {
        success: false,
        message: "Internal server error",
      },
      { status: 500 },
    );
  }
}
