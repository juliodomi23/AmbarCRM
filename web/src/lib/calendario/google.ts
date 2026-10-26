import type { DatosEventoCalendario, EventoCalendario, ProveedorCalendario } from "./tipos";

export class ProveedorGoogleCalendar implements ProveedorCalendario {
  constructor(private readonly calendarId: string, private readonly accessToken: string) {}

  private async request(path: string, init?: RequestInit): Promise<Response> {
    const response = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events${path}`, {
      ...init, headers: { Authorization: `Bearer ${this.accessToken}`, "Content-Type": "application/json", ...init?.headers },
    });
    if (!response.ok && response.status !== 404 && response.status !== 410) throw new Error(`Google Calendar respondió HTTP ${response.status}`);
    return response;
  }

  async obtenerEvento(id: string) {
    const response = await this.request(`/${encodeURIComponent(id)}`);
    return response.status === 404 ? null : await response.json() as EventoCalendario;
  }
  async guardarEvento(id: string | null, datos: DatosEventoCalendario) {
    const response = await this.request(id ? `/${encodeURIComponent(id)}` : "", { method: id ? "PATCH" : "POST", body: JSON.stringify(datos) });
    if (!response.ok) throw new Error(`Google Calendar respondió HTTP ${response.status}`);
    return await response.json() as EventoCalendario;
  }
  async eliminarEvento(id: string) {
    const response = await this.request(`/${encodeURIComponent(id)}`, { method: "DELETE" });
    if (!response.ok && response.status !== 404) throw new Error(`Google Calendar respondió HTTP ${response.status}`);
  }
  async marcarCita(id: string, citaId: string) {
    const evento = await this.obtenerEvento(id);
    const propiedades = { ...evento?.extendedProperties?.private, ambarcrm_cita_id: citaId };
    await this.request(`/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify({ extendedProperties: { private: propiedades } }) });
  }
  async listarCambios(syncToken?: string, pageToken?: string) {
    const params = new URLSearchParams({ showDeleted: "true", singleEvents: "true", maxResults: "2500" });
    if (syncToken) params.set("syncToken", syncToken);
    if (pageToken) params.set("pageToken", pageToken);
    const response = await this.request(`?${params}`);
    if (response.status === 410) throw Object.assign(new Error("El syncToken expiró"), { status: 410 });
    return await response.json() as { items: EventoCalendario[]; nextPageToken?: string; nextSyncToken?: string };
  }
}
