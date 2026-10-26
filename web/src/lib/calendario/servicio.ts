import { db, runWithOrg } from "@/lib/db";
import { transaccionTenant } from "@/lib/retail-db";
import { configReservas } from "@/lib/reservas/servidor";
import { ProveedorGoogleCalendar } from "./google";
import { mockCalendarioPermitido, proveedorCalendarioMock } from "./mock";
import { tokenCalendario } from "./oauth";
import { resolverConflictoLww, type EventoCalendario, type ProveedorCalendario } from "./tipos";

type Conexion = NonNullable<Awaited<ReturnType<typeof obtenerConexion>>>;
async function obtenerConexion(usuarioCrmId: bigint) {
  return db.calendarioConectado.findFirst({ where: { usuarioCrmId, estado: "activa" } });
}
async function proveedor(conexion: Conexion, override?: ProveedorCalendario) {
  if (override) return override;
  if (conexion.proveedor === "mock") {
    if (!mockCalendarioPermitido()) throw new Error("El proveedor mock de Calendar está bloqueado");
    return proveedorCalendarioMock;
  }
  const accessToken = await tokenCalendario(conexion.orgId, conexion);
  return new ProveedorGoogleCalendar(conexion.calendarId, accessToken);
}
function datosEvento(cita: { id: bigint; titulo: string; notas: string | null; inicio: Date; fin: Date }, timezone: string) {
  return { summary: cita.titulo, description: cita.notas ?? "", start: { dateTime: cita.inicio.toISOString(), timeZone: timezone }, end: { dateTime: cita.fin.toISOString(), timeZone: timezone }, extendedProperties: { private: { ambarcrm_cita_id: String(cita.id) } } };
}

export async function pushCitaCalendario(citaId: bigint) {
  const cita = await db.cita.findFirst({ where: { id: citaId } });
  if (!cita?.responsableId) return;
  const conexion = await obtenerConexion(cita.responsableId);
  if (!conexion) return;
  const modulo = await db.moduloOrg.findFirst({ where: { clave: "calendario", activo: true }, select: { id: true } });
  if (!modulo) return;
  const mapping = await db.eventoCalendario.findFirst({ where: { calendarioId: conexion.id, citaId, estado: { not: "desvinculado" } } });
  const anteriores = await db.eventoCalendario.findMany({ where: { citaId, calendarioId: { not: conexion.id }, estado: { notIn: ["eliminado", "desvinculado"] } }, include: { calendario: true } });
  for (const anterior of anteriores) {
    try { await (await proveedor(anterior.calendario)).eliminarEvento(anterior.eventoExterno); } catch { /* se preserva el historial y se continúa el envío */ }
    await db.eventoCalendario.update({ where: { id: anterior.id }, data: { estado: "desvinculado", detalle: "Responsable cambiado; el evento anterior se retiró de su calendario" } });
  }
  try {
    const api = await proveedor(conexion);
    if (cita.estado === "cancelada") {
      if (mapping) await api.eliminarEvento(mapping.eventoExterno);
      if (mapping) await db.eventoCalendario.update({ where: { id: mapping.id }, data: { estado: "eliminado", ultimoSync: new Date(), detalle: mapping.detalle } });
      return;
    }
    const existente = mapping && mapping.estado !== "pendiente" && mapping.estado !== "error" ? await api.obtenerEvento(mapping.eventoExterno) : null;
    const datos = datosEvento(cita, conexion.timezone);
    datos.extendedProperties.private = { ...existente?.extendedProperties?.private, ambarcrm_cita_id: String(cita.id) };
    const evento = await api.guardarEvento(mapping && mapping.estado !== "pendiente" && mapping.estado !== "error" ? mapping.eventoExterno : null, datos);
    await db.eventoCalendario.upsert({ where: { orgId_calendarioId_eventoExterno: { orgId: cita.orgId, calendarioId: conexion.id, eventoExterno: evento.id } }, create: { citaId, calendarioId: conexion.id, eventoExterno: evento.id, etag: evento.etag, estado: mapping?.estado === "conflicto" ? "conflicto" : mapping ? "actualizado" : "creado", ultimoSync: new Date(), detalle: mapping?.detalle }, update: { citaId, etag: evento.etag, estado: mapping?.estado === "conflicto" ? "conflicto" : "actualizado", ultimoSync: new Date(), detalle: mapping?.detalle } });
    if (mapping && mapping.eventoExterno !== evento.id) await db.eventoCalendario.delete({ where: { id: mapping.id } });
  } catch {
    if (mapping) await db.eventoCalendario.update({ where: { id: mapping.id }, data: { estado: "pendiente", detalle: "No fue posible enviar el cambio a Google; se reintentará" } }).catch(() => undefined);
    else await db.eventoCalendario.create({ data: { citaId, calendarioId: conexion.id, eventoExterno: `pendiente-cita-${citaId}`, estado: "pendiente", detalle: "No fue posible enviar el cambio a Google; se reintentará" } }).catch(() => undefined);
  }
}

async function importarEvento(conexion: Conexion, evento: EventoCalendario, api: ProveedorCalendario) {
  const citaId = evento.extendedProperties?.private?.ambarcrm_cita_id;
  const mapping = await db.eventoCalendario.findFirst({ where: { calendarioId: conexion.id, eventoExterno: evento.id } });
  if (evento.status === "cancelled") {
    if (mapping?.citaId) {
      await transaccionTenant(conexion.orgId, async (tx) => {
        const cita = await tx.cita.findFirst({ where: { id: mapping.citaId! }, select: { notas: true } });
        const motivo = "Cancelada desde Google Calendar";
        if (cita) await tx.cita.update({ where: { id: mapping.citaId! }, data: { estado: "cancelada", notas: cita.notas?.includes(motivo) ? cita.notas : [cita.notas?.trim(), motivo].filter(Boolean).join("\n\n") } });
        await tx.eventoCalendario.update({ where: { id: mapping.id }, data: { estado: "cancelado", etag: evento.etag, ultimoSync: new Date(), detalle: [mapping.detalle, "Evento eliminado en Google Calendar"].filter(Boolean).join("\n") } });
      });
    }
    return;
  }
  if (!evento.start?.dateTime || !evento.end?.dateTime) return;
  const inicio = new Date(evento.start.dateTime); const fin = new Date(evento.end.dateTime);
  if (!Number.isFinite(+inicio) || !Number.isFinite(+fin) || fin <= inicio) return;
  let cita = mapping?.citaId ? await db.cita.findFirst({ where: { id: mapping.citaId } }) : null;
  if (!cita && citaId && /^\d+$/.test(citaId)) cita = await db.cita.findFirst({ where: { id: BigInt(citaId) } });
  if (cita) {
    const ultimaSync = mapping?.ultimoSync?.getTime() ?? 0;
    const conflicto = cita.updatedAt.getTime() > ultimaSync && new Date(evento.updated ?? 0).getTime() > ultimaSync;
    const ganador = resolverConflictoLww(cita.updatedAt, evento.updated);
    const detalle = conflicto ? [mapping?.detalle, `Conflicto CRM ${cita.updatedAt.toISOString()} / Calendar ${evento.updated}; ganó ${ganador}`].filter(Boolean).join("\n") : mapping?.detalle ?? null;
    const estadoMapping = conflicto || mapping?.estado === "conflicto" ? "conflicto" : "actualizado";
    if (ganador === "calendar") await transaccionTenant(conexion.orgId, async (tx) => {
      await tx.cita.update({ where: { id: cita!.id }, data: { titulo: evento.summary?.trim() || "Cita de Google Calendar", notas: evento.description ?? null, inicio, fin } });
    });
    await db.eventoCalendario.upsert({ where: { orgId_calendarioId_eventoExterno: { orgId: conexion.orgId, calendarioId: conexion.id, eventoExterno: evento.id } }, create: { citaId: cita.id, calendarioId: conexion.id, eventoExterno: evento.id, etag: evento.etag, estado: estadoMapping, ultimoSync: new Date(), detalle }, update: { citaId: cita.id, etag: evento.etag, estado: estadoMapping, ultimoSync: new Date(), detalle } });
    if (evento.extendedProperties?.private?.ambarcrm_cita_id !== String(cita.id)) await api.marcarCita(evento.id, String(cita.id)).catch(() => undefined);
    return;
  }
  const contacto = await db.contacto.findFirst({ where: { nombre: "Eventos de Google Calendar" }, select: { id: true } })
    ?? await db.contacto.create({ data: { nombre: "Eventos de Google Calendar", fuente: "otro" }, select: { id: true } });
  const nueva = await db.cita.create({ data: { contactoId: contacto.id, responsableId: conexion.usuarioCrmId, titulo: evento.summary?.trim() || "Evento de Google Calendar", notas: evento.description ?? null, inicio, fin, estado: "programada", origen: "calendar" } });
  await db.eventoCalendario.upsert({ where: { orgId_calendarioId_eventoExterno: { orgId: conexion.orgId, calendarioId: conexion.id, eventoExterno: evento.id } }, create: { citaId: nueva.id, calendarioId: conexion.id, eventoExterno: evento.id, etag: evento.etag, estado: "creado", ultimoSync: new Date() }, update: { citaId: nueva.id, etag: evento.etag, estado: "creado", ultimoSync: new Date() } });
  await api.marcarCita(evento.id, String(nueva.id)).catch(() => undefined);
}

async function sincronizarConexion(conexion: Conexion, override?: ProveedorCalendario) {
  const orgId = conexion.orgId;
  let fullResync = false; let importados = 0; const syncToken = conexion.syncToken;
  const reclamo = await db.calendarioConectado.updateMany({ where: { id: conexion.id, OR: [{ sincronizandoAt: null }, { sincronizandoAt: { lt: new Date(Date.now() - 5 * 60_000) } }] }, data: { sincronizandoAt: new Date() } });
  if (reclamo.count === 0) return { ocupado: true, importados: 0, fullResync: false };
  try {
    const api = await proveedor(conexion, override);
    const pendientes = await db.eventoCalendario.findMany({ where: { calendarioId: conexion.id, estado: { in: ["pendiente", "error"] }, citaId: { not: null } }, select: { citaId: true }, take: 50 });
    for (const pendiente of pendientes) if (pendiente.citaId) await pushCitaCalendario(pendiente.citaId);
    const listado = async (token?: string) => {
      let pageToken: string | undefined; let nextSyncToken: string | undefined;
      do {
        const pagina = await api.listarCambios(token, pageToken);
        for (const evento of pagina.items ?? []) { await importarEvento(conexion, evento, api); importados++; }
        pageToken = pagina.nextPageToken; nextSyncToken = pagina.nextSyncToken ?? nextSyncToken;
      } while (pageToken);
      return nextSyncToken;
    };
    let nuevoToken: string | undefined;
    try { nuevoToken = await listado(syncToken ?? undefined); }
    catch (error) { if ((error as { status?: number }).status !== 410) throw error; fullResync = true; nuevoToken = await listado(); }
    await db.calendarioConectado.update({ where: { id: conexion.id }, data: { syncToken: nuevoToken ?? syncToken, sincronizadoAt: new Date(), sincronizandoAt: null, ultimoError: fullResync ? "syncToken expirado; se ejecutó una resincronización completa" : null } });
    return { ocupado: false, importados, fullResync };
  } catch (error) {
    await db.calendarioConectado.update({ where: { id: conexion.id }, data: { sincronizandoAt: null, ultimoError: "Falló la sincronización con Google Calendar" } });
    throw error;
  }
}

type ResultadoConexion = { ocupado: boolean; importados: number; fullResync: boolean; conexionId: string; error?: boolean };
type ResultadoOrg = { ocupado: boolean; importados: number; fullResync: boolean; conexiones: ResultadoConexion[] };

async function sincronizarCalendarioTenant(orgId: bigint, usuarioCrmId?: bigint, override?: ProveedorCalendario): Promise<ResultadoConexion | ResultadoOrg> {
  const modulo = await db.moduloOrg.findFirst({ where: { clave: "calendario", activo: true }, select: { id: true } });
  if (!modulo) return usuarioCrmId ? { ocupado: false, importados: 0, fullResync: false, conexionId: "" } : { ocupado: false, importados: 0, fullResync: false, conexiones: [] };
  const conexiones = await db.calendarioConectado.findMany({ where: { estado: "activa", ...(usuarioCrmId ? { usuarioCrmId } : {}) } });
  if (!conexiones.length) throw new Error("No hay un calendario conectado");
  const resultados = await Promise.all(conexiones.map(async (conexion) => {
    try { return { ...(await sincronizarConexion(conexion, override)), conexionId: String(conexion.id) }; }
    catch { return { ocupado: false, importados: 0, fullResync: false, conexionId: String(conexion.id), error: true }; }
  }));
  return usuarioCrmId ? resultados[0] : { ocupado: resultados.every((r) => r.ocupado), importados: resultados.reduce((s, r) => s + r.importados, 0), fullResync: resultados.some((r) => r.fullResync), conexiones: resultados };
}

export function sincronizarCalendario(orgId: bigint, usuarioCrmId: bigint, override?: ProveedorCalendario): Promise<ResultadoConexion>;
export function sincronizarCalendario(orgId: bigint, usuarioCrmId?: undefined, override?: ProveedorCalendario): Promise<ResultadoOrg>;
export function sincronizarCalendario(orgId: bigint, usuarioCrmId: bigint | undefined, override?: ProveedorCalendario): Promise<ResultadoConexion | ResultadoOrg>;
export function sincronizarCalendario(orgId: bigint, usuarioCrmId?: bigint, override?: ProveedorCalendario): Promise<ResultadoConexion | ResultadoOrg> {
  return runWithOrg(orgId, () => sincronizarCalendarioTenant(orgId, usuarioCrmId, override));
}

export async function zonaCalendarioOrg() {
  const modulo = await db.moduloOrg.findFirst({ where: { clave: "reservas_en_linea" }, select: { config: true } });
  return configReservas(modulo?.config).zona;
}
