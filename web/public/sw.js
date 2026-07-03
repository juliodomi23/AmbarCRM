// Service worker de AmbarCRM: notificaciones push y apertura del chat al tocarlas.

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* payload no-JSON */ }
  const titulo = data.titulo || "AmbarCRM";
  event.waitUntil(
    self.registration.showNotification(titulo, {
      body: data.cuerpo || "Tienes un mensaje nuevo",
      icon: "/icon.svg",
      badge: "/icon.svg",
      tag: data.url || "ambarcrm", // agrupa notificaciones del mismo chat
      data: { url: data.url || "/chat" }
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/chat";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((lista) => {
      // Si ya hay una pestaña de la app abierta, la enfoca y navega; si no, abre una.
      for (const c of lista) {
        if ("focus" in c) {
          c.focus();
          if ("navigate" in c) c.navigate(url);
          return;
        }
      }
      return clients.openWindow(url);
    })
  );
});
