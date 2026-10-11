// Endpoints de los módulos propios de cada giro (legal, viajes, academia, automotriz, inmobiliaria).
// Son altas/ediciones/bajas sobre colecciones del almacén (`datos.extra`), con las reglas de negocio mínimas
// del CRM real (saldos de reservas, cupos, duplicados). Nada sale del navegador.
import { almacen, fechaMexico, nuevoId } from "../almacen";
import { ErrorApi, Respuesta, ruta } from "./ruteo";

type Fila = Record<string, any>;
type Def = {
  base: string;
  col: string;
  modulo: string;
  num?: string[];
  fecha?: string[];
  /** Valores por omisión al crear. */
  porOmision?: () => Fila;
  /** Regla de negocio al crear (puede lanzar ErrorApi); recibe el cuerpo ya convertido. */
  alCrear?: (fila: Fila, cuerpo: Fila) => void;
  alEditar?: (fila: Fila, antes: Fila, cuerpo: Fila) => void;
  /** Colecciones permitidas para eliminar (por defecto sí). */
  sinBorrar?: boolean;
};

const ahora = () => new Date().toISOString();
const coleccion = (col: string): Fila[] => (almacen.datos.extra[col] ??= []);

/** Convierte el cuerpo de un formulario: vacío → null, números, fechas AAAA-MM-DD → ISO a mediodía de México. */
function convertir(def: Def, cuerpo: Fila): Fila {
  const salida: Fila = {};
  for (const [k, v] of Object.entries(cuerpo)) {
    if (v === "" || v == null) salida[k] = null;
    else if (def.num?.includes(k)) salida[k] = Number(v) || 0;
    else if (def.fecha?.includes(k)) salida[k] = new Date(`${v}T12:00:00-06:00`).toISOString();
    else salida[k] = v;
  }
  return salida;
}

const exigir = (fila: Fila, campo: string, mensaje: string) => {
  if (fila[campo] == null || fila[campo] === "") throw new ErrorApi(400, mensaje);
};
const buscar = (col: string, id: unknown, mensaje: string) => {
  const f = coleccion(col).find((x) => x.id === String(id));
  if (!f) throw new ErrorApi(404, mensaje);
  return f;
};
const pagosAplicados = (reservaId: string) =>
  coleccion("pagosTour").filter((p) => p.reservaId === reservaId && p.estado === "aplicado").reduce((s, p) => s + p.monto, 0);

const DEFS: Def[] = [
  // ── Legal ────────────────────────────────────────────────────────────────────────────────
  {
    base: "/api/legal/expedientes", col: "expedientesLegales", modulo: "legal", fecha: ["fechaInicio"], num: ["cuantia"],
    porOmision: () => ({ estado: "activo", numeroJudicial: null, juzgado: null, fechaInicio: null, updatedAt: ahora() }),
    alCrear: (f) => {
      if (!f.numeroInterno && !f.materia) throw new ErrorApi(400, "Captura el número interno o la materia");
      f.responsableId ??= almacen.datos.usuarios[0].id;
    },
    alEditar: (f) => void (f.updatedAt = ahora()),
  },
  {
    base: "/api/legal/asesorias", col: "asesorias", modulo: "asesorias_legales", fecha: ["fecha"],
    porOmision: () => ({ estado: "pendiente", fecha: ahora(), monto: 0, origen: null, expedienteId: null }),
    alCrear: (f) => {
      exigir(f, "tema", "El tema es obligatorio");
      f.abogadoId ??= almacen.datos.usuarios[0].id;
    },
  },
  {
    base: "/api/legal/movimientos", col: "movimientosLegales", modulo: "finanzas_legales", fecha: ["fecha"], num: ["monto"],
    porOmision: () => ({ fecha: ahora(), estado: "aplicado", createdAt: ahora() }),
    alCrear: (f) => {
      exigir(f, "tipo", "El tipo es obligatorio");
      exigir(f, "concepto", "El concepto es obligatorio");
      const exp = f.expedienteId ? coleccion("expedientesLegales").find((e) => e.id === String(f.expedienteId)) : null;
      f.contactoId = exp?.contactoId ?? null;
    },
  },
  {
    base: "/api/legal/operacion", col: "operacionLegal", modulo: "operacion_legal", fecha: ["fecha"],
    porOmision: () => ({ fecha: ahora(), estado: "registrada", createdAt: ahora() }),
    alCrear: (f) => {
      exigir(f, "tipo", "El tipo es obligatorio");
      f.usuarioId = almacen.datos.usuarios[0].id;
    },
  },
  {
    base: "/api/legal/sucursales", col: "sucursalesLegales", modulo: "operacion_legal",
    porOmision: () => ({ activa: true }),
    alCrear: (f) => exigir(f, "nombre", "El nombre es obligatorio"),
    sinBorrar: true,
  },
  // ── Viajes ───────────────────────────────────────────────────────────────────────────────
  {
    base: "/api/viajes/tours", col: "tours", modulo: "tours", fecha: ["fechaSalida", "fechaRegreso"], num: ["duracionDias", "capacidad", "precio"],
    porOmision: () => ({ moneda: "MXN", estado: "borrador", pais: null }),
    alCrear: (f) => {
      exigir(f, "nombre", "El nombre es obligatorio");
      exigir(f, "destino", "El destino es obligatorio");
      f.clave = `TOUR-${String(coleccion("tours").length + 1).padStart(2, "0")}`;
    },
  },
  {
    base: "/api/viajes/reservas", col: "reservasTour", modulo: "reservas_tours", fecha: ["fechaSalida"], num: ["viajeros", "total", "saldo"],
    porOmision: () => ({ estado: "solicitada", createdAt: ahora() }),
    alCrear: (f) => {
      const tour = buscar("tours", f.tourId, "Elige un tour");
      exigir(f, "contactoId", "Elige al viajero");
      f.viajeros ||= 1;
      const ocupados = coleccion("reservasTour").filter((r) => r.tourId === tour.id && !["cancelada", "reembolsada"].includes(r.estado)).reduce((s, r) => s + r.viajeros, 0);
      if (ocupados + f.viajeros > tour.capacidad) throw new ErrorApi(409, `Solo quedan ${Math.max(0, tour.capacidad - ocupados)} lugares en este tour`);
      f.codigo = `VIA-${1001 + coleccion("reservasTour").length}`;
      f.total ||= 0;
      f.saldo = f.saldo == null ? f.total : f.saldo;
      f.fechaSalida ??= tour.fechaSalida;
    },
    alEditar: (f, antes) => {
      if (f.total !== antes.total) f.saldo = Math.max(0, f.total - pagosAplicados(f.id));
    },
  },
  {
    base: "/api/viajes/pagos", col: "pagosTour", modulo: "pagos_tours", fecha: ["fecha"], num: ["monto"],
    porOmision: () => ({ estado: "aplicado", fecha: ahora(), concepto: "Pago de reservación" }),
    alCrear: (f) => {
      const r = buscar("reservasTour", f.reservaId, "Elige una reserva");
      if (!(f.monto > 0)) throw new ErrorApi(400, "El monto debe ser mayor a cero");
      if (f.monto > r.saldo + 0.001) throw new ErrorApi(409, "El pago supera el saldo de la reserva");
      r.saldo = Math.round((r.saldo - f.monto) * 100) / 100;
      if (r.saldo <= 0) r.estado = "liquidada";
      else if (r.estado === "solicitada") r.estado = "confirmada";
    },
    alEditar: (f, antes) => {
      if (antes.estado !== "cancelado" && f.estado === "cancelado") {
        const r = coleccion("reservasTour").find((x) => x.id === f.reservaId);
        if (r) {
          r.saldo = Math.round((r.saldo + f.monto) * 100) / 100;
          if (r.estado === "liquidada") r.estado = "confirmada";
        }
      }
    },
    sinBorrar: true,
  },
  // ── Academia ─────────────────────────────────────────────────────────────────────────────
  {
    base: "/api/academia/alumnos", col: "alumnos", modulo: "alumnos", fecha: ["fechaNacimiento"],
    porOmision: () => ({ estado: "activo", createdAt: ahora() }),
    alCrear: (f) => {
      const c = almacen.datos.contactos.find((x) => x.id === String(f.contactoId));
      if (!c) throw new ErrorApi(400, "Elige un contacto");
      if (coleccion("alumnos").some((a) => a.contactoId === c.id)) throw new ErrorApi(409, "Ese contacto ya es alumno");
      f.matricula ??= `AF-${String(coleccion("alumnos").length + 1).padStart(3, "0")}`;
    },
  },
  {
    base: "/api/academia/cursos", col: "cursos", modulo: "cursos_academia", fecha: ["fechaInicio", "fechaFin"], num: ["capacidad", "mensualidad"],
    porOmision: () => ({ estado: "abierto", modalidad: "presencial" }),
    alCrear: (f) => {
      exigir(f, "nombre", "El nombre es obligatorio");
      f.mensualidad ||= 0;
      f.clave = `CUR-${String(coleccion("cursos").length + 1).padStart(2, "0")}`;
    },
  },
  {
    base: "/api/academia/inscripciones", col: "inscripciones", modulo: "inscripciones_academia", num: ["avance", "descuento"],
    porOmision: () => ({ estado: "activa", avance: 0, descuento: 0, fechaAlta: ahora(), createdAt: ahora() }),
    alCrear: (f) => {
      buscar("alumnos", f.alumnoId, "Elige un alumno");
      const curso = buscar("cursos", f.cursoId, "Elige un curso");
      if (coleccion("inscripciones").some((i) => i.alumnoId === f.alumnoId && i.cursoId === f.cursoId)) throw new ErrorApi(409, "El alumno ya está inscrito en este curso");
      const ocupados = coleccion("inscripciones").filter((i) => i.cursoId === curso.id && i.estado === "activa").length;
      if (ocupados >= curso.capacidad) throw new ErrorApi(409, "El curso ya no tiene cupo");
    },
  },
  {
    base: "/api/academia/colegiaturas", col: "colegiaturas", modulo: "colegiaturas", fecha: ["vencimiento"], num: ["monto"],
    porOmision: () => ({ estado: "pendiente", concepto: "Colegiatura", inscripcionId: null }),
    alCrear: (f) => {
      buscar("alumnos", f.alumnoId, "Elige un alumno");
      if (!(f.monto > 0)) throw new ErrorApi(400, "El monto debe ser mayor a cero");
      exigir(f, "vencimiento", "Captura el vencimiento");
    },
  },
  {
    base: "/api/academia/asistencia", col: "asistencias", modulo: "asistencia_academia", fecha: ["fecha"],
    porOmision: () => ({ estado: "presente", notas: null }),
    alCrear: (f) => {
      buscar("alumnos", f.alumnoId, "Elige un alumno");
      buscar("cursos", f.cursoId, "Elige un curso");
      exigir(f, "fecha", "Captura la fecha");
      if (coleccion("asistencias").some((a) => a.alumnoId === f.alumnoId && a.cursoId === f.cursoId && a.fecha.slice(0, 10) === f.fecha.slice(0, 10))) throw new ErrorApi(409, "Ya hay asistencia de ese alumno en esa fecha");
    },
  },
  // ── Automotriz e inmobiliaria ────────────────────────────────────────────────────────────
  {
    base: "/api/automotriz/vehiculos", col: "vehiculos", modulo: "automotriz", num: ["anio", "kilometraje"],
    porOmision: () => ({ estado: "disponible", moneda: "MXN", fotoUrl: null, notas: null }),
    alCrear: (f) => {
      exigir(f, "marca", "La marca es obligatoria");
      exigir(f, "modelo", "El modelo es obligatorio");
      if (f.numeroStock && coleccion("vehiculos").some((v) => v.numeroStock === f.numeroStock)) throw new ErrorApi(409, "Ya existe una unidad con ese número de stock");
      f.precio = String(Number(f.precio) || 0);
    },
  },
  {
    base: "/api/inmobiliaria/propiedades", col: "propiedades", modulo: "inmobiliaria", num: ["recamaras"],
    porOmision: () => ({ estado: "disponible", fotoUrl: null, notas: null, direccion: null, colonia: null }),
    alCrear: (f) => {
      exigir(f, "titulo", "El título es obligatorio");
      exigir(f, "ciudad", "La ciudad es obligatoria");
      f.precio = String(Number(f.precio) || 0);
      f.banos = String(Number(f.banos) || 0);
      f.superficie = String(Number(f.superficie) || 0);
    },
  },
];

for (const def of DEFS) {
  ruta("POST", def.base, ({ cuerpo }) => {
    if (!almacen.datos.modulos[def.modulo]?.activo) throw new ErrorApi(404, "módulo no activo");
    const fila: Fila = { id: nuevoId(), ...def.porOmision?.(), ...convertir(def, cuerpo) };
    almacen.mutar(() => {
      def.alCrear?.(fila, cuerpo);
      coleccion(def.col).unshift(fila);
    });
    return new Respuesta(201, { ok: true, id: fila.id, [def.col]: fila });
  });
  ruta("PATCH", `${def.base}/:id`, ({ params, cuerpo }) => {
    const fila = buscar(def.col, params.id, "no encontrado");
    const antes = { ...fila };
    almacen.mutar(() => {
      Object.assign(fila, convertir(def, cuerpo));
      def.alEditar?.(fila, antes, cuerpo);
    });
    return { ok: true };
  });
  ruta("DELETE", `${def.base}/:id`, ({ params }) => {
    if (def.sinBorrar) throw new ErrorApi(405, "Este registro no se puede borrar");
    buscar(def.col, params.id, "no encontrado");
    almacen.mutar((d) => {
      d.extra[def.col] = coleccion(def.col).filter((x) => x.id !== params.id);
      if (def.col === "alumnos") for (const c of ["inscripciones", "colegiaturas", "asistencias"]) d.extra[c] = coleccion(c).filter((x) => x.alumnoId !== params.id);
      if (def.col === "tours") d.extra.reservasTour = coleccion("reservasTour").filter((x) => x.tourId !== params.id);
    });
    return { ok: true };
  });
}

// Registros del expediente legal (historial).
ruta("POST", "/api/legal/expedientes/:id/registros", ({ params, cuerpo }) => {
  const exp = buscar("expedientesLegales", params.id, "Expediente inexistente");
  if (!cuerpo.titulo || !cuerpo.tipo) throw new ErrorApi(400, "Faltan el tipo y el título");
  const fecha = (v: unknown) => (v ? new Date(`${v}T12:00:00-06:00`).toISOString() : null);
  const registro = {
    id: nuevoId(), expedienteId: exp.id, usuarioId: almacen.datos.usuarios[0].id, tipo: cuerpo.tipo, titulo: cuerpo.titulo, descripcion: cuerpo.descripcion || null,
    fechaInicio: fecha(cuerpo.fechaInicio) ?? ahora(), fechaFin: fecha(cuerpo.fechaFin), estado: cuerpo.estado || null, archivoUrl: null,
  };
  almacen.mutar(() => {
    coleccion("registrosLegales").unshift(registro);
    exp.updatedAt = ahora();
  });
  return new Respuesta(201, { ok: true, id: registro.id });
});

export const hoyDemo = () => fechaMexico(0, 12);
