import { randomUUID } from "node:crypto";

import cloudinary from "@/lib/cloudinary";

export const SUPPORT_UPLOAD_FOLDER = "ecommerce/support/tickets";
export const SUPPORT_MAX_FILE_SIZE = 5 * 1024 * 1024;
export const SUPPORT_MAX_ATTACHMENTS = 3;
export const SUPPORT_ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;

type SupportedMimeType = (typeof SUPPORT_ALLOWED_MIME_TYPES)[number];
type SupportResourceType = "image" | "raw";
export type SupportAttachment = {
  url: string;
  publicId: string;
  resourceType: SupportResourceType;
  fileName: string;
  mimeType: SupportedMimeType;
  size: number;
};

function getResourceType(mimeType: SupportedMimeType): SupportResourceType {
  return mimeType === "application/pdf" ? "raw" : "image";
}

async function hasExpectedSignature(file: File) {
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (file.type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (file.type === "image/png") return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
  if (file.type === "image/webp") return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (file.type === "application/pdf") return String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
  return false;
}

export function validateSupportFiles(files: File[]) {
  if (files.length > SUPPORT_MAX_ATTACHMENTS) throw new Error(`You can attach up to ${SUPPORT_MAX_ATTACHMENTS} files`);
  for (const file of files) {
    if (!SUPPORT_ALLOWED_MIME_TYPES.includes(file.type as SupportedMimeType)) throw new Error("Only JPEG, PNG, WEBP, and PDF files are supported");
    if (file.size < 1 || file.size > SUPPORT_MAX_FILE_SIZE) throw new Error("Each attachment must be 5 MB or smaller");
  }
}

function uploadToCloudinary(file: File, resourceType: SupportResourceType) {
  return new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
    const publicId = randomUUID();
    const stream = cloudinary.uploader.upload_stream(
      { folder: SUPPORT_UPLOAD_FOLDER, public_id: publicId, resource_type: resourceType },
      (error, result) => {
        if (error || !result) reject(error ?? new Error("Cloudinary support upload failed"));
        else resolve({ secure_url: result.secure_url, public_id: result.public_id });
      },
    );
    void file.arrayBuffer().then((buffer) => stream.end(Buffer.from(buffer))).catch(reject);
  });
}

export async function uploadSupportAttachments(files: File[]): Promise<SupportAttachment[]> {
  validateSupportFiles(files);
  const uploaded: SupportAttachment[] = [];
  try {
    for (const file of files) {
      if (!(await hasExpectedSignature(file))) throw new Error("One or more attachments have an invalid file signature");
      const mimeType = file.type as SupportedMimeType;
      const resourceType = getResourceType(mimeType);
      const result = await uploadToCloudinary(file, resourceType);
      uploaded.push({ url: result.secure_url, publicId: result.public_id, resourceType, fileName: file.name, mimeType, size: file.size });
    }
    return uploaded;
  } catch (error) {
    await deleteSupportAttachments(uploaded);
    throw error;
  }
}

export async function deleteSupportAttachments(attachments: Array<Pick<SupportAttachment, "publicId" | "resourceType">>) {
  await Promise.allSettled(attachments.map((attachment) => new Promise<void>((resolve, reject) => {
    cloudinary.uploader.destroy(attachment.publicId, { resource_type: attachment.resourceType }, (error, result) => {
      if (error || (result?.result !== "ok" && result?.result !== "not found")) reject(error ?? new Error("Cloudinary support cleanup failed"));
      else resolve();
    });
  })));
}
