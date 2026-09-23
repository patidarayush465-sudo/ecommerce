import { z } from "zod";

export const customerSupportTicketFormSchema = z.object({
  subject: z.string().trim().min(3, "Subject must be at least 3 characters").max(150, "Subject must be 150 characters or fewer"),
  category: z.enum(["ORDER", "PAYMENT", "DELIVERY", "PRODUCT", "RETURN_REFUND", "ACCOUNT", "OTHER"], { message: "Select a category" }),
  priority: z.enum(["LOW", "MEDIUM", "HIGH"], { message: "Select a priority" }),
  orderId: z.string().optional(),
  message: z.string().trim().min(1, "Message is required").max(3000, "Message must be 3000 characters or fewer"),
});

export type CustomerSupportTicketFormValues = z.infer<typeof customerSupportTicketFormSchema>;
