import { NextResponse } from "next/server";

const CUSTOMER_ACCESS_TOKEN_COOKIE = "customer_access_token";

function isSecureRequest(request: Request) {
  return request.url.startsWith("https://") || request.headers.get("x-forwarded-proto")?.split(",")[0].trim() === "https";
}

export async function POST(request: Request) {
  const response = NextResponse.json({
    success: true,
    message: "Logged out successfully.",
  });

  response.cookies.set(CUSTOMER_ACCESS_TOKEN_COOKIE, "", {
    httpOnly: true,
    secure: isSecureRequest(request),
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });

  return response;
}