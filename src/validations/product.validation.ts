import mongoose from "mongoose";
import { z } from "zod";

const objectIdSchema = z.string().refine(
  (value) => mongoose.Types.ObjectId.isValid(value),
  "Must be a valid MongoDB ObjectId",
);

export const createProductSchema = z
  .object({
    name: z.string().trim().min(2).max(150),
    description: z.string().trim().max(2000),
    mrp: z.number().finite().positive(),
    discountPercent: z.number().finite().min(0).max(100),
    sellingPrice: z.number().finite().min(0),
    stock: z.number().int().min(0),
    category: objectIdSchema,
    subcategory: objectIdSchema,
    isActive: z.boolean().optional(),
  })
  .strict();

export const updateProductSchema = z
  .object({
    name: z.string().trim().min(2).max(150).optional(),
    description: z.string().trim().max(2000).optional(),
    mrp: z.number().finite().positive().optional(),
    discountPercent: z.number().finite().min(0).max(100).optional(),
    sellingPrice: z.number().finite().min(0).optional(),
    stock: z.number().int().min(0).optional(),
    category: objectIdSchema.optional(),
    subcategory: objectIdSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
