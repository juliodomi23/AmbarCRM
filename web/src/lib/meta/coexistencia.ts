// Meta no manda contactos ni historial por sí solo al conectar por Coexistence: hay que pedirlos con
// POST /{phone_number_id}/smb_app_data, contactos primero e historial después. Cada llamada se acepta una
// sola vez por conexión y dentro de las 24 h posteriores al onboarding.
export type ResultadoSincronizacion = { ok: boolean; requestId?: string; error?: string };
type TipoSincronizacion = "smb_app_state_sync" | "history";

async function pedirSincronizacion(
  graphUrl: string,
  phoneNumberId: string,
  token: string,
  syncType: TipoSincronizacion
): Promise<ResultadoSincronizacion> {
  try {
    const response = await fetch(`${graphUrl}/${phoneNumberId}/smb_app_data`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", sync_type: syncType })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return { ok: false, error: data?.error?.message || `Meta HTTP ${response.status}` };
    return { ok: true, requestId: typeof data?.request_id === "string" ? data.request_id : undefined };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "error de red" };
  }
}

export async function iniciarSincronizacionCoexistencia(graphUrl: string, phoneNumberId: string, token: string) {
  const contactos = await pedirSincronizacion(graphUrl, phoneNumberId, token, "smb_app_state_sync");
  const historial = await pedirSincronizacion(graphUrl, phoneNumberId, token, "history");
  return { contactos, historial, solicitadaAt: new Date().toISOString() };
}

export function avisoSincronizacion(sync: { contactos: ResultadoSincronizacion; historial: ResultadoSincronizacion }) {
  const fallas = [
    !sync.contactos.ok && `contactos (${sync.contactos.error})`,
    !sync.historial.ok && `historial (${sync.historial.error})`
  ].filter(Boolean);
  return fallas.length
    ? `El número quedó conectado, pero Meta no inició la sincronización de ${fallas.join(" ni de ")}. Avisa a soporte: solo se puede pedir una vez dentro de las 24 h.`
    : undefined;
}
