import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { Prisma } from "@prisma/client";
import { cargosCierre, configPanelAR, elegibleMRR, fechaAR, hoyAR, mensualidadDelMes, mesSiguiente, repartirComisiones, validarContrato, vencimientoMes } from "../src/lib/contratos-cobros.ts";
import { puestoPuedeAcceder } from "../src/lib/modulos-catalogo.ts";

const decimal = (valor: string) => new Prisma.Decimal(valor);
const base = { estado: "produccion", mensualidad: decimal("1200"), inicioMensualidad: null, diaCobro: 5, fechaBaja: null };
assert.equal(elegibleMRR(base, fechaAR("2026-10-13")!), true);
assert.equal(elegibleMRR({ ...base, inicioMensualidad: fechaAR("2026-11-01") }, fechaAR("2026-10-31")!), false);
assert.equal(elegibleMRR({ ...base, estado: "baja" }, fechaAR("2026-10-13")!), false);
assert.equal(elegibleMRR({ ...base, estado: null }, fechaAR("2026-10-13")!), false);
assert.equal(elegibleMRR({ ...base, mensualidad: null }, fechaAR("2026-10-13")!), false);
assert.equal(elegibleMRR({ ...base, fechaBaja: fechaAR("2026-10-13") }, fechaAR("2026-10-13")!), false);
assert.equal(mensualidadDelMes({ ...base, diaCobro: null }, fechaAR("2026-11-01")!), null);
assert.equal(mensualidadDelMes({ ...base, inicioMensualidad: fechaAR("2026-11-06") }, fechaAR("2026-11-01")!), null);
assert.equal(mensualidadDelMes({ ...base, inicioMensualidad: fechaAR("2026-11-05") }, fechaAR("2026-11-01")!)?.monto.toFixed(2), "1200.00");
for (const anio of [2024, 2025, 2026]) for (const dia of [29, 30, 31]) {
  assert.equal(vencimientoMes(fechaAR(`${anio}-02-01`)!, dia).toISOString().slice(0, 10), `${anio}-02-28`);
}
assert.equal(mesSiguiente("2026-12-31").toISOString().slice(0, 10), "2027-01-01");
assert.equal(hoyAR(new Date("2026-10-14T03:00:00Z")), "2026-10-13");
assert.throws(() => fechaAR("2026-02-30"));
assert.throws(() => validarContrato({ contactoId: "1", tipo: "web", diaCobro: 29 }));
assert.throws(() => validarContrato({ contactoId: "1", tipo: "web", montoCierre: "1.001" }));
assert.throws(() => validarContrato({ contactoId: "1", tipo: "web", anticipoPct: "100.01" }));
assert.deepEqual(cargosCierre(decimal("100.01"), decimal("50")).map((cargo) => cargo.monto.toFixed(2)), ["50.01", "50.00"]);
assert.equal(cargosCierre(decimal("12000"), null).length, 0, "un anticipo sin confirmar no genera deuda inventada");
const reparto = repartirComisiones([
  { id: 1n, contactoId: 1n, concepto: "mensualidad", monto: decimal("1200"), periodo: fechaAR("2026-10-01") },
  { id: 2n, contactoId: 1n, concepto: "mensualidad", monto: decimal("800"), periodo: fechaAR("2026-10-01") },
  { id: 3n, contactoId: 2n, concepto: "anticipo", monto: decimal("100.01"), periodo: null },
], configPanelAR({}));
assert.equal(reparto[0].creditoIA.plus(reparto[1].creditoIA).toFixed(2), "100.00");
assert.equal(reparto[0].cto.plus(reparto[1].cto).toFixed(2), "950.00");
assert.equal(reparto[0].ceo.plus(reparto[1].ceo).toFixed(2), "950.00");
assert.equal(reparto[2].cto.toFixed(2), "70.01");
assert.equal(reparto[2].ceo.toFixed(2), "30.00");
const bajos = repartirComisiones([
  { id: 1n, contactoId: 1n, concepto: "mensualidad", monto: decimal("40"), periodo: fechaAR("2026-10-01") },
  { id: 2n, contactoId: 1n, concepto: "mensualidad", monto: decimal("80"), periodo: fechaAR("2026-10-01") },
], configPanelAR({}));
assert.equal(bajos[0].creditoIA.plus(bajos[1].creditoIA).toString(), "100");
assert.equal(bajos[0].cto.plus(bajos[1].cto).toString(), "10");
const extra = repartirComisiones([{ id: 1n, contactoId: 1n, concepto: "extra", monto: decimal("100"), periodo: null }], configPanelAR({}))[0];
assert.equal(extra.pendiente, true, "no suponer una regla de comisiones para extras");
assert.equal(extra.cto.plus(extra.ceo).toString(), "0");
assert.throws(() => configPanelAR({ proyectoCtoPct: "" }), RangeError);
assert.throws(() => configPanelAR({ credito_ia_mxn: "" }), RangeError);
for (const clave of ["contratos", "cobros", "panel_ar"] as const) {
  assert.equal(puestoPuedeAcceder(clave, {}, "Agente", "agente"), false);
  assert.equal(puestoPuedeAcceder(clave, {}, "Administrador", "admin"), true);
}
const cron = await readFile(new URL("../src/app/api/cron/generar-cobros/route.ts", import.meta.url), "utf8");
const seed = await readFile(new URL("./seed-ambar-rojo.mjs", import.meta.url), "utf8");
assert.doesNotMatch(cron + seed, /recordarCobro|enviarTexto|enviarPlantilla/);
assert.match(seed, /recordatoriosAutomaticos: false/);
const sql = await readFile(new URL("../prisma/sql/actualizaciones.sql", import.meta.url), "utf8");
assert.match(sql, /WHEN clave IN \('contratos', 'cobros', 'panel_ar'\) THEN\s+'\["Administrador"\]'::jsonb/, "reaplicar SQL debe conservar el acceso solo de Administrador para AR");
assert.match(seed, /puestosPermitidos: \["Administrador"\]/);
console.log("contratos/cobros: MRR, inicio/baja, febrero 29–31 → 28, cargos exactos, IA una vez por cliente, permisos y cero envíos automáticos OK");
