import mongoose from "mongoose";
import { z } from "zod";

const objectIdSchema = z.string().refine(
  (value) => mongoose.Types.ObjectId.isValid(value),
  "Must be a valid MongoDB ObjectId",
);

export const refundPaymentMethodSchema = z.enum(["ONLINE", "COD"]);

export const refundItemSchema = z
  .object({
    productId: objectIdSchema,
    quantity: z.number().int().min(1),
    unitPrice: z.number().min(0),
    amount: z.number().min(0),
  })
  .strict();

export const createRefundSchema = z
  .object({
    returnRequestId: objectIdSchema,
    orderId: objectIdSchema,
    userId: objectIdSchema,
    items: z.array(refundItemSchema).min(1),
    refundAmount: z.number().positive(),
    currency: z.string().trim().toUpperCase().default("INR"),
    paymentMethod: refundPaymentMethodSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const productIds = new Set<string>();
    for (const item of value.items) {
      if (productIds.has(item.productId)) {
        context.addIssue({
          code: "custom",
          path: ["items"],
          message: "Each product may appear only once in a refund request",
        });
        return;
      }
      productIds.add(item.productId);
    }
  });

export type CreateRefundInput = z.infer<typeof createRefundSchema>;
export type RefundItemInput = z.infer<typeof refundItemSchema>;
