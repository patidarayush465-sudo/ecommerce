import mongoose from "mongoose";
import { z } from "zod";

import { codRefundDestinationSchema } from "@/validations/refund.validation";

const objectIdSchema = z.string().refine(
  (value) => mongoose.Types.ObjectId.isValid(value),
  "Must be a valid MongoDB ObjectId",
);

export const returnReasonSchema = z.enum([
  "DAMAGED",
  "DEFECTIVE",
  "WRONG_ITEM",
  "MISSING_ITEM",
  "NOT_AS_DESCRIBED",
  "SIZE_OR_FIT",
  "CHANGED_MIND",
  "OTHER",
]);

export const returnItemRequestSchema = z
  .object({
    productId: objectIdSchema,
    quantity: z.number().int().min(1),
  })
  .strict();

export const createReturnRequestSchema = z
  .object({
    orderId: objectIdSchema,
    items: z.array(returnItemRequestSchema).min(1),
    reason: returnReasonSchema,
    reasonDetails: z.string().trim().max(500).optional(),
    refundDestination: codRefundDestinationSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const productIds = new Set<string>();
    for (const item of value.items) {
      if (productIds.has(item.productId)) {
        context.addIssue({
          code: "custom",
          path: ["items"],
          message: "Each product may appear only once in a return request",
        });
        return;
      }
      productIds.add(item.productId);
    }
  });

export type CreateReturnRequestInput = z.infer<typeof createReturnRequestSchema>;
export type RequestedReturnItem = z.infer<typeof returnItemRequestSchema>;