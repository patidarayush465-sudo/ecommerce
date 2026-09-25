import mongoose from "mongoose";
import { NextResponse } from "next/server";

import { AuthenticationError, AuthorizationError, getAdminUser } from "@/lib/auth";
import { CodRefundProcessingError, manuallyConfirmCodRefund } from "@/services/return-refund-processing.service";

function handleError(error: unknown) {
  if (error instanceof AuthenticationError || error instanceof AuthorizationError || error instanceof CodRefundProcessingError) {
    return NextResponse.json({ success: false, message: error.message }, { status: error.status });
  }
  console.error("Admin COD refund processing failed", { name: error instanceof Error ? error.name : "UnknownError", message: error instanceof Error ? error.message : "Unknown error" });
  return NextResponse.json({ success: false, message: "Unable to process COD refund" }, { status: 500 });
}

export async function POST(request: Request, { params }: { params: Promise<{ refundId: string }> }) {
  try {
    getAdminUser(request);
    const { refundId } = await params;
    if (!mongoose.Types.ObjectId.isValid(refundId)) {
      return NextResponse.json({ success: false, message: "Invalid refund ID" }, { status: 400 });
    }
    const result = await manuallyConfirmCodRefund(refundId);
    return NextResponse.json({
      success: true,
      message: result.idempotent ? "COD refund was already manually confirmed" : "COD refund manually confirmed",
      refund: {
        id: result.refund._id.toString(),
        paymentMethod: result.refund.paymentMethod,
        paymentStatus: result.refund.paymentStatus,
        refundAmount: result.refund.refundAmount,
        manualConfirmation: true,
        automatedPayout: false,
      },
    });
  } catch (error: unknown) {
    return handleError(error);
  }
}
