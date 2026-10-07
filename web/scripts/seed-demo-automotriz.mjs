// Uso opcional: node scripts/seed-demo-automotriz.mjs correo contraseña
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const [email = "auto@local.test", password = "AutoDemo2026!"] = process.argv.slice(2);
const prisma = new PrismaClient();

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
      activo: true,
    },
    create: {
      nombre: "Gerencia Autos Horizonte",
      email,
      passwordHash,
      rol: "admin",
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
});

console.log("Demo automotriz lista: /login?org=demo-auto", email);
await prisma.$disconnect();
