import type { CampoFormulario, OpcionCampo } from "@/components/modulos/FormularioModulo";
import { hoyMexico, OPCIONES } from "@/lib/opciones-formularios";

/** Campos de los formularios de módulos (alta y edición), en un solo lugar. */

type Def = [nombre: string, etiqueta: string, tipo?: CampoFormulario["tipo"], extra?: Partial<CampoFormulario>];
const campos = (...defs: Def[]): CampoFormulario[] =>
  defs.map(([nombre, etiqueta, tipo = "texto", extra = {}]) => ({ nombre, etiqueta, tipo, ...extra }));
const req = { requerido: true };
const opciones = (lista: OpcionCampo[], requerido = false) => ({ opciones: lista, requerido });

// ---------------------------------------------------------------- viajes
export const camposTour = () => campos(
  ["nombre", "Nombre", "texto", req], ["destino", "Destino", "texto", req], ["pais", "País"],
  ["fechaSalida", "Fecha de salida", "fecha"], ["fechaRegreso", "Fecha de regreso", "fecha"],
  ["duracionDias", "Duración (días)", "numero", { valorInicial: "1" }], ["capacidad", "Cupo (personas)", "numero", req],
  ["precio", "Precio por persona", "dinero", req], ["puntoEncuentro", "Punto de encuentro"],
  ["incluye", "Incluye", "textarea"], ["estado", "Estado", "seleccion", opciones(OPCIONES.estadoTour)],
);

export const camposReserva = (tours: OpcionCampo[]) => campos(
  ["contactoId", "Viajero (contacto)", "contacto", req], ["tourId", "Tour", "seleccion", opciones(tours, true)],
  ["viajeros", "Número de viajeros", "numero", { requerido: true, valorInicial: "1" }], ["total", "Total", "dinero", req],
  ["saldo", "Saldo pendiente", "dinero", { ayuda: "Vacío = igual al total" }],
  ["estado", "Estado", "seleccion", opciones(OPCIONES.estadoReserva)], ["notas", "Notas", "textarea"],
);

export const camposReservaEdicion = () => campos(
  ["estado", "Estado", "seleccion", opciones(OPCIONES.estadoReservaTodos)],
  ["viajeros", "Número de viajeros", "numero", req],
  ["total", "Total", "dinero", { requerido: true, ayuda: "El saldo se recalcula con lo ya pagado" }],
  ["fechaSalida", "Fecha de salida", "fecha"], ["notas", "Notas", "textarea"],
);

export const camposPago = (reservas: OpcionCampo[]) => campos(
  ["reservaId", "Reserva", "seleccion", opciones(reservas, true)], ["monto", "Monto", "dinero", req],
  ["metodo", "Método", "seleccion", opciones(OPCIONES.metodoPago)], ["referencia", "Referencia"],
  ["concepto", "Concepto", "texto", { valorInicial: "Pago de reservación" }],
  ["fecha", "Fecha", "fecha", { valorInicial: hoyMexico() }],
);

export const camposPagoEdicion = () => campos(
  ["concepto", "Concepto"], ["metodo", "Método", "seleccion", opciones(OPCIONES.metodoPago)], ["referencia", "Referencia"],
);

// ---------------------------------------------------------------- academia
export const camposAlumno = () => [
  ...campos(["contactoId", "Alumno (contacto)", "contacto", req]), ...camposAlumnoEdicion(),
];

export const camposAlumnoEdicion = () => campos(
  ["matricula", "Matrícula"], ["nivel", "Nivel"], ["fechaNacimiento", "Fecha de nacimiento", "fecha"],
  ["tutorNombre", "Tutor"], ["tutorTelefono", "Teléfono del tutor"],
  ["estado", "Estado", "seleccion", opciones(OPCIONES.estadoAlumno)], ["observaciones", "Observaciones", "textarea"],
);

export const camposCurso = () => campos(
  ["nombre", "Nombre", "texto", req], ["categoria", "Categoría"],
  ["modalidad", "Modalidad", "seleccion", opciones(OPCIONES.modalidad)], ["profesor", "Profesor"], ["horario", "Horario"],
  ["fechaInicio", "Inicio", "fecha"], ["fechaFin", "Fin", "fecha"], ["capacidad", "Cupo", "numero", req],
  ["mensualidad", "Mensualidad", "dinero"], ["estado", "Estado", "seleccion", opciones(OPCIONES.estadoCurso)],
);

export const camposInscripcion = (alumnos: OpcionCampo[], cursos: OpcionCampo[]) => campos(
  ["alumnoId", "Alumno", "seleccion", opciones(alumnos, true)], ["cursoId", "Curso", "seleccion", opciones(cursos, true)],
  ["descuento", "Descuento (%)", "numero", { valorInicial: "0" }],
);

export const camposInscripcionEdicion = () => campos(
  ["estado", "Estado", "seleccion", opciones(OPCIONES.estadoInscripcion)], ["avance", "Avance (%)", "numero"],
  ["descuento", "Descuento (%)", "numero"], ["notas", "Notas", "textarea"],
);

export const camposColegiatura = (alumnos: OpcionCampo[]) => [
  ...campos(["alumnoId", "Alumno", "seleccion", opciones(alumnos, true)]), ...camposColegiaturaEdicion(),
];

export const camposColegiaturaEdicion = () => campos(
  ["concepto", "Concepto", "texto", { valorInicial: "Colegiatura" }], ["periodo", "Periodo", "texto", { ayuda: "Ej. Octubre 2026" }],
  ["monto", "Monto", "dinero", req], ["vencimiento", "Vence", "fecha", req],
  ["estado", "Estado", "seleccion", opciones(OPCIONES.estadoColegiatura)],
  ["metodo", "Método de pago", "seleccion", opciones([{ valor: "", etiqueta: "Sin pagar" }, ...OPCIONES.metodoPago])],
);

export const camposAsistencia = (alumnos: OpcionCampo[], cursos: OpcionCampo[]) => [
  ...campos(
    ["cursoId", "Curso", "seleccion", opciones(cursos, true)], ["alumnoId", "Alumno", "seleccion", opciones(alumnos, true)],
    ["fecha", "Fecha", "fecha", { requerido: true, valorInicial: hoyMexico() }],
  ),
  ...camposAsistenciaEdicion(),
];

export const camposAsistenciaEdicion = () => campos(
  ["estado", "Asistencia", "seleccion", opciones(OPCIONES.asistencia)], ["notas", "Notas"],
);

// ---------------------------------------------------------------- legal
export const camposExpediente = (equipo: OpcionCampo[], sucursales: OpcionCampo[]) => campos(
  ["numeroInterno", "Número interno", "texto", { ayuda: "Captura el número interno o la materia" }], ["materia", "Materia"],
  ["contactoId", "Cliente (contacto)", "contacto"],
  ["responsableId", "Responsable", "seleccion", { opciones: equipo, ayuda: "Si eres pasante, siempre queda a tu nombre" }],
  ["sucursalId", "Sucursal", "seleccion", opciones(sucursales)], ["tipoJuicio", "Tipo de juicio"], ["juzgado", "Juzgado"],
  ["etapaProcesal", "Etapa procesal"], ["fechaInicio", "Fecha de inicio", "fecha"], ["cuantia", "Cuantía", "dinero"],
  ["estado", "Estado", "seleccion", opciones(OPCIONES.estadoExpediente)], ["resumen", "Resumen", "textarea"],
);

export const camposAsesoria = (equipo: OpcionCampo[], expedientes: OpcionCampo[], conContacto = true) => campos(
  ["tema", "Tema", "texto", req], ...(conContacto ? [["contactoId", "Cliente (contacto)", "contacto"] as Def] : []),
  ["abogadoId", "Abogado", "seleccion", opciones(equipo)], ["expedienteId", "Expediente", "seleccion", opciones(expedientes)],
  ["fecha", "Fecha", "fecha", { valorInicial: hoyMexico() }],
  ["origen", "Origen", "texto", { ayuda: "Ej. WhatsApp, recomendación, página web" }],
  ["estado", "Estado", "seleccion", opciones(OPCIONES.estadoAsesoria)], ["resumen", "Resumen", "textarea"],
);

export const camposMovimiento = (expedientes: OpcionCampo[]) => campos(
  ["tipo", "Tipo", "seleccion", opciones(OPCIONES.tipoMovimiento, true)], ["concepto", "Concepto", "texto", req],
  ["monto", "Monto", "dinero", { requerido: true, ayuda: "Los gastos pueden capturarse en negativo" }],
  ["expedienteId", "Expediente", "seleccion", opciones(expedientes)],
  ["fecha", "Fecha", "fecha", { valorInicial: hoyMexico() }],
);

export const camposOperacion = (sucursales: OpcionCampo[]) => campos(
  ["tipo", "Tipo", "seleccion", opciones(OPCIONES.tipoOperacion, true)], ["sucursalId", "Sucursal", "seleccion", opciones(sucursales)],
  ["fecha", "Fecha", "fecha", { valorInicial: hoyMexico() }], ["descripcion", "Descripción", "textarea"],
);

export const camposSucursal = () => campos(
  ["nombre", "Nombre", "texto", req], ["direccion", "Dirección"], ["telefono", "Teléfono"],
);

/** Valor de un campo de fecha (AAAA-MM-DD) a partir de lo guardado. */
export const fechaCampo = (fecha: Date | null | undefined) => (fecha ? fecha.toISOString().slice(0, 10) : "");
/** Cualquier valor guardado (número, Decimal, bigint, null) como texto para el formulario. */
export const textoCampo = (valor: unknown) => (valor == null ? "" : String(valor));
