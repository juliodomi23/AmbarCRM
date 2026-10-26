export type EventoCalendario = {
  id: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  updated?: string;
  etag?: string;
  status?: string;
  extendedProperties?: { private?: Record<string, string> };
};

export type DatosEventoCalendario = Pick<EventoCalendario, "summary" | "description" | "start" | "end" | "extendedProperties">;

export interface ProveedorCalendario {
  obtenerEvento(id: string): Promise<EventoCalendario | null>;
  guardarEvento(id: string | null, datos: DatosEventoCalendario): Promise<EventoCalendario>;
  eliminarEvento(id: string): Promise<void>;
  marcarCita(id: string, citaId: string): Promise<void>;
  listarCambios(syncToken?: string, pageToken?: string): Promise<{ items: EventoCalendario[]; nextPageToken?: string; nextSyncToken?: string }>;
}

export function resolverConflictoLww(citaActualizadaAt: Date, eventoActualizado?: string | null) {
  if (!eventoActualizado) return "crm" as const;
  return new Date(eventoActualizado).getTime() > citaActualizadaAt.getTime() ? "calendar" as const : "crm" as const;
}

export function validarZonaHoraria(zona: string) {
  try { new Intl.DateTimeFormat("en", { timeZone: zona }); return true; } catch { return false; }
}
