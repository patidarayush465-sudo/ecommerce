importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

console.info("[NotificationDiagnostics] Firebase messaging service worker script loaded", {
	origin: self.location.origin,
	scope: self.registration.scope,
});

const config = Object.fromEntries(new URL(self.location.href).searchParams.entries());
firebase.initializeApp(config);
console.info("[NotificationDiagnostics] Firebase initialized in service worker", {
	origin: self.location.origin,
	scope: self.registration.scope,
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
	const data = payload && payload.data ? payload.data : {};
	const hasNotificationPayload = Boolean(payload && payload.notification);
	console.info("[NotificationDiagnostics] Background message callback triggered", {
		messageId: payload && payload.messageId ? payload.messageId : null,
		hasNotificationPayload,
		dataKeys: Object.keys(data),
	});
	console.info("[NotificationRegistration] Background message received", {
		messageId: payload && payload.messageId ? payload.messageId : null,
		supportTicketNotificationId: data.supportTicketNotificationId || null,
		hasNotificationPayload,
	});

	// Firebase automatically displays messages that contain a notification payload.
	// Only data-only messages need an explicit browser notification here.
	if (hasNotificationPayload) {
		console.info("[NotificationDiagnostics] Manual showNotification skipped because payload.notification exists");
		return;
	}

	const notification = payload && payload.notification ? payload.notification : {};
	const title = notification.title || data.title || "New Notification";
	const body = notification.body || data.body || "You have a new notification.";

	console.info("[NotificationRegistration] Background showNotification called", {
		supportTicketNotificationId: data.supportTicketNotificationId || null,
	});
	console.info("[NotificationDiagnostics] Manual showNotification called");
	return self.registration.showNotification(title, {
		body,
	});
});

self.addEventListener("notificationclick", (event) => {
	console.info("[NotificationDiagnostics] notificationclick triggered");
	event.notification.close();
	event.waitUntil(
		self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
			const existingClient = clientList.find((client) => "focus" in client);
			if (existingClient) return existingClient.focus();
			return self.clients.openWindow("/customer/home");
		}),
	);
});