import { z } from "zod";

export const createOrderSchema = z
  .object({
    paymentMethod: z.enum(["COD", "ONLINE"]).default("ONLINE"),
  })
  .strict();

export type CreateOrderInput = z.infer<typeof createOrderSchema>;