"use client";

import { useEffect } from "react";

// La clave VAPID llega en base64url; el navegador la quiere como Uint8Array.
function b64aBytes(base64: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/**
 * Registra el service worker y suscribe este dispositivo a las notificaciones push
 * (si el usuario ya dio permiso; el permiso se pide en la pantalla de Chat).
 * Montado en el AppShell: corre en cada sesión y mantiene la suscripción fresca.
 */
export function PushSetup() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    (async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");
        if (Notification.permission !== "granted") return;

        const { configurado, publicKey } = await fetch("/api/push/suscribir").then((r) => r.json());
        if (!configurado) return;

        const sub =
          (await reg.pushManager.getSubscription()) ??
          (await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: b64aBytes(publicKey)
          }));

        await fetch("/api/push/suscribir", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(sub.toJSON())
        });
      } catch {
        /* sin push: la app funciona igual */
      }
    })();
  }, []);

  return null;
}
