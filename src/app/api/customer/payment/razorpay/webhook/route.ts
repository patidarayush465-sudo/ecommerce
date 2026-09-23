import { NextResponse } from "next/server";

import { connectToDatabase } from "@/lib/mongodb";
import {
  RazorpayWebhookConfigurationError,
  verifyRazorpayWebhookSignature,
} from "@/lib/razorpay";
import Order, { PaymentMethod } from "@/models/Order";
import {
  PaymentProcessingError,
  processFailedRazorpayPayment,
  processSuccessfulRazorpayPayment,
} from "@/services/payment.service";
import { InventoryError } from "@/services/inventory.service";

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === "object" && value !== null
    ? value as JsonRecord
    : null;
}

function getString(record: JsonRecord | null, key: string) {
  const value = record?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function getNumber(record: JsonRecord | null, key: string) {
  const value = record?.[key];
  return typeof value === "number" ? value : undefined;
}

function getPaymentEntity(event: JsonRecord) {
  const payload = asRecord(event.payload);
  const payment = asRecord(payload?.payment);
  return asRecord(payment?.entity);
}

function acknowledge(message = "Event received") {
  return NextResponse.json({ success: true, message });
}

function handleWebhookError(error: unknown) {
  if (error instanceof RazorpayWebhookConfigurationError) {
    return NextResponse.json(
      { success: false, message: "Webhook is not configured" },
      { status: error.status },
    );
  }

  console.error("Razorpay webhook processing failed", error);

  return NextResponse.json(
    { success: false, message: "Webhook processing failed" },
    { status: 500 },
  );
}

export async function POST(request: Request) {
  try {
    const signature = request.headers.get("x-razorpay-signature");
    const rawBody = await request.text();

    if (!signature) {
      return NextResponse.json(
        { success: false, message: "Invalid webhook signature" },
        { status: 400 },
      );
    }

    if (!verifyRazorpayWebhookSignature(rawBody, signature)) {
      return NextResponse.json(
        { success: false, message: "Invalid webhook signature" },
        { status: 400 },
      );
    }

    let event: JsonRecord;

    try {
      const parsedEvent: unknown = JSON.parse(rawBody);
      const eventRecord = asRecord(parsedEvent);

      if (!eventRecord) {
        return acknowledge();
      }

      event = eventRecord;
    } catch {
      return NextResponse.json(
        { success: false, message: "Invalid webhook payload" },
        { status: 400 },
      );
    }

    const eventName = getString(event, "event");

    if (eventName !== "payment.captured" && eventName !== "payment.failed") {
      console.info("Razorpay webhook event received", { event: eventName ?? "unknown" });
      return acknowledge();
    }

    const paymentEntity = getPaymentEntity(event);
    const razorpayPaymentId = getString(paymentEntity, "id");
    const razorpayOrderId = getString(paymentEntity, "order_id");

    if (!razorpayPaymentId || !razorpayOrderId) {
      console.warn("Razorpay webhook missing payment references", {
        event: eventName,
      });
      return acknowledge();
    }

    await connectToDatabase();

    const order = await Order.findOne({ razorpayOrderId });

    if (!order) {
      console.warn("Razorpay webhook order not found", {
        event: eventName,
        razorpayOrderId,
      });
      return acknowledge();
    }

    console.info("Razorpay webhook event received", {
      event: eventName,
      razorpayOrderId,
      razorpayPaymentId,
      orderId: order._id.toString(),
    });

    if (order.paymentMethod !== PaymentMethod.ONLINE) {
      console.warn("Razorpay webhook ignored for non-online order", {
        razorpayOrderId,
        orderId: order._id.toString(),
      });
      return acknowledge();
    }

    if (eventName === "payment.captured") {
      const capturedAmount = getNumber(paymentEntity, "amount");
      const expectedAmount = Math.round(order.totalAmount * 100);

      if (
        capturedAmount !== undefined &&
        (!Number.isSafeInteger(capturedAmount) || capturedAmount !== expectedAmount)
      ) {
        console.warn("Razorpay webhook amount mismatch", {
          razorpayOrderId,
          razorpayPaymentId,
          orderId: order._id.toString(),
        });
        return acknowledge("Event received; payment requires reconciliation");
      }

      try {
        const result = await processSuccessfulRazorpayPayment(
          order._id.toString(),
          razorpayPaymentId,
        );

        return acknowledge(
          result.alreadyProcessed
            ? "Payment already processed"
            : "Webhook processed",
        );
      } catch (error: unknown) {
        if (error instanceof InventoryError) {
          console.error("Razorpay webhook stock processing deferred", {
            razorpayOrderId,
            razorpayPaymentId,
            orderId: order._id.toString(),
          });
          return NextResponse.json(
            { success: false, message: "Webhook processing deferred" },
            { status: 500 },
          );
        }

        if (error instanceof PaymentProcessingError) {
          console.warn("Razorpay webhook payment processing skipped", {
            razorpayOrderId,
            razorpayPaymentId,
            orderId: order._id.toString(),
          });
          return acknowledge();
        }

        throw error;
      }
    }

    await processFailedRazorpayPayment(
      order._id.toString(),
      razorpayPaymentId,
    );

    return acknowledge("Webhook processed");
  } catch (error: unknown) {
    return handleWebhookError(error);
  }
}