import { getApp, getApps, initializeApp } from "firebase/app";
import { getMessaging, getToken, isSupported, onMessage, type MessagePayload } from "firebase/messaging";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const requiredFirebaseConfig = Object.entries(firebaseConfig);
let foregroundMessageListenerRegistered = false;
const displayedForegroundMessageIds = new Set<string>();

function summarizePayload(payload: MessagePayload) {
  return {
    notification: payload.notification
      ? {
          exists: true,
          title: payload.notification.title ?? null,
          body: payload.notification.body ?? null,
        }
      : { exists: false },
    data: payload.data
      ? {
          exists: true,
          keys: Object.keys(payload.data),
          title: payload.data.title ?? null,
          body: payload.data.body ?? null,
          supportTicketNotificationId: payload.data.supportTicketNotificationId ?? null,
        }
      : { exists: false },
  };
}

export type WebPushRegistrationStep =
  | "messaging-initializing"
  | "messaging-initialized"
  | "service-worker-registering"
  | "service-worker-registered"
  | "service-worker-state"
  | "service-worker-ready"
  | "get-token-calling"
  | "get-token-completed";

type WebPushRegistrationOptions = {
  onStep?: (step: WebPushRegistrationStep, details?: { state?: string; ready?: boolean }) => void;
};

const WEB_PUSH_OPERATION_TIMEOUT_MS = 15_000;

function withTimeout<T>(operation: Promise<T>, label: string) {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      const error = new Error(`${label} timed out after ${WEB_PUSH_OPERATION_TIMEOUT_MS / 1000} seconds`);
      error.name = "NotificationRegistrationTimeout";
      console.error("[NotificationRegistration] Operation timed out", { operation: label });
      reject(error);
    }, WEB_PUSH_OPERATION_TIMEOUT_MS);

    operation.then((value) => {
      window.clearTimeout(timeoutId);
      resolve(value);
    }, (error: unknown) => {
      window.clearTimeout(timeoutId);
      reject(error);
    });
  });
}

function waitForActiveServiceWorker(
  registration: ServiceWorkerRegistration,
  notify: WebPushRegistrationOptions["onStep"],
) {
  return new Promise<ServiceWorker>((resolve, reject) => {
    const worker = registration.installing ?? registration.waiting ?? registration.active;
    if (!worker) {
      reject(new Error("Firebase messaging service worker did not start"));
      return;
    }

    const reportState = () => notify?.("service-worker-state", { state: worker.state });
    const handleStateChange = () => {
      reportState();
      if (worker.state === "activated") {
        worker.removeEventListener("statechange", handleStateChange);
        resolve(worker);
      }
    };

    reportState();
    if (worker.state === "activated") {
      resolve(worker);
      return;
    }
    worker.addEventListener("statechange", handleStateChange);
  });
}

export async function registerForWebPushToken(options: WebPushRegistrationOptions = {}) {
  const notify = options.onStep ?? (() => undefined);
  console.info("[NotificationDiagnostics] registerForWebPushToken started", {
    origin: typeof window === "undefined" ? "server" : window.location.origin,
    notificationPermission: typeof Notification === "undefined" ? "unavailable" : Notification.permission,
  });
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    throw new Error("Firebase web notifications require a browser");
  }
  notify("messaging-initializing");
  if (!(await withTimeout(isSupported(), "Firebase messaging support check"))) throw new Error("Push notifications are not supported in this browser");
  const missingConfig = requiredFirebaseConfig
    .filter(([, value]) => !value)
    .map(([name]) => name);
  if (!process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY) {
    missingConfig.push("NEXT_PUBLIC_FIREBASE_VAPID_KEY");
  }
  if (missingConfig.length > 0) {
    throw new Error(`Firebase web notification configuration is incomplete: ${missingConfig.join(", ")}`);
  }

  const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
  console.info("[NotificationDiagnostics] Firebase messaging initialized");
  notify("messaging-initialized");
  notify("service-worker-registering");
  const serviceWorkerScriptUrl = "/firebase-messaging-sw.js";
  console.info("[NotificationRegistration] Service worker script URL:", serviceWorkerScriptUrl);
  const registration = await withTimeout(navigator.serviceWorker.register(
    `${serviceWorkerScriptUrl}?apiKey=${encodeURIComponent(firebaseConfig.apiKey!)}&authDomain=${encodeURIComponent(firebaseConfig.authDomain!)}&projectId=${encodeURIComponent(firebaseConfig.projectId!)}&storageBucket=${encodeURIComponent(firebaseConfig.storageBucket!)}&messagingSenderId=${encodeURIComponent(firebaseConfig.messagingSenderId!)}&appId=${encodeURIComponent(firebaseConfig.appId!)}`,
  ), "Firebase messaging service worker registration");
  console.info("[NotificationDiagnostics] Service worker registration succeeded", {
    origin: window.location.origin,
    scope: registration.scope,
    state: registration.installing?.state ?? registration.waiting?.state ?? registration.active?.state ?? "none",
  });
  notify("service-worker-registered");
  const readyRegistration = await withTimeout(navigator.serviceWorker.ready, "Firebase messaging service worker ready");
  const readyWorker = readyRegistration.active;
  notify("service-worker-ready", { ready: Boolean(readyWorker), state: readyWorker?.state ?? "none" });
  const activeWorker = await withTimeout(
    waitForActiveServiceWorker(registration, notify),
    "Firebase messaging service worker activation",
  );
  if (!activeWorker || activeWorker.state !== "activated") {
    throw new Error("Firebase messaging service worker is not active");
  }
  console.info("[NotificationDiagnostics] Service worker activated", {
    origin: window.location.origin,
    scope: readyRegistration.scope,
    state: activeWorker.state,
  });
  const messaging = getMessaging(app);
  if (!foregroundMessageListenerRegistered) {
    console.info("[NotificationDiagnostics] Registering foreground onMessage listener");
    onMessage(messaging, async (payload) => {
      console.info("[NotificationDiagnostics] Foreground onMessage callback triggered", {
        messageId: payload.messageId ?? null,
        ...summarizePayload(payload),
      });
      console.info("[NotificationDiagnostics] Notification.permission", Notification.permission);
      console.info("[NotificationRegistration] Foreground message received", {
        messageId: payload.messageId ?? null,
        supportTicketNotificationId: payload.data?.supportTicketNotificationId ?? null,
      });
      if (Notification.permission !== "granted") {
        console.info("[NotificationDiagnostics] Foreground notification skipped because permission is not granted");
        return;
      }
      if (payload.messageId && displayedForegroundMessageIds.has(payload.messageId)) {
        console.info("[NotificationDiagnostics] Duplicate foreground notification skipped", {
          messageId: payload.messageId,
        });
        return;
      }
      const title = payload.data?.title ?? payload.notification?.title ?? "New Notification";
      const body = payload.data?.body ?? payload.notification?.body ?? "You have a new notification.";
      console.info("[NotificationDiagnostics] Attempting Service Worker notification", {
        title,
        body,
        messageId: payload.messageId ?? null,
      });
      try {
        await registration.showNotification(title, {
          body,
          data: payload.data ?? {},
        });
        if (payload.messageId) {
          displayedForegroundMessageIds.add(payload.messageId);
          if (displayedForegroundMessageIds.size > 100) {
            const oldestMessageId = displayedForegroundMessageIds.values().next().value;
            if (oldestMessageId) displayedForegroundMessageIds.delete(oldestMessageId);
          }
        }
        console.info("[NotificationDiagnostics] Service Worker notification succeeded");
      } catch (error: unknown) {
        console.error("[NotificationDiagnostics] Service Worker notification failed", {
          name: error instanceof Error ? error.name : "UnknownError",
          message: error instanceof Error ? error.message : "Unknown notification error",
        });
      }
    });
    foregroundMessageListenerRegistered = true;
    console.info("[NotificationDiagnostics] Foreground onMessage listener registered");
  }

  notify("get-token-calling");
  let token: string;
  try {
    token = await withTimeout(getToken(messaging, {
      vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: readyRegistration,
    }), "Firebase getToken");
    console.info("[NotificationDiagnostics] getToken returned", {
      tokenExists: Boolean(token),
      tokenLength: token?.length ?? 0,
      vapidKeyExists: Boolean(process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY),
      notificationPermission: Notification.permission,
      serviceWorkerState: readyRegistration.active?.state ?? "none",
    });
  } catch (error: unknown) {
    const firebaseError = error as { code?: unknown; message?: unknown; name?: unknown };
    console.error("[NotificationDiagnostics] getToken failed", {
      name: typeof firebaseError.name === "string" ? firebaseError.name : error instanceof Error ? error.name : "UnknownError",
      code: typeof firebaseError.code === "string" ? firebaseError.code : null,
      message: typeof firebaseError.message === "string" ? firebaseError.message : error instanceof Error ? error.message : "Unknown Firebase getToken error",
      vapidKeyExists: Boolean(process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY),
      notificationPermission: Notification.permission,
      serviceWorkerState: readyRegistration.active?.state ?? "none",
    });
    throw error;
  }
  notify("get-token-completed");
  return token;
}