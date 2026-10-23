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

/** Manda una notificación push a todos los dispositivos de la org. No lanza: loguea y sigue. */
export async function enviarPushAOrg(titulo: string, cuerpo: string, url: string) {
  const tareas: Promise<unknown>[] = [];
  if (pushConfigurado) tareas.push(enviarWebPush(titulo, cuerpo, url));
  if (fcmConfigurado()) tareas.push(enviarFcmAOrg(titulo, cuerpo, url));
  const resultados = await Promise.allSettled(tareas);
  for (const resultado of resultados) {
    if (resultado.status === "rejected") console.warn("push falló:", resultado.reason instanceof Error ? resultado.reason.message : "error");
  }
}

async function enviarWebPush(titulo: string, cuerpo: string, url: string) {
  const subs = await db.pushSuscripcion.findMany();
  const payload = JSON.stringify({ titulo, cuerpo, url });
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
