export const SUPPORT_ATTACHMENT_ACCEPT = ".jpg,.jpeg,.png,.webp,.pdf";
export const SUPPORT_ATTACHMENT_MAX_COUNT = 3;
export const SUPPORT_ATTACHMENT_MAX_SIZE = 5 * 1024 * 1024;
export const SUPPORT_ATTACHMENT_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

export function validateSupportAttachmentFiles(files: File[]) {
  if (files.length > SUPPORT_ATTACHMENT_MAX_COUNT) return `You can attach up to ${SUPPORT_ATTACHMENT_MAX_COUNT} files.`;
  const invalidType = files.find((file) => !SUPPORT_ATTACHMENT_TYPES.includes(file.type));
  if (invalidType) return "Only JPEG, PNG, WEBP, and PDF files are supported.";
  const oversized = files.find((file) => file.size > SUPPORT_ATTACHMENT_MAX_SIZE || file.size < 1);
  if (oversized) return "Each attachment must be 5 MB or smaller.";
  return "";
}

export function formatAttachmentSize(size: number) {
  return size >= 1024 * 1024 ? `${(size / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1024))} KB`;
}
