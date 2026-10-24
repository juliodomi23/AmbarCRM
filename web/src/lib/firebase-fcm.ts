import { createSign } from "node:crypto";
import { db } from "@/lib/db";

type CuentaServicio = { client_email: string; private_key: string; project_id: string };
let cuenta: CuentaServicio | null | undefined;
let aviso = false;
let acceso: { token: string; vence: number } | null = null;
let renovando: Promise<string> | null = null;

function cuentaServicio() {
  if (cuenta !== undefined) return cuenta;
  try {
    const valor = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!valor) throw new Error("sin configuración");
    const parsed = JSON.parse(valor) as CuentaServicio;
    if (!parsed.client_email || !parsed.private_key || !parsed.project_id) throw new Error("incompleta");
    cuenta = parsed;
  } catch {
    cuenta = null;
    if (!aviso) console.warn("FCM desactivado: falta FIREBASE_SERVICE_ACCOUNT_JSON válida");
    aviso = true;
  }
  return cuenta;
}

export function fcmConfigurado() { return !!cuentaServicio(); }

function base64url(valor: string) { return Buffer.from(valor).toString("base64url"); }

async function fetchLimitado(url: string, init: RequestInit, limite = Date.now() + 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(0, limite - Date.now()));
  try { return await fetch(url, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

async function tokenAcceso(config: CuentaServicio, limite: number) {
  if (acceso && acceso.vence - Date.now() > 5 * 60_000) return acceso.token;
  if (renovando) return renovando;
  renovando = (async () => {
    const ahora = Math.floor(Date.now() / 1000);
    const cabecera = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const cuerpo = base64url(JSON.stringify({ iss: config.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token", iat: ahora, exp: ahora + 3600 }));
    const firmado = `${cabecera}.${cuerpo}`;
    const firma = createSign("RSA-SHA256").update(firmado).sign(config.private_key).toString("base64url");
    const respuesta = await fetchLimitado("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${firmado}.${firma}` })
    }, limite);
    if (!respuesta.ok) throw new Error(`OAuth FCM: ${respuesta.status}`);
    const datos = await respuesta.json() as { access_token: string; expires_in: number };
    if (!datos.access_token) throw new Error("OAuth FCM sin token");
    acceso = { token: datos.access_token, vence: Date.now() + datos.expires_in * 1000 };
    return acceso.token;
  })();
  try { return await renovando; }
  finally { renovando = null; }
}

function datosNotificacion(url: string, tipo: "mensaje" | "atencion_humana") {
  const data: Record<string, string> = { url, tipo };
  const match = /^\/chat\?conv=(\d+)$/.exec(url);
  if (match) data.conversacionId = match[1];
  return data;
}

export async function enviarFcmAOrg(titulo: string, cuerpo: string, url: string, usuarioId?: bigint, tipo: "mensaje" | "atencion_humana" = "mensaje") {
  const config = cuentaServicio();
  if (!config) return;
  const limite = Date.now() + 8000;
  const dispositivos = await db.dispositivoPush.findMany({
    where: usuarioId == null ? undefined : { usuarioId },
    select: { id: true, tokenFcm: true }
  });
  if (!dispositivos.length) return;
  const accessToken = await tokenAcceso(config, limite);
  await Promise.allSettled(dispositivos.map(async (dispositivo) => {
    try {
      const respuesta = await fetchLimitado(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(config.project_id)}/messages:send`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ message: { token: dispositivo.tokenFcm,
          notification: { title: titulo, body: cuerpo.slice(0, 150) }, data: datosNotificacion(url, tipo),
          android: { priority: "high" }, apns: { payload: { aps: { sound: "default" } } } } })
      }, limite);
      if (respuesta.ok) return;
      const error = await respuesta.json().catch(() => null) as { error?: { status?: string; details?: Array<{ errorCode?: string }> } } | null;
      const codigo = error?.error?.details?.find((d) => d.errorCode)?.errorCode;
      if ((respuesta.status === 404 && codigo === "UNREGISTERED") ||
          (respuesta.status === 400 && codigo === "INVALID_ARGUMENT")) {
        await db.dispositivoPush.deleteMany({ where: { id: dispositivo.id } });
      } else console.warn("FCM falló:", respuesta.status, codigo ?? error?.error?.status ?? "sin detalle");
    } catch (error) {
      console.warn("FCM falló:", error instanceof Error ? error.name : "error");
    }
  }));
}
