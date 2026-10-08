import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { credencialesDemo, imprimirCredencialesDemo } from "./lib/demo-seed.mjs";

const { email, password, passwordGenerada } = credencialesDemo("viajes@local.test");
const prisma = new PrismaClient();
const org = await prisma.org.upsert({
  where: { slug: "demo-viajes" },
  update: { nombre: "Horizonte Tours", activo: true },
  create: { slug: "demo-viajes", nombre: "Horizonte Tours" },
});

await prisma.$transaction(async (tx) => {
  await tx.$executeRawUnsafe("SELECT set_config('app.current_org', $1, true)", String(org.id));
  const passwordHash = await bcrypt.hash(password, 10);
  const admin = await tx.usuario.upsert({
    where: { orgId_email: { orgId: org.id, email } },
    update: { passwordHash, activo: true, puesto: "Agente de viajes", rol: "admin" },
    create: { nombre: "Paola Rivera", email, passwordHash, puesto: "Agente de viajes", rol: "admin" },
  });
  await tx.ajustes.upsert({
    where: { orgId: org.id },
    update: { marcaNombre: "Horizonte Tours", nombreNegocio: "Horizonte Tours" },
    create: { marcaNombre: "Horizonte Tours", nombreNegocio: "Horizonte Tours" },
  });
  for (const clave of ["tours", "reservas_tours", "pagos_tours", "citas"] ) {
    await tx.moduloOrg.upsert({
      where: { orgId_clave: { orgId: org.id, clave } },
      update: { activo: true }, create: { clave, activo: true, config: {} },
    });
  }
  const contactos = [];
  for (const [nombre, telefono] of [
    ["Ana Viajera", "5558200001"], ["Luis Turista", "5558200002"], ["Mónica Paseo", "5558200003"],
  ]) {
    contactos.push(await tx.contacto.upsert({
      where: { orgId_telefono: { orgId: org.id, telefono } },
      update: { nombre },
      create: { nombre, telefono, fuente: "manual", responsableId: admin.id },
    }));
  }
  const definiciones = [
    {
      clave: "OAX-01", nombre: "Oaxaca cultural", destino: "Oaxaca",
      pais: "México", duracionDias: 4, capacidad: 18, precio: 7800, estado: "publicado",
    },
    {
      clave: "GTO-02", nombre: "Fin de semana en Guanajuato", destino: "Guanajuato",
      pais: "México", duracionDias: 3, capacidad: 25, precio: 4200, estado: "publicado",
    },
    {
      clave: "CUN-03", nombre: "Caribe en familia", destino: "Cancún",
      pais: "México", duracionDias: 5, capacidad: 20, precio: 14500, estado: "borrador",
    },
  ];
  const tours = [];
  for (const datos of definiciones) {
    tours.push(await tx.tour.upsert({
      where: { orgId_clave: { orgId: org.id, clave: datos.clave } },
      update: datos,
      create: datos,
    }));
  }
  const reservas = [
    {
      codigo: "VIA-1001", tourId: tours[0].id, contactoId: contactos[0].id,
      viajeros: 2, estado: "confirmada", total: 15600, saldo: 7600,
    },
    {
      codigo: "VIA-1002", tourId: tours[1].id, contactoId: contactos[1].id,
      viajeros: 1, estado: "liquidada", total: 4200, saldo: 0,
    },
    {
      codigo: "VIA-1003", tourId: tours[0].id, contactoId: contactos[2].id,
      viajeros: 3, estado: "solicitada", total: 23400, saldo: 23400,
    },
  ];
  for (const datos of reservas) {
    const reserva = await tx.reservaTour.upsert({
      where: { orgId_codigo: { orgId: org.id, codigo: datos.codigo } },
      update: datos,
      create: datos,
    });
    const sinPagos = await tx.pagoTour.count({ where: { reservaId: reserva.id } }) === 0;
    if (datos.saldo < datos.total && sinPagos) {
      await tx.pagoTour.create({ data: {
        reservaId: reserva.id, concepto: "Anticipo de reservación",
        monto: datos.total - datos.saldo, metodo: "transferencia", referencia: `DEMO-${datos.codigo}`,
      } });
    }
  }
}, { timeout: 60_000 });

imprimirCredencialesDemo({
  nombre: "viajes",
  slug: "demo-viajes",
  email,
  password,
  passwordGenerada,
});
await prisma.$disconnect();
