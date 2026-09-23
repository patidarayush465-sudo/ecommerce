import { verifyAccessToken } from "@/lib/jwt";
import type { JWTPayload } from "@/types/auth";

export class AuthenticationError extends Error {
  status = 401;

  constructor(message = "Authentication required") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class AuthorizationError extends Error {
  status = 403;

  constructor(message = "Admin access required") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export function getAuthUser(request: Request): JWTPayload {
  const authorizationHeader = request.headers.get("authorization");

  if (!authorizationHeader) {
    throw new AuthenticationError("Authentication required");
  }

  const [scheme, token, ...extraParts] = authorizationHeader.trim().split(/\s+/);

  if (scheme !== "Bearer" || !token || extraParts.length > 0) {
    throw new AuthenticationError("Invalid authorization header");
  }

  try {
    return verifyAccessToken(token);
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "JWT_SECRET is not configured") {
      throw error;
    }

    throw new AuthenticationError("Invalid or expired access token");
  }
}

export function getAdminUser(request: Request): JWTPayload {
  const authUser = getAuthUser(request);

  if (authUser.role !== "ADMIN") {
    throw new AuthorizationError("Admin access required");
  }

  return authUser;
}
