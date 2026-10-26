import type { DatosEventoCalendario, EventoCalendario, ProveedorCalendario } from "./tipos";

export class ProveedorCalendarioMock implements ProveedorCalendario {
  private eventos = new Map<string, EventoCalendario>();
  private contador = 0;

  async obtenerEvento(id: string) { return this.eventos.get(id) ?? null; }
  async guardarEvento(id: string | null, datos: DatosEventoCalendario) {
    const eventoId = id ?? `mock-${++this.contador}`;
    const evento = { id: eventoId, ...datos, updated: new Date().toISOString(), etag: `"${Date.now()}"`, status: "confirmed" };
    this.eventos.set(eventoId, evento);
    return evento;
  }
  async eliminarEvento(id: string) {
    const evento = this.eventos.get(id);
    if (evento) this.eventos.set(id, { ...evento, status: "cancelled", updated: new Date().toISOString() });
  }
  async marcarCita(id: string, citaId: string) {
    const evento = this.eventos.get(id);
    if (evento) this.eventos.set(id, { ...evento, extendedProperties: { ...evento.extendedProperties, private: { ...evento.extendedProperties?.private, ambarcrm_cita_id: citaId } } });
  }
  async listarCambios(): Promise<{ items: EventoCalendario[]; nextPageToken?: string; nextSyncToken?: string }> { return { items: [...this.eventos.values()], nextSyncToken: `mock-sync-${this.contador}` }; }
}

export function mockCalendarioPermitido() {
  return process.env.NODE_ENV !== "production" && process.env.CALENDARIO_PERMITIR_MOCK === "1";
}

export const proveedorCalendarioMock = new ProveedorCalendarioMock();
