import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { dbRaw } from "../../src/lib/db";
import { transaccionTenant } from "../../src/lib/retail-db";
import { cobradoRegistrado, resumenCobrosCliente } from "../../src/lib/cobros-resumen-db";
import { LIMITE_PANEL } from "../../src/lib/paginacion";

const url = new URL(process.env.DATABASE_URL!);
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname), "Solo BD local desechable");
assert.equal(url.username, "crm_app");
const [rol] = await dbRaw.$queryRaw<Array<{ rolsuper: boolean; rolbypassrls: boolean }>>`
  SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user
`;
assert.deepEqual(rol, { rolsuper: false, rolbypassrls: false });
const org = await dbRaw.org.create({ data: { nombre: "Total cliente DB", slug: `total-cliente-db-${Date.now()}` } });
const ajena = await dbRaw.org.create({ data: { nombre: "Total cliente aislamiento", slug: `total-cliente-ajena-${Date.now()}` } });

function abono(monto: string, pagadoEn: string) {
  return { clave: `prueba-${monto}`, monto, pagadoEn, metodo: "transferencia", referencia: null };
}

try {
  const fixture = await transaccionTenant(org.id, async tx => {
    const contacto = await tx.contacto.create({ data: { nombre: "Cliente con dos contratos" } });
    const a = await tx.contrato.create({ data: { contactoId: contacto.id, tipo: "web" } });
    const b = await tx.contrato.create({ data: { contactoId: contacto.id, tipo: "bot_whatsapp" } });
    await tx.cobro.createMany({ data: [
      { contratoId: a.id, concepto: "mensualidad", periodo: new Date("2026-03-01"), estado: "pagado", monto: "1200.10", montoPagado: "1200.10", pagadoEn: new Date("2026-03-15T18:00:00Z"), pagos: [abono("600", "2026-03-01T18:00:00Z"), abono("600.10", "2026-03-15T18:00:00Z")] },
      { contratoId: b.id, concepto: "mensualidad", periodo: new Date("2026-02-01"), estado: "pagado", monto: "500.20", pagos: [] },
      { contratoId: b.id, concepto: "extra", estado: "vencido", monto: "200", montoPagado: "50.05", pagos: [abono("50.05", "2026-04-01T18:00:00Z")] },
      { contratoId: b.id, concepto: "extra", estado: "pendiente", monto: "300" },
      { contratoId: a.id, concepto: "extra", estado: "cancelado", monto: "900", montoPagado: "900", pagadoEn: new Date("2020-01-01"), pagos: [abono("900", "2020-01-01T18:00:00Z")] },
      { contratoId: b.id, concepto: "extra", estado: "incobrable", monto: "500", montoPagado: "25", pagadoEn: new Date("2019-01-01"), pagos: [abono("25", "2019-01-01T18:00:00Z")] },
    ] });
    return { contacto, a, b };
  });
  const resumen = await resumenCobrosCliente(org.id, fixture.contacto.id, fixture.a.id);
  assert.ok(resumen.totalCobrado instanceof Prisma.Decimal);
  assert.equal(resumen.totalCobrado.toFixed(2), "1750.35", "suma ambos contratos, histórico y abono parcial; excluye cancelado/incobrable/pendiente sin abonos");
  assert.equal(resumen.cobradoContrato.toFixed(2), "1200.10");
  assert.equal(resumen.contratos, 2);
  assert.equal(resumen.porCobrar.toFixed(2), "449.95");
  assert.equal(resumen.mensualidadesPagadas, 2);
  assert.equal(resumen.clienteDesde?.toISOString(), "2026-03-01T18:00:00.000Z", "primer abono, no fecha del último pago ni de cobros excluidos");
  const kpi = await transaccionTenant(org.id, tx => cobradoRegistrado(tx));
  const kpiCliente = await transaccionTenant(org.id, tx => cobradoRegistrado(tx, { contrato: { contactoId: fixture.contacto.id } }));
  assert.ok(resumen.totalCobrado.eq(kpi) && resumen.totalCobrado.eq(kpiCliente), "paridad con la función del KPI de /cobros");
  assert.equal((await resumenCobrosCliente(org.id, fixture.contacto.id, fixture.b.id)).cobradoContrato.toFixed(2), "550.25");
  await transaccionTenant(org.id, tx => tx.cobro.createMany({ data: Array.from({ length: LIMITE_PANEL + 1 }, () => ({ contratoId: fixture.a.id, concepto: "extra", monto: "0.01", estado: "pagado", pagos: [] })) }));
  assert.equal((await resumenCobrosCliente(org.id, fixture.contacto.id, fixture.a.id)).totalCobrado.toFixed(2), "1752.36", "agregado completo más allá de LIMITE_PANEL");
  await transaccionTenant(org.id, tx => tx.cobro.updateMany({ where: { contratoId: fixture.b.id, concepto: "mensualidad" }, data: { pagadoEn: new Date("2026-01-01T18:00:00Z") } }));
  assert.equal((await resumenCobrosCliente(org.id, fixture.contacto.id, fixture.a.id)).clienteDesde?.toISOString(), "2026-01-01T18:00:00.000Z", "incluye fecha histórica sin abonos");

  const sinPagos = await transaccionTenant(org.id, async tx => {
    const contacto = await tx.contacto.create({ data: { nombre: "Sin pagos" } });
    const contrato = await tx.contrato.create({ data: { contactoId: contacto.id, tipo: "otro" } });
    return { contacto, contrato };
  });
  const vacio = await resumenCobrosCliente(org.id, sinPagos.contacto.id, sinPagos.contrato.id);
  assert.equal(vacio.totalCobrado.toFixed(2), "0.00");
  assert.equal(vacio.porCobrar.toFixed(2), "0.00");
  assert.equal(vacio.mensualidadesPagadas, 0);
  assert.equal(vacio.clienteDesde, null);
  assert.equal(vacio.contratos, 1);
  await transaccionTenant(org.id, tx => tx.cobro.create({ data: { contratoId: sinPagos.contrato.id, concepto: "extra", estado: "pagado", monto: "7.70", pagos: [] } }));
  const sinFechas = await resumenCobrosCliente(org.id, sinPagos.contacto.id, sinPagos.contrato.id);
  assert.equal(sinFechas.totalCobrado.toFixed(2), "7.70");
  assert.equal(sinFechas.clienteDesde, null, "sin fechas no se inventa antigüedad");
  const aislado = await resumenCobrosCliente(ajena.id, fixture.contacto.id, fixture.a.id);
  assert.equal(aislado.totalCobrado.toFixed(2), "0.00");
  assert.equal(aislado.contratos, 0);
  assert.equal(aislado.clienteDesde, null);
  console.log("Total cliente DB OK: dos contratos, estados excluidos con abonos, pendiente sin pago, histórico sin abonos, parcial exacto, paridad KPI /cobros, saldo, primer abono/fecha histórica, mensualidades, más de LIMITE_PANEL, sin pagos/sin fechas y aislamiento RLS crm_app sin BYPASSRLS.");
} finally {
  await transaccionTenant(org.id, async tx => {
    await tx.cobro.deleteMany();
    await tx.contrato.deleteMany();
    await tx.contacto.deleteMany();
  });
  await dbRaw.org.deleteMany({ where: { id: { in: [org.id, ajena.id] } } });
  await dbRaw.$disconnect();
}
