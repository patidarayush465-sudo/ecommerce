import jwt, { type SignOptions } from "jsonwebtoken";

import type { JWTPayload } from "@/types/auth";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }

  return secret;
}

function getJwtExpiresIn(): SignOptions["expiresIn"] {
  return (process.env.JWT_EXPIRES_IN || "1d") as SignOptions["expiresIn"];
}

export function generateAccessToken(payload: JWTPayload): string {
  try {
    return jwt.sign(payload, getJwtSecret(), {
      expiresIn: getJwtExpiresIn(),
    });
  } catch (error: unknown) {
    throw new Error(
      `Access token generation failed: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
}

export function verifyAccessToken(token: string): JWTPayload {
  try {
    const decoded = jwt.verify(token, getJwtSecret());

    if (
      typeof decoded !== "object" ||
      decoded === null ||
      typeof decoded.userId !== "string" ||
      typeof decoded.email !== "string" ||
      (decoded.role !== "ADMIN" && decoded.role !== "CUSTOMER")
    ) {
      throw new Error("Invalid access token payload");
    }

    return {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role,
    };
  } catch (error: unknown) {
    if (error instanceof Error && error.message === "JWT_SECRET is not configured") {
      throw error;
    }

    throw new Error("Invalid or expired access token");
  }
}
