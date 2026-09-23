import mongoose from "mongoose";
import { z } from "zod";

const objectIdSchema = z.string().refine(
  (value) => mongoose.Types.ObjectId.isValid(value),
  "Must be a valid MongoDB ObjectId",
);

export const createReviewSchema = z
  .object({
    productId: objectIdSchema,
    orderId: objectIdSchema,
    rating: z.number().int().min(1).max(5),
    review: z.string().trim().min(3).max(1000),
  })
  .strict();

export const updateReviewSchema = z
  .object({
    rating: z.number().int().min(1).max(5),
    review: z.string().trim().min(3).max(1000),
  })
  .strict();