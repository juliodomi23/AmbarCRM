// Uso: node --experimental-strip-types scripts/check-plantilla-meta.ts
import assert from "node:assert/strict";
import { errorDePlantilla, variablesDePlantilla } from "../src/lib/meta/plantillaMeta.ts";

assert.deepEqual(variablesDePlantilla("Hola {{1}}, tu cita es el {{2}} a las {{2}}"), [1, 2]);
assert.equal(errorDePlantilla("Hola, gracias por escribirnos", []), null);
assert.equal(errorDePlantilla("Hola {{1}}, tu cita es el {{2}}. Te esperamos", ["Ana", "lunes"]), null);
assert.match(errorDePlantilla("Hola {{1}}, tu cita es el {{2}}.", ["Ana", "lunes"])!, /terminar/);
assert.match(errorDePlantilla("{{1}}, tu cita está lista", ["Ana"])!, /empezar/);
assert.match(errorDePlantilla("Hola {{1}} y {{3}} gracias", ["a", "b"])!, /orden/);
assert.match(errorDePlantilla("Hola {{1}}, tu cita es el {{2}} gracias", ["Ana"])!, /ejemplo/);
assert.match(errorDePlantilla("Hola {{1}}, gracias", ["  "])!, /ejemplo/);
console.log("plantillaMeta OK");
