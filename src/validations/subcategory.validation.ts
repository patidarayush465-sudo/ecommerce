import { z } from "zod";

const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Must be a valid MongoDB ObjectId");

export const createSubCategorySchema = z
  .object({
    name: z.string().trim().min(2).max(100),
    description: z.string().trim().max(500).optional(),
    category: objectIdSchema,
  })
  .strict();

export const updateSubCategorySchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    description: z.string().trim().max(500).optional(),
    category: objectIdSchema.optional(),
    isActive: z.boolean().optional(),
  })
  .strict();

export type CreateSubCategoryInput = z.infer<typeof createSubCategorySchema>;
export type UpdateSubCategoryInput = z.infer<typeof updateSubCategorySchema>;
