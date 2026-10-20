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

/**
 * Un mensaje saliente que llega por eco en un canal Coexistence lo escribió una persona desde la app
 * del celular (lo que manda el CRM por la API no genera eco). El historial no cuenta: son mensajes viejos.
 */
export function esRespuestaHumanaPorCoexistence(
  canal: { proveedor: string; config: unknown },
  mensaje: { direccion?: string; historico?: boolean }
) {
  const modo = (canal.config as { onboardingMode?: unknown } | null)?.onboardingMode;
  return canal.proveedor === "cloud_api" && modo === "coexistence" && mensaje.direccion === "saliente" && !mensaje.historico;
}

export async function iniciarSincronizacionCoexistencia(graphUrl: string, phoneNumberId: string, token: string) {
  const contactos = await pedirSincronizacion(graphUrl, phoneNumberId, token, "smb_app_state_sync");
  const historial = await pedirSincronizacion(graphUrl, phoneNumberId, token, "history");
  return { contactos, historial, solicitadaAt: new Date().toISOString() };
}

const VENTANA_SINCRONIZACION_MS = 24 * 60 * 60 * 1000;
type Parte = "contactos" | "historial";
type Sincronizacion = { contactos: ResultadoSincronizacion; historial: ResultadoSincronizacion; solicitadaAt: string };

/** Qué falta por sincronizar y hasta cuándo se puede pedir (24 h desde que se conectó). null si no es Coexistence. */
export function estadoSincronizacion(config: unknown, ahora = Date.now()) {
  const c = config as { onboardingMode?: unknown; connectedAt?: unknown; sincronizacion?: Partial<Sincronizacion> } | null;
  if (c?.onboardingMode !== "coexistence") return null;
  const vence = typeof c.connectedAt === "string" ? Date.parse(c.connectedAt) + VENTANA_SINCRONIZACION_MS : NaN;
  const pendientes = (["contactos", "historial"] as Parte[]).filter((parte) => !c.sincronizacion?.[parte]?.ok);
  return { vigente: ahora < vence, venceAt: Number.isNaN(vence) ? null : new Date(vence).toISOString(), pendientes };
}

/** Repite solo las partes que Meta rechazó: las que ya aceptó no se pueden pedir otra vez. */
export async function reintentarSincronizacion(
  graphUrl: string,
  phoneNumberId: string,
  token: string,
  previa: Partial<Sincronizacion> | undefined,
  pendientes: Parte[]
): Promise<Sincronizacion> {
  const contactos = pendientes.includes("contactos")
    ? await pedirSincronizacion(graphUrl, phoneNumberId, token, "smb_app_state_sync")
    : previa!.contactos!;
  const historial = pendientes.includes("historial")
    ? await pedirSincronizacion(graphUrl, phoneNumberId, token, "history")
    : previa!.historial!;
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
