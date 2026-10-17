export const EVENTOS_CRM = [
  "conversacion.creada", "conversacion.estado_cambiado", "mensaje.recibido",
  "mensaje.enviado", "contacto.creado",
] as const;
export type EventoCrm = typeof EVENTOS_CRM[number];
export type DatosEvento = {
  id: string; conversacion_id?: string; contacto_id?: string; canal_id?: string;
  estado?: string; estado_anterior?: string; nombre?: string; tipo?: string;
};
