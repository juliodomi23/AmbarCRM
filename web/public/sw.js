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

// ─── Caja sin internet (A5) ───────────────────────────────────────────────────
// Solo cachea el shell de /caja y los assets estáticos de Next. Ninguna API ni otra página.
// Los cachés llevan la versión del build (/sw.js?v=<build>) y `activate` borra los de otras versiones,
// para que una caja no se quede con chunks que un despliegue ya eliminó.
const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE_SHELL = `ambar-caja-shell-${VERSION}`;
const CACHE_STATIC = `ambar-caja-static-${VERSION}`;
const CACHES_ACTUALES = [CACHE_SHELL, CACHE_STATIC];

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const nombre of await caches.keys()) {
        if (nombre.startsWith("ambar-caja-") && !CACHES_ACTUALES.includes(nombre)) await caches.delete(nombre);
      }
      await self.clients.claim();
    })()
  );
});

// IndexedDB `ambar-caja` (mismo esquema que src/lib/caja-offline/almacen.ts): `meta/identidadActiva`.
function abrirMeta() {
  return new Promise((resolver, rechazar) => {
    const apertura = indexedDB.open("ambar-caja", 1);
    apertura.onupgradeneeded = () => {
      for (const nombre of ["meta", "catalogo", "cola"]) {
        if (!apertura.result.objectStoreNames.contains(nombre)) apertura.result.createObjectStore(nombre);
      }
    };
    apertura.onsuccess = () => resolver(apertura.result);
    apertura.onerror = () => rechazar(apertura.error);
  });
}

async function identidadActiva() {
  try {
    const db = await abrirMeta();
    return await new Promise((resolver) => {
      const solicitud = db.transaction("meta", "readonly").objectStore("meta").get("identidadActiva");
      solicitud.onsuccess = () => resolver(solicitud.result || null);
      solicitud.onerror = () => resolver(null);
    });
  } catch {
    return null;
  }
}

const claveShell = (identidad) => new Request(`${self.location.origin}/__caja-shell/${encodeURIComponent(identidad)}`);

async function atenderCaja(request) {
  try {
    const respuesta = await fetch(request);
    if (respuesta.ok) {
      // La identidad sale del propio HTML (data-caja-identidad), no de lo último que escribió otra pestaña.
      const html = await respuesta.clone().text();
      const identidad = /data-caja-identidad="(\d+:\d+)"/.exec(html)?.[1];
      if (identidad) {
        const cache = await caches.open(CACHE_SHELL);
        await cache.put(claveShell(identidad), respuesta.clone());
      }
    }
    return respuesta;
  } catch (error) {
    const identidad = await identidadActiva();
    if (identidad) {
      const guardada = await (await caches.open(CACHE_SHELL)).match(claveShell(identidad));
      if (guardada) return guardada;
    }
    throw error;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate" && url.pathname === "/caja") {
    event.respondWith(atenderCaja(request));
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(CACHE_STATIC).then(async (cache) => {
        const guardada = await cache.match(request);
        if (guardada) return guardada;
        const respuesta = await fetch(request);
        if (respuesta.ok) await cache.put(request, respuesta.clone());
        return respuesta;
      })
    );
  }
});

// El cierre de sesión pide borrar el shell de esa identidad (computadora compartida).
self.addEventListener("message", (event) => {
  if (event.data?.tipo !== "caja:limpiar") return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_SHELL);
      if (event.data.identidad) await cache.delete(claveShell(event.data.identidad));
      else for (const clave of await cache.keys()) await cache.delete(clave);
    })()
  );
});
