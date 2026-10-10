import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { codificarCode128B, svgCode128 } from "../src/lib/code128";
import { toCSV } from "../src/lib/csv";

assert.equal(codificarCode128B("ABC123").checksum, 67);
assert.equal(codificarCode128B("123456").checksum, 16);
const svg = svgCode128("ABC123");
assert.match(svg, /^<svg/);
assert.match(svg, /<rect/);
assert.match(svg, /ABC123/);

const csv = toCSV(["nombre"], [["=SUM(1,1)"]]);
assert.match(csv, /'=SUM\(1,1\)/, "la exportación debe neutralizar fórmulas");
const negativos = toCSV(["n"], [[-12.5], ["-3.00"], ["-5"], ["-x"], ["-1+2"], ["+5"], ["@a"]]).split("\n").slice(1);
assert.deepEqual(negativos, ["-12.5", "-3.00", "-5", "'-x", "'-1+2", "'+5", "'@a"], "los números negativos quedan como número; el resto sigue neutralizado");

const [schema, migracion, importador, lote] = await Promise.all([
  readFile("prisma/schema.prisma", "utf8"),
  readFile("prisma/sql/actualizaciones.sql", "utf8"),
  readFile("src/app/api/productos/importar/route.ts", "utf8"),
  readFile("src/app/api/productos/lote/route.ts", "utf8"),
]);
assert.match(schema, /grupoId\s+BigInt\?/);
assert.match(schema, /atributos\s+Json/);
assert.match(migracion, /grupo_id/);
assert.match(migracion, /atributos JSONB/);
assert.doesNotMatch(importador, /\bstock\s*:/, "la importación no debe escribir existencia");
assert.doesNotMatch(lote, /\bstock\s*:/, "el lote no debe escribir existencia");

console.log(JSON.stringify({
  code128: { ABC123: 67, "123456": 16, svg: true },
  csv: { formulasNeutralizadas: true, importacionSinExistencia: true },
  variantes: { grupoId: true, atributosJsonb: true },
}));
