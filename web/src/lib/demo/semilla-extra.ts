// Datos de los módulos por giro (citas, productos, caja, cotizaciones, pedidos…). Misma historia que los
// seeds demo reales (web/scripts/seed-demo-clinica.mjs y seed-demo-retail.mjs).
import { fechaEstaSemana, fechaMexico, indiceDiaHoy } from "./fechas";
import { sembrarAcademia, sembrarAutomotriz, sembrarInmobiliaria, sembrarLegal, sembrarViajes } from "./semilla-giros";
import type { ContactoD, Datos, GiroId, UsuarioD } from "./tipos";

export type AyudasSemilla = { id: () => string; atiende: (i?: number) => UsuarioD };

const nuevoContacto = (a: AyudasSemilla, nombre: string, telefono: string, responsableId: string | null, extra: Partial<ContactoD> = {}): ContactoD => ({
  id: a.id(), nombre, telefono, email: null, empresa: null, notas: null, fuente: "manual", responsableId, optOutDifusion: false, esPersonal: false,
  esCliente: false, etiquetaIds: [], campos: {}, createdAt: fechaMexico(-20, 10), ...extra,
});

// Agenda de Serénica Health Center (semana actual y siguiente, lunes = 0). Calendarios de Ricardo y Paloma.
// [día desde lunes, hora, minutos, paciente, tratamiento, estado]
type CitaSerenica = [number, string, number, string, string, "confirmada" | "programada"];
const AGENDA_RICARDO: CitaSerenica[] = [
  [0, "16:00", 60, "Teresa Domínguez Pérez", "Extracciones", "confirmada"],
  [0, "17:30", 60, "Rosa Medina", "Implantes", "programada"],
  [1, "10:00", 90, "Elisa Montalvo", "Valoración inicial", "confirmada"],
  [1, "11:30", 90, "Beatriz Cetina", "Endodoncia", "confirmada"],
  [1, "13:00", 90, "Gabriela Sosa", "Limpieza", "confirmada"],
  [1, "14:30", 60, "Fernando Albert", "Valoración inicial", "programada"],
  [1, "18:00", 90, "Leticia Cárdenas", "Endodoncia", "confirmada"],
  [3, "11:30", 90, "Mauricio Herrera", "Endodoncia", "confirmada"],
  [3, "13:30", 60, "Octavio Ruiz Canto", "Valoración inicial", "programada"],
  [3, "16:30", 60, "Leticia Cárdenas", "Implantes", "confirmada"],
  [4, "10:00", 60, "Daniela Ponce", "Endodoncia", "programada"],
  [4, "11:00", 90, "Fabiola Lugo", "Endodoncia", "programada"],
  [4, "12:30", 60, "Renata Pech", "Limpieza", "programada"],
  [2, "15:30", 60, "Hugo Peniche", "Extracciones", "programada"],
  [2, "17:00", 60, "Karina Briceño", "Implantes", "programada"],
  [9, "11:00", 60, "Alma Quintal", "Valoración inicial", "programada"],
  [4, "14:00", 60, "Carlos Mendoza", "Limpieza", "programada"],
  [7, "10:00", 90, "Naomi Brown", "Endodoncia", "programada"],
  [7, "16:00", 60, "Iván Chan Poot", "Valoración inicial", "programada"],
  [8, "11:30", 90, "Ximena Peraza", "Endodoncia", "programada"],
  [10, "10:00", 90, "Héctor Solís", "Endodoncia", "programada"],
  [11, "16:00", 90, "Arturo Bastos", "Endodoncia", "programada"],
];
const AGENDA_PALOMA: CitaSerenica[] = [
  [0, "14:00", 60, "Emilio Barrera", "Ortodoncia", "programada"],
  [1, "08:00", 60, "Camila Ortega", "Limpieza", "confirmada"],
  [1, "09:00", 60, "Itzel Moguel", "Limpieza", "confirmada"],
  [1, "10:00", 30, "Rodolfo Tun", "Ortodoncia", "confirmada"],
  [1, "11:00", 30, "Valentina Rivas", "Ortodoncia", "confirmada"],
  [1, "12:00", 60, "Gael Acosta", "Limpieza", "confirmada"],
  [1, "13:00", 60, "Lourdes Pacheco", "Limpieza", "confirmada"],
  [1, "14:00", 30, "Bruno Escalante", "Limpieza", "confirmada"],
  [2, "15:30", 30, "Regina Canul", "Ortodoncia", "programada"],
  [2, "16:00", 30, "Aurora Dzib", "Ortodoncia", "programada"],
  [2, "16:30", 30, "Itzel Moguel", "Ortodoncia", "programada"],
  [2, "17:00", 30, "Leonel Aké", "Ortodoncia", "programada"],
  [3, "15:00", 120, "Samuel Vela", "Ortodoncia", "confirmada"],
  [4, "16:00", 30, "Kevin Montejo", "Ortodoncia", "programada"],
  [4, "16:30", 30, "Paulina Cab", "Ortodoncia", "programada"],
  [4, "17:00", 30, "Guadalupe Euán", "Ortodoncia", "programada"],
  [3, "13:00", 30, "Ana Paula Ek", "Ortodoncia", "programada"],
  [4, "12:00", 60, "Cecilia Rendón", "Limpieza", "programada"],
  [5, "11:00", 30, "Tomás Villanueva", "Ortodoncia", "programada"],
  [8, "12:00", 30, "Jimena Salazar", "Ortodoncia", "programada"],
  [8, "12:30", 30, "Mariana Pat", "Ortodoncia", "programada"],
  [8, "16:00", 30, "Ariadna Moo", "Ortodoncia", "programada"],
  [8, "16:30", 30, "Sandra Lizama", "Ortodoncia", "programada"],
  [8, "17:00", 30, "Marisol Cen", "Ortodoncia", "programada"],
  [8, "17:30", 30, "Andrés Cetina", "Extracciones", "programada"],
];

const ZONAS_DIENTE = ["vestibular", "lingual", "mesial", "distal", "oclusal"];
const zonas = (lista: string[], estado: string) => Object.fromEntries(lista.map((zona) => [zona, estado]));

/** Odontograma de demostración según el tratamiento del paciente (numeración FDI). */
function dientesPara(tratamiento: string, i: number) {
  const [principal, segundo, tercero] = i % 2 === 0 ? [46, 16, 17] : [36, 26, 27];
  switch (tratamiento) {
    case "Endodoncia":
      return [{ numero: principal, zonas: zonas(["oclusal", "mesial", "distal"], "endodoncia") }, { numero: segundo, zonas: zonas(["oclusal"], "restaurado") }, { numero: 18, zonas: zonas(["oclusal"], "caries") }];
    case "Implantes":
      return [{ numero: principal, zonas: zonas(ZONAS_DIENTE, "extraido") }, { numero: segundo, zonas: zonas(ZONAS_DIENTE, "corona") }, { numero: tercero, zonas: zonas(["distal"], "caries") }];
    case "Extracciones":
      return [{ numero: 48, zonas: zonas(ZONAS_DIENTE, "extraido") }, { numero: tercero, zonas: zonas(["oclusal", "mesial"], "caries") }];
    case "Ortodoncia":
      return [{ numero: principal, zonas: zonas(["oclusal"], "restaurado") }];
    case "Limpieza":
      return [{ numero: segundo, zonas: zonas(["oclusal"], "restaurado") }, { numero: tercero, zonas: zonas(["distal"], "caries") }];
    default:
      return [{ numero: tercero, zonas: zonas(["oclusal", "distal"], "caries") }, { numero: principal, zonas: zonas(["oclusal"], "restaurado") }];
  }
}

function sembrarClinica(d: Datos, a: AyudasSemilla) {
  const definiciones: Array<[string, string, string, string[]]> = [
    ["tipo_tratamiento", "Tratamiento", "opcion", ["Valoración inicial", "Limpieza", "Ortodoncia", "Implantes", "Extracciones", "Endodoncia"]],
    ["motivo_consulta", "Motivo de consulta", "texto", []],
    ["alergias", "Alergias", "texto", []],
    ["ultima_limpieza", "Última limpieza", "fecha", []],
    ["primera_visita", "Primera visita", "si_no", []],
  ];
  definiciones.forEach(([clave, etiqueta, tipo, opciones], orden) =>
    d.camposPersonalizados.push({ id: a.id(), entidad: "contacto", clave, etiqueta, tipo, opciones, activo: true, orden }),
  );
  const motivos: Record<string, string> = {
    "Valoración inicial": "Primera revisión y plan de tratamiento",
    Limpieza: "Profilaxis y control de sarro",
    Ortodoncia: "Control de brackets / alineadores",
    Implantes: "Reposición de pieza perdida",
    Extracciones: "Pieza con movilidad o sin posibilidad de restauración",
    Endodoncia: "Dolor y sensibilidad en pieza tratada",
  };
  const admin = d.usuarios[0];
  const pacientesBase: Array<[string, string, string, string, boolean]> = [
    ["Ana García", "5551000001", "Valoración inicial", "Penicilina", true],
    ["Carlos Mendoza", "5551000002", "Limpieza", "Ninguna", false],
    ["Sofía Ramírez", "5551000003", "Ortodoncia", "Látex", true],
    ["Luis Hernández", "5551000004", "Extracciones", "Ibuprofeno", false],
    ["Mariana López", "5551000005", "Implantes", "Ninguna", true],
    ["Diego Castro", "5551000006", "Ortodoncia", "Ninguna", false],
    ["Valeria Ruiz", "5551000007", "Valoración inicial", "Sulfas", true],
    ["Jorge Navarro", "5551000008", "Limpieza", "Ninguna", false],
  ];
  const porNombre = new Map<string, ContactoD>();
  const registrar = (nombre: string, telefono: string, tratamiento: string, alergias: string, primera: boolean) => {
    const campos = { tipo_tratamiento: tratamiento, motivo_consulta: motivos[tratamiento], alergias, ultima_limpieza: fechaMexico(-120, 12).slice(0, 10), primera_visita: primera };
    const existente = d.contactos.find((c) => c.telefono === telefono);
    if (existente) Object.assign(existente, { campos, esCliente: true });
    const contacto = existente ?? nuevoContacto(a, nombre, telefono, admin.id, { campos, esCliente: true });
    if (!existente) d.contactos.push(contacto);
    porNombre.set(nombre, contacto);
  };
  pacientesBase.forEach((p) => registrar(...p));
  [...AGENDA_RICARDO, ...AGENDA_PALOMA].forEach(([, , , nombre, tratamiento]) => {
    if (porNombre.has(nombre)) return;
    registrar(nombre, `55590${String(porNombre.size).padStart(5, "0")}`, tratamiento, "Ninguna reportada", tratamiento === "Valoración inicial");
  });
  const contactos = [...porNombre.values()];
  d.extra.expedientes = contactos.map((c, i) => ({
    contactoId: c.id, fechaNacimiento: `${1965 + ((i * 7) % 40)}-0${(i % 9) + 1}-1${i % 9}`, sexo: i % 2 === 0 ? "Femenino" : "Masculino",
    alergias: String(c.campos.alergias), antecedentes: i % 3 === 0 ? "Hipertensión controlada" : "Sin antecedentes relevantes",
    medicamentos: "Ninguno reportado", observaciones: "Expediente de demostración.", evoluciones: [] as any[],
  }));
  d.extra.odontogramas = contactos.map((c, i) => ({ contactoId: c.id, dientes: dientesPara(String(c.campos.tipo_tratamiento), i) }));
  d.extra.doctores = [
    { id: a.id(), nombre: "Dr. Ricardo Azcorra", especialidad: "Odontología general y endodoncia", cedula: "PROF-102938", color: "#0EA5E9", activo: true },
    { id: a.id(), nombre: "Dra. Paloma", especialidad: "Ortodoncia", cedula: "PROF-564738", color: "#8B5CF6", activo: true },
  ];
  const [ricardo, paloma] = d.extra.doctores;
  const citaDe = (fila: CitaSerenica, doctorId: string) => {
    const [dia, hora, minutos, nombre, tratamiento, estado] = fila;
    const [h, m] = hora.split(":").map(Number);
    const inicio = new Date(new Date(fechaEstaSemana(dia, h)).getTime() + m * 60_000).toISOString();
    return {
      id: a.id(), contactoId: porNombre.get(nombre)!.id, responsableId: admin.id, doctorId, titulo: `${tratamiento} · ${nombre}`, notas: null,
      inicio, fin: new Date(new Date(inicio).getTime() + minutos * 60_000).toISOString(), estado,
    };
  };
  d.extra.citas = [...AGENDA_RICARDO.map((f) => citaDe(f, ricardo.id)), ...AGENDA_PALOMA.map((f) => citaDe(f, paloma.id))];
  d.extra.citas.slice(0, 2).forEach((c, i) => void (c.tokenGestion = `demo-cita-${i + 1}`));
  d.extra.serviciosReserva = [
    { id: a.id(), nombre: "Valoración inicial", descripcion: "Revisión y plan de tratamiento personalizado.", duracionMin: 60, bufferMin: 0, precio: 700, activo: true, doctorIds: [ricardo.id] },
    { id: a.id(), nombre: "Limpieza dental", descripcion: "El costo se define en la valoración.", duracionMin: 60, bufferMin: 0, precio: 0, activo: true, doctorIds: [ricardo.id, paloma.id] },
    { id: a.id(), nombre: "Ortodoncia", descripcion: "Brackets y alineadores.", duracionMin: 60, bufferMin: 0, precio: 0, activo: true, doctorIds: [paloma.id] },
    { id: a.id(), nombre: "Implantes", descripcion: "El costo se define en la valoración.", duracionMin: 60, bufferMin: 0, precio: 0, activo: true, doctorIds: [ricardo.id] },
    { id: a.id(), nombre: "Extracciones", descripcion: "El costo se define en la valoración.", duracionMin: 60, bufferMin: 0, precio: 0, activo: true, doctorIds: [ricardo.id] },
  ];
  d.extra.horariosDoctor = [
    ...[1, 2, 3, 4, 5].flatMap((dia) => [
      { id: a.id(), doctorId: ricardo.id, diaSemana: dia, inicioMin: 10 * 60, finMin: 18 * 60 },
      { id: a.id(), doctorId: paloma.id, diaSemana: dia, inicioMin: 11 * 60, finMin: 18 * 60 },
    ]),
    { id: a.id(), doctorId: ricardo.id, diaSemana: 6, inicioMin: 10 * 60, finMin: 13 * 60 },
    { id: a.id(), doctorId: paloma.id, diaSemana: 6, inicioMin: 11 * 60, finMin: 13 * 60 },
  ];
  const bloqueo = (doctorId: string, dia: number, inicioMin: number | null, finMin: number | null, motivo: string) =>
    ({ id: a.id(), doctorId, fecha: fechaEstaSemana(dia, 12), inicioMin, finMin, motivo });
  d.extra.excepcionesHorario = [
    bloqueo(ricardo.id, 2, 9 * 60, 15 * 60, "Curso"),
    bloqueo(ricardo.id, 5, 10 * 60, 14 * 60, "Bloqueado / no citar"),
    bloqueo(ricardo.id, 12, 10 * 60, 14 * 60, "Bloqueado / no citar"),
    bloqueo(paloma.id, 2, 9 * 60, 15 * 60, "Curso de experiencia del cliente"),
    ...[9, 10, 11].map((dia) => bloqueo(paloma.id, dia, null, null, "Clearcorrect experience")),
  ];
  d.modulos.reservas_en_linea.config = { anticipacionMin: 120, ventanaDias: 30, granularidadMin: 30, maxPorTelefono: 3 };
  const notas = [
    "Endodoncia: conductos instrumentados y obturados. Se indica restauración definitiva.",
    "Profilaxis completa. Se refuerza técnica de cepillado e hilo dental.",
    "Control de ortodoncia: arcos cambiados, sin molestias reportadas.",
    "Valoración inicial: se entrega plan de tratamiento por etapas.",
  ];
  d.extra.expedientes.slice(0, 8).forEach((e, i) => {
    e.evoluciones.push({ id: a.id(), contenido: notas[i % notas.length], createdAt: fechaMexico(-3 - i, 11), doctorId: d.extra.doctores[i % 2].id, citaId: null, registradoPorId: d.usuarios[0].id });
  });
}

/** Citas genéricas para los giros que activan «Citas» sin pacientes (legal, automotriz, inmobiliaria). */
function sembrarCitasGenericas(d: Datos, a: AyudasSemilla, titulo: string) {
  d.extra.doctores = [];
  d.extra.citas = d.contactos.slice(0, 5).map((c, i) => {
    const inicio = fechaEstaSemana([indiceDiaHoy(), 1, 2, 3, 4][i], [10, 11, 15, 12, 16][i]);
    return {
      id: a.id(), contactoId: c.id, responsableId: a.atiende(i).id, doctorId: null, titulo: `${titulo} · ${c.nombre}`, notas: null,
      inicio, fin: new Date(new Date(inicio).getTime() + 60 * 60_000).toISOString(), estado: i === 0 ? "confirmada" : "programada",
    };
  });
}

type Fila = [string, string, string, number, number, number, number];
const CATALOGO: Fila[] = [
  ["CAM-001", "Camisa lino arena", "Ropa", 899, 410, 18, 5],
  ["BOL-002", "Bolsa piel terracota", "Accesorios", 1890, 920, 7, 3],
  ["VEL-003", "Vela ámbar y cedro", "Hogar", 420, 165, 24, 6],
  ["TAZ-004", "Taza cerámica artesanal", "Hogar", 360, 145, 15, 4],
  ["LIB-005", "Libreta piel reciclada", "Papelería", 295, 105, 3, 5],
  ["PAN-006", "Pantalón sastre negro", "Ropa", 1190, 540, 11, 4],
  ["ARE-007", "Aretes baño de oro", "Accesorios", 540, 190, 20, 5],
  ["DIF-008", "Difusor cítricos 200 ml", "Hogar", 590, 230, 9, 3],
  ["PAÑ-009", "Pañuelo seda botánico", "Accesorios", 680, 285, 13, 4],
  ["TEN-010", "Tenis urbanos blancos", "Calzado", 1490, 710, 6, 3],
];

type VentaDemo = [string, number, string, string, string, Array<[string, number]>, { dia?: number; reserva?: boolean; tipoEntrega?: string; costoEnvio?: number; token?: string }?];
const VENTAS: VentaDemo[] = [
  ["DEMO-001", 0, "entregada", "mostrador", "tarjeta", [["CAM-001", 1], ["ARE-007", 1]]],
  ["DEMO-002", 1, "entregada", "whatsapp", "transferencia", [["VEL-003", 2]]],
  ["DEMO-003", 2, "preparando", "tienda_en_linea", "tarjeta", [["BOL-002", 1]]],
  ["DEMO-004", 3, "pagada", "mostrador", "efectivo", [["TAZ-004", 2], ["DIF-008", 1]]],
  ["DEMO-005", 4, "pendiente", "whatsapp", "enlace", [["PAN-006", 1], ["PAÑ-009", 1]]],
  ["DEMO-006", 5, "cancelada", "telefono", "otro", [["TEN-010", 1]]],
  ["DEMO-007", 5, "entregada", "mostrador", "efectivo", [["LIB-005", 1], ["VEL-003", 1]], { dia: -1 }],
  ["DEMO-008", 0, "pagada", "mostrador", "tarjeta", [["ARE-007", 2]], {}],
  ["DEMO-009", 3, "pendiente", "tienda_en_linea", "enlace", [["DIF-008", 1], ["TAZ-004", 1]], { reserva: true, tipoEntrega: "envio", costoEnvio: 65 }],
  ["DEMO-010", 1, "entregada", "tienda_en_linea", "transferencia", [["CAM-001", 1]], { dia: -2, tipoEntrega: "envio", costoEnvio: 65 }],
  ["DEMO-011", 2, "lista", "tienda_en_linea", "tarjeta", [["PAÑ-009", 1]], { tipoEntrega: "recoger" }],
  ["DEMO-012", 4, "cancelada", "tienda_en_linea", "otro", [["LIB-005", 1]], { dia: -3, tipoEntrega: "recoger" }],
];

type CotDemo = [string, number, string, number, Array<[string, number]>, string];
const COTIZACIONES: CotDemo[] = [
  ["DEMO-COT-001", 0, "enviada", 10, [["CAM-001", 1]], "c07a2ac10de0486a92a29dd10c0ffee1"],
  ["DEMO-COT-002", 2, "aceptada", 12, [["VEL-003", 12]], "c07a2ac10de0486a92a29dd10c0ffee2"],
  ["DEMO-COT-003", 3, "borrador", 15, [["BOL-002", 1], ["ARE-007", 1]], "c07a2ac10de0486a92a29dd10c0ffee3"],
  ["DEMO-COT-004", 1, "rechazada", 5, [["TAZ-004", 4]], "c07a2ac10de0486a92a29dd10c0ffee4"],
  ["DEMO-COT-005", 5, "vencida", -3, [["PAN-006", 1]], "c07a2ac10de0486a92a29dd10c0ffee5"],
];

function sembrarRetail(d: Datos, a: AyudasSemilla) {
  const admin = d.usuarios[0];
  const equipo = d.usuarios.slice(1); // como el seed real: el equipo no incluye a la gerencia
  d.contactos.forEach((c, i) => {
    c.email = `cliente${i + 1}@casa-ambar.demo`;
    c.fuente = i % 2 === 0 ? "whatsapp" : "manual";
    c.esCliente = true;
  });
  const productos = CATALOGO.map(([sku, nombre, categoria, precio, costo, stock, stockMinimo], i) => ({
    id: a.id(), grupoId: null, atributos: {}, sku, codigoBarras: `75010000000${String(i).padStart(2, "0")}`, nombre, categoria, descripcion: null,
    precio, costo, stock, stockMinimo, unidad: "pieza", vendePorPeso: false, moneda: "MXN", fotoUrl: null, visibleEnLinea: true, agotadoManual: false,
    etiquetasEnLinea: i < 2 ? ["temporada"] : [], activo: true,
    movimientos: [] as any[],
  }));
  const porSku = new Map(productos.map((p) => [p.sku, p]));
  const inventarioInicial = new Map(productos.map((p) => [p.id, p.stock]));
  for (const p of productos) {
    p.movimientos.push({ id: a.id(), tipo: "entrada", cantidad: p.stock, existenciaAntes: 0, existenciaDespues: p.stock, motivo: "Inventario inicial de demostración", createdAt: fechaMexico(-30, 9), usuario: { nombre: admin.nombre } });
  }
  d.extra.productos = productos;

  d.extra.cajas = [{ id: a.id(), nombre: "Caja principal", sucursal: "Matriz", activa: true }];
  const caja = d.extra.cajas[0];
  const cajero = equipo.find((u) => u.puesto === "Cajero") ?? equipo[1];
  const turno = (cerrado: boolean, dia: number, hora: number, fin?: number) => ({
    id: a.id(), estado: cerrado ? "cerrado" : "abierto", fondoInicial: 500, abiertoAt: fechaMexico(dia, hora), cerradoAt: cerrado ? fechaMexico(dia, fin!) : null,
    efectivoContado: null as number | null, efectivoEsperado: null as number | null, diferencia: null as number | null,
    cajaId: caja.id, usuarioId: cajero.id, movimientos: [] as any[],
  });
  const turnoAyer = turno(true, -1, 9, 20);
  const turnoHoy = turno(false, 0, 9);
  d.extra.turnos = [turnoHoy, turnoAyer];

  d.extra.ventas = VENTAS.map(([folio, ci, estado, canal, metodoPago, partidas, extra = {}], i) => {
    const subtotal = partidas.reduce((s, [sku, n]) => s + porSku.get(sku)!.precio * n, 0);
    const costoEnvio = extra.costoEnvio ?? 0;
    const creadaAt = fechaMexico(extra.dia ?? (i < 4 ? 0 : -i + 3), 10 + (i % 9));
    const t = canal === "mostrador" ? (extra.dia === -1 ? turnoAyer : turnoHoy) : null;
    const aplicaStock = estado !== "borrador" && estado !== "cancelada" && !extra.reserva;
    const venta = {
      id: a.id(), folio, contactoId: d.contactos[ci].id, creadoPorId: equipo[i % equipo.length].id, estado, canal, metodoPago, subtotal, costoEnvio, total: subtotal + costoEnvio,
      turnoId: t?.id ?? null, cajaId: t ? caja.id : null, createdAt: creadaAt, tipoEntrega: extra.tipoEntrega ?? (canal === "tienda_en_linea" ? "recoger" : null),
      partidas: partidas.map(([sku, n]) => ({ id: a.id(), productoId: porSku.get(sku)!.id, cantidad: n, precioUnitario: porSku.get(sku)!.precio, total: porSku.get(sku)!.precio * n })),
      pagos: t && estado !== "cancelada" ? [{ metodo: metodoPago, monto: subtotal }] : [],
    };
    if (aplicaStock) for (const [sku, n] of partidas) porSku.get(sku)!.stock -= n;
    const tokens: Record<string, string> = { "DEMO-003": "de003000000000000000000000000003", "DEMO-009": "de009000000000000000000000000009", "DEMO-010": "de010000000000000000000000000010", "DEMO-011": "de011000000000000000000000000011", "DEMO-012": "de012000000000000000000000000012" };
    return { ...venta, tokenSeguimiento: tokens[folio] ?? null };
  });
  for (const p of productos) {
    const ventido = (inventarioInicial.get(p.id) ?? 0) - p.stock;
    if (ventido > 0) {
      p.movimientos.unshift({ id: a.id(), tipo: "venta", cantidad: -ventido, existenciaAntes: p.stock + ventido, existenciaDespues: p.stock, motivo: "Venta DEMO", createdAt: fechaMexico(0, 12), usuario: { nombre: equipo[1].nombre } });
    }
  }
  const efectivoAyer = d.extra.ventas.filter((v) => v.turnoId === turnoAyer.id && v.metodoPago === "efectivo" && v.estado !== "cancelada").reduce((s, v) => s + v.subtotal, 0);
  turnoAyer.efectivoEsperado = 500 + efectivoAyer;
  turnoAyer.efectivoContado = 500 + efectivoAyer;
  turnoAyer.diferencia = 0;

  d.extra.cotizaciones = COTIZACIONES.map(([folio, ci, estado, vigenciaDias, partidas, tokenPublico]) => {
    const lineas = partidas.map(([sku, n]) => ({ id: a.id(), productoId: porSku.get(sku)!.id, concepto: porSku.get(sku)!.nombre, cantidad: n, precio: porSku.get(sku)!.precio, descuento: 0, total: porSku.get(sku)!.precio * n }));
    const subtotal = lineas.reduce((s, l) => s + l.total, 0);
    const impuestos = Math.round(subtotal * 0.16 * 100) / 100;
    return {
      id: a.id(), folio, contactoId: d.contactos[ci].id, creadoPorId: admin.id, estado, vigencia: fechaMexico(vigenciaDias, 12), subtotal, impuestos, total: subtotal + impuestos,
      tokenPublico, ventaId: null, oportunidadId: null, createdAt: fechaMexico(-vigenciaDias > 0 ? -vigenciaDias : -2, 12), partidas: lineas,
    };
  });

  // Expedientes (ficha de clientes) y compras/proveedores/precios, como en el seed real.
  d.extra.expedientes = d.contactos.map((c, i) => ({
    contactoId: c.id, fechaNacimiento: null, sexo: null, alergias: null, antecedentes: i % 2 === 0 ? "Prefiere novedades por WhatsApp" : "Compra en tienda",
    medicamentos: null, observaciones: i === 0 ? "Cliente frecuente" : null, evoluciones: [] as any[],
  }));
  d.extra.proveedores = [
    ["Textiles del Norte", "Isabel Peña", "8110002201", "ventas@textiles-norte.demo"],
    ["Taller Cerámico Sur", "René Casas", "8110002202", "pedidos@ceramica-sur.demo"],
    ["Accesorios Central", "Pilar Díaz", "8110002203", "hola@accesorios-central.demo"],
  ].map(([nombre, contactoNombre, telefono, email]) => ({ id: a.id(), nombre, contactoNombre, telefono, email, rfc: null, notas: null, activo: true }));
  const encargado = equipo[2] ?? equipo[0];
  d.extra.compras = ([
    ["DEMO-C-001", 0, "recibida", [["CAM-001", 10, 400], ["TAZ-004", 8, 140]]],
    ["DEMO-C-002", 2, "ordenada", [["BOL-002", 6, 900], ["TEN-010", 4, 690]]],
  ] as Array<[string, number, string, Array<[string, number, number]>]>).map(([folio, pi, estado, partidas], i) => {
    const lineas = partidas.map(([sku, cantidad, costoUnitario]) => ({ id: a.id(), productoId: porSku.get(sku)!.id, cantidad, costoUnitario, total: cantidad * costoUnitario }));
    if (estado === "recibida") {
      for (const l of lineas) {
        const p = productos.find((x) => x.id === l.productoId)!;
        const antes = p.stock;
        p.stock += l.cantidad;
        p.costo = l.costoUnitario;
        p.movimientos.push({ id: a.id(), tipo: "compra", cantidad: l.cantidad, existenciaAntes: antes, existenciaDespues: p.stock, motivo: `Compra ${folio}`, createdAt: fechaMexico(-i, 9 + i), usuario: { nombre: encargado.nombre } });
      }
    }
    return { id: a.id(), folio, proveedorId: d.extra.proveedores[pi].id, creadoPorId: encargado.id, estado, total: lineas.reduce((t, l) => t + l.total, 0), notas: null, createdAt: fechaMexico(-i, 9 + i), partidas: lineas };
  });
  d.extra.listasPrecio = [{ id: a.id(), nombre: "Mayoreo", tipo: "mayoreo" }];
  d.extra.escalas = [{ id: a.id(), productoId: porSku.get("VEL-003")!.id, desde: 6, precio: 380 }];
  d.extra.promociones = [{ id: a.id(), nombre: "Temporada: 10 % en hogar", tipo: "porcentaje", productoId: null, categoria: "Hogar", valor: 10, inicia: fechaMexico(-3, 0), termina: fechaMexico(20, 0) }];

  // Crédito de cliente (DEMO-005 es a crédito) y un apartado activo, como ejemplo de la Caja completa.
  const ventaCredito = d.extra.ventas.find((v) => v.folio === "DEMO-005")!;
  ventaCredito.esCredito = true;
  d.extra.cuentasCredito = [{
    contactoId: d.contactos[4].id, limiteCredito: 3000, saldo: ventaCredito.total, creadaAt: ventaCredito.createdAt,
    movimientos: [{ id: a.id(), tipo: "cargo", monto: ventaCredito.total, createdAt: ventaCredito.createdAt, referencia: ventaCredito.folio }],
  }];
  const camisa = porSku.get("CAM-001")!;
  const ventaApartado = {
    id: a.id(), folio: "APA-0001", contactoId: d.contactos[0].id, creadoPorId: equipo[0].id, estado: "apartado", canal: "mostrador", metodoPago: "efectivo", subtotal: camisa.precio, descuento: 0, costoEnvio: 0,
    total: camisa.precio, turnoId: turnoHoy.id, cajaId: caja.id, createdAt: fechaMexico(0, 10), tipoEntrega: null, notas: null,
    partidas: [{ id: a.id(), productoId: camisa.id, cantidad: 1, precioUnitario: camisa.precio, total: camisa.precio, devoluciones: [] as any[] }], pagos: [{ metodo: "efectivo", monto: 300 }],
  };
  camisa.stock -= 1; // la existencia queda separada
  d.extra.ventas.unshift(ventaApartado);
  d.extra.apartados = [{ id: a.id(), estado: "activo", saldo: camisa.precio - 300, venceAt: fechaMexico(5, 20), contactoId: d.contactos[0].id, ventaId: ventaApartado.id }];

  d.modulos.caja.config = { puestosPermitidos: ["Cajero", "Encargado de tienda"], descuentoMaximoCajero: 10, apartadoDiasVigencia: 7 };
  d.modulos.pedidos_en_linea.config = { permiteEntrega: true, permiteRecoger: true, minimoCompra: "300.00", costoEnvio: "65.00", maxPorTelefono: 3, maxPorIp: 10, horasVencimiento: 48 };
  d.modulos.cotizaciones.config = { ivaPorcentaje: "16", preciosConIva: false };
}

export function sembrarExtra(datos: Datos, giro: GiroId, ayudas: AyudasSemilla) {
  if (giro === "clinica") sembrarClinica(datos, ayudas);
  else if (giro === "retail") sembrarRetail(datos, ayudas);
  else if (datos.modulos.citas?.activo) sembrarCitasGenericas(datos, ayudas, giro === "legal" ? "Asesoría" : giro === "automotriz" ? "Prueba de manejo" : "Visita");
  const a = { id: ayudas.id };
  if (giro === "legal") sembrarLegal(datos, a);
  if (giro === "viajes") sembrarViajes(datos, a);
  if (giro === "educacion") sembrarAcademia(datos, a);
  if (giro === "automotriz") sembrarAutomotriz(datos, a);
  if (giro === "inmobiliaria") sembrarInmobiliaria(datos, a);
}
