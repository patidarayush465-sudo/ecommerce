import { z } from "zod";

export const updateAdminOrderStatusSchema = z
  .object({
    orderStatus: z.enum([
      "PENDING",
      "CONFIRMED",
      "PROCESSING",
      "SHIPPED",
      "DELIVERED",
      "CANCELLED",
    ]),
  })
  .strict();

export type UpdateAdminOrderStatusInput = z.infer<
  typeof updateAdminOrderStatusSchema
>;
