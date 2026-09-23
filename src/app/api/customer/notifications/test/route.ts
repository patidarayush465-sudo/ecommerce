import { NextResponse } from "next/server";

import { AuthenticationError, AuthorizationError, getAuthUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { sendPushNotificationToUser } from "@/services/notification.service";
import { UserRole } from "@/models/User";

export async function POST(request: Request) {
  try {
    const authUser = getAuthUser(request);
    if (authUser.role !== UserRole.CUSTOMER) throw new AuthorizationError("Customer access required");
    await connectToDatabase();
    const result = await sendPushNotificationToUser(authUser.userId, {
      title: "Test Notification",
      body: "Push notifications are working successfully.",
    });
    if (result.successCount === 0 && result.failureCount === 0) {
      return NextResponse.json({ success: false, message: "No registered notification token found" }, { status: 400 });
    }
    if (result.successCount === 0) {
      return NextResponse.json({ success: false, message: "Unable to send test notification" }, { status: 503 });
    }
    return NextResponse.json({ success: true, message: "Test notification sent" });
  } catch (error: unknown) {
    if (error instanceof AuthenticationError || error instanceof AuthorizationError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
    console.error("Notification test failed");
    return NextResponse.json({ success: false, message: "Unable to send test notification" }, { status: 503 });
  }
}