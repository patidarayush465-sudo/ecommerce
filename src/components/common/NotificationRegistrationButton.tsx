"use client";

import { startTransition, useEffect, useState } from "react";

import { registerForWebPushToken } from "@/lib/firebase-client";

const REGISTERED_KEY = "web-push-notifications-registered";

type NotificationRegistrationButtonProps = {
  dark?: boolean;
  compact?: boolean;
  audience: "customer" | "admin";
};

async function hasActiveFirebaseMessagingServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    return registrations.some((registration) => {
      const worker = registration.active;
      if (!worker || worker.state !== "activated") return false;

      try {
        return new URL(worker.scriptURL).pathname === "/firebase-messaging-sw.js";
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

export default function NotificationRegistrationButton({ dark = false, compact = false, audience }: NotificationRegistrationButtonProps) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [isRegistered, setIsRegistered] = useState(false);
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function initializeRegistrationState() {
      const nextPermission = typeof Notification === "undefined" ? "default" : Notification.permission;
      const storageKey = `${REGISTERED_KEY}-${audience}`;
      const storedRegistration = window.localStorage.getItem(storageKey) === "true";
      const activeFirebaseWorker = audience === "customer"
        ? await hasActiveFirebaseMessagingServiceWorker()
        : true;
      const registrationIsValid = storedRegistration
        && nextPermission === "granted"
        && activeFirebaseWorker;

      if (audience === "customer" && storedRegistration && !registrationIsValid) {
        window.localStorage.removeItem(storageKey);
      }

      if (cancelled) return;
      startTransition(() => {
        setPermission(nextPermission);
        setIsRegistered(registrationIsValid);
      });
    }

    void initializeRegistrationState();
    return () => {
      cancelled = true;
    };
  }, [audience]);

  async function enableNotifications() {
    if (isRegistering || isRegistered) return;
    if (audience === "admin") console.info("[NotificationRegistration] Enable clicked");
    setIsRegistering(true);
    setMessage("");
    setErrorMessage("");
    try {
      if (typeof Notification === "undefined") throw new Error("Browser notifications are not supported.");
      if (audience === "admin") console.info("[NotificationRegistration] Requesting notification permission...");
      const nextPermission = await Notification.requestPermission();
      setPermission(nextPermission);
      if (audience === "admin") console.info(`[NotificationRegistration] Permission result: ${nextPermission}`);
      if (nextPermission === "denied") {
        setErrorMessage("Notifications are blocked. Allow them in your browser settings to enable alerts.");
        return;
      }
      if (nextPermission !== "granted") {
        setErrorMessage("Notification permission was not granted.");
        return;
      }
      const token = await registerForWebPushToken({
        onStep: (step, details) => {
          if (audience !== "admin") return;
          const messages = {
            "messaging-initializing": "[NotificationRegistration] Initializing Firebase messaging...",
            "messaging-initialized": "[NotificationRegistration] Messaging initialized",
            "service-worker-registering": "[NotificationRegistration] Registering Firebase messaging service worker...",
            "service-worker-registered": "[NotificationRegistration] Service worker registered",
            "service-worker-state": "[NotificationRegistration] Service worker registration state:",
            "service-worker-ready": "[NotificationRegistration] Service worker ready:",
            "get-token-calling": "[NotificationRegistration] Calling getToken...",
            "get-token-completed": "[NotificationRegistration] getToken completed",
          } as const;
          if (details?.state) console.info(messages[step], details.state);
          else if (details?.ready !== undefined) console.info(messages[step], details.ready);
          else console.info(messages[step]);
        },
      });
      if (!token) throw new Error("Firebase did not return a notification token");
      const response = await fetch("/api/customer/notifications/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-notification-audience": audience,
        },
        body: JSON.stringify({ token, deviceType: "web" }),
      });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(body.message ?? "Unable to register notifications");
      window.localStorage.setItem(`${REGISTERED_KEY}-${audience}`, "true");
      setIsRegistered(true);
      setMessage("Push notifications enabled.");
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error && error.name === "NotificationRegistrationTimeout"
        ? "Unable to enable notifications. Please try again."
        : error instanceof Error ? error.message : "Unable to enable notifications. Please try again.");
    } finally {
      setIsRegistering(false);
    }
  }

  const enabled = permission === "granted" && isRegistered;
  const buttonClass = dark
    ? "rounded-lg border border-amber-300 px-6 py-3 font-semibold text-amber-200 transition-colors hover:bg-amber-300/10 disabled:cursor-not-allowed disabled:opacity-60"
    : "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-900 hover:text-white disabled:cursor-not-allowed disabled:opacity-60";

  return (
    <div className={compact ? "mt-3" : "mt-8"}>
      <button type="button" onClick={() => void enableNotifications()} disabled={isRegistering || enabled} className={buttonClass}>
        {isRegistering ? "Enabling..." : enabled ? "Notifications Enabled" : "Enable Notifications"}
      </button>
      {permission === "denied" && !errorMessage && <p className={`mt-2 text-xs ${dark ? "text-red-300" : "text-rose-300"}`}>Notifications are blocked in browser settings.</p>}
      {message && <p className={`mt-2 text-xs ${dark ? "text-emerald-300" : "text-emerald-300"}`} role="status">{message}</p>}
      {errorMessage && <p className={`mt-2 text-xs ${dark ? "text-red-300" : "text-rose-300"}`} role="alert">{errorMessage}</p>}
    </div>
  );
}
