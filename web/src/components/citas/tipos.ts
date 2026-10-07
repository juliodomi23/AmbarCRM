export type ContactoCita = {
  id: string;
  nombre: string;
  expediente?: { id: string } | null;
};
export type UsuarioCita = { id: string; nombre: string };
export type DoctorCita = {
  id: string;
  nombre: string;
  especialidad: string | null;
  cedula: string | null;
  color: string;
  activo: boolean;
};

export type EstadoCita =
  | "programada"
  | "confirmada"
  | "en_sala"
  | "completada"
  | "cancelada"
  | "no_asistio";

export type Cita = {
  id: string;
  titulo: string;
  notas: string | null;
  inicio: string;
  fin: string;
  estado: EstadoCita;
  contacto: ContactoCita;
  responsable: UsuarioCita | null;
  doctor: DoctorCita | null;
};

export type FormularioCita = {
  contactoId: string;
  conversacionId: string;
  titulo: string;
  notas: string;
  inicio: string;
  fin: string;
  responsableId: string;
  doctorId: string;
};

export const ESTADOS_CITA: { valor: EstadoCita; etiqueta: string }[] = [
  { valor: "programada", etiqueta: "Programada" },
  { valor: "confirmada", etiqueta: "Confirmada" },
  { valor: "en_sala", etiqueta: "En sala" },
  { valor: "completada", etiqueta: "Completada" },
  { valor: "cancelada", etiqueta: "Cancelada" },
  { valor: "no_asistio", etiqueta: "No asistió" },
];

export function estiloEstado(estado: EstadoCita) {
  const estilos: Record<EstadoCita, string> = {
    programada: "border-sky-400 bg-sky-100 text-sky-950",
    confirmada: "border-emerald-500 bg-emerald-100 text-emerald-950",
    en_sala: "border-violet-500 bg-violet-100 text-violet-950",
    completada: "border-slate-400 bg-slate-100 text-slate-700",
    cancelada: "border-red-400 bg-red-100 text-red-800",
    no_asistio: "border-amber-400 bg-amber-100 text-amber-900",
  };
  return estilos[estado];
}
