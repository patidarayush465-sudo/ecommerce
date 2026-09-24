import { NextResponse } from "next/server";

import { AuthenticationError, AuthorizationError, getAdminUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import User from "@/models/User";

function handleError(error: unknown) {
  if (error instanceof AuthenticationError || error instanceof AuthorizationError) {
    return NextResponse.json({ success: false, message: error.message }, { status: error.status });
  }

  console.error("FCM token reset failed", {
    message: error instanceof Error ? error.message : "Unknown error",
  });
  return NextResponse.json({ success: false, message: "Unable to reset FCM tokens" }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    getAdminUser(request);
    await connectToDatabase();

    const result = await User.updateMany({}, { $set: { fcmTokens: [] } });
    console.info("FCM token reset completed", {
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
    });

    return NextResponse.json({
      success: true,
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
    });
  } catch (error: unknown) {
    return handleError(error);
  }
}