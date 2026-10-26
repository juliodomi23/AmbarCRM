"use client";

import { useEffect, useState } from "react";
import { Badge, Boton, EncabezadoPagina } from "@/components/ui";

type Conexion = { cuentaGoogle: string; calendarId: string; estado: string; timezone: string; sincronizadoAt: string | null; ultimoError: string | null } | null;
type Calendario = { id: string; nombre: string; primary: boolean };
type ConexionAdmin = { id: string; usuarioCrmId: string; usuario: { nombre: string }; cuentaGoogle: string; calendarId: string; estado: string; sincronizadoAt: string | null; ultimoError: string | null };
export function CalendarioPanel({ admin, resultadoOAuth, embebido = false }: { admin: boolean; resultadoOAuth?: string; embebido?: boolean }) {
  const [conexion, setConexion] = useState<Conexion>(null);
  const [configurado, setConfigurado] = useState(false);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [calendarios, setCalendarios] = useState<Calendario[]>([]);
  const [adminConnections, setAdminConnections] = useState<ConexionAdmin[]>([]);
  const [guardandoCalendario, setGuardandoCalendario] = useState(false);
  async function cargar() {
    const response = await fetch("/api/calendario/conexion");
    if (!response.ok) { setError("No se pudo consultar el estado de Calendar"); return; }
    const data = await response.json(); setConexion(data.connection); setConfigurado(data.configurado); setCalendarios(data.calendars ?? []); setAdminConnections(data.adminConnections ?? []);
  }
  useEffect(() => { void cargar(); }, []);
  async function sincronizar() {
    setOcupado(true); setError("");
    try { const response = await fetch("/api/calendario/sync", { method: "POST" }); const data = await response.json(); if (!response.ok) throw new Error(data.error); if (data.ocupado) setError("Ya hay una sincronización en curso."); await cargar(); }
    catch { setError("No se pudo completar la sincronización. Revisa la conexión e inténtalo de nuevo."); await cargar(); }
    finally { setOcupado(false); }
  }
  async function desconectar() {
    if (!window.confirm("¿Desconectar tu cuenta de Google Calendar?")) return;
    const response = await fetch("/api/calendario/conexion", { method: "DELETE" });
    if (!response.ok) setError("No se pudo desconectar Google Calendar."); else await cargar();
  }
  async function cambiarCalendario(calendarId: string) {
    setGuardandoCalendario(true); setError("");
    try { const response = await fetch("/api/calendario/conexion", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ calendarId }) }); if (!response.ok) throw new Error(); await cargar(); }
    catch { setError("No se pudo cambiar el calendario seleccionado."); }
    finally { setGuardandoCalendario(false); }
  }
  async function solicitarReconectar(usuarioCrmId: string) {
    const response = await fetch("/api/calendario/conexion", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ usuarioCrmId }) });
    if (!response.ok) setError("No se pudo solicitar la reconexión."); else await cargar();
  }
  const Raiz = embebido ? "section" : "main";
  return <Raiz className={embebido ? "mt-8 space-y-5" : "space-y-5"}>
    {embebido ? <div><h2 className="text-lg font-semibold">Conecta tu calendario</h2><p className="text-sm text-muted-foreground">Sincroniza con tu Google Calendar las citas que tienes asignadas.</p></div> : <EncabezadoPagina titulo="Google Calendar" descripcion="Conecta tu cuenta para sincronizar las citas que tienes asignadas." />}
    <section className="surface max-w-2xl space-y-4 p-5" aria-live="polite">
      {resultadoOAuth === "conectado" && <p role="status" className="text-sm text-green-700">Cuenta de Google conectada.</p>}
      {resultadoOAuth === "error" && <p role="alert" className="text-sm text-destructive">No se pudo conectar. Revisa permisos y configuración de OAuth.</p>}
      {!configurado && <p role="status" className="rounded-lg bg-muted p-3 text-sm">Google Calendar aún no está configurado. Añade GOOGLE_CALENDAR_CLIENT_ID y GOOGLE_CALENDAR_CLIENT_SECRET al entorno para habilitar la conexión.</p>}
      {conexion ? <>
        <div className="flex flex-wrap items-center gap-3"><Badge tono={conexion.estado === "activa" ? "success" : conexion.estado === "requiere_reconectar" ? "warning" : "neutral"}>{conexion.estado.replaceAll("_", " ")}</Badge><span className="text-sm">{conexion.cuentaGoogle}</span></div>
        <dl className="grid gap-2 text-sm sm:grid-cols-2"><div><dt className="text-muted-foreground">Calendario</dt><dd>{conexion.calendarId}</dd></div><div><dt className="text-muted-foreground">Zona horaria</dt><dd>{conexion.timezone}</dd></div><div><dt className="text-muted-foreground">Última sincronización</dt><dd>{conexion.sincronizadoAt ? new Intl.DateTimeFormat("es-MX", { dateStyle: "short", timeStyle: "short", timeZone: conexion.timezone }).format(new Date(conexion.sincronizadoAt)) : "Pendiente"}</dd></div></dl>
        {conexion.estado === "activa" && calendarios.length > 0 && <label className="block space-y-1 text-sm">Calendario de destino<select aria-label="Calendario de Google" className="input w-full" value={conexion.calendarId} disabled={guardandoCalendario} onChange={(event) => void cambiarCalendario(event.target.value)}>{calendarios.map((item) => <option key={item.id} value={item.id}>{item.nombre}{item.primary ? " (principal)" : ""}</option>)}</select></label>}
        {conexion.ultimoError && <p role="alert" className="text-sm text-destructive">{conexion.ultimoError}</p>}
        {conexion.estado === "activa" && <div className="flex flex-wrap gap-2"><Boton onClick={sincronizar} disabled={ocupado}>{ocupado ? "Sincronizando…" : "Sincronizar ahora"}</Boton>{admin && <Boton variante="ghost" onClick={desconectar}>Desconectar</Boton>}</div>}
      </> : <p className="text-sm text-muted-foreground">No hay una cuenta conectada a esta organización.</p>}
      {(!conexion || conexion.estado !== "activa") && configurado && <a className="inline-flex rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground" href="/api/calendario/oauth/iniciar">{conexion ? "Reconectar Google Calendar" : "Conectar con Google"}</a>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </section>
    {admin && <section className="surface space-y-3 p-5"><h2 className="text-lg font-semibold">Conexiones de la organización</h2>{adminConnections.length ? <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th className="p-2">Usuario</th><th className="p-2">Cuenta</th><th className="p-2">Calendario</th><th className="p-2">Estado</th><th className="p-2">Última sincronización</th><th className="p-2">Último error</th><th className="p-2">Acción</th></tr></thead><tbody>{adminConnections.map((item) => <tr key={item.id} className="border-t"><td className="p-2">{item.usuario.nombre}</td><td className="p-2">{item.cuentaGoogle}</td><td className="p-2">{item.calendarId}</td><td className="p-2">{item.estado}</td><td className="p-2">{item.sincronizadoAt ? new Date(item.sincronizadoAt).toLocaleString("es-MX") : "Pendiente"}</td><td className="p-2">{item.ultimoError ?? "—"}</td><td className="p-2">{item.estado === "activa" && <Boton variante="ghost" onClick={() => void solicitarReconectar(item.usuarioCrmId)}>Solicitar reconexión</Boton>}</td></tr>)}</tbody></table></div> : <p className="text-sm text-muted-foreground">Aún no hay conexiones de usuarios.</p>}</section>}
  </Raiz>;
}
