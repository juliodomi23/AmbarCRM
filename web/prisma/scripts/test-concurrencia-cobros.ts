import assert from "node:assert/strict";
import pg from "pg";
import { dbRaw } from "../../src/lib/db";
import { transaccionTenant } from "../../src/lib/retail-db";
import { cambiarCobro, generarCobros } from "../../src/lib/cobros-db";
import { fechaAR, mensualidadDelMes, mesSiguiente } from "../../src/lib/contratos-cobros";

const adminUrl = process.env.ADMIN_DATABASE_URL;
if (!adminUrl) throw new Error("Define ADMIN_DATABASE_URL de una BD de prueba");
const admin = new pg.Pool({ connectionString: adminUrl });
const orgId = BigInt(Date.now()) * 1000n + 871n;
const sin = process.env.COBROS_SIN_PROTECCION === "1";
const pausa = () => new Promise((resolve) => setTimeout(resolve, 150));

try {
  await admin.query("INSERT INTO orgs (id,nombre,slug) VALUES ($1,'Prueba cobros',$2)", [String(orgId), `cobros-${orgId}`]);
  const base = await transaccionTenant(orgId, async (tx) => {
    await tx.moduloOrg.create({ data: { clave: "cobros", activo: true } });
    const contacto = await tx.contacto.create({ data: { nombre: "Prueba" } });
    const contrato = await tx.contrato.create({ data: { contactoId: contacto.id, tipo: "web", estado: "produccion", mensualidad: "1200", diaCobro: 5 } });
    const cobro = await tx.cobro.create({ data: { contratoId: contrato.id, concepto: "extra", monto: "100" } });
    return { contrato, cobro };
  });
  async function pagar() {
    if (!sin) return cambiarCobro(orgId, base.cobro.id, { metodo: "transferencia" }, true);
    return transaccionTenant(orgId, async (tx) => {
      const cobro = await tx.cobro.findFirstOrThrow({ where: { id: base.cobro.id } });
      if (cobro.estado === "pagado") return { repetido: true };
      await pausa();
      await tx.cobro.update({ where: { id: cobro.id }, data: { estado: "pagado", metodo: "transferencia", pagadoEn: new Date() } });
      return { repetido: false };
    });
  }
  const pagos = await Promise.all([pagar(), pagar()]);
  const pagosAplicados = pagos.filter((pago) => !pago.repetido).length;
  async function cron() {
    if (!sin) return generarCobros(orgId, "2026-10-13");
    return transaccionTenant(orgId, async (tx) => {
      const periodo = mesSiguiente("2026-10-13");
      const existe = await tx.cobro.findFirst({ where: { contratoId: base.contrato.id, concepto: "mensualidad", periodo } });
      if (existe) return { generados: 0 };
      await pausa();
      const cargo = mensualidadDelMes(base.contrato, periodo)!;
      await tx.cobro.create({ data: { ...cargo, contratoId: base.contrato.id } });
      return { generados: 1 };
    });
  }
  // Quitar solo la restricción en esta BD desechable para probar también su contribución.
  if (sin) {
    const url = new URL(adminUrl);
    if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.port !== "55453") throw new Error("La variante sin protección solo admite localhost:55453");
    await admin.query("ALTER TABLE cobros DROP CONSTRAINT cobros_contrato_id_concepto_periodo_key");
  }
  const crons = await Promise.all([cron(), cron()]);
  const mensualidades = await transaccionTenant(orgId, (tx) => tx.cobro.count({ where: { contratoId: base.contrato.id, concepto: "mensualidad", periodo: fechaAR("2026-11-01") } }));
  console.log(JSON.stringify({ modo: sin ? "SIN_PROTECCION" : "CON_PROTECCION", pagosAplicados, mensualidades, creadosPorCron: crons.map((resultado) => resultado.generados) }));
  assert.equal(pagosAplicados, 1, "un solo pago debe aplicarse");
  assert.equal(mensualidades, 1, "no debe duplicarse la mensualidad");
} finally {
  await admin.query("DELETE FROM cobros WHERE org_id=$1", [String(orgId)]);
  await admin.query("DELETE FROM contratos WHERE org_id=$1", [String(orgId)]);
  await admin.query("DELETE FROM contactos WHERE org_id=$1", [String(orgId)]);
  await admin.query("DELETE FROM modulos_org WHERE org_id=$1", [String(orgId)]);
  await admin.query("DELETE FROM orgs WHERE id=$1", [String(orgId)]);
  if (sin) await admin.query("ALTER TABLE cobros ADD CONSTRAINT cobros_contrato_id_concepto_periodo_key UNIQUE (contrato_id,concepto,periodo)");
  await Promise.all([admin.end(), dbRaw.$disconnect()]);
}
