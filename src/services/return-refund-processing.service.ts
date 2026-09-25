import mongoose from "mongoose";

import Order, { PaymentStatus } from "@/models/Order";
import ReturnRefund, {
  RefundPaymentMethod,
  RefundStatus,
} from "@/models/ReturnRefund";
import { createFullRazorpayRefund } from "@/services/refund.service";
import { notifyReturnRefundProcessed } from "@/services/return-refund-notification.service";

export class ReturnRefundProcessingError extends Error {
  constructor(
    message: string,
    public readonly status = 400,
  ) {
    super(message);
    this.name = "ReturnRefundProcessingError";
  }
}

type ReturnRefundDocument = {
  _id: { toString(): string };
  order: { toString(): string };
  paymentMethod: RefundPaymentMethod;
  paymentStatus: RefundStatus;
  refundAmount: number;
  razorpayPaymentId?: string;
  razorpayRefundId?: string;
  retryCount?: number;
  processingKey: string;
};

type ProcessingResult = {
  status: RefundStatus;
  refund: unknown;
  processed: boolean;
  skipped: boolean;
  reason?: string;
};

function assertValidRefundId(returnRefundId: string) {
  if (!mongoose.Types.ObjectId.isValid(returnRefundId)) {
    throw new ReturnRefundProcessingError("Invalid refund ID", 400);
  }
}

function getSafeFailureReason(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "Razorpay refund processing failed";
}

function getAmountInPaise(refundAmount: number) {
  const amountInPaise = refundAmount * 100;
  if (!Number.isFinite(amountInPaise) || !Number.isInteger(amountInPaise) || amountInPaise <= 0) {
    throw new ReturnRefundProcessingError("Refund amount is invalid", 422);
  }
  return amountInPaise;
}

function serializeResult(
  refund: ReturnRefundDocument,
  options: Omit<ProcessingResult, "refund" | "status"> = {
    processed: false,
    skipped: false,
  },
): ProcessingResult {
  return {
    refund,
    status: refund.paymentStatus,
    ...options,
  };
}

export async function processReturnRefund(
  returnRefundId: string,
): Promise<ProcessingResult> {
  assertValidRefundId(returnRefundId);

  const refund = (await ReturnRefund.findById(returnRefundId).lean()) as
    | ReturnRefundDocument
    | null;
  if (!refund) {
    throw new ReturnRefundProcessingError("Refund record not found", 404);
  }

  if (refund.paymentStatus === RefundStatus.PROCESSED) {
    return serializeResult(refund, { processed: true, skipped: true });
  }

  if (refund.paymentStatus === RefundStatus.PROCESSING) {
    return serializeResult(refund, {
      processed: false,
      skipped: true,
      reason: "Refund is already processing",
    });
  }

  if (refund.paymentMethod === RefundPaymentMethod.COD) {
    return serializeResult(refund, {
      processed: false,
      skipped: true,
      reason: "COD refund destination is not configured",
    });
  }

  if (refund.paymentMethod !== RefundPaymentMethod.ONLINE) {
    throw new ReturnRefundProcessingError("Unsupported refund payment method", 422);
  }

  const order = await Order.findById(refund.order)
    .select("paymentStatus razorpayPaymentId")
    .lean() as { paymentStatus: PaymentStatus; razorpayPaymentId?: string } | null;
  if (!order) {
    throw new ReturnRefundProcessingError("Associated order not found", 404);
  }
  if (order.paymentStatus !== PaymentStatus.PAID) {
    throw new ReturnRefundProcessingError("Order payment is not eligible for refund", 409);
  }
  if (!order.razorpayPaymentId) {
    throw new ReturnRefundProcessingError("Order Razorpay payment ID is missing", 422);
  }

  const amountInPaise = getAmountInPaise(refund.refundAmount);
  const now = new Date();
  const claimedRefund = (await ReturnRefund.findOneAndUpdate(
    {
      _id: returnRefundId,
      paymentMethod: RefundPaymentMethod.ONLINE,
      paymentStatus: { $in: [RefundStatus.PENDING, RefundStatus.FAILED] },
    },
    {
      $set: {
        paymentStatus: RefundStatus.PROCESSING,
        lastAttemptAt: now,
      },
      $inc: { retryCount: 1 },
      $unset: { failedAt: "", failureReason: "" },
    },
    { returnDocument: "after" },
  ).lean()) as ReturnRefundDocument | null;

  if (!claimedRefund) {
    const currentRefund = (await ReturnRefund.findById(returnRefundId).lean()) as
      | ReturnRefundDocument
      | null;
    if (!currentRefund) {
      throw new ReturnRefundProcessingError("Refund record not found", 404);
    }
    if (currentRefund.paymentStatus === RefundStatus.PROCESSED) {
      return serializeResult(currentRefund, { processed: true, skipped: true });
    }
    if (currentRefund.paymentStatus === RefundStatus.PROCESSING) {
      return serializeResult(currentRefund, {
        processed: false,
        skipped: true,
        reason: "Refund is already processing",
      });
    }
    return serializeResult(currentRefund, {
      processed: false,
      skipped: true,
      reason: "Refund could not be claimed for processing",
    });
  }

  let processedRefund: ReturnRefundDocument;
  try {
    const razorpayRefund = await createFullRazorpayRefund(
      order.razorpayPaymentId,
      amountInPaise,
    );
    const processedAt = new Date();
    const updatedRefund = (await ReturnRefund.findOneAndUpdate(
      {
        _id: returnRefundId,
        paymentStatus: RefundStatus.PROCESSING,
      },
      {
        $set: {
          paymentStatus: RefundStatus.PROCESSED,
          processedAt,
          lastAttemptAt: processedAt,
          razorpayRefundId: razorpayRefund.id,
          razorpayPaymentId: order.razorpayPaymentId,
        },
        $unset: { failedAt: "", failureReason: "" },
      },
      { returnDocument: "after" },
    ).lean()) as ReturnRefundDocument | null;

    if (!updatedRefund) {
      throw new ReturnRefundProcessingError(
        "Razorpay refund succeeded but the refund record could not be finalized",
        500,
      );
    }
    processedRefund = updatedRefund;
  } catch (error: unknown) {
    const failedAt = new Date();
    await ReturnRefund.updateOne(
      {
        _id: returnRefundId,
        paymentStatus: RefundStatus.PROCESSING,
      },
      {
        $set: {
          paymentStatus: RefundStatus.FAILED,
          failedAt,
          lastAttemptAt: failedAt,
          failureReason: getSafeFailureReason(error),
        },
      },
    );

    if (error instanceof ReturnRefundProcessingError) throw error;
    throw new ReturnRefundProcessingError("Razorpay refund processing failed", 502);
  }

  await notifyReturnRefundProcessed(returnRefundId);
  return serializeResult(processedRefund, {
    processed: true,
    skipped: false,
  });
}
