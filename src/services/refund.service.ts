import { getRazorpayClient } from "@/lib/razorpay";

export class RefundProcessingError extends Error {
  status = 502;

  constructor(message: string) {
    super(message);
    this.name = "RefundProcessingError";
  }
}

export async function createFullRazorpayRefund(
  paymentId: string,
  amountInPaise: number,
) {
  try {
    const razorpay = getRazorpayClient();
    const existingRefunds = await razorpay.payments.fetchMultipleRefund(paymentId);
    const existingFullRefund = existingRefunds.items.find(
      (refund) => refund.amount === amountInPaise && refund.status !== "failed",
    );

    if (existingFullRefund) {
      return {
        id: existingFullRefund.id,
        amount: existingFullRefund.amount,
        status: existingFullRefund.status,
      };
    }

    const refund = await razorpay.payments.refund(paymentId, {
      amount: amountInPaise,
    });

    if (!refund?.id) {
      throw new RefundProcessingError("Razorpay did not return a refund ID");
    }

    return {
      id: refund.id,
      amount: refund.amount,
      status: refund.status,
    };
  } catch (error: unknown) {
    if (error instanceof RefundProcessingError) {
      throw error;
    }

    throw new RefundProcessingError("Razorpay refund request failed");
  }
}