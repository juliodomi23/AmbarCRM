import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { esIpInterna, validarWebhookUrl } from "@/lib/webhook-url";

export function validarUrlCanalApi(valor: string) {
  const error = validarWebhookUrl(valor);
  if (error) return error;
  return new URL(valor).protocol === "https:" ? null : "el webhook debe usar https";
}

export function firmaApi(secreto: string, timestamp: string, cuerpo: string) {
  return `sha256=${createHmac("sha256", secreto).update(`${timestamp}.${cuerpo}`).digest("hex")}`;
}

export function verificarFirmaApi(secreto: string, timestamp: string, cuerpo: string, firma: string) {
  const esperado = Buffer.from(firmaApi(secreto, timestamp, cuerpo));
  const recibido = Buffer.from(firma);
  return esperado.length === recibido.length && timingSafeEqual(esperado, recibido);
}

type Direccion = { address: string; family: number };
type Peticion = { url: URL; direccion: Direccion; cuerpo: string; headers: Record<string, string> };

async function resolver(hostname: string) {
  return lookup(hostname.replace(/^\[|\]$/g, ""), { all: true, verbatim: true });
}

function enviarSeguro({ url, direccion, cuerpo, headers }: Peticion): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request(url, {
      method: "POST", headers,
      // La conexión usa la IP validada y conserva hostname/SNI para verificar TLS.
      lookup: (_hostname, options, callback) => {
        if (options.all) callback(null, [direccion]);
        else callback(null, direccion.address, direccion.family);
      },
    }, (res) => { res.resume(); resolve(res.statusCode ?? 0); });
    const timer = setTimeout(() => req.destroy(new Error("webhook agotó el tiempo de espera de 5 s")), 5000);
    req.on("close", () => clearTimeout(timer));
    req.on("error", reject);
    req.end(cuerpo);
  });
}

export async function entregarWebhookApi(
  url: string, secreto: string, payload: unknown,
  opciones: {
    resolver?: (host: string) => Promise<Direccion[]>;
    enviar?: (peticion: Peticion) => Promise<number>;
    esperar?: (ms: number) => Promise<void>;
  } = {},
) {
  const errorUrl = validarUrlCanalApi(url);
  if (errorUrl) return { ok: false, error: errorUrl };
  const cuerpo = JSON.stringify(payload);
  const entrega = randomUUID();
  const destino = new URL(url);
  let error = "no se pudo entregar el webhook";
  for (let intento = 0; intento < 4; intento++) {
    try {
      const direcciones = await (opciones.resolver ?? resolver)(destino.hostname);
      if (!direcciones.length || direcciones.some((d) => esIpInterna(d.address))) {
        return { ok: false, error: "el webhook resuelve a una dirección privada o local" };
      }
      const timestamp = String(Math.floor(Date.now() / 1000));
      const status = await (opciones.enviar ?? enviarSeguro)({
        url: destino, direccion: direcciones[0], cuerpo,
        headers: {
          "Content-Type": "application/json", "X-Ambar-Delivery": entrega,
          "X-Ambar-Timestamp": timestamp, "X-Ambar-Signature": firmaApi(secreto, timestamp, cuerpo),
        },
      });
      if (status >= 200 && status < 300) return { ok: true, waMessageId: entrega };
      error = `webhook HTTP ${status}`;
      if (status < 500 && status !== 429) break;
    } catch (e) { error = e instanceof Error ? e.message : "error de red"; }
    if (intento < 3) await (opciones.esperar ?? ((ms) => new Promise((r) => setTimeout(r, ms))))(500 * 2 ** intento);
  }
  return { ok: false, error };
}
