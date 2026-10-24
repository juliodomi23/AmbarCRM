// Web Push a los dispositivos suscritos de la org ACTUAL (las queries corren bajo RLS,
// así que hay que llamarlo dentro de runWithOrg o con sesión).
// Claves VAPID: npx web-push generate-vapid-keys (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY).

import webpush from "web-push";
import { db } from "@/lib/db";
import { enviarFcmAOrg, fcmConfigurado } from "@/lib/firebase-fcm";

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY ?? "";
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY ?? "";

export const pushConfigurado = Boolean(PUBLIC_KEY && PRIVATE_KEY);
export const vapidPublicKey = PUBLIC_KEY;

if (pushConfigurado) {
  webpush.setVapidDetails("mailto:soporte@ambarrojo.mx", PUBLIC_KEY, PRIVATE_KEY);
}

/** Manda una notificación push a la org o al usuario indicado. No lanza: loguea y sigue. */
export async function enviarPushAOrg(titulo: string, cuerpo: string, url: string, usuarioId?: bigint, tipo: "mensaje" | "atencion_humana" = "mensaje") {
  const tareas: Promise<unknown>[] = [];
  if (pushConfigurado) tareas.push(enviarWebPush(titulo, cuerpo, url, usuarioId, tipo));
  if (fcmConfigurado()) tareas.push(enviarFcmAOrg(titulo, cuerpo, url, usuarioId, tipo));
  const resultados = await Promise.allSettled(tareas);
  for (const resultado of resultados) {
    if (resultado.status === "rejected") console.warn("push falló:", resultado.reason instanceof Error ? resultado.reason.message : "error");
  }
}

async function enviarWebPush(titulo: string, cuerpo: string, url: string, usuarioId?: bigint, tipo: "mensaje" | "atencion_humana" = "mensaje") {
  const subs = await db.pushSuscripcion.findMany({ where: usuarioId == null ? undefined : { usuarioId } });
  const payload = JSON.stringify({ titulo, cuerpo: cuerpo.slice(0, 150), url, tipo, ...(url.match(/^\/chat\?conv=(\d+)$/) ? { conversacionId: url.match(/^\/chat\?conv=(\d+)$/)![1] } : {}) });
  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          payload
        );
      } catch (e: any) {
        // 404/410 = la suscripción ya no existe (app desinstalada, permiso revocado): se limpia.
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await db.pushSuscripcion.delete({ where: { id: s.id } }).catch(() => {});
        } else {
          console.warn("push falló:", e?.statusCode ?? e?.message ?? e);
        }
      }
    })
  );
}
