import { z } from "zod";

export const registerNotificationTokenSchema = z.object({
  token: z.string().trim().min(1),
  deviceType: z.enum(["web", "android", "ios"]),
}).strict();

export const removeNotificationTokenSchema = z.object({
  token: z.string().trim().min(1),
}).strict();