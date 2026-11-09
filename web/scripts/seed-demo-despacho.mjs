// Uso opcional: ALLOW_DEMO_SEED=1 node scripts/seed-demo-despacho.mjs correo contraseña
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { credencialesDemo, imprimirCredencialesDemo } from "./lib/demo-seed.mjs";

const { email, password, passwordGenerada } = credencialesDemo("despacho@local.test");
const prisma = new PrismaClient();
const SLUG = process.env.ORG_SLUG || "demo-despacho";

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
  update: { nombre: "Despacho Contable del Valle", activo: true },
  create: { nombre: "Despacho Contable del Valle", slug: SLUG },
});

const PROCESOS = [
  ["Nómina mensual", "mensual", [["Recibir incidencias", 3], ["Calcular nómina", 5], ["Timbrado y dispersión", 7], ["Enviar acuse al cliente", 9]]],
  ["Declaraciones mensuales", "mensual", [["Recopilar facturas", 5], ["Conciliar IVA e ISR", 8], ["Presentar declaración", 17], ["Enviar acuse", 19]]],
  ["Contabilidad mensual", "mensual", [["Registrar pólizas", 10], ["Revisar balanza", 15], ["Cerrar mes", 20]]],
  ["Conciliación bancaria", "mensual", [["Descargar estados de cuenta", 4], ["Conciliar movimientos", 6]]],
  ["Reporte trimestral", "trimestral", [["Preparar estados financieros", 10], ["Revisar con dirección", 15], ["Entregar al cliente", 20]]],
];

const CLIENTES = [
  ["Panadería La Espiga", "5557000001", "PAE850101AB1"],
  ["Ferretería Torres", "5557000002", "FTO920202CD2"],
  ["Clínica Dental Sonríe", "5557000003", "CDS010303EF3"],
  ["Transportes del Sur", "5557000004", "TSU980404GH4"],
];

await prisma.$transaction(async (tx) => {
  await tx.$executeRawUnsafe("SELECT set_config('app.current_org', $1, true)", String(org.id));
  const passwordHash = await bcrypt.hash(password, 10);
  const admin = await tx.usuario.upsert({
    where: { orgId_email: { orgId: org.id, email } },
    update: { nombre: "Dirección del despacho", passwordHash, rol: "admin", puesto: "Administrador", activo: true },
    create: { nombre: "Dirección del despacho", email, passwordHash, rol: "admin", puesto: "Administrador" },
  });
  const equipo = [];
  for (const [nombre, correo, puesto] of [
    ["Claudia Nava", "claudia@despacho-valle.demo", "Contador"],
    ["Raúl Medina", "raul@despacho-valle.demo", "Contador"],
    ["Sofía Lara", "sofia@despacho-valle.demo", "Gerente general"],
  ]) {
    equipo.push(await tx.usuario.upsert({
      where: { orgId_email: { orgId: org.id, email: correo } },
      update: { nombre, puesto, activo: true },
      create: { nombre, email: correo, passwordHash, rol: "agente", puesto },
    }));
  }
  await tx.ajustes.upsert({ where: { orgId: org.id }, update: { marcaNombre: "Despacho del Valle" }, create: { marcaNombre: "Despacho del Valle" } });
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
    const cliente = await tx.despachoCliente.create({ data: { contactoId: contacto.id, rfc, responsableId: equipo[indice % equipo.length].id, notas: "Cliente de demostración." } });
    for (const proceso of [procesos[indice % procesos.length], procesos[(indice + 1) % procesos.length]]) {
      await tx.despachoClienteProceso.create({ data: { clienteId: cliente.id, procesoId: proceso.id, responsableId: equipo[indice % equipo.length].id } });
    }
    clientes.push(cliente);
  }

  const { anio, mes } = hoyMexico();
  const mesAnterior = mes === 1 ? { anio: anio - 1, mes: 12 } : { anio, mes: mes - 1 };
  const instancias = [];
  for (const cliente of clientes) {
    for (const proceso of procesos.slice(0, 4)) {
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
});

imprimirCredencialesDemo({ nombre: "Despacho Contable del Valle", slug: SLUG, email, password, passwordGenerada });
await prisma.$disconnect();
