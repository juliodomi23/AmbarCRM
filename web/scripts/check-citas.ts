import assert from "node:assert/strict";
import { recordatorioDebeEnviarse } from "../src/lib/citas.ts";
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
console.log("citas OK");
