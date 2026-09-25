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
const displayedMessageIds = new Set();

messaging.onBackgroundMessage((payload) => {
	const data = payload && payload.data ? payload.data : {};
	const notification = payload && payload.notification ? payload.notification : {};
	const title = notification.title || data.title || "New Notification";
	const body = notification.body || data.body || "You have a new notification.";
	const messageId = payload && payload.messageId ? payload.messageId : null;

	console.info("[NotificationDiagnostics] Background message received", { messageId });
	console.info("[NotificationDiagnostics] Notification title/body selected", { title, body });

	if (messageId && displayedMessageIds.has(messageId)) {
		return Promise.resolve();
	}
	if (messageId) displayedMessageIds.add(messageId);

	return self.registration.showNotification(title, {
		body,
		data,
	}).then(() => {
		console.info("[NotificationDiagnostics] showNotification succeeded", { messageId });
	}).catch((error) => {
		if (messageId) displayedMessageIds.delete(messageId);
		console.error("[NotificationDiagnostics] showNotification failed", {
			messageId,
			code: error && error.code ? error.code : null,
			message: error && error.message ? error.message : String(error),
		});
		throw error;
	});
});

self.addEventListener("notificationclick", (event) => {
	console.info("[NotificationDiagnostics] notificationclick triggered");
	event.notification.close();
	event.waitUntil(
		self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
			const existingClient = clientList.find((client) =>
				"focus" in client && new URL(client.url).pathname.startsWith("/customer"),
			);
			if (existingClient) return existingClient.focus();
			return self.clients.openWindow("/customer/home");
		}),
	);
});