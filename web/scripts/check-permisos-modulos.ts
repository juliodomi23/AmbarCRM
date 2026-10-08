import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const modulos = await readFile(new URL("../src/lib/modulos.ts", import.meta.url), "utf8");
const auth = await readFile(new URL("../src/lib/auth.ts", import.meta.url), "utf8");
const apiModulos = await readFile(
  new URL("../src/app/api/modulos/route.ts", import.meta.url),
  "utf8",
);
const expediente = await readFile(
  new URL("../src/app/api/contactos/[id]/expediente/route.ts", import.meta.url),
  "utf8",
);
const legal = await readFile(
  new URL("../src/app/api/legal/expedientes/route.ts", import.meta.url),
  "utf8",
);

assert.match(modulos, /acceso: ACCESO_CLINICO/);
assert.match(modulos, /acceso: ACCESO_LEGAL/);
assert.match(modulos, /puestosPermitidosModulo/);
assert.match(modulos, /puestoPuedeAcceder/);
assert.match(auth, /token\.puesto/);
assert.match(auth, /puesto: u\.puesto/);
assert.match(apiModulos, /puestosPermitidos/);
assert.match(expediente, /requireModuloActivo\(modulo\)/);
assert.match(legal, /responsableId: sesion\.userId/);

console.log("permisos por puesto: sesión, configuración y servidor OK");
