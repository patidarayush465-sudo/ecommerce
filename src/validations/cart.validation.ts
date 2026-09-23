import mongoose from "mongoose";
import { z } from "zod";

const objectIdSchema = z.string().refine(
  (value) => mongoose.Types.ObjectId.isValid(value),
  "Must be a valid MongoDB ObjectId",
);

export const addToCartSchema = z
  .object({
    productId: objectIdSchema,
    quantity: z.number().int().positive(),
  })
  .strict();

export const updateCartItemSchema = z
  .object({
    quantity: z.number().int().min(1),
  })
  .strict();

export type AddToCartInput = z.infer<typeof addToCartSchema>;
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;