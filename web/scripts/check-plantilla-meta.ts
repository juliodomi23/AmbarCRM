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

// Botones
import { componenteBotones, errorDeBotones, leerBotones } from "../src/lib/meta/plantillaMeta.ts";
const botones = leerBotones([
  { tipo: "URL", texto: "Ver menú", url: "https://ambar.mx/menu" },
  { tipo: "QUICK_REPLY", texto: "Sí, confirmo" },
  { tipo: "HACK", texto: "x" }
]);
assert.equal(botones.length, 2);
assert.equal(errorDeBotones(botones), null);
assert.equal(componenteBotones(botones)!.buttons[0].type, "QUICK_REPLY");
assert.match(errorDeBotones(leerBotones([{ tipo: "URL", texto: "Ir", url: "http://x.com" }]))!, /https/);
assert.match(errorDeBotones(leerBotones([{ tipo: "PHONE_NUMBER", texto: "Llamar", telefono: "9611234567" }]))!, /lada/);
assert.equal(errorDeBotones(leerBotones([{ tipo: "PHONE_NUMBER", texto: "Llamar", telefono: "+52 961 123 4567" }])), null);
assert.match(errorDeBotones(leerBotones([{ tipo: "QUICK_REPLY", texto: "x".repeat(26) }]))!, /25/);

// Ventana de 24 h y errores
import { estadoVentana } from "../src/lib/meta/ventana.ts";
import { motivoDeError, motivoDeErrorMeta } from "../src/lib/meta/errores.ts";
const ahora = new Date("2026-10-07T12:00:00Z");
assert.equal(estadoVentana("2026-10-07T00:00:00Z", ahora).abierta, true);
assert.equal(estadoVentana("2026-10-06T11:59:00Z", ahora).abierta, false);
assert.equal(estadoVentana(null, ahora).abierta, false);
assert.match(motivoDeError(131047), /24 h/);
assert.match(motivoDeErrorMeta({ code: 999, error_data: { details: "algo raro" } }), /999.*algo raro/);
console.log("botones, ventana y errores OK");
