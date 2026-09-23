import { z } from "zod";

export const customerSignupSchema = z
  .object({
    name: z.string().trim().min(2).max(50),
    email: z.string().trim().email(),
    password: z.string().min(6),
    confirmPassword: z.string(),
  })
  .strict()
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type CustomerSignupInput = z.infer<typeof customerSignupSchema>;

export const customerLoginSchema = z
  .object({
    email: z.string().trim().email(),
    password: z.string().min(6),
  })
  .strict();

export type CustomerLoginInput = z.infer<typeof customerLoginSchema>;

export const adminLoginSchema = z
  .object({
    email: z.string().trim().email(),
    password: z.string().min(6),
  })
  .strict();

export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

export const customerResendVerificationSchema = z
  .object({
    email: z.string().trim().email(),
  })
  .strict();

export type CustomerResendVerificationInput = z.infer<
  typeof customerResendVerificationSchema
>;

export const customerForgotPasswordSchema = z
  .object({
    email: z.string().trim().email(),
  })
  .strict();

export type CustomerForgotPasswordInput = z.infer<
  typeof customerForgotPasswordSchema
>;

export const customerResetPasswordSchema = z
  .object({
    token: z.string().trim().min(1),
    password: z.string().min(6),
    confirmPassword: z.string(),
  })
  .strict()
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type CustomerResetPasswordInput = z.infer<
  typeof customerResetPasswordSchema
>;

export const customerChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(6),
    newPassword: z.string().min(6),
    confirmPassword: z.string(),
  })
  .strict()
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export type CustomerChangePasswordInput = z.infer<
  typeof customerChangePasswordSchema
>;
