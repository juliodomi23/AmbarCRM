// Uso opcional: ALLOW_DEMO_SEED=1 node scripts/seed-demo-despacho.mjs correo contraseña
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { credencialesDemo, imprimirCredencialesDemo } from "./lib/demo-seed.mjs";

const { email, password, passwordGenerada } = credencialesDemo("refmex@local.test");
const prisma = new PrismaClient();
const SLUG = process.env.ORG_SLUG || "refmex";

function fechaCivil(anio, mes, dia) {
  return new Date(Date.UTC(anio, mes - 1, dia));
}
function hoyMexico() {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const [anio, mes] = partes.split("-").map(Number);
  return { anio, mes };
}

const org = await prisma.org.upsert({
  where: { slug: SLUG },
  update: { nombre: "REFMEX", activo: true },
  create: { nombre: "REFMEX", slug: SLUG },
});

const PROCESOS = [
  ["Contabilidad mensual", "mensual", [["Recibir documentación", 5], ["Registrar pólizas", 10], ["Conciliar cuentas", 15], ["Cerrar mes", 20], ["Enviar estados financieros", 25]]],
  ["Impuestos mensuales", "mensual", [["Recopilar CFDI", 5], ["Conciliar IVA e ISR", 8], ["Presentar declaraciones", 17], ["Enviar acuses", 19]]],
  ["Nómina y seguridad social", "mensual", [["Recibir incidencias", 3], ["Calcular nómina", 5], ["Timbrado y dispersión", 7], ["IMSS e INFONAVIT", 9]]],
  ["Auditoría y aseguramiento", "anual", [["Planeación de auditoría", 10], ["Pruebas selectivas", 20], ["Informe de hallazgos", 30]]],
  ["Planeación fiscal y REPSE", "trimestral", [["Diagnóstico fiscal", 10], ["Revisión REPSE", 15], ["Propuesta de optimización", 20], ["Seguimiento con socio", 25]]],
];

const CLIENTES = [
  ["Grupo Tuxtla", "5557000001", "GTU230101AB1"],
  ["Constructora Monterrey", "5557000002", "CMO210202CD2"],
  ["Comercializadora Izcalli", "5557000003", "CIZ190303EF3"],
  ["Servicios del Sureste", "5557000004", "SSU200404GH4"],
];

await prisma.$transaction(async (tx) => {
  await tx.$executeRawUnsafe("SELECT set_config('app.current_org', $1, true)", String(org.id));
  const passwordHash = await bcrypt.hash(password, 10);
  const admin = await tx.usuario.upsert({
    where: { orgId_email: { orgId: org.id, email } },
    update: { nombre: "Adrián Jiménez", passwordHash, rol: "admin", puesto: "Director general", activo: true },
    create: { nombre: "Adrián Jiménez", email, passwordHash, rol: "admin", puesto: "Director general" },
  });
  const equipo = [];
  for (const [nombre, correo, puesto] of [
    ["Cartajena", "cartajena@refmex.demo", "Gerente general"],
    ["Darío Pérez", "dario@refmex.demo", "Contador"],
    ["Nelson Gómez", "nelson@refmex.demo", "Contador"],
    ["Juan José Castañeda", "juanjose@refmex.demo", "Contador"],
    ["Abner Culebro", "abner@refmex.demo", "Contador"],
    ["Yolanda Ruiz", "yolanda@refmex.demo", "Auxiliar contable"],
    ["Brenda Solís", "brenda@refmex.demo", "Auxiliar contable"],
    ["Ismael Torres", "ismael@refmex.demo", "Auxiliar contable"],
    ["Dulce Ramos", "dulce@refmex.demo", "Auxiliar contable"],
  ]) {
    equipo.push(await tx.usuario.upsert({
      where: { orgId_email: { orgId: org.id, email: correo } },
      update: { nombre, puesto, activo: true },
      create: { nombre, email: correo, passwordHash, rol: "agente", puesto },
    }));
  }
  const contadores = equipo.filter((usuario) => usuario.puesto === "Contador");
  await tx.ajustes.upsert({
    where: { orgId: org.id },
    update: { marcaNombre: "REFMEX", marcaColorPrimario: "#0F2341", marcaColorAcento: "#2563EB", marcaPreset: "legal" },
    create: { marcaNombre: "REFMEX", marcaColorPrimario: "#0F2341", marcaColorAcento: "#2563EB", marcaPreset: "legal" },
  });
  for (const clave of ["despacho", "clientes"]) {
    await tx.moduloOrg.upsert({ where: { orgId_clave: { orgId: org.id, clave } }, update: { activo: true }, create: { clave, activo: true, config: {} } });
  }

  await tx.despachoActividadCambio.deleteMany({});
  await tx.despachoActividad.deleteMany({});
  await tx.despachoClienteProceso.deleteMany({});
  await tx.despachoProcesoActividad.deleteMany({});
  await tx.despachoProceso.deleteMany({});
  await tx.despachoCliente.deleteMany({});

  const procesos = [];
  for (const [nombre, periodicidad, actividades] of PROCESOS) {
    procesos.push(await tx.despachoProceso.create({
      data: { nombre, periodicidad, actividades: { create: actividades.map(([titulo, diaLimite], orden) => ({ nombre: titulo, diaLimite, orden })) } },
      include: { actividades: true },
    }));
  }

  const clientes = [];
  for (const [indice, [nombre, telefono, rfc]] of CLIENTES.entries()) {
    const contacto = await tx.contacto.upsert({
      where: { orgId_telefono: { orgId: org.id, telefono } },
      update: { nombre, empresa: nombre },
      create: { nombre, telefono, empresa: nombre, fuente: "manual" },
    });
    const responsableId = contadores[indice % contadores.length].id;
    const cliente = await tx.despachoCliente.create({ data: { contactoId: contacto.id, rfc, responsableId, notas: "Cliente de demostración." } });
    for (const proceso of [procesos[indice % procesos.length], procesos[(indice + 1) % procesos.length]]) {
      await tx.despachoClienteProceso.create({ data: { clienteId: cliente.id, procesoId: proceso.id, responsableId } });
    }
    clientes.push(cliente);
  }

  const { anio, mes } = hoyMexico();
  const mesAnterior = mes === 1 ? { anio: anio - 1, mes: 12 } : { anio, mes: mes - 1 };
  const instancias = [];
  for (const cliente of clientes) {
    for (const proceso of procesos) {
      const clienteProceso = await tx.despachoClienteProceso.findFirst({ where: { clienteId: cliente.id, procesoId: proceso.id } });
      if (!clienteProceso) continue;
      for (const actividad of proceso.actividades) {
        instancias.push({ cliente, clienteProceso, proceso, actividad, periodo: fechaCivil(mesAnterior.anio, mesAnterior.mes, 1), estado: "completada", completada: true });
        instancias.push({ cliente, clienteProceso, proceso, actividad, periodo: fechaCivil(anio, mes, 1), estado: "pendiente", completada: false });
      }
    }
  }
  for (const [indice, instancia] of instancias.entries()) {
    const fechaLimite = fechaCivil(instancia.periodo.getUTCFullYear(), instancia.periodo.getUTCMonth() + 1, instancia.actividad.diaLimite);
    const estados = ["pendiente", "en_proceso", "completada", "pendiente", "bloqueada"];
    const estado = instancia.completada ? "completada" : estados[indice % estados.length];
    const actividad = await tx.despachoActividad.create({
      data: {
        clienteId: instancia.cliente.id,
        clienteProcesoId: instancia.clienteProceso.id,
        plantillaActividadId: instancia.actividad.id,
        tipo: "fija",
        titulo: instancia.actividad.nombre,
        periodo: instancia.periodo,
        fechaLimite,
        responsableId: instancia.clienteProceso.responsableId ?? instancia.cliente.responsableId ?? admin.id,
        estado,
        completadaAt: estado === "completada" ? new Date() : null,
      },
    });
    if (estado !== "pendiente") {
      await tx.despachoActividadCambio.create({ data: { actividadId: actividad.id, estadoAnterior: "pendiente", estadoNuevo: estado, userId: admin.id, nota: "Demo" } });
    }
  }

  // Una actividad atrasada visible para la demo.
  const atrasada = await tx.despachoActividad.findFirst({ where: { estado: { not: "completada" } }, orderBy: { fechaLimite: "asc" } });
  if (atrasada) await tx.despachoActividad.update({ where: { id: atrasada.id }, data: { fechaLimite: fechaCivil(anio, mes, Math.max(1, new Date().getDate() - 2)) } });

  await tx.usuario.deleteMany({ where: { orgId: org.id, email: { in: ["claudia@refmex.demo", "raul@refmex.demo", "sofia@refmex.demo"] } } });
});

imprimirCredencialesDemo({ nombre: "REFMEX", slug: SLUG, email, password, passwordGenerada });
await prisma.$disconnect();
