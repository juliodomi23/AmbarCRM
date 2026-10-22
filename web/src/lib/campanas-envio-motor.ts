import { db } from "@/lib/db";
import { getProvider } from "@/lib/channel";
import { horarioPermitido } from "@/lib/campanas-envio";
import { aplicarVariables } from "@/lib/plantillas";
import { transaccionTenant } from "@/lib/retail-db";
import type { ResultadoEnvio } from "@/lib/channel/types";
import { Prisma } from "@prisma/client";

const espera = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const recientes = ["enviado", "entregado", "leido", "respondio"];

async function reclamarTanda(orgId: bigint, campanaId: bigint, ahora: Date) {
  return transaccionTenant(orgId, async (tx) => {
    const base = await tx.campanaEnvio.findFirst({ where: { id: campanaId }, select: { canalId: true } });
    if (!base) return [];
    await tx.$queryRaw`SELECT id FROM canales_whatsapp WHERE id = ${base.canalId} FOR UPDATE`;
    const campana = await tx.campanaEnvio.findFirst({ where: { id: campanaId } });
    if (!campana || !["programada", "en_curso"].includes(campana.estado) || !campana.confirmoPermiso || !horarioPermitido(campana, ahora)) return [];
    const hoy = await tx.$queryRaw<{ total: bigint }[]>`
      SELECT count(*)::bigint AS total FROM campanas_destinatarios d
      JOIN campanas_envio c ON c.id = d.campana_id
      WHERE c.canal_id = ${campana.canalId}
        AND (d.enviado_at AT TIME ZONE ${campana.zonaHoraria})::date = (${ahora}::timestamptz AT TIME ZONE ${campana.zonaHoraria})::date`;
    const restantes = Math.max(0, campana.topeDiario - Number(hoy[0]?.total ?? 0));
    if (!restantes) return [];
    const ids = await tx.$queryRaw<{ id: bigint }[]>`
      SELECT d.id FROM campanas_destinatarios d
      JOIN contactos contacto ON contacto.id = d.contacto_id
      WHERE d.campana_id = ${campanaId} AND contacto.opt_out_difusion = false
        AND (d.estado = 'pendiente' OR (d.estado = 'omitido' AND d.error_codigo = 131049 AND d.reintentos = 0 AND d.reintentar_at <= ${ahora}))
      ORDER BY d.id LIMIT ${Math.min(campana.tandaTamano, restantes)} FOR UPDATE OF d SKIP LOCKED`;
    if (!ids.length) return [];
    await tx.campanaDestinatario.updateMany({ where: { id: { in: ids.map((r) => r.id) } }, data: { estado: "enviando", enviadoAt: ahora, updatedAt: ahora } });
    await tx.$executeRaw(Prisma.sql`UPDATE campanas_destinatarios SET reintentos = reintentos + 1 WHERE id IN (${Prisma.join(ids.map((r) => r.id))}) AND error_codigo = 131049`);
    await tx.campanaEnvio.update({ where: { id: campanaId }, data: { estado: "en_curso", ultimaTandaAt: ahora } });
    return ids.map((r) => r.id);
  });
}

export function clasificar(envio: ResultadoEnvio, reintentos: number) {
  if (envio.ok) return { estado: "enviado", motivo: null, reintentarAt: null, pausar: null };
  const codigo = envio.errorCodigo;
  const error = envio.error ?? "Meta no confirmó el envío";
  if (codigo === 131050) return { estado: "omitido", motivo: "El contacto rechazó mensajes de marketing", reintentarAt: null, pausar: null };
  if (codigo === 131049) return { estado: "omitido", motivo: "Límite de marketing por usuario", reintentarAt: reintentos === 0 ? new Date(Date.now() + 24 * 60 * 60_000) : null, pausar: null };
  if (codigo === 131026) return { estado: "fallido", motivo: "Número no entregable", reintentarAt: null, pausar: null };
  if (codigo === 131042) return { estado: "fallido", motivo: error, reintentarAt: null, pausar: "Meta no pudo cobrar: revisa el método de pago de la cuenta de WhatsApp de EXI" };
  if ([190, 102].includes(codigo ?? -1) || /token|credencial|autorizaci[oó]n/i.test(error)) return { estado: "fallido", motivo: error, reintentarAt: null, pausar: "Meta rechazó la credencial: revisa el token del canal" };
  return { estado: "fallido", motivo: error, reintentarAt: null, pausar: null };
}

async function guardarResultado(orgId: bigint, campanaId: bigint, destinatarioId: bigint, envio: ResultadoEnvio) {
  return transaccionTenant(orgId, async (tx) => {
    const campana = await tx.campanaEnvio.findUniqueOrThrow({ where: { id: campanaId } });
    const d = await tx.campanaDestinatario.findUniqueOrThrow({ where: { id: destinatarioId }, include: { contacto: true } });
    const resultado = clasificar(envio, d.reintentos);
    const ahora = new Date();
    await tx.campanaDestinatario.update({ where: { id: destinatarioId }, data: { estado: resultado.estado, motivo: resultado.motivo, waMessageId: envio.waMessageId, errorCodigo: envio.errorCodigo, reintentarAt: resultado.reintentarAt, updatedAt: ahora } });
    if (envio.errorCodigo === 131050) await tx.contacto.update({ where: { id: d.contactoId }, data: { optOutDifusion: true } });
    const conv = await tx.conversacion.upsert({ where: { contactoId_canalId: { contactoId: d.contactoId, canalId: campana.canalId } }, update: { ultimoMensajeAt: ahora }, create: { contactoId: d.contactoId, canalId: campana.canalId, ultimoMensajeAt: ahora } });
    await tx.mensaje.create({ data: { conversacionId: conv.id, canalId: campana.canalId, direccion: "saliente", tipo: "plantilla", contenido: `[Meta] ${campana.plantillaNombre}`, esDifusion: true, status: envio.ok ? "enviado" : "fallido", errorDetalle: envio.error, waMessageId: envio.waMessageId, enviadoPor: campana.creadoPor } });
    const nombreEtiqueta = `Campaña: ${campana.nombre}`;
    const etiqueta = await tx.etiqueta.upsert({ where: { orgId_nombre: { orgId, nombre: nombreEtiqueta } }, update: {}, create: { nombre: nombreEtiqueta } });
    await tx.contactoEtiqueta.upsert({ where: { contactoId_etiquetaId: { contactoId: d.contactoId, etiquetaId: etiqueta.id } }, update: {}, create: { contactoId: d.contactoId, etiquetaId: etiqueta.id } });
    if (resultado.pausar) await tx.campanaEnvio.update({ where: { id: campanaId }, data: { estado: "pausada", motivoPausa: resultado.pausar } });
    return envio.ok;
  });
}

async function revisarFallos(orgId: bigint, campanaId: bigint) {
  await transaccionTenant(orgId, async (tx) => {
    const ultimos = await tx.campanaDestinatario.findMany({ where: { campanaId, estado: { in: [...recientes, "fallido", "omitido"] } }, orderBy: { enviadoAt: "desc" }, take: 20, select: { estado: true } });
    if (ultimos.length === 20 && ultimos.filter((d) => d.estado === "fallido").length > 6) await tx.campanaEnvio.updateMany({ where: { id: campanaId, estado: "en_curso" }, data: { estado: "pausada", motivoPausa: "Más del 30 % de los últimos 20 envíos falló; revisa el canal" } });
  });
}

export async function procesarCampana(orgId: bigint, campanaId: bigint, ahora = new Date()) {
  const campana = await db.campanaEnvio.findFirst({ where: { id: campanaId }, include: { canal: true } });
  if (!campana || !["programada", "en_curso"].includes(campana.estado)) return { enviados: 0, fallidos: 0 };
  if (!campana.canal.activo || campana.canal.estado !== "conectado" || campana.canal.proveedor !== "cloud_api") {
    await db.campanaEnvio.update({ where: { id: campanaId }, data: { estado: "pausada", motivoPausa: "El canal de Meta está desconectado" } });
    return { enviados: 0, fallidos: 0 };
  }
  const provider = getProvider("cloud_api", campana.canal.config, campana.canal.instancia);
  const plantillas = await provider.listarPlantillas?.() ?? [];
  if (!plantillas.some((p) => p.name === campana.plantillaNombre && p.language === campana.plantillaIdioma && p.status === "APPROVED")) {
    await db.campanaEnvio.update({ where: { id: campanaId }, data: { estado: "pausada", motivoPausa: "La plantilla no está aprobada o Meta no permitió verificarla" } });
    return { enviados: 0, fallidos: 0 };
  }
  const ids = await reclamarTanda(orgId, campanaId, ahora);
  let enviados = 0;
  let fallidos = 0;
  for (const id of ids) {
    const vigente = await db.campanaEnvio.findFirst({ where: { id: campanaId }, select: { estado: true } });
    if (vigente?.estado !== "en_curso") {
      await db.campanaDestinatario.update({ where: { id }, data: { estado: "pendiente", enviadoAt: null } });
      continue;
    }
    const d = await db.campanaDestinatario.findFirst({ where: { id }, include: { contacto: true } });
    if (!d) continue;
    if (d.contacto.optOutDifusion) {
      await db.campanaDestinatario.update({ where: { id }, data: { estado: "omitido", motivo: "Baja de difusión", enviadoAt: null } });
      continue;
    }
    const mapa = (d.variables ?? {}) as Record<string, string>;
    const claves = Array.isArray(campana.mapeoVariables) ? campana.mapeoVariables.map(String) : [];
    const variables = claves.map((clave) => aplicarVariables(mapa[clave] ?? clave, d.contacto));
    let envio: ResultadoEnvio;
    try { envio = await provider.enviarPlantilla!(d.telefono, { name: campana.plantillaNombre, language: campana.plantillaIdioma }, variables); }
    catch (e) { envio = { ok: false, error: e instanceof Error ? e.message : "Error de Meta", errorCodigo: (e as { errorCodigo?: number })?.errorCodigo }; }
    const ok = await guardarResultado(orgId, campanaId, id, envio);
    ok ? enviados++ : fallidos++;
    await revisarFallos(orgId, campanaId);
    await espera(1200 + Math.random() * 1800);
  }
  const pendientes = await db.campanaDestinatario.count({ where: { campanaId, OR: [{ estado: "pendiente" }, { estado: "enviando" }, { estado: "omitido", reintentarAt: { not: null } }] } });
  if (!pendientes) await db.campanaEnvio.updateMany({ where: { id: campanaId, estado: "en_curso" }, data: { estado: "completada" } });
  return { enviados, fallidos };
}
