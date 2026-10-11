// Datos de los módulos por giro (citas, productos, caja, cotizaciones, pedidos…). Misma historia que los
// seeds demo reales (web/scripts/seed-demo-clinica.mjs y seed-demo-retail.mjs).
import { fechaEstaSemana, fechaMexico, indiceDiaHoy } from "./fechas";
import type { ContactoD, Datos, GiroId, UsuarioD } from "./tipos";

export type AyudasSemilla = { id: () => string; atiende: (i?: number) => UsuarioD };

const nuevoContacto = (a: AyudasSemilla, nombre: string, telefono: string, responsableId: string | null, extra: Partial<ContactoD> = {}): ContactoD => ({
  id: a.id(), nombre, telefono, email: null, empresa: null, notas: null, fuente: "manual", responsableId, optOutDifusion: false, esPersonal: false,
  esCliente: false, etiquetaIds: [], campos: {}, createdAt: fechaMexico(-20, 10), ...extra,
});

function sembrarClinica(d: Datos, a: AyudasSemilla) {
  const definiciones: Array<[string, string, string, string[]]> = [
    ["tipo_tratamiento", "Tipo de tratamiento", "opcion", ["Consulta", "Limpieza", "Ortodoncia"]],
    ["alergias", "Alergias", "texto", []],
    ["primera_visita", "Primera visita", "si_no", []],
  ];
  definiciones.forEach(([clave, etiqueta, tipo, opciones], orden) =>
    d.camposPersonalizados.push({ id: a.id(), entidad: "contacto", clave, etiqueta, tipo, opciones, activo: true, orden }),
  );
  const pacientes: Array<[string, string, string, string, boolean]> = [
    ["Ana García", "5551000001", "Consulta", "Penicilina", true],
    ["Carlos Mendoza", "5551000002", "Limpieza", "Ninguna", false],
    ["Sofía Ramírez", "5551000003", "Ortodoncia", "Látex", true],
    ["Luis Hernández", "5551000004", "Consulta", "Ibuprofeno", false],
    ["Mariana López", "5551000005", "Limpieza", "Ninguna", true],
    ["Diego Castro", "5551000006", "Ortodoncia", "Ninguna", false],
    ["Valeria Ruiz", "5551000007", "Consulta", "Sulfas", true],
    ["Jorge Navarro", "5551000008", "Limpieza", "Ninguna", false],
  ];
  const admin = d.usuarios[0];
  const contactos = pacientes.map(([nombre, telefono, tratamiento, alergias, primera]) => {
    const campos = { tipo_tratamiento: tratamiento, alergias, primera_visita: primera };
    const existente = d.contactos.find((c) => c.telefono === telefono);
    if (existente) {
      Object.assign(existente, { campos, esCliente: true });
      return existente;
    }
    const nuevo = nuevoContacto(a, nombre, telefono, admin.id, { campos, esCliente: true });
    d.contactos.push(nuevo);
    return nuevo;
  });
  d.extra.expedientes = contactos.map((c, i) => ({
    contactoId: c.id, fechaNacimiento: `${1988 + i}-05-12`, sexo: i % 2 === 0 ? "Femenino" : "Masculino", alergias: pacientes[i][3],
    antecedentes: i % 3 === 0 ? "Sin enfermedades crónicas conocidas" : "Sin antecedentes relevantes", medicamentos: "Ninguno reportado",
    observaciones: "Expediente inicial de demostración.", evoluciones: [] as any[],
  }));
  d.extra.doctores = [
    { id: a.id(), nombre: "Dra. Elena Torres", especialidad: "Odontología general", cedula: "PROF-102938", color: "#0EA5E9", activo: true },
    { id: a.id(), nombre: "Dr. Mateo Salas", especialidad: "Ortodoncia", cedula: "PROF-564738", color: "#8B5CF6", activo: true },
  ];
  const dias = [indiceDiaHoy(), indiceDiaHoy(), 0, 1, 2, 3, 4, 5];
  const horas = [9, 11, 10, 14, 16, 12, 15, 17];
  d.extra.citas = contactos.map((c, i) => {
    const inicio = fechaEstaSemana(dias[i], horas[i]);
    return {
      id: a.id(), contactoId: c.id, responsableId: admin.id, doctorId: d.extra.doctores[i % 2].id,
      titulo: `${pacientes[i][2]} de ${pacientes[i][0]}`, notas: null, inicio, fin: new Date(new Date(inicio).getTime() + 45 * 60_000).toISOString(),
      estado: "programada",
    };
  });
  d.extra.expedientes.slice(0, 3).forEach((e, i) => {
    e.evoluciones.push({ id: a.id(), contenido: "Valoración inicial: paciente estable y apto para continuar el tratamiento.", createdAt: fechaMexico(-3 - i, 11), doctorId: d.extra.doctores[i % 2].id, citaId: null, registradoPorId: d.usuarios[0].id });
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
    return venta;
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

  d.modulos.caja.config = { puestosPermitidos: ["Cajero", "Encargado de tienda"], descuentoMaximoCajero: 10, apartadoDiasVigencia: 7 };
  d.modulos.pedidos_en_linea.config = { permiteEntrega: true, permiteRecoger: true, minimoCompra: "300.00", costoEnvio: "65.00", maxPorTelefono: 3, maxPorIp: 10, horasVencimiento: 48 };
  d.modulos.cotizaciones.config = { ivaPorcentaje: "16", preciosConIva: false };
}

export function sembrarExtra(datos: Datos, giro: GiroId, ayudas: AyudasSemilla) {
  if (giro === "clinica") sembrarClinica(datos, ayudas);
  else if (giro === "retail") sembrarRetail(datos, ayudas);
  else if (datos.modulos.citas?.activo) sembrarCitasGenericas(datos, ayudas, giro === "legal" ? "Asesoría" : giro === "automotriz" ? "Prueba de manejo" : "Visita");
}
