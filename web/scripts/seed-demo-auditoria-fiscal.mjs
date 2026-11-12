// Uso opcional: ALLOW_DEMO_SEED=1 node scripts/seed-demo-auditoria-fiscal.mjs
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

function hoyMexico() {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit" }).format(new Date());
  const [anio, mes] = partes.split("-").map(Number);
  return { anio, mes };
}

const org = await prisma.org.findUnique({ where: { slug: SLUG } });
if (!org) {
  console.error(`No existe la org "${SLUG}". Corre primero scripts/seed-demo-despacho.mjs.`);
  process.exit(1);
}

await prisma.$transaction(async (tx) => {
  await tx.$executeRawUnsafe("SELECT set_config('app.current_org', $1, true)", String(org.id));

  const cartagena = await tx.usuario.findUnique({ where: { orgId_email: { orgId: org.id, email: "cartagena@refmex.demo" } } });
  const dario = await tx.usuario.findUnique({ where: { orgId_email: { orgId: org.id, email: "dario@refmex.demo" } } });
  const admin = await tx.usuario.findFirst({ where: { orgId: org.id, rol: "admin" } });
  const auditorPrincipal = cartagena ?? admin;
  if (!auditorPrincipal) {
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

  const { anio, mes } = hoyMexico();
  const periodoActual = `${anio}-T${Math.ceil(mes / 3)}`;
  const periodoAnterior = `Ejercicio ${anio - 1}`;

  const PLAN = [
    { cliente: 0, periodo: periodoAnterior, alcance: "ISR e IVA del ejercicio fiscal anterior", estado: "concluida", hallazgos: "Sin diferencias relevantes; se recomendó actualizar papeles de trabajo de depreciaciones.", diasAtras: 95, auditor: auditorPrincipal },
    { cliente: 1, periodo: periodoAnterior, alcance: "Nómina y seguridad social del ejercicio anterior", estado: "con_observaciones", hallazgos: "Se detectaron 3 altas IMSS fuera de plazo; pendiente corrección con el cliente.", diasAtras: 60, auditor: dario ?? auditorPrincipal },
    { cliente: 2, periodo: periodoActual, alcance: "CFDI e ISR del trimestre en curso", estado: "en_proceso", hallazgos: null, diasAtras: 10, auditor: auditorPrincipal },
    { cliente: 3, periodo: periodoActual, alcance: "Revisión preventiva de obligaciones fiscales del trimestre", estado: "planeacion", hallazgos: null, diasAtras: 1, auditor: dario ?? auditorPrincipal },
  ];

  for (const item of PLAN) {
    const cliente = clientes[item.cliente % clientes.length];
    const fechaInicio = new Date(); fechaInicio.setUTCDate(fechaInicio.getUTCDate() - item.diasAtras);
    const fechaCierre = item.estado === "concluida" ? new Date() : null;
    await tx.auditoriaFiscalCliente.upsert({
      where: { orgId_clienteId_periodo: { orgId: org.id, clienteId: cliente.id, periodo: item.periodo } },
      update: { estado: item.estado, hallazgos: item.hallazgos, auditorId: item.auditor.id, fechaCierre },
      create: {
        orgId: org.id, clienteId: cliente.id, auditorId: item.auditor.id,
        periodo: item.periodo, alcance: item.alcance, estado: item.estado,
        hallazgos: item.hallazgos, fechaInicio, fechaCierre,
      },
    });
  }
}, { timeout: 30000 });

console.log("Auditoría fiscal de demostración lista para REFMEX (/auditoria/fiscal).");
await prisma.$disconnect();
