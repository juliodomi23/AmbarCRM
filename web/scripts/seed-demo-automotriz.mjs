// Uso opcional: node scripts/seed-demo-automotriz.mjs correo contraseña
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const [email = "auto@local.test", password = "AutoDemo2026!"] = process.argv.slice(2);
const prisma = new PrismaClient();
const ZONA = "America/Mexico_City";

function fechaProxima(dias, hora) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: ZONA,
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
  where: { slug: "demo-auto" },
  update: { nombre: "Autos Horizonte", activo: true },
  create: { nombre: "Autos Horizonte", slug: "demo-auto" },
});

const inventario = [
  ["A-101", "Toyota", "Corolla", 2024, "LE CVT", "Blanco", 18400, 389000],
  ["A-102", "Mazda", "CX-30", 2023, "i Sport", "Rojo", 26750, 419900],
  ["A-103", "Nissan", "Kicks", 2024, "Advance", "Gris", 12100, 438000],
  ["A-104", "Volkswagen", "Jetta", 2022, "Comfortline", "Azul", 39500, 369000],
  ["A-105", "Kia", "Seltos", 2023, "EX", "Negro", 22400, 449000],
  ["A-106", "Honda", "Civic", 2021, "Touring", "Plata", 48100, 399000],
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
      nombre: "Gerencia Autos Horizonte",
      passwordHash,
      rol: "admin",
      puesto: "Administrador",
      activo: true,
    },
    create: {
      nombre: "Gerencia Autos Horizonte",
      email,
      passwordHash,
      rol: "admin",
      puesto: "Administrador",
    },
  });
  await tx.ajustes.upsert({
    where: { orgId: org.id },
    update: { marcaNombre: "Autos Horizonte" },
    create: { marcaNombre: "Autos Horizonte" },
  });
  await tx.moduloOrg.upsert({
    where: { orgId_clave: { orgId: org.id, clave: "automotriz" } },
    update: { activo: true },
    create: { clave: "automotriz", activo: true, config: {} },
  });
  await tx.moduloOrg.upsert({
    where: { orgId_clave: { orgId: org.id, clave: "citas" } },
    update: { activo: true },
    create: { clave: "citas", activo: true, config: {} },
  });

  const vendedores = [];
  for (const [nombre, correo] of [
    ["Mariana Vega", "mariana@autos-horizonte.demo"],
    ["Diego Luna", "diego@autos-horizonte.demo"],
  ]) {
    vendedores.push(
      await tx.usuario.upsert({
        where: { orgId_email: { orgId: org.id, email: correo } },
        update: { nombre, puesto: "Asesor automotriz", activo: true },
        create: {
          nombre,
          email: correo,
          passwordHash,
          rol: "agente",
          puesto: "Asesor automotriz",
        },
      }),
    );
  }

  for (let indice = 0; indice < inventario.length; indice++) {
    const [numeroStock, marca, modelo, anio, version, color, kilometraje, precio] =
      inventario[indice];
    await tx.vehiculo.upsert({
      where: {
        orgId_numeroStock: { orgId: org.id, numeroStock: String(numeroStock) },
      },
      update: {
        marca: String(marca),
        modelo: String(modelo),
        anio: Number(anio),
        version: String(version),
        color: String(color),
        kilometraje: Number(kilometraje),
        precio: Number(precio),
        estado: indice === 1 ? "reservado" : indice === 5 ? "vendido" : "disponible",
      },
      create: {
        numeroStock: String(numeroStock),
        vin: `DEMOAUTO${String(indice + 1).padStart(9, "0")}`,
        marca: String(marca),
        modelo: String(modelo),
        anio: Number(anio),
        version: String(version),
        color: String(color),
        kilometraje: Number(kilometraje),
        precio: Number(precio),
        estado: indice === 1 ? "reservado" : indice === 5 ? "vendido" : "disponible",
        notas: indice === 0 ? "Un solo dueño, servicios de agencia." : null,
      },
    });
  }

  const prospectos = [
    ["Laura Méndez", "5552000001", "Toyota Corolla", 1, 10],
    ["Miguel Santos", "5552000002", "Mazda CX-30", 1, 16],
    ["Fernanda Ríos", "5552000003", "Nissan Kicks", 2, 12],
  ];
  for (let indice = 0; indice < prospectos.length; indice++) {
    const [nombre, telefono, vehiculo, dias, hora] = prospectos[indice];
    const contacto = await tx.contacto.upsert({
      where: { orgId_telefono: { orgId: org.id, telefono } },
      update: { nombre, responsableId: vendedores[indice % vendedores.length].id },
      create: {
        nombre,
        telefono,
        fuente: "manual",
        responsableId: vendedores[indice % vendedores.length].id,
      },
    });
    const titulo = `Prueba de manejo · ${vehiculo}`;
    const inicio = fechaProxima(Number(dias), Number(hora));
    const existente = await tx.cita.findFirst({
      where: { contactoId: contacto.id, titulo },
    });
    const datos = {
      contactoId: contacto.id,
      responsableId: vendedores[indice % vendedores.length].id,
      titulo,
      notas: `Vehículo de interés: ${vehiculo}`,
      inicio,
      fin: new Date(inicio.getTime() + 45 * 60_000),
    };
    if (existente) await tx.cita.update({ where: { id: existente.id }, data: datos });
    else await tx.cita.create({ data: datos });
  }
});

console.log("Demo automotriz lista: /login?org=demo-auto", email);
await prisma.$disconnect();
