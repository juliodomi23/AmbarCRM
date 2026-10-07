export type ContactoCita = { id: string; nombre: string };
export type UsuarioCita = { id: string; nombre: string };

export type EstadoCita =
  | "programada"
  | "confirmada"
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
};

export type FormularioCita = {
  contactoId: string;
  conversacionId: string;
  titulo: string;
  notas: string;
  inicio: string;
  fin: string;
  responsableId: string;
};

export const ESTADOS_CITA: { valor: EstadoCita; etiqueta: string }[] = [
  { valor: "programada", etiqueta: "Programada" },
  { valor: "confirmada", etiqueta: "Confirmada" },
  { valor: "completada", etiqueta: "Completada" },
  { valor: "cancelada", etiqueta: "Cancelada" },
  { valor: "no_asistio", etiqueta: "No asistió" },
];

export function estiloEstado(estado: EstadoCita) {
  const estilos: Record<EstadoCita, string> = {
    programada: "border-sky-400 bg-sky-100 text-sky-950",
    confirmada: "border-emerald-500 bg-emerald-100 text-emerald-950",
    completada: "border-slate-400 bg-slate-100 text-slate-700",
    cancelada: "border-red-400 bg-red-100 text-red-800",
    no_asistio: "border-amber-400 bg-amber-100 text-amber-900",
  };
  return estilos[estado];
}
