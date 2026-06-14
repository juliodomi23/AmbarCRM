// Capa de abstracción de canal de WhatsApp.
// Toda la app habla con esta interfaz. Cambiar de Evolution a Cloud API (coexistencia Meta)
// = registrar otra implementación; ni la UI ni la lógica del embudo cambian.

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
  readonly nombre: "evolution" | "cloud_api";

  enviarTexto(telefono: string, texto: string): Promise<ResultadoEnvio>;

  enviarMedia(
    telefono: string,
    mediaUrl: string,
    tipo: TipoMensaje,
    caption?: string
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

  // --- Gestión de conexión (opcional) ---
  // Solo aplica a proveedores que vinculan por QR (Evolution). Cloud API usa token,
  // así que estos métodos quedan ausentes y la UI no muestra el flujo de QR.

  /** Crea la instancia si no existe y pide el QR/código para vincular el número. */
  conectar?(instancia: string): Promise<DatosConexion>;

  /** Consulta el estado real de la conexión contra el proveedor. */
  estadoConexion?(instancia: string): Promise<{ estado: EstadoConexion; telefono?: string }>;

  /** Cierra la sesión del número vinculado. */
  desconectar?(instancia: string): Promise<ResultadoEnvio>;
}
