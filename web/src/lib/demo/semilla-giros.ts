// Datos de los módulos propios de cada giro (legal, viajes, academia, automotriz, inmobiliaria).
// Misma historia que web/scripts/seed-demo-{legal,viajes,academia,automotriz,inmobiliaria}.mjs.
// Las filas conservan los nombres de columna de la BD (camelCase) y las fechas van en ISO.
import { fechaMexico } from "./fechas";
import type { Datos } from "./tipos";

type Ayuda = { id: () => string };
const porTelefono = (d: Datos, tel: string) => d.contactos.find((c) => c.telefono === tel)!;
const dia = (dias: number) => fechaMexico(dias, 12);

export function sembrarLegal(d: Datos, a: Ayuda) {
  const admin = d.usuarios[0];
  const sucursal = { id: a.id(), nombre: "Oficina Centro", direccion: "Dirección de ejemplo", activa: true };
  d.extra.sucursalesLegales = [sucursal];
  const contactos = [porTelefono(d, "5558100001"), porTelefono(d, "5558100002"), porTelefono(d, "5558100003")];
  const base = { numeroJudicial: null, juzgado: null, fechaInicio: null, estado: "activo", responsableId: admin.id, sucursalId: sucursal.id };
  d.extra.expedientesLegales = [
    { id: a.id(), numeroInterno: "DEMO-FAM-001", materia: "Familiar", tipoJuicio: "Convenio", etapaProcesal: "Integración", resumen: "Asunto completamente ficticio para mostrar el módulo.", contactoId: contactos[0].id, updatedAt: dia(-1), ...base },
    { id: a.id(), numeroInterno: "DEMO-MER-002", materia: "Mercantil", tipoJuicio: "Cobranza", etapaProcesal: "Seguimiento", resumen: "Segundo expediente demostrativo sin información real.", contactoId: contactos[1].id, updatedAt: dia(0), ...base },
  ];
  d.extra.registrosLegales = d.extra.expedientesLegales.flatMap((e, i) => [
    { id: a.id(), expedienteId: e.id, usuarioId: admin.id, tipo: "actuacion", titulo: "Revisión inicial", descripcion: "Registro ficticio de demostración.", fechaInicio: dia(-2 - i), fechaFin: null, estado: null, archivoUrl: null },
    { id: a.id(), expedienteId: e.id, usuarioId: admin.id, tipo: "seguimiento", titulo: "Llamada de seguimiento", descripcion: "Se acordó continuar la próxima semana.", fechaInicio: dia(-1 - i), fechaFin: null, estado: null, archivoUrl: null },
  ]);
  d.extra.asesorias = contactos.slice(1).map((c, i) => ({ id: a.id(), contactoId: c.id, abogadoId: admin.id, expedienteId: null, sucursalId: sucursal.id, fecha: dia(0), tema: i ? "Consulta civil de ejemplo" : "Consulta familiar de ejemplo", estado: i ? "pendiente" : "contrato_firmado", monto: 900, origen: null }));
  d.extra.movimientosLegales = [
    { id: a.id(), tipo: "plan_pago", concepto: "Plan de honorarios · DEMO-FAM-001", monto: 6000, expedienteId: d.extra.expedientesLegales[0].id, contactoId: contactos[0].id, fecha: dia(-6), estado: "vigente", createdAt: dia(-6) },
    { id: a.id(), tipo: "pago", concepto: "Anticipo de honorarios", monto: 2000, expedienteId: d.extra.expedientesLegales[0].id, contactoId: contactos[0].id, fecha: dia(-5), estado: "aplicado", createdAt: dia(-5) },
    { id: a.id(), tipo: "diligencia", concepto: "Copias certificadas", monto: 350, expedienteId: d.extra.expedientesLegales[1].id, contactoId: contactos[1].id, fecha: dia(-2), estado: "pagado", createdAt: dia(-2) },
  ];
  d.extra.operacionLegal = [
    { id: a.id(), tipo: "checada", sucursalId: sucursal.id, usuarioId: admin.id, fecha: fechaMexico(0, 9), descripcion: "Entrada", estado: "registrada", createdAt: fechaMexico(0, 9) },
    { id: a.id(), tipo: "actividad", sucursalId: sucursal.id, usuarioId: d.usuarios[1]?.id ?? admin.id, fecha: fechaMexico(0, 11), descripcion: "Revisión de expedientes pendientes", estado: "registrada", createdAt: fechaMexico(0, 11) },
  ];
}

export function sembrarViajes(d: Datos, a: Ayuda) {
  const contactos = ["5558200001", "5558200002", "5558200003"].map((t) => porTelefono(d, t));
  const tours = ([
    ["OAX-01", "Oaxaca cultural", "Oaxaca", 4, 18, 7800, "publicado", 25],
    ["GTO-02", "Fin de semana en Guanajuato", "Guanajuato", 3, 25, 4200, "publicado", 40],
    ["CUN-03", "Caribe en familia", "Cancún", 5, 20, 14500, "borrador", 60],
  ] as Array<[string, string, string, number, number, number, string, number]>).map(([clave, nombre, destino, duracionDias, capacidad, precio, estado, salidaEn]) => ({
    id: a.id(), clave, nombre, destino, pais: "México", duracionDias, capacidad, precio, moneda: "MXN", estado,
    fechaSalida: dia(salidaEn), fechaRegreso: dia(salidaEn + duracionDias), puntoEncuentro: null, incluye: null,
  }));
  d.extra.tours = tours;
  d.extra.reservasTour = ([
    ["VIA-1001", 0, 0, 2, "confirmada", 15600, 7600],
    ["VIA-1002", 1, 1, 1, "liquidada", 4200, 0],
    ["VIA-1003", 0, 2, 3, "solicitada", 23400, 23400],
  ] as Array<[string, number, number, number, string, number, number]>).map(([codigo, ti, ci, viajeros, estado, total, saldo], i) => ({
    id: a.id(), codigo, tourId: tours[ti].id, contactoId: contactos[ci].id, viajeros, estado, total, saldo, fechaSalida: tours[ti].fechaSalida, notas: null, createdAt: dia(-8 + i),
  }));
  d.extra.pagosTour = d.extra.reservasTour.filter((r) => r.saldo < r.total).map((r) => ({
    id: a.id(), reservaId: r.id, concepto: "Anticipo de reservación", monto: r.total - r.saldo, metodo: "transferencia", referencia: `DEMO-${r.codigo}`, estado: "aplicado", fecha: dia(-6),
  }));
}

export function sembrarAcademia(d: Datos, a: Ayuda) {
  const alumnos = ["5558300001", "5558300002", "5558300003", "5558300004"].map((t, i) => ({
    id: a.id(), contactoId: porTelefono(d, t).id, matricula: `AF-00${i + 1}`, nivel: i < 2 ? "Inicial" : "Intermedio", fechaNacimiento: null, tutorNombre: `Tutor ${i + 1}`, tutorTelefono: null, estado: "activo", observaciones: null, createdAt: dia(-30 + i),
  }));
  d.extra.alumnos = alumnos;
  const cursos = [
    { clave: "ING-A1", nombre: "Inglés inicial", categoria: "Idiomas", profesor: "Mtra. Elisa Prado", horario: "Lun y mié 17:00", capacidad: 12, mensualidad: 1450 },
    { clave: "MAT-01", nombre: "Matemáticas prácticas", categoria: "Regularización", profesor: "Prof. Iván Mora", horario: "Mar y jue 16:00", capacidad: 10, mensualidad: 1200 },
  ].map((c) => ({ id: a.id(), modalidad: "presencial", fechaInicio: null, fechaFin: null, estado: "abierto", ...c }));
  d.extra.cursos = cursos;
  d.extra.inscripciones = alumnos.map((al, i) => ({ id: a.id(), alumnoId: al.id, cursoId: cursos[i % 2].id, estado: "activa", avance: 20 + i * 15, descuento: 0, notas: null, fechaAlta: dia(-25), createdAt: dia(-25) }));
  d.extra.colegiaturas = d.extra.inscripciones.map((ins, i) => ({
    id: a.id(), alumnoId: ins.alumnoId, inscripcionId: ins.id, concepto: "Colegiatura mensual", periodo: "Octubre 2026", monto: cursos[i % 2].mensualidad,
    vencimiento: dia(i < 2 ? -3 : 4), estado: i < 2 ? "pagada" : "pendiente", metodo: i < 2 ? "transferencia" : null,
  }));
  d.extra.asistencias = d.extra.inscripciones.map((ins, i) => ({ id: a.id(), alumnoId: ins.alumnoId, cursoId: ins.cursoId, fecha: dia(-4), estado: i === 3 ? "retardo" : "presente", notas: null }));
}

export function sembrarAutomotriz(d: Datos, a: Ayuda) {
  const inventario: Array<[string, string, string, number, string, string, number, number]> = [
    ["A-101", "Toyota", "Corolla", 2024, "LE CVT", "Blanco", 18400, 389000],
    ["A-102", "Mazda", "CX-30", 2023, "i Sport", "Rojo", 26750, 419900],
    ["A-103", "Nissan", "Kicks", 2024, "Advance", "Gris", 12100, 438000],
    ["A-104", "Volkswagen", "Jetta", 2022, "Comfortline", "Azul", 39500, 369000],
    ["A-105", "Kia", "Seltos", 2023, "EX", "Negro", 22400, 449000],
    ["A-106", "Honda", "Civic", 2021, "Touring", "Plata", 48100, 399000],
  ];
  d.extra.vehiculos = inventario.map(([numeroStock, marca, modelo, anio, version, color, kilometraje, precio], i) => ({
    id: a.id(), numeroStock, vin: `DEMOAUTO${String(i + 1).padStart(9, "0")}`, marca, modelo, anio, version, color, kilometraje, precio: String(precio), moneda: "MXN",
    estado: i === 1 ? "reservado" : i === 5 ? "vendido" : "disponible", fotoUrl: null, notas: i === 0 ? "Un solo dueño, servicios de agencia." : null,
  }));
}

export function sembrarInmobiliaria(d: Datos, a: Ayuda) {
  const catalogo: Array<[string, string, string, string, string, number, number, number, number]> = [
    ["P-101", "Casa familiar en Cumbres", "Casa", "Venta", "Monterrey", 3, 2.5, 210, 4950000],
    ["P-102", "Departamento con terraza", "Departamento", "Renta", "Monterrey", 2, 2, 110, 28000],
    ["P-103", "Residencia frente al parque", "Casa", "Venta", "San Pedro", 4, 4.5, 420, 12900000],
    ["P-104", "Local en avenida principal", "Local", "Renta", "Guadalupe", 0, 1, 85, 19500],
    ["P-105", "Terreno para desarrollo", "Terreno", "Venta", "Apodaca", 0, 0, 650, 3250000],
  ];
  d.extra.propiedades = catalogo.map(([clave, titulo, tipo, operacion, ciudad, recamaras, banos, superficie, precio], i) => ({
    id: a.id(), clave, titulo, tipo, operacion, direccion: null, colonia: null, ciudad, recamaras, banos: String(banos), superficie: String(superficie), precio: String(precio),
    estado: i === 2 ? "reservada" : "disponible", fotoUrl: null, notas: null,
  }));
}
