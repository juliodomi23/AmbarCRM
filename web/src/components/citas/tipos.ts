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
  horarios?: { diaSemana: number; inicioMin: number; finMin: number }[];
  excepciones?: { fecha: string; inicioMin: number | null; finMin: number | null }[];
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
    programada: "border-info bg-card bg-[linear-gradient(hsl(var(--info)/0.14),hsl(var(--info)/0.14))] text-info",
    confirmada: "border-success bg-card bg-[linear-gradient(hsl(var(--success)/0.14),hsl(var(--success)/0.14))] text-success",
    en_sala: "border-accent-foreground bg-accent text-accent-foreground",
    completada: "border-border bg-muted text-foreground",
    cancelada: "border-destructive bg-card bg-[linear-gradient(hsl(var(--destructive)/0.14),hsl(var(--destructive)/0.14))] text-destructive",
    no_asistio: "border-warning bg-card bg-[linear-gradient(hsl(var(--warning)/0.14),hsl(var(--warning)/0.14))] text-warning",
  };
  return estilos[estado];
}
