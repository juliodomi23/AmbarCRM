import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { credencialesDemo, imprimirCredencialesDemo } from "./lib/demo-seed.mjs";

const { email, password, passwordGenerada } = credencialesDemo(
  "inmobiliaria@local.test",
);
const prisma = new PrismaClient();

function fechaProxima(dias, hora) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Mexico_City",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .map((parte) => [parte.type, parte.value]),
  );
  const fecha = new Date(
    Date.UTC(Number(partes.year), Number(partes.month) - 1, Number(partes.day)),
  );
  fecha.setUTCDate(fecha.getUTCDate() + dias);
  return new Date(
    `${fecha.toISOString().slice(0, 10)}T${String(hora).padStart(2, "0")}:00:00-06:00`,
  );
}

const org = await prisma.org.upsert({
  where: { slug: "demo-inmobiliaria" },
  update: { nombre: "Inmobiliaria Horizonte", activo: true },
  create: { nombre: "Inmobiliaria Horizonte", slug: "demo-inmobiliaria" },
});

const catalogo = [
  ["P-101", "Casa familiar en Cumbres", "Casa", "Venta", "Monterrey", 3, 2.5, 210, 4950000],
  ["P-102", "Departamento con terraza", "Departamento", "Renta", "Monterrey", 2, 2, 110, 28000],
  ["P-103", "Residencia frente al parque", "Casa", "Venta", "San Pedro", 4, 4.5, 420, 12900000],
  ["P-104", "Local en avenida principal", "Local", "Renta", "Guadalupe", 0, 1, 85, 19500],
  ["P-105", "Terreno para desarrollo", "Terreno", "Venta", "Apodaca", 0, 0, 650, 3250000],
];

await prisma.$transaction(async (tx) => {
  await tx.$executeRawUnsafe(
    "SELECT set_config('app.current_org', $1, true)",
    String(org.id),
  );
  const passwordHash = await bcrypt.hash(password, 10);
  await tx.usuario.upsert({
    where: { orgId_email: { orgId: org.id, email } },
    update: {
      nombre: "Gerencia Inmobiliaria Horizonte",
      passwordHash,
      rol: "admin",
      puesto: "Administrador",
      activo: true,
    },
    create: {
      nombre: "Gerencia Inmobiliaria Horizonte",
      email,
      passwordHash,
      rol: "admin",
      puesto: "Administrador",
    },
  });
  const asesores = [];
  for (const [nombre, correo] of [
    ["Sofía Campos", "sofia@inmobiliaria-horizonte.demo"],
    ["Raúl Benítez", "raul@inmobiliaria-horizonte.demo"],
  ]) {
    asesores.push(
      await tx.usuario.upsert({
        where: { orgId_email: { orgId: org.id, email: correo } },
        update: { nombre, puesto: "Asesor inmobiliario", activo: true },
        create: {
          nombre,
          email: correo,
          passwordHash,
          rol: "agente",
          puesto: "Asesor inmobiliario",
        },
      }),
    );
  }
  await tx.ajustes.upsert({
    where: { orgId: org.id },
    update: { marcaNombre: "Inmobiliaria Horizonte" },
    create: { marcaNombre: "Inmobiliaria Horizonte" },
  });
  for (const clave of ["inmobiliaria", "citas"]) {
    await tx.moduloOrg.upsert({
      where: { orgId_clave: { orgId: org.id, clave } },
      update: { activo: true },
      create: { clave, activo: true, config: {} },
    });
  }

  for (let indice = 0; indice < catalogo.length; indice++) {
    const [clave, titulo, tipo, operacion, ciudad, recamaras, banos, superficie, precio] =
      catalogo[indice];
    await tx.propiedad.upsert({
      where: { orgId_clave: { orgId: org.id, clave: String(clave) } },
      update: {
        titulo: String(titulo),
        tipo: String(tipo),
        operacion: String(operacion),
        ciudad: String(ciudad),
        recamaras: Number(recamaras),
        banos: Number(banos),
        superficie: Number(superficie),
        precio: Number(precio),
      },
      create: {
        clave: String(clave),
        titulo: String(titulo),
        tipo: String(tipo),
        operacion: String(operacion),
        ciudad: String(ciudad),
        recamaras: Number(recamaras),
        banos: Number(banos),
        superficie: Number(superficie),
        precio: Number(precio),
        estado: indice === 2 ? "reservada" : "disponible",
      },
    });
  }

  for (let indice = 0; indice < 3; indice++) {
    const telefono = `555300000${indice + 1}`;
    const contacto = await tx.contacto.upsert({
      where: { orgId_telefono: { orgId: org.id, telefono } },
      update: { nombre: ["Andrea Gil", "José Flores", "Paola Cruz"][indice] },
      create: {
        nombre: ["Andrea Gil", "José Flores", "Paola Cruz"][indice],
        telefono,
        fuente: "manual",
        responsableId: asesores[indice % asesores.length].id,
      },
    });
    const titulo = `Visita · ${catalogo[indice][1]}`;
    const inicio = fechaProxima(indice + 1, 11 + indice * 2);
    const datos = {
      contactoId: contacto.id,
      responsableId: asesores[indice % asesores.length].id,
      titulo,
      inicio,
      fin: new Date(inicio.getTime() + 60 * 60_000),
    };
    const existente = await tx.cita.findFirst({
      where: { contactoId: contacto.id, titulo },
    });
    if (existente) await tx.cita.update({ where: { id: existente.id }, data: datos });
    else await tx.cita.create({ data: datos });
  }
});

imprimirCredencialesDemo({
  nombre: "inmobiliaria",
  slug: "demo-inmobiliaria",
  email,
  password,
  passwordGenerada,
});
await prisma.$disconnect();
