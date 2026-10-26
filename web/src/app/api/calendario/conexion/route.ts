import { NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { serializar } from "@/lib/serialize";
import { tokenCalendario, listarCalendariosGoogle, revocarTokenCalendario } from "@/lib/calendario/oauth";

export const GET = conModulo("calendario", {}, async (sesion) => {
  if (!sesion.userId) return NextResponse.json({ connection: null, calendars: [] });
  const connection = await db.calendarioConectado.findFirst({ where: { usuarioCrmId: sesion.userId }, select: { id: true, cuentaGoogle: true, calendarId: true, estado: true, timezone: true, sincronizadoAt: true, ultimoError: true, accessTokenEncrypted: true, refreshTokenEncrypted: true, tokenExpiraAt: true } });
  let calendars: Awaited<ReturnType<typeof listarCalendariosGoogle>> = [];
  if (connection?.estado === "activa") {
    try { calendars = await listarCalendariosGoogle(await tokenCalendario(sesion.orgId!, connection)); } catch { /* el error queda visible en la conexión */ }
  }
  const { accessTokenEncrypted: _access, refreshTokenEncrypted: _refresh, tokenExpiraAt: _expiry, id: _id, ...publicConnection } = connection ?? {};
  const adminConnections = sesion.rol === "admin" ? await db.calendarioConectado.findMany({ select: { id: true, usuarioCrmId: true, usuario: { select: { nombre: true } }, cuentaGoogle: true, calendarId: true, estado: true, sincronizadoAt: true, ultimoError: true } }) : [];
  return NextResponse.json({ configurado: Boolean(process.env.GOOGLE_CALENDAR_CLIENT_ID && process.env.GOOGLE_CALENDAR_CLIENT_SECRET), connection: connection ? publicConnection : null, calendars, adminConnections: serializar(adminConnections) });
});
export const DELETE = conModulo("calendario", {}, async (sesion) => {
  if (!sesion.userId) return NextResponse.json({ error: "Sesión sin usuario" }, { status: 400 });
  const connection = await db.calendarioConectado.findFirst({ where: { usuarioCrmId: sesion.userId }, select: { id: true, accessTokenEncrypted: true } });
  if (connection) await revocarTokenCalendario(connection.accessTokenEncrypted);
  await db.calendarioConectado.updateMany({ where: { usuarioCrmId: sesion.userId }, data: { estado: "revocada", syncToken: null } });
  return NextResponse.json({ ok: true });
});
export const PATCH = conModulo("calendario", {}, async (sesion, req: Request) => {
  if (!sesion.userId) return NextResponse.json({ error: "Sesión sin usuario" }, { status: 400 });
  const body = await req.json().catch(() => ({})) as { calendarId?: string };
  if (!body.calendarId || typeof body.calendarId !== "string") return NextResponse.json({ error: "Calendario inválido" }, { status: 400 });
  const connection = await db.calendarioConectado.findFirst({ where: { usuarioCrmId: sesion.userId, estado: "activa" } });
  if (!connection) return NextResponse.json({ error: "No hay conexión activa" }, { status: 404 });
  const allowed = await listarCalendariosGoogle(await tokenCalendario(sesion.orgId!, connection));
  const selected = allowed.find((item) => item.id === body.calendarId);
  if (!selected) return NextResponse.json({ error: "No tienes permiso para usar ese calendario" }, { status: 403 });
  if (connection.calendarId !== selected.id) {
    await db.eventoCalendario.updateMany({ where: { calendarioId: connection.id }, data: { estado: "eliminado", detalle: "Mapeo conservado como histórico; al cambiar de calendario no se borran eventos del calendario anterior" } });
    await db.calendarioConectado.update({ where: { id: connection.id }, data: { calendarId: selected.id, timezone: selected.timezone ?? connection.timezone, syncToken: null, ultimoError: null } });
  }
  return NextResponse.json({ ok: true });
});
export const POST = conModulo("calendario", { admin: true }, async (_sesion, req: Request) => {
  const body = await req.json().catch(() => ({})) as { usuarioCrmId?: string };
  if (!body.usuarioCrmId || !/^\d+$/.test(body.usuarioCrmId)) return NextResponse.json({ error: "Usuario inválido" }, { status: 400 });
  const result = await db.calendarioConectado.updateMany({ where: { usuarioCrmId: BigInt(body.usuarioCrmId), estado: { not: "revocada" } }, data: { estado: "requiere_reconectar", ultimoError: "El administrador solicitó reconectar Google Calendar" } });
  return result.count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Conexión no encontrada" }, { status: 404 });
});
