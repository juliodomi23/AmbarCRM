import { db } from "@/lib/db";
import { decryptMetaToken } from "@/lib/meta/credentials";
import type { ClienteAurum, ConexionAurum } from "@/lib/lealtad";

export class ErrorAurum extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

/** URL fija por entorno: ninguna empresa puede apuntar el servidor a otra dirección. */
export function urlAurum() {
  const url = process.env.AURUM_URL?.replace(/\/+$/, "");
  if (!url) throw new ErrorAurum("La integración con Aurum no está configurada", 503);
  return url;
}

export async function moduloLealtad() {
  return db.moduloOrg.findFirst({ where: { clave: "lealtad", activo: true } });
}

export function conexionDe(config: unknown) {
  const aurum = (config as { aurum?: ConexionAurum } | null)?.aurum;
  return aurum?.slug && aurum.claveCifrada ? aurum : null;
}

/** Llamada autenticada como el negocio. Un 401 desactiva la conexión: Aurum bloquea la IP
 *  tras 10 claves fallidas, y esa IP es la de todas las empresas de AmbarCRM. */
export async function llamarAurum(
  conexion: ConexionAurum,
  ruta: string,
  init: RequestInit = {},
  clave = decryptMetaToken(conexion.claveCifrada),
) {
  if (conexion.estado === "error") {
    throw new ErrorAurum("La conexión con Aurum tiene un error; vuelve a conectarla", 409);
  }
  const respuesta = await fetch(`${urlAurum()}${ruta}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${clave}`, ...init.headers },
    signal: AbortSignal.timeout(8000),
  }).catch(() => {
    throw new ErrorAurum("Aurum no responde");
  });
  const datos = await respuesta.json().catch(() => ({}));
  if (respuesta.status === 401) {
    await marcarError("La clave de Aurum ya no es válida");
    throw new ErrorAurum("La clave de Aurum ya no es válida; vuelve a conectarla", 409);
  }
  if (!respuesta.ok) throw new ErrorAurum(String(datos.error ?? "Aurum rechazó la operación"), 400);
  return datos;
}

async function marcarError(error: string) {
  const modulo = await moduloLealtad();
  const conexion = conexionDe(modulo?.config);
  if (!modulo || !conexion) return;
  const config = modulo.config as Record<string, unknown>;
  await db.moduloOrg.update({
    where: { id: modulo.id },
    data: { config: { ...config, aurum: { ...conexion, estado: "error", error } } },
  });
  cache.delete(conexion.slug);
}

// ponytail: caché en memoria por proceso (60 s); con varios procesos o miles de clientes,
// pedir a Aurum un endpoint de búsqueda por teléfono.
const cache = new Map<string, { hasta: number; clientes: ClienteAurum[] }>();

export async function clientesAurum(conexion: ConexionAurum, { fresco = false } = {}) {
  const guardado = cache.get(conexion.slug);
  if (!fresco && guardado && guardado.hasta > Date.now()) return guardado.clientes;
  const clientes = (await llamarAurum(
    conexion,
    `/api/${encodeURIComponent(conexion.slug)}/customers`,
  )) as ClienteAurum[];
  cache.set(conexion.slug, { hasta: Date.now() + 60_000, clientes });
  return clientes;
}

export async function accionTarjeta(conexion: ConexionAurum, accion: "stamp" | "redeem", token: string) {
  const resultado = await llamarAurum(conexion, `/api/${accion}`, {
    method: "POST",
    body: JSON.stringify({ token }),
  });
  cache.delete(conexion.slug);
  return resultado;
}

/** Verifica slug + clave del dueño una sola vez, al conectar. */
export async function verificarCredenciales(slug: string, clave: string) {
  const respuesta = await fetch(`${urlAurum()}/api/${encodeURIComponent(slug)}/stats`, {
    headers: { Authorization: `Bearer ${clave}` },
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  if (!respuesta) return "Aurum no responde";
  if (respuesta.status === 404) return "No existe ese negocio en Aurum";
  if (respuesta.status === 401) return "La clave no es la del dueño de ese negocio";
  if (respuesta.status === 429) return "Demasiados intentos; espera 15 minutos";
  return respuesta.ok ? null : "Aurum rechazó la conexión";
}

export function ligaDeAlta(slug: string) {
  return `${urlAurum()}/join.html?b=${encodeURIComponent(slug)}`;
}
