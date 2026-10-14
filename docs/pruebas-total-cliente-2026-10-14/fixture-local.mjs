import assert from "node:assert/strict";
import bcrypt from "../../web/node_modules/bcryptjs/index.js";
import { PrismaClient } from "../../web/node_modules/@prisma/client/default.js";

const url = new URL(process.env.DATABASE_URL);
assert.equal(url.hostname, "127.0.0.1");
assert.equal(url.port, "55453");
assert.equal(url.pathname, "/crm");
assert.equal(url.username, "crm_app");
const prisma = new PrismaClient();
async function completarEmbudo(tx) {
  const embudo = await tx.embudo.findFirst({ where: { nombre: "Comercial Ámbar Rojo" } }) ?? await tx.embudo.create({ data: { nombre: "Comercial Ámbar Rojo" } });
  for (const [orden, nombre] of ["Prospecto", "Contactado", "Cotizado", "Negociación", "Ganado", "Perdido"].entries()) {
    if (!await tx.etapa.findFirst({ where: { embudoId: embudo.id, nombre } })) await tx.etapa.create({ data: { embudoId: embudo.id, nombre, orden, tipo: nombre === "Ganado" ? "ganado" : nombre === "Perdido" ? "perdido" : "normal" } });
  }
}
try {
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT set_config('app.current_org', '1', true)`;
    if (process.argv.includes("--completar-embudo")) {
      await completarEmbudo(tx);
      console.log("Fixture local completado: Comercial Ámbar Rojo y seis etapas para el E2E existente de baja de contrato.");
      return;
    }
    assert.equal(await tx.contacto.count(), 0, "Fixture solo para una BD nueva");
    await tx.usuario.create({ data: { nombre: "Admin fixture", email: "admin@ambar-rojo.local.test", passwordHash: await bcrypt.hash("AR-Prueba-2026", 10), rol: "admin", puesto: "Administrador" } });
    await tx.ajustes.upsert({ where: { orgId: 1n }, update: {}, create: { marcaNombre: "Ámbar Rojo · pruebas", nombreNegocio: "Pruebas locales" } });
    // Solo los mínimos que exige la batería existente. No ejecuta ni modifica seeds.
    await tx.moduloOrg.createMany({ data: ["contratos", "cobros", "panel_ar", "servidores"].map(clave => ({ clave, activo: true, config: { puestosPermitidos: ["Administrador"], recordatoriosAutomaticos: false } })) });
    const cliente = await tx.contacto.create({ data: { nombre: "Villafuerte y Asociados", optOutDifusion: true } });
    const contrato = await tx.contrato.create({ data: { contactoId: cliente.id, tipo: "web", estado: "produccion", mensualidad: "4400", diaCobro: 5 } });
    await tx.cobro.create({ data: { contratoId: contrato.id, concepto: "balance", monto: "6500", estado: "pagado", nota: "Fixture pagado sin fecha histórica" } });
    await completarEmbudo(tx);
    console.log("Fixture local mínimo: org 1/ambar-rojo, admin de pruebas, MRR 4400 y balance pagado sin fecha. Sin servidores, seeds ni envíos.");
  });
} finally { await prisma.$disconnect(); }
