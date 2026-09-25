import mongoose from "mongoose";
import { NextResponse } from "next/server";
import { z } from "zod";

import { AuthenticationError, AuthorizationError, getAdminUser } from "@/lib/auth";
import { CodRefundProcessingError, markCodRefundFailed } from "@/services/return-refund-processing.service";

const failureSchema = z.object({ failureReason: z.string().trim().min(1).max(500) }).strict();

function handleError(error: unknown) {
  if (error instanceof AuthenticationError || error instanceof AuthorizationError || error instanceof CodRefundProcessingError) {
    return NextResponse.json({ success: false, message: error.message }, { status: error.status });
  }
  console.error("Admin COD refund failure update failed", { name: error instanceof Error ? error.name : "UnknownError", message: error instanceof Error ? error.message : "Unknown error" });
  return NextResponse.json({ success: false, message: "Unable to mark COD refund failed" }, { status: 500 });
}

export async function POST(request: Request, { params }: { params: Promise<{ refundId: string }> }) {
  try {
    getAdminUser(request);
    const { refundId } = await params;
    if (!mongoose.Types.ObjectId.isValid(refundId)) {
      return NextResponse.json({ success: false, message: "Invalid refund ID" }, { status: 400 });
    }
    const result = failureSchema.safeParse(await request.json());
    if (!result.success) {
      return NextResponse.json({ success: false, message: "A valid failure reason is required" }, { status: 400 });
    }
    const failedRefund = await markCodRefundFailed(refundId, result.data.failureReason);
    return NextResponse.json({
      success: true,
      message: "COD refund marked failed and remains retryable",
      refund: {
        id: failedRefund.refund._id.toString(),
        paymentMethod: failedRefund.refund.paymentMethod,
        paymentStatus: failedRefund.refund.paymentStatus,
        retryCount: failedRefund.refund.retryCount,
        failedAt: failedRefund.refund.failedAt,
      },
    });
  } catch (error: unknown) {
    return handleError(error);
  }
}
