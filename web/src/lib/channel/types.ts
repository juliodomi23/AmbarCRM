// Contrato del canal oficial de WhatsApp Cloud API.

export type TipoMensaje =
  | "texto" | "imagen" | "audio" | "video" | "documento" | "ubicacion" | "plantilla";

/** Mensaje entrante ya normalizado (sin importar el proveedor). */
export interface MensajeEntranteNormalizado {
  waMessageId: string;          // id único del proveedor -> idempotencia
  telefono: string;             // remitente en E.164 (sin '+', solo dígitos)
  nombre?: string;              // pushName / perfil
  tipo: TipoMensaje;
  contenido?: string;           // texto o caption
  mediaUrl?: string;            // URL cruda del proveedor (cifrada en WhatsApp, no servible)
  mediaMime?: string;
  direccion?: "entrante" | "saliente"; // saliente = lo mandó el propio número (desde el celular)
  historico?: boolean;         // importado por Coexistence; no dispara bots, push ni automatizaciones
  raw?: unknown;                // mensaje original del proveedor (para descargar el media)
  timestamp: Date;
}

/** Para importar el directorio existente del número (contactos y chats). */
export interface ImportContacto {
  telefono: string;
  nombre?: string;
}
export interface ImportChat {
  telefono: string;
  nombre?: string;
  ultimoTexto?: string;
  timestamp?: Date;
}

/** Mensaje entrante de un grupo, ya normalizado. */
export interface MensajeGrupoNormalizado {
  grupoJid: string;
  remitenteTel: string;
  remitenteNombre?: string;
  tipo: TipoMensaje;
  contenido?: string;
  mediaUrl?: string;
  mediaMime?: string;
  raw?: unknown;
  waMessageId: string;
  timestamp: Date;
}

/** Mensaje histórico (para importar últimos N de una conversación o grupo). */
export interface MensajeHistorial {
  direccion: "entrante" | "saliente";
  tipo: TipoMensaje;
  contenido?: string;
  mediaUrl?: string;
  mediaMime?: string;
  waMessageId: string;
  timestamp: Date;
  remitenteNombre?: string;
  remitenteTel?: string;
}

/** Estado de un mensaje saliente reportado por el proveedor (acuses). */
export type EstadoMensaje = "enviado" | "entregado" | "leido" | "fallido";

export interface ActualizacionEstado {
  waMessageId: string;
  status: EstadoMensaje;
}

/** Resultado de un envío. */
export interface ResultadoEnvio {
  ok: boolean;
  waMessageId?: string;
  error?: string;
}

export interface PlantillaOficial {
  name: string;
  language: string;
  status?: string;
  category?: string;
  components?: unknown[];
}

export type EstadoConexion = "conectado" | "conectando" | "desconectado";

/** Resultado de pedir vincular el número (QR / código de emparejamiento). */
export interface DatosConexion {
  ok: boolean;
  estado: EstadoConexion;
  qrBase64?: string;     // data URI listo para <img src>; ausente si ya está conectado
  pairingCode?: string;  // alternativa al QR para vincular escribiendo un código
  telefono?: string;     // número vinculado, si ya conectó
  error?: string;
}

/** Contrato común de todos los proveedores. */
export interface ChannelProvider {
  readonly nombre: "cloud_api";

  enviarTexto(telefono: string, texto: string): Promise<ResultadoEnvio>;

  /** Envía una plantilla oficial previamente aprobada por WhatsApp. */
  enviarPlantilla?(telefono: string, plantilla: PlantillaOficial, variables?: string[]): Promise<ResultadoEnvio>;

  /** Lista las plantillas oficiales disponibles en el proveedor. */
  listarPlantillas?(): Promise<PlantillaOficial[]>;

  enviarMedia(
    telefono: string,
    mediaUrl: string,
    tipo: TipoMensaje,
    caption?: string,
    mimetype?: string
  ): Promise<ResultadoEnvio>;

  /** Envía un audio como nota de voz (PTT). Recibe base64 (sin prefijo data:). */
  enviarAudio?(telefono: string, audioBase64: string): Promise<ResultadoEnvio>;

  /** Convierte el body crudo del webhook del proveedor a uno o varios mensajes normalizados. */
  normalizarEntrante(payload: unknown): MensajeEntranteNormalizado[];

  /** Extrae acuses de estado (entregado/leído) de un evento de actualización. [] si no aplica. */
  normalizarEstado?(payload: unknown): ActualizacionEstado[];

  /** Descarga el contenido real de un media entrante (cifrado en WhatsApp) como base64. */
  descargarMedia?(raw: unknown, instancia: string): Promise<{ base64: string; mime: string } | null>;

  /** Trae el directorio existente del número (contactos y chats) para importarlo al CRM. */
  obtenerDirectorio?(instancia: string): Promise<{ contactos: ImportContacto[]; chats: ImportChat[] }>;

  /** Configura el webhook del proveedor para que mande los mensajes entrantes al CRM. */
  configurarWebhook?(instancia: string, url: string, apiKey: string): Promise<ResultadoEnvio>;

  /** Extrae los mensajes entrantes de GRUPOS (chats @g.us). [] si no aplica. */
  normalizarEntranteGrupo?(payload: unknown): MensajeGrupoNormalizado[];

  /** Nombre/asunto de un grupo. */
  infoGrupo?(instancia: string, jid: string): Promise<{ nombre?: string } | null>;

  /** Últimos N mensajes de un chat o grupo (por jid), para importar historial. */
  obtenerMensajes?(instancia: string, jid: string, limite?: number): Promise<MensajeHistorial[]>;

  /** Lista los grupos del número. */
  listarGruposWA?(instancia: string): Promise<{ jid: string; nombre: string }[]>;

}
