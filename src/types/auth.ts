import type { UserRole } from "@/models/User";

export type JWTPayload = {
  userId: string;
  email: string;
  role: UserRole;
};
