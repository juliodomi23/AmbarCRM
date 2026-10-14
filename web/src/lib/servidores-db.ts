import { isIP } from "node:net";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ErrorRetail, transaccionTenant } from "@/lib/retail-db";
import { fechaAR, hoyAR, montoOpcional } from "@/lib/contratos-cobros";
import { estadoServidor, diasParaVencer } from "@/lib/servidores";
import { nuevoTokenHeartbeat } from "../../scripts/lib/heartbeat-token.mjs";

export const CAMPOS_SERVIDOR = { id: true, nombre: true, proveedor: true, ip: true, propietario: true, loPagamos: true, costoAnualMxn: true, vence: true, activo: true, ramTotalMb: true, notas: true, cargasLibres: true, ultimoReporte: true } satisfies Prisma.ServidorSelect;

export function validarServidor(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new RangeError("Servidor inválido");
  const b = body as Record<string, unknown>;
  function texto(clave: string, max: number, requerido = false) {
    if (b[clave] != null && typeof b[clave] !== "string") throw new RangeError("Texto inválido");
    const valor = String(b[clave] ?? "").trim();
    if (valor.length > max || (requerido && !valor)) throw new RangeError("Texto inválido");
    return valor;
  }
  function booleano(clave: string, defecto: boolean) {
    if (b[clave] === undefined) return defecto;
    if (typeof b[clave] !== "boolean") throw new RangeError("Booleano inválido");
    return b[clave] as boolean;
  }
  const ip = texto("ip", 45, true);
  if (!isIP(ip)) throw new RangeError("IP inválida");
  const ramTotalMb = b.ramTotalMb == null || b.ramTotalMb === "" ? null : Number(b.ramTotalMb);
  if (ramTotalMb !== null && (!Number.isInteger(ramTotalMb) || ramTotalMb < 0 || ramTotalMb > 2147483647)) throw new RangeError("RAM inválida");
  return { nombre: texto("nombre", 120, true), proveedor: texto("proveedor", 80, true), ip, propietario: texto("propietario", 120, true), loPagamos: booleano("loPagamos", true), activo: booleano("activo", true), costoAnualMxn: montoOpcional(b.costoAnualMxn), vence: fechaAR(b.vence), ramTotalMb, notas: texto("notas", 10000) || null, cargasLibres: texto("cargasLibres", 10000) || null };
}

export async function listarServidores(ahora = new Date()) {
  const filas = await db.servidor.findMany({ orderBy: { nombre: "asc" }, select: {
    ...CAMPOS_SERVIDOR,
    contratos: { select: { id: true, tipo: true, estado: true, contacto: { select: { nombre: true } } } },
    heartbeats: { orderBy: { fecha: "desc" }, take: 1 },
  } });
  const historial = await db.heartbeatServidor.findMany({ where: { fecha: { gte: new Date(ahora.getTime() - 86400000) } }, orderBy: { fecha: "asc" } });
  return filas.map(s => ({ ...s, ...estadoServidor(s.heartbeats[0] ?? (s.ultimoReporte ? { fecha: s.ultimoReporte, ramPct: null, discoPct: null } : null), ahora), diasParaVencer: diasParaVencer(s.vence, hoyAR(ahora)), ultimo: s.heartbeats[0] ?? null, inicioHistorial: new Date(ahora.getTime() - 86400000), historial: historial.filter(h => h.servidorId === s.id) }));
}

export function crearServidor(orgId: bigint, datos: ReturnType<typeof validarServidor>) {
  const { token, hash } = nuevoTokenHeartbeat();
  return transaccionTenant(orgId, async tx => ({ servidor: await tx.servidor.create({ data: { ...datos, heartbeatTokenHash: hash }, select: CAMPOS_SERVIDOR }), token }));
}

export function editarServidor(orgId: bigint, id: bigint, cambios: unknown) {
  return transaccionTenant(orgId, async tx => {
    await tx.$queryRaw`SELECT id FROM servidores WHERE id=${id} FOR UPDATE`;
    const actual = await tx.servidor.findFirst({ where: { id }, select: CAMPOS_SERVIDOR });
    if (!actual) throw new ErrorRetail("Servidor inexistente", 404);
    if (!cambios || typeof cambios !== "object" || Array.isArray(cambios)) throw new RangeError("Datos inválidos");
    const datos = validarServidor({ ...actual, costoAnualMxn: actual.costoAnualMxn?.toString(), ...cambios });
    return tx.servidor.update({ where: { id }, data: datos, select: CAMPOS_SERVIDOR });
  });
}

export function regenerarToken(orgId: bigint, id: bigint) {
  return transaccionTenant(orgId, async tx => {
    await tx.$queryRaw`SELECT id FROM servidores WHERE id=${id} FOR UPDATE`;
    if (!await tx.servidor.findFirst({ where: { id }, select: { id: true } })) throw new ErrorRetail("Servidor inexistente", 404);
    const { token, hash } = nuevoTokenHeartbeat();
    await tx.servidor.update({ where: { id }, data: { heartbeatTokenHash: hash } });
    return { token };
  });
}
