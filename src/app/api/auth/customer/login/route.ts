import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";

import { generateAccessToken } from "@/lib/jwt";
import User, { UserRole } from "@/models/User";
import { customerLoginSchema } from "@/validations/auth.validation";

const CUSTOMER_ACCESS_TOKEN_COOKIE = "customer_access_token";
const ACCESS_TOKEN_MAX_AGE_SECONDS = 24 * 60 * 60;

function isSecureRequest(request: Request) {
  return request.url.startsWith("https://") || request.headers.get("x-forwarded-proto")?.split(",")[0].trim() === "https";
}

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const validationResult = customerLoginSchema.safeParse(body);

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

    if (user.role === UserRole.ADMIN) {
      return NextResponse.json(
        {
          success: false,
          message: "Please use the admin login",
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
          message: "Please verify your email before login",
          isEmailVerified: false,
        },
        { status: 403 },
      );
    }

    const accessToken = generateAccessToken({
      userId: user._id.toString(),
      email: user.email,
      role: UserRole.CUSTOMER,
    });

    const response = NextResponse.json(
      {
        success: true,
        message: "Login successful",
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

    response.cookies.set(CUSTOMER_ACCESS_TOKEN_COOKIE, accessToken, {
      httpOnly: true,
      secure: isSecureRequest(request),
      sameSite: "lax",
      path: "/",
      maxAge: ACCESS_TOKEN_MAX_AGE_SECONDS,
    });

    console.info("Customer login session cookie created", {
      pathname: new URL(request.url).pathname,
      responseStatus: 200,
      setCookieGenerated: Boolean(response.headers.get("set-cookie")),
      secure: isSecureRequest(request),
    });

    return response;
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

    console.error("Customer login failed", error);

    return NextResponse.json(
      {
        success: false,
        message: "Internal server error",
      },
      { status: 500 },
    );
  }
}
