import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { puestosParaModulos, validarPuesto } from "../src/lib/puestos";

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
const usuariosApi = await readFile(
  new URL("../src/app/api/usuarios/route.ts", import.meta.url),
  "utf8",
);
const usuariosUi = await readFile(
  new URL("../src/components/config/tabs/TabUsuarios.tsx", import.meta.url),
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
assert.deepEqual(validarPuesto("  coordinador   CLÍNICO "), { valor: "Coordinador clínico" });
assert.deepEqual(validarPuesto("Arqueólogo"), { valor: "Arqueólogo" });
assert.ok("error" in validarPuesto("x".repeat(61)));
assert.ok("error" in validarPuesto("Doctor\u0000"));
assert.ok(puestosParaModulos(["pacientes"]).includes("Doctor"));
assert.ok(!puestosParaModulos(["ventas"]).includes("Doctor"));
assert.match(usuariosApi, /validarPuesto/);
assert.match(usuariosUi, /Otro…/);
assert.match(usuariosUi, /Los cambios de puesto pueden tardar hasta 5 minutos/);
assert.match(usuariosUi, /modulosAccesibles/);

console.log("permisos por puesto: sesión, configuración y servidor OK");
