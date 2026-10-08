import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  validarAsesoriaLegal,
  validarExpedienteLegal,
  validarMovimientoLegal,
  validarRegistroLegal,
} from "../src/lib/legal.ts";

const catalogo = await readFile(new URL("../src/lib/modulos.ts", import.meta.url), "utf8");
const sql = await readFile(new URL("../prisma/sql/actualizaciones.sql", import.meta.url), "utf8");

for (const [clave, ruta] of [
  ["legal", "/legal"],
  ["asesorias_legales", "/asesorias-legales"],
  ["finanzas_legales", "/finanzas-legales"],
  ["operacion_legal", "/operacion-legal"],
]) {
  assert.match(catalogo, new RegExp(`clave: "${clave}"[\\s\\S]*?ruta: "${ruta}"`));
}
for (const tabla of [
  "sucursales_legales",
  "expedientes_legales",
  "registros_expediente_legal",
  "asesorias_legales",
  "movimientos_legales",
  "registros_operacion_legal",
]) {
  assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${tabla}`));
}
assert.ok("data" in validarExpedienteLegal({ numeroInterno: "EXP-1", estado: "activo" }));
assert.ok("error" in validarExpedienteLegal({ estado: "desconocido" }));
assert.ok("data" in validarRegistroLegal({ tipo: "audiencia", titulo: "Audiencia inicial" }));
assert.ok("data" in validarAsesoriaLegal({ tema: "Consulta mercantil" }));
assert.ok("data" in validarMovimientoLegal({ tipo: "pago", concepto: "Anticipo", monto: 5000 }));
assert.ok("error" in validarMovimientoLegal({ tipo: "pago", concepto: "", monto: "x" }));

console.log("legal: módulos, validadores y SQL OK");
