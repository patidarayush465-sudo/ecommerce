import { z } from "zod";

export const adminSupportReplySchema = z.object({
  message: z.string().trim().min(1).max(3000),
}).strict();

export const adminSupportStatusSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]),
}).strict();
