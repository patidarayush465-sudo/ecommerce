import { NextResponse } from "next/server";

const ADMIN_ACCESS_TOKEN_COOKIE = "admin_access_token";
const ACCESS_TOKEN_MAX_AGE_SECONDS = 24 * 60 * 60;

type LoginResponse = {
  message?: string;
  data?: {
    user?: {
      id: string;
      name: string;
      email: string;
      role: string;
    };
    accessToken?: string;
  };
};

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    const loginResponse = await fetch(
      new URL("/api/auth/admin/login", request.url),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        cache: "no-store",
      },
    );
    const responseBody = (await loginResponse.json()) as LoginResponse;

    if (!loginResponse.ok) {
      return NextResponse.json(responseBody, { status: loginResponse.status });
    }

    const accessToken = responseBody.data?.accessToken;

    if (!accessToken) {
      return NextResponse.json(
        {
          success: false,
          message: "Login response did not include an access token",
        },
        { status: 500 },
      );
    }

    const response = NextResponse.json({
      success: true,
      message: responseBody.message ?? "Admin login successful",
      data: { user: responseBody.data?.user },
    });

    response.cookies.set(ADMIN_ACCESS_TOKEN_COOKIE, accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: ACCESS_TOKEN_MAX_AGE_SECONDS,
    });

    return response;
  } catch (error: unknown) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { success: false, message: "Invalid request body" },
        { status: 400 },
      );
    }

    console.error("Admin login session failed", error);

    return NextResponse.json(
      { success: false, message: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
