import { NextResponse } from "next/server";

import { AuthenticationError, AuthorizationError, getAuthUser } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import User, { UserRole } from "@/models/User";
import { registerNotificationTokenSchema, removeNotificationTokenSchema } from "@/validations/notification.validation";

function authenticateNotificationUser(request: Request) {
  const authUser = getAuthUser(request);
  if (authUser.role !== UserRole.CUSTOMER && authUser.role !== UserRole.ADMIN) {
    throw new AuthorizationError("Notification access required");
  }
  return authUser.userId;
}

function handleError(error: unknown) {
  if (error instanceof AuthenticationError || error instanceof AuthorizationError) return NextResponse.json({ success: false, message: error.message }, { status: error.status });
  console.error("Notification token request failed", error);
  return NextResponse.json({ success: false, message: "Unable to manage notification token" }, { status: 500 });
}

export async function POST(request: Request) {
  try {
    const authUser = getAuthUser(request);
    if (authUser.role !== UserRole.CUSTOMER && authUser.role !== UserRole.ADMIN) {
      throw new AuthorizationError("Notification access required");
    }
    const userId = authUser.userId;
    const result = registerNotificationTokenSchema.safeParse(await request.json());
    console.info("Notification token registration request", {
      role: authUser.role,
      userId: authUser.userId,
      tokenReceived: result.success && Boolean(result.data.token),
      token: result.success ? maskToken(result.data.token) : null,
    });
    if (!result.success) return NextResponse.json({ success: false, message: "Invalid notification token", errors: result.error.issues }, { status: 400 });
    await connectToDatabase();
    const now = new Date();
    const updateResult = await User.updateOne(
      { _id: userId, role: authUser.role },
      [
        {
          $set: {
            fcmTokens: {
              $concatArrays: [
                {
                  $filter: {
                    input: { $ifNull: ["$fcmTokens", []] },
                    as: "entry",
                    cond: { $ne: ["$$entry.token", result.data.token] },
                  },
                },
                [{ token: result.data.token, deviceType: result.data.deviceType, lastActiveAt: now }],
              ],
            },
          },
        },
      ],
      { updatePipeline: true },
    );
    const updatedUser = await User.findOne({ _id: userId, role: authUser.role }).select("fcmTokens").lean() as { fcmTokens?: unknown[] } | null;
    console.info("Notification token registration persistence", {
      role: authUser.role,
      userId: authUser.userId,
      matchedCount: updateResult.matchedCount,
      modifiedCount: updateResult.modifiedCount,
      fcmTokenCount: updatedUser?.fcmTokens?.length ?? 0,
    });
    return NextResponse.json({ success: true, message: "Notification token registered" });
  } catch (error: unknown) {
    if (error instanceof SyntaxError) return NextResponse.json({ success: false, message: "Invalid request body" }, { status: 400 });
    return handleError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const userId = authenticateNotificationUser(request);
    const result = removeNotificationTokenSchema.safeParse(await request.json());
    if (!result.success) return NextResponse.json({ success: false, message: "Invalid notification token", errors: result.error.issues }, { status: 400 });
    await connectToDatabase();
    const authUser = getAuthUser(request);
    await User.updateOne({ _id: userId, role: authUser.role }, { $pull: { fcmTokens: { token: result.data.token } } });
    return NextResponse.json({ success: true, message: "Notification token removed" });
  } catch (error: unknown) {
    if (error instanceof SyntaxError) return NextResponse.json({ success: false, message: "Invalid request body" }, { status: 400 });
    return handleError(error);
  }
}

function maskToken(token: string) {
  if (token.length <= 8) return "********";
  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}