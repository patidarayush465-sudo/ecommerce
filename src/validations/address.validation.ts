import { z } from "zod";

const addressFields = {
  fullName: z.string().trim().min(2).max(100),
  mobile: z.string().regex(/^[6-9]\d{9}$/, "Mobile must be a valid 10-digit number"),
  addressLine: z.string().trim().min(5).max(300),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  pincode: z.string().regex(/^\d{6}$/, "Pincode must be a valid 6-digit number"),
  country: z.string().trim().min(2).max(100).default("India"),
  isDefault: z.boolean().optional().default(false),
};

export const createAddressSchema = z.object(addressFields).strict();

export const updateAddressSchema = z
  .object({
    fullName: addressFields.fullName.optional(),
    mobile: addressFields.mobile.optional(),
    addressLine: addressFields.addressLine.optional(),
    city: addressFields.city.optional(),
    state: addressFields.state.optional(),
    pincode: addressFields.pincode.optional(),
    country: z.string().trim().min(2).max(100).optional(),
    isDefault: z.boolean().optional(),
  })
  .strict();

export type CreateAddressInput = z.infer<typeof createAddressSchema>;
export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;