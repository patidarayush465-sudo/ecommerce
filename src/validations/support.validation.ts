import mongoose from "mongoose";
import { z } from "zod";

import {
  SupportTicketCategory,
  SupportTicketPriority,
  SupportTicketStatus,
} from "@/models/SupportTicket";

const objectIdSchema = z.string().refine(
  (value) => mongoose.Types.ObjectId.isValid(value),
  "Must be a valid MongoDB ObjectId",
);

const attachmentSchema = z
  .object({
    url: z.string().trim().min(1),
    publicId: z.string().trim().min(1),
    resourceType: z.enum(["image", "raw"]),
    fileName: z.string().trim().min(1),
    mimeType: z.string().trim().min(1),
    size: z.number().int().positive(),
  })
  .strict();

export const createSupportTicketSchema = z
  .object({
    subject: z.string().trim().min(3).max(150),
    category: z.enum(SupportTicketCategory),
    message: z.string().trim().min(1).max(3000),
    priority: z.enum(SupportTicketPriority).default(SupportTicketPriority.MEDIUM),
    orderId: objectIdSchema.optional(),
    attachments: z.array(attachmentSchema).default([]),
  })
  .strict();

export const createSupportReplySchema = z
  .object({
    message: z.string().trim().min(1).max(3000),
    attachments: z.array(attachmentSchema).default([]),
  })
  .strict();

export const supportTicketStatusSchema = z.enum(SupportTicketStatus);
export const supportTicketCategorySchema = z.enum(SupportTicketCategory);
