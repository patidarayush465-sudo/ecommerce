import { z } from "zod";

export const customerProfileUpdateSchema = z
  .object({
    name: z.string().trim().min(2).max(50).optional(),
    dateOfBirth: z
      .string()
      .refine((value) => !Number.isNaN(Date.parse(value)), {
        message: "Date of birth must be a valid date",
      })
      .optional(),
    mobile: z
      .string()
      .regex(/^[6-9]\d{9}$/, "Mobile must be a valid 10-digit number")
      .optional(),
  })
  .strict();

export type CustomerProfileUpdateInput = z.infer<
  typeof customerProfileUpdateSchema
>;
