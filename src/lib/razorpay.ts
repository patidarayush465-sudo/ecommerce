import crypto from "node:crypto";
import Razorpay from "razorpay";

const keyId = process.env.RAZORPAY_KEY_ID ?? "";
const keySecret = process.env.RAZORPAY_KEY_SECRET ?? "";
const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET ?? "";

let razorpay: Razorpay | null = null;

export class RazorpayConfigurationError extends Error {
  status = 503;

  constructor(message = "Razorpay credentials are not configured") {
    super(message);
    this.name = "RazorpayConfigurationError";
  }
}

export function getRazorpayClient() {
  if (!keyId || !keySecret) {
    throw new RazorpayConfigurationError();
  }

  razorpay ??= new Razorpay({
    key_id: keyId,
    key_secret: keySecret,
  });

  return razorpay;
}

export function getRazorpayKeyId() {
  if (!keyId) {
    throw new RazorpayConfigurationError();
  }

  return keyId;
}

export function verifyRazorpaySignature(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  razorpaySignature: string,
) {
  if (!keySecret) {
    throw new RazorpayConfigurationError();
  }

  const generatedSignature = crypto
    .createHmac("sha256", keySecret)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");
  const expected = Buffer.from(generatedSignature, "utf8");
  const received = Buffer.from(razorpaySignature, "utf8");

  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

export class RazorpayWebhookConfigurationError extends Error {
  status = 503;

  constructor() {
    super("Razorpay webhook is not configured");
    this.name = "RazorpayWebhookConfigurationError";
  }
}

export function verifyRazorpayWebhookSignature(
  rawBody: string,
  razorpaySignature: string,
) {
  if (!webhookSecret) {
    throw new RazorpayWebhookConfigurationError();
  }

  const generatedSignature = crypto
    .createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex");
  const expected = Buffer.from(generatedSignature, "utf8");
  const received = Buffer.from(razorpaySignature, "utf8");

  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}