import crypto from "node:crypto";
import { NextResponse } from "next/server";

import { connectToDatabase } from "@/lib/mongodb";
import ReturnRefund, {
  RefundPaymentMethod,
  RefundStatus,
} from "@/models/ReturnRefund";
import { processReturnRefund } from "@/services/return-refund-processing.service";
import { notifyReturnRefundProcessed } from "@/services/return-refund-notification.service";

const MAX_BATCH_SIZE = 5;

type CronSummary = {
  success: true;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  notifications: {
    processed: number;
    succeeded: number;
    failed: number;
    skipped: number;
  };
};

function hasValidCronAuthorization(request: Request) {
  const expectedSecret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!expectedSecret || !authorization?.startsWith("Bearer ")) return false;

  const suppliedSecret = authorization.slice("Bearer ".length);
  const expectedBuffer = Buffer.from(expectedSecret, "utf8");
  const suppliedBuffer = Buffer.from(suppliedSecret, "utf8");
  return (
    expectedBuffer.length === suppliedBuffer.length &&
    crypto.timingSafeEqual(expectedBuffer, suppliedBuffer)
  );
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { success: false, message: "Cron processing is not configured" },
      { status: 500 },
    );
  }

  if (!hasValidCronAuthorization(request)) {
    return NextResponse.json(
      { success: false, message: "Unauthorized" },
      { status: 401 },
    );
  }

  try {
    await connectToDatabase();
    const refunds = await ReturnRefund.find({
      paymentMethod: RefundPaymentMethod.ONLINE,
      paymentStatus: { $in: [RefundStatus.PENDING, RefundStatus.FAILED] },
    })
      .select("_id")
      .sort({ createdAt: 1 })
      .limit(MAX_BATCH_SIZE)
      .lean();

    const results = await Promise.allSettled(
      refunds.map((refund) => processReturnRefund(refund._id.toString())),
    );
    let succeeded = 0;
    let failed = 0;
    let skipped = 0;

    for (const result of results) {
      if (result.status === "rejected") {
        failed += 1;
      } else if (result.value.processed) {
        succeeded += 1;
      } else {
        skipped += 1;
      }
    }

    const notificationRefunds = await ReturnRefund.find({
      paymentMethod: RefundPaymentMethod.ONLINE,
      paymentStatus: RefundStatus.PROCESSED,
      $or: [
        { refundPushNotificationSent: { $ne: true } },
        { refundEmailSent: { $ne: true } },
      ],
    })
      .select("_id")
      .sort({ processedAt: 1, createdAt: 1 })
      .limit(MAX_BATCH_SIZE)
      .lean();
    const notificationResults = await Promise.allSettled(
      notificationRefunds.map((refund) =>
        notifyReturnRefundProcessed(refund._id.toString()),
      ),
    );
    let notificationSucceeded = 0;
    let notificationFailed = 0;
    let notificationSkipped = 0;
    for (const result of notificationResults) {
      if (result.status === "rejected") {
        notificationFailed += 1;
      } else if (result.value.skipped) {
        notificationSkipped += 1;
      } else if (result.value.sentPush || result.value.sentEmail) {
        notificationSucceeded += 1;
      } else {
        notificationSkipped += 1;
      }
    }

    const summary: CronSummary = {
      success: true,
      processed: succeeded + failed,
      succeeded,
      failed,
      skipped,
      notifications: {
        processed: notificationSucceeded + notificationFailed,
        succeeded: notificationSucceeded,
        failed: notificationFailed,
        skipped: notificationSkipped,
      },
    };
    return NextResponse.json(summary);
  } catch {
    return NextResponse.json(
      { success: false, message: "Unable to process return refunds" },
      { status: 500 },
    );
  }
}
