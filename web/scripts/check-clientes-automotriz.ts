import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validarPropiedad } from "../src/lib/propiedades.ts";
import { validarVehiculo } from "../src/lib/vehiculos.ts";

const catalogo = await readFile(new URL("../src/lib/modulos.ts", import.meta.url), "utf8");

assert.match(catalogo, /clave: "clientes"[\s\S]*?nombre: "Clientes"/);
assert.match(catalogo, /clave: "clientes"[\s\S]*?ruta: "\/clientes"/);
assert.match(catalogo, /clave: "pacientes"[\s\S]*?ruta: "\/pacientes"/);
assert.match(catalogo, /clave: "automotriz"[\s\S]*?nombre: "Automotriz"/);
assert.match(catalogo, /clave: "automotriz"[\s\S]*?ruta: "\/automotriz"/);
assert.match(catalogo, /clave: "inmobiliaria"[\s\S]*?ruta: "\/inmobiliaria"/);
assert.ok(
  "data" in validarVehiculo({
    marca: "Toyota",
    modelo: "Corolla",
    anio: 2025,
    kilometraje: 100,
    precio: 350000,
  }),
);
assert.ok(
  "data" in validarPropiedad({
    titulo: "Casa demo",
    tipo: "Casa",
    operacion: "Venta",
    ciudad: "Monterrey",
    recamaras: 3,
    banos: 2.5,
    superficie: 180,
    precio: 4500000,
  }),
);

console.log("verticales clientes, pacientes, automotriz e inmobiliaria OK");
