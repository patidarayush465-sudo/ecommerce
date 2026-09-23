import { NextResponse } from "next/server";

const ADMIN_ACCESS_TOKEN_COOKIE = "admin_access_token";

export async function POST() {
  const response = NextResponse.json({
    success: true,
    message: "Admin logout successful",
  });

  response.cookies.set(ADMIN_ACCESS_TOKEN_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}
