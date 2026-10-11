// Tipos del almacén en memoria de la demo. Los ids son strings numéricos (como los BigInt serializados
// del CRM real) y las fechas ISO. Las filas replican la forma que los componentes reales reciben.
import type { BrandPreset } from "@/lib/brand";

export type GiroId = "clinica" | "automotriz" | "inmobiliaria" | "retail" | "legal" | "viajes" | "educacion";

export type UsuarioD = {
  id: string;
  nombre: string;
  email: string;
  rol: "admin" | "agente";
  puesto: string;
  activo: boolean;
};

export type EtiquetaD = { id: string; nombre: string; color: string };

export type ContactoD = {
  id: string;
  nombre: string;
  telefono: string | null;
  email: string | null;
  empresa: string | null;
  notas: string | null;
  fuente: string;
  responsableId: string | null;
  optOutDifusion: boolean;
  esPersonal: boolean;
  esCliente: boolean;
  etiquetaIds: string[];
  campos: Record<string, unknown>;
  createdAt: string;
};

export type ConversacionD = {
  id: string;
  contactoId: string;
  canalId: string | null;
  responsableId: string | null;
  estado: "abierta" | "pendiente" | "cerrada";
  botActivo: boolean;
  fijadoAt: string | null;
  noLeidos: number;
  ultimoMensajeAt: string | null;
  csatScore: number | null;
};

export type MensajeD = {
  id: string;
  conversacionId: string;
  direccion: "entrante" | "saliente";
  tipo: string;
  contenido: string | null;
  mediaUrl: string | null;
  interna: boolean;
  status: string;
  timestamp: string;
};

export type ProgramadoD = { id: string; conversacionId: string; contenido: string; enviarAt: string };

export type EmbudoD = { id: string; nombre: string; orden: number };
export type EtapaD = {
  id: string;
  embudoId: string;
  nombre: string;
  color: string;
  tipo: "normal" | "ganado" | "perdido";
  orden: number;
};
export type OportunidadD = {
  id: string;
  titulo: string;
  valor: number;
  moneda: string;
  embudoId: string;
  etapaId: string;
  contactoId: string;
  responsableId: string | null;
  estado: "abierto" | "ganado" | "perdido";
  motivoPerdida: string | null;
  orden: number;
  createdAt: string;
  closedAt: string | null;
};

export type TareaD = {
  id: string;
  titulo: string;
  descripcion: string | null;
  venceAt: string | null;
  completada: boolean;
  completadaAt: string | null;
  responsableId: string | null;
  oportunidadId: string | null;
  createdAt: string;
};

export type PlantillaD = { id: string; nombre: string; contenido: string };

export type CampoPersonalizadoD = {
  id: string;
  entidad: string;
  clave: string;
  etiqueta: string;
  tipo: string;
  opciones: string[];
  activo: boolean;
  orden: number;
};

export type ModuloD = { activo: boolean; config: Record<string, unknown> };

export type MarcaD = {
  nombre: string;
  preset: BrandPreset;
  logo: string | null;
  colorPrimario: string;
  colorAcento: string;
};

export type Datos = {
  giro: GiroId;
  marca: MarcaD;
  usuarios: UsuarioD[];
  etiquetas: EtiquetaD[];
  contactos: ContactoD[];
  conversaciones: ConversacionD[];
  mensajes: MensajeD[];
  programados: ProgramadoD[];
  embudos: EmbudoD[];
  etapas: EtapaD[];
  oportunidades: OportunidadD[];
  tareas: TareaD[];
  plantillas: PlantillaD[];
  camposPersonalizados: CampoPersonalizadoD[];
  modulos: Record<string, ModuloD>;
  resenas: Array<{ calificacion: number; origen: string; createdAt: string }>;
  /** Filas de los módulos por giro (citas, productos, cotizaciones…): se agregan por fase. */
  extra: Record<string, any[]>;
};
