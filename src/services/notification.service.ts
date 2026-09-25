import { getFirebaseMessaging } from "@/lib/firebase-admin";
import User from "@/models/User";

export type PushNotification = {
  title: string;
  body: string;
  data?: Record<string, string>;
};

type StoredFcmToken = { token: string; deviceType: string; lastActiveAt: Date };
type UserNotificationRecord = { _id: unknown; fcmTokens?: StoredFcmToken[] };

function isInvalidTokenError(code?: string) {
  return code === "messaging/registration-token-not-registered" || code === "messaging/invalid-registration-token";
}

function logFirebaseError(error: unknown) {
  const firebaseError = error as { code?: unknown; name?: unknown; message?: unknown };
  console.error("Firebase notification error", {
    code: typeof firebaseError.code === "string" ? firebaseError.code : undefined,
    name: typeof firebaseError.name === "string" ? firebaseError.name : undefined,
    message: typeof firebaseError.message === "string" ? firebaseError.message : undefined,
  });
}

export async function sendPushNotification(tokens: string[], notification: PushNotification) {
  const uniqueTokens = [...new Set(tokens.filter(Boolean))];
  if (uniqueTokens.length === 0) return { successCount: 0, failureCount: 0, invalidTokens: [] };

  let result;
  try {
    const data = Object.fromEntries(
      Object.entries({
        title: notification.title,
        body: notification.body,
        ...(notification.data ?? {}),
      }).map(([key, value]) => [key, String(value)]),
    );
    result = await getFirebaseMessaging().sendEachForMulticast({
      tokens: uniqueTokens,
      data,
    });
  } catch (error: unknown) {
    logFirebaseError(error);
    throw error;
  }
  for (const response of result.responses) {
    if (!response.success && response.error) logFirebaseError(response.error);
  }
  const invalidTokens = result.responses.flatMap((response, index) => response.success || !isInvalidTokenError(response.error?.code) ? [] : [uniqueTokens[index]]);
  return { successCount: result.successCount, failureCount: result.failureCount, invalidTokens };
}

export async function sendPushNotificationToUser(userId: string, notification: PushNotification) {
  const user = await User.findById(userId).select("fcmTokens").lean() as UserNotificationRecord | null;
  const tokens = (user?.fcmTokens ?? []).map((entry) => entry.token);
  console.info("Push notification token lookup completed", {
    tokenCount: tokens.length,
  });
  const result = await sendPushNotification(tokens, notification);
  await removeInvalidTokensForUser(userId, result.invalidTokens);
  console.info("Push notification delivery completed", {
    successCount: result.successCount,
    failureCount: result.failureCount,
    invalidTokenCount: result.invalidTokens.length,
  });
  return result;
}

export async function sendPushNotificationToUsers(userIds: string[], notification: PushNotification) {
  const users = await User.find({ _id: { $in: userIds } }).select("_id fcmTokens").lean() as UserNotificationRecord[];
  const tokens = users.flatMap((user) => (user.fcmTokens ?? []).map((entry) => entry.token));
  const result = await sendPushNotification(tokens, notification);
  const invalidTokens = new Set(result.invalidTokens);
  await Promise.all(users.map((user) => removeInvalidTokensForUser(
    String(user._id),
    (user.fcmTokens ?? []).map((entry) => entry.token).filter((token) => invalidTokens.has(token)),
  )));
  return result;
}

async function removeInvalidTokensForUser(userId: string, invalidTokens: string[]) {
  const uniqueInvalidTokens = [...new Set(invalidTokens.filter(Boolean))];
  if (uniqueInvalidTokens.length === 0) return;

  try {
    const result = await User.updateOne(
      { _id: userId },
      { $pull: { fcmTokens: { token: { $in: uniqueInvalidTokens } } } },
    );
    console.info("Invalid FCM tokens cleaned up", {
      userId,
      invalidTokenCount: uniqueInvalidTokens.length,
      removedTokenCount: result.modifiedCount,
      tokens: uniqueInvalidTokens.map(maskToken),
    });
  } catch (error: unknown) {
    console.error("Invalid FCM token cleanup failed", {
      userId,
      invalidTokenCount: uniqueInvalidTokens.length,
      message: error instanceof Error ? error.message : "Unknown token cleanup error",
    });
  }
}

function maskToken(token: string) {
  if (token.length <= 8) return "********";
  return `${token.slice(0, 6)}...${token.slice(-4)}`;
}