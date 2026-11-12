// Uso opcional: ALLOW_DEMO_SEED=1 node scripts/seed-demo-finanzas.mjs
// Reutiliza clientes y colaboradores sembrados por seed-demo-despacho.mjs; correlo despues de ese.
import { PrismaClient } from "@prisma/client";

if (process.env.NODE_ENV === "production") {
  console.error("Este seed de demostración no corre en producción.");
  process.exit(1);
}
if (process.env.ALLOW_DEMO_SEED !== "1") {
  console.error("Define ALLOW_DEMO_SEED=1 para autorizar datos de demostración.");
  process.exit(1);
}

const prisma = new PrismaClient();
const SLUG = process.env.ORG_SLUG || "refmex";

function fechaMes(dia) {
  const hoy = new Date();
  return new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), dia));
}

const org = await prisma.org.findUnique({ where: { slug: SLUG } });
if (!org) {
  console.error(`No existe la org "${SLUG}". Corre primero scripts/seed-demo-despacho.mjs.`);
  process.exit(1);
}

await prisma.$transaction(async (tx) => {
  await tx.$executeRawUnsafe("SELECT set_config('app.current_org', $1, true)", String(org.id));

  const admin = await tx.usuario.findFirst({ where: { orgId: org.id, rol: "admin" } });
  const cartagena = await tx.usuario.findUnique({ where: { orgId_email: { orgId: org.id, email: "cartagena@refmex.demo" } } });
  const responsable = cartagena ?? admin;
  if (!responsable) {
    console.error("No hay usuarios en la org; corre primero seed-demo-despacho.mjs.");
    process.exit(1);
  }

  const clientes = await tx.despachoCliente.findMany({
    where: { orgId: org.id, activo: true },
    include: { contacto: { select: { nombre: true, empresa: true } } },
    orderBy: { id: "asc" },
    take: 6,
  });
  if (clientes.length === 0) {
    console.error("No hay clientes de despacho; corre primero seed-demo-despacho.mjs.");
    process.exit(1);
  }

  await tx.despachoFinanzaPago.deleteMany({ where: { orgId: org.id } });
  await tx.despachoMovimientoFinanciero.deleteMany({ where: { orgId: org.id } });

  const INGRESOS = [
    { cliente: 0, concepto: "Honorarios mensuales de noviembre", monto: 8000, vence: 15, pagado: 5000 },
    { cliente: 1, concepto: "Honorarios mensuales de noviembre", monto: 6000, vence: 20, pagado: 0 },
    { cliente: 2, concepto: "Honorarios mensuales de noviembre", monto: 7500, vence: 5, pagado: 0 },
    { cliente: 3, concepto: "Migración e implementación inicial", monto: 3000, vence: 10, pagado: 3000 },
  ];
  const GASTOS = [
    { concepto: "Renta de oficina", monto: 12000, dia: 1, tipo: "gasto" },
    { concepto: "Nómina quincenal", monto: 45000, dia: 15, tipo: "gasto" },
    { concepto: "Software de contabilidad", monto: 1800, dia: 5, tipo: "costo" },
    { concepto: "Hosting y respaldos AmbarCRM", monto: 600, dia: 3, tipo: "costo" },
  ];

  for (const item of INGRESOS) {
    const cliente = clientes[item.cliente % clientes.length];
    const movimiento = await tx.despachoMovimientoFinanciero.create({
      data: {
        orgId: org.id, unidad: "refmex", tipo: "ingreso", concepto: item.concepto,
        monto: item.monto, fecha: fechaMes(1), fechaVencimiento: fechaMes(item.vence),
        clienteId: cliente.id, responsableId: responsable.id,
      },
    });
    if (item.pagado > 0) {
      await tx.despachoFinanzaPago.create({
        data: { orgId: org.id, movimientoId: movimiento.id, monto: item.pagado, fecha: fechaMes(item.vence), responsableId: responsable.id, metodo: "transferencia" },
      });
    }
  }

  for (const item of GASTOS) {
    await tx.despachoMovimientoFinanciero.create({
      data: {
        orgId: org.id, unidad: "despacho", tipo: item.tipo, concepto: item.concepto,
        monto: item.monto, fecha: fechaMes(item.dia), responsableId: responsable.id,
      },
    });
  }
}, { timeout: 30000 });

console.log("Finanzas de demostración listas para REFMEX (/despacho/finanzas).");
await prisma.$disconnect();
