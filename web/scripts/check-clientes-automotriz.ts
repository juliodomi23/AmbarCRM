import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const catalogo = await readFile(new URL("../src/lib/modulos.ts", import.meta.url), "utf8");

assert.match(catalogo, /clave: "clientes"[\s\S]*?nombre: "Clientes"/);
assert.match(catalogo, /clave: "clientes"[\s\S]*?ruta: "\/clientes"/);
assert.match(catalogo, /clave: "automotriz"[\s\S]*?nombre: "Automotriz"/);
assert.match(catalogo, /clave: "automotriz"[\s\S]*?ruta: "\/automotriz"/);

console.log("clientes y automotriz OK");
