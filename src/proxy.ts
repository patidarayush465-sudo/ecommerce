import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { verifyAccessToken } from "@/lib/jwt";
import type { JWTPayload } from "@/types/auth";

const CUSTOMER_ACCESS_TOKEN_COOKIE = "customer_access_token";
const ADMIN_ACCESS_TOKEN_COOKIE = "admin_access_token";
const NOTIFICATION_AUDIENCE_HEADER = "x-notification-audience";

function getAuthenticatedUser(
  request: NextRequest,
  cookieName: string,
): JWTPayload | null {
  const token = request.cookies.get(cookieName)?.value;

  if (!token) {
    return null;
  }

  try {
    return verifyAccessToken(token);
  } catch {
    return null;
  }
}

function redirectTo(request: NextRequest, destination: string) {
  return NextResponse.redirect(new URL(destination, request.url));
}

function logCustomerRouteDecision(request: NextRequest, decision: "allowed" | "redirected") {
  console.info("Customer proxy authentication decision", {
    pathname: request.nextUrl.pathname,
    customerAccessTokenCookieExists: Boolean(request.cookies.get(CUSTOMER_ACCESS_TOKEN_COOKIE)?.value),
    adminAccessTokenCookieExists: Boolean(request.cookies.get(ADMIN_ACCESS_TOKEN_COOKIE)?.value),
    decision,
  });
}

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (pathname === "/api/customer/notifications/token") {
    const notificationAudience = request.headers.get(NOTIFICATION_AUDIENCE_HEADER);
    const cookieName = notificationAudience === "customer"
      ? CUSTOMER_ACCESS_TOKEN_COOKIE
      : notificationAudience === "admin"
        ? ADMIN_ACCESS_TOKEN_COOKIE
        : null;
    const notificationUser = cookieName
      ? getAuthenticatedUser(request, cookieName)
      : null;

    if (
      (notificationAudience === "customer" && notificationUser?.role === "CUSTOMER") ||
      (notificationAudience === "admin" && notificationUser?.role === "ADMIN")
    ) {
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set(
        "authorization",
        `Bearer ${request.cookies.get(cookieName!)?.value}`,
      );
      return NextResponse.next({
        request: { headers: requestHeaders },
      });
    }
  }

  if (pathname.startsWith("/api/customer/")) {
    const customerUser = getAuthenticatedUser(
      request,
      CUSTOMER_ACCESS_TOKEN_COOKIE,
    );

    if (customerUser?.role === "CUSTOMER") {
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set(
        "authorization",
        `Bearer ${request.cookies.get(CUSTOMER_ACCESS_TOKEN_COOKIE)?.value}`,
      );
      return NextResponse.next({
        request: { headers: requestHeaders },
      });
    }
  }

  if (pathname.startsWith("/api/admin/")) {
    const adminUser = getAuthenticatedUser(request, ADMIN_ACCESS_TOKEN_COOKIE);

    if (adminUser?.role === "ADMIN") {
      const requestHeaders = new Headers(request.headers);
      requestHeaders.set(
        "authorization",
        `Bearer ${request.cookies.get(ADMIN_ACCESS_TOKEN_COOKIE)?.value}`,
      );
      return NextResponse.next({
        request: { headers: requestHeaders },
      });
    }
  }

  if (pathname === "/admin/login") {
    return NextResponse.next();
  }

  if (pathname === "/admin" || pathname.startsWith("/admin/")) {
    const adminUser = getAuthenticatedUser(request, ADMIN_ACCESS_TOKEN_COOKIE);
    const customerUser = getAuthenticatedUser(
      request,
      CUSTOMER_ACCESS_TOKEN_COOKIE,
    );

    if (!adminUser && customerUser?.role === "CUSTOMER") {
      return redirectTo(request, "/admin/login");
    }

    if (!adminUser) {
      return redirectTo(request, "/admin/login");
    }

    if (adminUser.role !== "ADMIN") {
      return redirectTo(request, "/admin/login");
    }
  }

  if (
    pathname === "/customer/home" ||
    pathname.startsWith("/customer/home/") ||
    pathname === "/customer/cart" ||
    pathname.startsWith("/customer/cart/") ||
    pathname === "/customer/checkout" ||
    pathname.startsWith("/customer/checkout/") ||
    pathname === "/customer/orders" ||
    pathname.startsWith("/customer/orders/") ||
    pathname === "/customer/order-success" ||
    pathname.startsWith("/customer/order-success/") ||
    pathname === "/customer/addresses" ||
    pathname.startsWith("/customer/addresses/") ||
    pathname === "/customer/wishlist" ||
    pathname.startsWith("/customer/wishlist/") ||
    pathname === "/profile" ||
    pathname.startsWith("/profile/") ||
    pathname === "/products" ||
    pathname.startsWith("/products/")
  ) {
    const customerUser = getAuthenticatedUser(
      request,
      CUSTOMER_ACCESS_TOKEN_COOKIE,
    );
    const adminUser = getAuthenticatedUser(request, ADMIN_ACCESS_TOKEN_COOKIE);

    if (!customerUser && adminUser?.role === "ADMIN") {
      logCustomerRouteDecision(request, "redirected");
      return redirectTo(request, "/admin");
    }

    if (!customerUser) {
      logCustomerRouteDecision(request, "redirected");
      return redirectTo(request, "/login");
    }

    if (customerUser.role !== "CUSTOMER") {
      logCustomerRouteDecision(request, "redirected");
      return redirectTo(request, "/admin");
    }

    logCustomerRouteDecision(request, "allowed");
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/customer/:path*",
    "/profile/:path*",
    "/products/:path*",
    "/api/customer/:path*",
    "/api/admin/:path*",
  ],
};