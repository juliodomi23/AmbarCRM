/** Permisos que se le pueden dar a cada bot. Sin dependencias: lo usan la API y la pantalla de Configuración. */
export const PERMISOS_BOT = [
  "leer_perfil",
  "enviar_mensaje",
  "notas_internas",
  "mover_embudo",
  "editar_oportunidad",
  "crear_tarea",
  "handoff",
  "agendar_cita",
  "cotizar",
  "ver_productos",
  "gestionar_contactos",
] as const;

export type PermisoBot = (typeof PERMISOS_BOT)[number];

/** Con lo que nace un bot nuevo; el admin activa el resto. */
export const PERMISOS_MINIMOS: PermisoBot[] = ["leer_perfil", "enviar_mensaje", "notas_internas", "handoff"];

export const ETIQUETAS_PERMISO: Record<PermisoBot, string> = {
  leer_perfil: "Leer conversación y perfil",
  enviar_mensaje: "Enviar mensajes al cliente",
  notas_internas: "Dejar notas internas",
  mover_embudo: "Mover etapa del embudo",
  editar_oportunidad: "Editar oportunidad (valor, responsable, embudo)",
  crear_tarea: "Crear tareas",
  handoff: "Pasar a un asesor y etiquetar",
  agendar_cita: "Consultar, agendar y reprogramar citas",
  cotizar: "Crear y enviar cotizaciones",
  ver_productos: "Consultar productos y existencias",
  gestionar_contactos: "Buscar y crear contactos",
};

/** Lista de permisos válida (sin repetidos) o null si trae algo que no existe. */
export function permisosValidos(valor: unknown): PermisoBot[] | null {
  if (!Array.isArray(valor)) return null;
  const lista = valor.map(String);
  if (!lista.every((p) => (PERMISOS_BOT as readonly string[]).includes(p))) return null;
  return [...new Set(lista)] as PermisoBot[];
}
