import crypto from "node:crypto";

export function generateEmailVerificationToken(): {
  rawToken: string;
  hashedToken: string;
} {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const hashedToken = crypto
    .createHash("sha256")
    .update(rawToken)
    .digest("hex");

  return { rawToken, hashedToken };
}

export function generatePasswordResetToken(): {
  rawToken: string;
  hashedToken: string;
} {
  return generateEmailVerificationToken();
}
