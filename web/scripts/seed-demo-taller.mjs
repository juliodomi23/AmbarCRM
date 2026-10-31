// Uso opcional: ALLOW_DEMO_SEED=1 node scripts/seed-demo-taller.mjs correo contraseña
import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { credencialesDemo, imprimirCredencialesDemo } from "./lib/demo-seed.mjs";
import { fechaMexico, sembrarActividadDemo } from "./lib/demo-actividad.mjs";
import { PERFIL_TALLER } from "./lib/demo-perfiles.mjs";

const { email, password, passwordGenerada } = credencialesDemo("taller@local.test");
const prisma = new PrismaClient();
const hace = (dias, hora = 10) => fechaMexico(-dias, hora);

const org = await prisma.org.upsert({
  where: { slug: "demo-taller" },
  update: { nombre: "Taller Rivera", activo: true },
  create: { nombre: "Taller Rivera", slug: "demo-taller" },
});

const REFACCIONES = [
  ["ACE-5W30", "Aceite sintético 5W-30 (litro)", 36, 95, 165, 12],
  ["FIL-ACE", "Filtro de aceite", 18, 70, 130, 8],
  ["FIL-AIR", "Filtro de aire", 3, 110, 210, 5],
  ["BAL-DEL", "Balatas delanteras (juego)", 7, 540, 890, 4],
  ["BAT-12V", "Batería 12V 45Ah", 2, 1450, 2150, 3],
  ["BUJ-IR", "Bujía de iridio", 24, 135, 240, 8],
];

// [placa, contacto (índice del perfil), marca, modelo, año, color, km, notas]
const VEHICULOS = [
  ["ABC-123-A", 0, "Nissan", "Versa", 2018, "Blanco", 87400, "Servicio cada 5,000 km"],
  ["XYZ-482-B", 1, "Toyota", "Hilux", 2020, "Gris", 61250, null],
  ["JTT-905-C", 2, "Volkswagen", "Jetta", 2016, "Negro", 132800, "Cliente prefiere refacciones originales"],
  ["AVE-217-D", 3, "Chevrolet", "Aveo", 2014, "Rojo", 158000, null],
  ["CRV-640-E", 4, "Honda", "CR-V", 2019, "Azul", 74100, "Unidad de flotilla"],
  ["RNG-338-F", 5, "Ford", "Ranger", 2017, "Plata", 119500, null],
  ["KIA-771-G", 0, "Kia", "Rio", 2021, "Blanco", 32600, "Segundo vehículo de Roberto"],
];

const hex48 = () => randomBytes(24).toString("hex");
let urlAprobacion = "";

await prisma.$transaction(async (tx) => {
  await tx.$executeRawUnsafe("SELECT set_config('app.current_org', $1, true)", String(org.id));
  const passwordHash = await bcrypt.hash(password, 10);

  const admin = await tx.usuario.upsert({
    where: { orgId_email: { orgId: org.id, email } },
    update: { nombre: "Gerencia Taller Rivera", passwordHash, rol: "admin", puesto: "Administrador", activo: true },
    create: { nombre: "Gerencia Taller Rivera", email, passwordHash, rol: "admin", puesto: "Administrador" },
  });
  const equipo = [];
  for (const [nombre, correo, puesto] of [
    ["Pedro Ruiz", "pedro@taller-rivera.demo", "Mecánico"],
    ["Luis Cano", "luis@taller-rivera.demo", "Mecánico"],
    ["Marisol Vega", "marisol@taller-rivera.demo", "Recepcionista"],
  ]) {
    equipo.push(await tx.usuario.upsert({
      where: { orgId_email: { orgId: org.id, email: correo } },
      update: { nombre, puesto, activo: true },
      create: { nombre, email: correo, passwordHash, rol: "agente", puesto },
    }));
  }
  const [pedro, luis, marisol] = equipo;

  await tx.ajustes.upsert({
    where: { orgId: org.id },
    update: { marcaNombre: "Taller Rivera" },
    create: { marcaNombre: "Taller Rivera" },
  });
  for (const clave of ["taller", "citas"]) {
    await tx.moduloOrg.upsert({
      where: { orgId_clave: { orgId: org.id, clave } },
      update: { activo: true },
      create: { clave, activo: true, config: {} },
    });
  }

  await sembrarActividadDemo(tx, org, PERFIL_TALLER);
  const contactos = [];
  for (const dato of PERFIL_TALLER.contactos) {
    contactos.push(await tx.contacto.findFirstOrThrow({ where: { telefono: dato.telefono } }));
  }

  // Reinicio de los datos del taller: cada corrida deja la demo igual y con fechas respecto a hoy.
  await tx.tallerPago.deleteMany({});
  await tx.tallerRecordatorio.deleteMany({});
  await tx.tallerOrden.deleteMany({});
  await tx.tallerVehiculo.deleteMany({});
  await tx.tallerRefaccion.deleteMany({});

  const refs = {};
  for (const [codigo, nombre, existencia, costo, precio, minimo] of REFACCIONES) {
    refs[codigo] = await tx.tallerRefaccion.create({ data: { codigo, nombre, existencia, costo, precio, minimo } });
  }
  const vehiculos = [];
  for (const [placa, c, marca, modelo, anio, color, kilometraje, notas] of VEHICULOS) {
    vehiculos.push(await tx.tallerVehiculo.create({
      data: { contactoId: contactos[c].id, placa, marca, modelo, anio, color, kilometraje, notas },
    }));
  }

  const mo = (descripcion, precioUnitario, cantidad = 1) => ({ tipo: "mano_obra", descripcion, cantidad, precioUnitario });
  const pieza = (codigo, cantidad) => ({
    tipo: "refaccion", descripcion: refs[codigo].nombre, cantidad, precioUnitario: Number(refs[codigo].precio), refaccionId: refs[codigo].id,
  });

  // [vehículo, estado, falla, diagnóstico, mecánico, díasAtrás, promesaEnDías, conceptos, pagos [monto, método, díasAtrás], historial [estado, díasAtrás]]
  const ORDENES = [
    [5, "entregado", "Servicio de 120,000 km", "Cambio de aceite, filtros y revisión general de suspensión.", pedro, 12, -9,
      [pieza("ACE-5W30", 5), pieza("FIL-ACE", 1), pieza("FIL-AIR", 1), mo("Servicio de 120,000 km", 650)],
      [[1815, "tarjeta", 9]], [["recibido", 12], ["diagnostico", 12], ["en_reparacion", 11], ["listo", 10], ["entregado", 9]]],
    [0, "listo", "Servicio mayor y ruido en la rueda trasera", "Se cambió aceite, bujías y se rectificó balero trasero.", luis, 4, 0,
      [pieza("ACE-5W30", 4), pieza("FIL-ACE", 1), pieza("BUJ-IR", 4), mo("Afinación mayor", 780), mo("Cambio de balero trasero", 500)],
      [[1500, "efectivo", 4]], [["recibido", 4], ["diagnostico", 4], ["en_reparacion", 3], ["listo", 1]]],
    [2, "en_reparacion", "Pierde potencia y vibra en carretera", "Bujías y filtro de aire saturados; se cambia kit de afinación.", pedro, 2, 1,
      [pieza("BUJ-IR", 4), pieza("FIL-AIR", 1), mo("Afinación", 700)],
      [[1000, "transferencia", 1]], [["recibido", 2], ["diagnostico", 2], ["en_reparacion", 1]], true],
    [1, "esperando_aprobacion", "Ruido metálico al frenar", "Balatas desgastadas al límite; discos aún en rango.", luis, 1, 2,
      [pieza("BAL-DEL", 1), mo("Cambio de balatas y ajuste de frenos", 600)], [], [["recibido", 1], ["diagnostico", 1], ["esperando_aprobacion", 0]]],
    [4, "diagnostico", "Testigo de motor encendido", "Pendiente lectura de códigos con escáner.", pedro, 1, 3,
      [mo("Diagnóstico con escáner", 450)], [], [["recibido", 1], ["diagnostico", 0]]],
    [3, "recibido", "Se apaga en los semáforos", "", null, 0, 2, [], [], [["recibido", 0]]],
    [6, "cancelado", "Revisión de ruido en el tablero", "El cliente decidió no continuar.", marisol, 8, null,
      [mo("Revisión", 300)], [], [["recibido", 8], ["cancelado", 7]]],
  ];

  let folio = 0;
  for (const [v, estado, falla, diagnostico, mecanico, dias, promesa, conceptos, pagos, historial, aprobada] of ORDENES) {
    folio += 1;
    const total = conceptos.reduce((suma, c) => suma + Number(c.cantidad) * Number(c.precioUnitario), 0);
    const aprobar = ["en_reparacion", "listo", "entregado"].includes(estado) || aprobada;
    const token = estado === "esperando_aprobacion" ? hex48() : null;
    const orden = await tx.tallerOrden.create({
      data: {
        vehiculoId: vehiculos[v].id, numero: folio, estado, kmEntrada: vehiculos[v].kilometraje, fallaReportada: falla, diagnostico,
        mecanicoId: mecanico?.id ?? null, fechaPromesa: promesa === null ? null : fechaMexico(promesa, 18), total,
        creadoPorId: admin.id, createdAt: hace(dias, 9),
        aprobadoAt: aprobar ? hace(Math.max(dias - 1, 0), 12) : null, aprobadoMedio: aprobar ? "enlace_publico" : null,
        aprobacionResultado: aprobar ? "aprobar" : null, aprobacionToken: token,
      },
    });
    if (token) urlAprobacion = `/taller-aprobacion/${org.id}-${token}`;
    if (conceptos.length) await tx.tallerOrdenConcepto.createMany({ data: conceptos.map((c) => ({ ...c, ordenId: orden.id })) });
    for (const [e, d] of historial) {
      await tx.tallerOrdenCambio.create({ data: { ordenId: orden.id, estado: e, userId: e === "esperando_aprobacion" || e === "en_reparacion" ? null : admin.id, actor: e === "en_reparacion" && aprobar ? "cliente" : "equipo", creadoAt: hace(d, 11) } });
    }
    for (const [monto, metodo, d] of pagos) await tx.tallerPago.create({ data: { ordenId: orden.id, monto, metodo, userId: admin.id, createdAt: hace(d, 13) } });
  }
  await tx.$executeRawUnsafe(
    "INSERT INTO taller_folios (org_id, ultimo_numero) VALUES ($1, $2) ON CONFLICT (org_id) DO UPDATE SET ultimo_numero = EXCLUDED.ultimo_numero",
    org.id, folio,
  );

  // Recordatorios: vencido, próximo por fecha y próximo por kilometraje.
  await tx.tallerRecordatorio.createMany({ data: [
    { vehiculoId: vehiculos[5].id, tipo: "Cambio de aceite", proximoKm: 124500, proximaFecha: fechaMexico(80, 12) },
    { vehiculoId: vehiculos[0].id, tipo: "Rotación de llantas", proximaFecha: fechaMexico(-6, 12) },
    { vehiculoId: vehiculos[6].id, tipo: "Servicio de 35,000 km", proximoKm: 35000 },
    { vehiculoId: vehiculos[1].id, tipo: "Revisión de suspensión", proximaFecha: fechaMexico(12, 12) },
  ] });

  // Agenda: recepciones próximas.
  for (const [indice, [c, titulo, dias, hora]] of [
    [3, "Recepción · Aveo (testigo y apagado)", 0, 16], [1, "Entrega · Hilux con frenos nuevos", 2, 11], [4, "Revisión de flotilla · CR-V", 3, 9],
  ].entries()) {
    const inicio = fechaMexico(dias, hora);
    const existente = await tx.cita.findFirst({ where: { contactoId: contactos[c].id, titulo } });
    const datos = { contactoId: contactos[c].id, responsableId: [marisol, luis, pedro][indice].id, titulo, inicio, fin: new Date(inicio.getTime() + 60 * 60_000) };
    if (existente) await tx.cita.update({ where: { id: existente.id }, data: datos });
    else await tx.cita.create({ data: datos });
  }
});

imprimirCredencialesDemo({ nombre: "taller", slug: "demo-taller", email, password, passwordGenerada });
if (urlAprobacion) console.log(`Enlace de aprobación (orden esperando al cliente): ${urlAprobacion}`);
await prisma.$disconnect();
