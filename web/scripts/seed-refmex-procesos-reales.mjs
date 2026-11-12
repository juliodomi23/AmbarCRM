// Uso: ORG_SLUG=refmex node scripts/seed-refmex-procesos-reales.mjs
// Carga los procesos reales de REFMEX (Excel entregado por el cliente, agrupados por color)
// como catalogo en Configuracion > Procesos. Es idempotente: si el proceso ya existe (mismo
// nombre), actualiza sus actividades en vez de duplicarlo.
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production");
const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient();
const orgSlug = process.env.ORG_SLUG || "refmex";

const PROCESOS = [
  {
    nombre: "Contabilidad y fiscal mensual (REFMEX)",
    periodicidad: "mensual",
    actividades: [
      ["Entrega de contabilidad", 5],
      ["Recepción de CFDI, cotización de estado de cuenta, contrato y orden de compra", 5],
      ["Descarga de CFDI", 5],
      ["Buzón tributario", 5],
      ["69-B, 49-BIS, 69", 5],
      ["Proceso contable", 14],
      ["Determinación de impuestos", 16],
      ["Aviso de determinación de contribuciones del SAT", 16],
      ["Confirmación de pago", 16],
      ["Línea de captura del SAT", 16],
      ["CFDI de honorarios", 15],
      ["Envío de CFDI de honorarios", 16],
      ["Pago de línea de captura del SAT", 18],
      ["Pago de honorarios del despacho", 31],
    ],
  },
  {
    nombre: "ISN mensual",
    periodicidad: "mensual",
    actividades: [
      ["Altas y bajas", 31],
      ["Aviso ISN mensual", 31],
      ["Determinación ISN mensual", 14],
      ["Confirmación de pago ISN mensual", 13],
    ],
  },
  {
    nombre: "ISN bimestral",
    periodicidad: "bimestral",
    actividades: [
      ["Aviso ISN bimestral", 9],
      ["Determinación ISN bimestral", 8],
      ["Confirmación de pago ISN bimestral", 10],
    ],
  },
  {
    nombre: "IMSS y nómina",
    periodicidad: "mensual",
    actividades: [
      ["Descarga ISDE", 6],
      ["Administración SUA", 10],
      ["Envío de línea de captura IMSS", 10],
      ["Recordatorio IMSS", 16],
      ["Pago IMSS", 17],
      ["Descarga de CFDI, IMSS e Infonavit", 31],
      ["1Q Nómina", 14],
      ["2Q Nómina", 30],
      ["SIROC", 5],
    ],
  },
  {
    // El excel dice "cuatrimestral"; esa periodicidad no existe en el sistema (solo hasta
    // trimestral o anual), así que se deja como trimestral. Ajustar fechas límite a mano si
    // hace falta cuadrarlo exacto a cada 4 meses.
    nombre: "SISUB e ICSOE (cuatrimestral)",
    periodicidad: "trimestral",
    actividades: [
      ["SISUB cuatrimestral", 17],
      ["ICSOE cuatrimestral", 17],
    ],
  },
  {
    nombre: "Informe e impresión mensual",
    periodicidad: "mensual",
    actividades: [
      ["Informe mensual", 31],
      ["Impresión de contabilidad", 31],
    ],
  },
  {
    nombre: "ISH y municipal",
    periodicidad: "mensual",
    actividades: [
      ["Determinación de ISH", 9],
      ["Determinación municipal", 9],
      ["Generación de línea de captura ISH", 10],
      ["Generación de línea de captura municipal", 10],
    ],
  },
];

const org = await prisma.org.findUnique({ where: { slug: orgSlug } });
if (!org) {
  console.error(`No existe la org "${orgSlug}".`);
  process.exit(1);
}

await prisma.$transaction(async (tx) => {
  await tx.$executeRawUnsafe("SELECT set_config('app.current_org', $1, true)", String(org.id));
  for (const grupo of PROCESOS) {
    const existente = await tx.despachoProceso.findUnique({ where: { orgId_nombre: { orgId: org.id, nombre: grupo.nombre } } });
    const actividadesData = grupo.actividades.map(([nombre, diaLimite], orden) => ({ nombre, diaLimite, peso: 1, orden }));
    if (existente) {
      await tx.despachoProcesoActividad.deleteMany({ where: { procesoId: existente.id } });
      await tx.despachoProceso.update({
        where: { id: existente.id },
        data: { periodicidad: grupo.periodicidad, activo: true, actividades: { create: actividadesData } },
      });
      console.log(`Actualizado: ${grupo.nombre} (${actividadesData.length} actividades)`);
    } else {
      await tx.despachoProceso.create({
        data: { nombre: grupo.nombre, periodicidad: grupo.periodicidad, actividades: { create: actividadesData } },
      });
      console.log(`Creado: ${grupo.nombre} (${actividadesData.length} actividades)`);
    }
  }
}, { timeout: 30000 });

console.log("Procesos reales de REFMEX listos en /despacho/configuracion.");
await prisma.$disconnect();
