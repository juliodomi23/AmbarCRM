import assert from "node:assert/strict";
import {
  horasAnticipacion,
  rangoRecordatorio,
  recordatorioDebeEnviarse,
  valoresRecordatorio,
} from "../src/lib/citas.ts";
const ahora = new Date("2026-10-06T12:00:00Z");
assert.equal(
  recordatorioDebeEnviarse(new Date("2026-10-07T11:00:00Z"), 24, ahora),
  true,
);
assert.equal(
  recordatorioDebeEnviarse(new Date("2026-10-08T12:01:00Z"), 24, ahora),
  false,
);
assert.equal(
  recordatorioDebeEnviarse(new Date("2026-10-06T11:00:00Z"), 24, ahora),
  false,
);
assert.deepEqual(
  valoresRecordatorio(["titulo_cita", "nombre_contacto"], {
    nombreContacto: "Ana",
    inicio: ahora,
    titulo: "Valoración",
    nombreNegocio: "Clínica",
  }),
  ["Valoración", "Ana"],
);
// El cron filtra por fecha en la consulta: solo citas futuras dentro de la anticipación.
assert.equal(horasAnticipacion(undefined), 24);
assert.equal(horasAnticipacion("abc"), 24);
assert.equal(horasAnticipacion(0), 24);
assert.equal(horasAnticipacion(1000), 168);
assert.deepEqual(rangoRecordatorio(24, ahora), {
  gt: ahora,
  lte: new Date("2026-10-07T12:00:00Z"),
});
console.log("citas OK");
