import { PrismaClient } from "@prisma/client";
import { credencialesDemo } from "./lib/demo-seed.mjs";
import { actualizarEmbudoAR } from "./lib/ar-embudo.mjs";

credencialesDemo("sin-usuario@local.test");
const slug = process.env.ORG_SLUG;
if (!slug) throw new Error("Define ORG_SLUG; no se elige una organización por defecto");
const prisma = new PrismaClient();
try {
  const org = await prisma.org.findUniqueOrThrow({ where: { slug } });
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT set_config('app.current_org', ${String(org.id)}, true)`;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${org.id})`;
    await tx.$queryRaw`SELECT id FROM contratos ORDER BY id FOR UPDATE`;
    const webs = await tx.contrato.findMany({ where: { orgId: org.id, tipo: "web", contacto: { nombre: "Pie Feliz" } } });
    const ids = webs.map(c => c.id);
    const cobros = ids.length ? (await tx.cobro.deleteMany({ where: { orgId: org.id, contratoId: { in: ids } } })).count : 0;
    const contratos = ids.length ? (await tx.contrato.deleteMany({ where: { orgId: org.id, id: { in: ids } } })).count : 0;
    console.log(`Ajustes AR (${slug}): eliminados ${contratos} contratos web de Pie Feliz y ${cobros} cobros.`);
    console.log(`Embudo: ${JSON.stringify(await actualizarEmbudoAR(tx))}`);
  }, { timeout: 30000 });
} finally { await prisma.$disconnect(); }
