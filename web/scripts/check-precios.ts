import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const rutas = [
  "src/lib/caja-db.ts",
  "src/lib/caja-a2-db.ts",
  "src/lib/cotizaciones-db.ts",
  "src/lib/pedidos-db.ts",
  "src/app/api/ventas/route.ts",
  "src/app/api/public/tienda/[slug]/route.ts",
];
const contenidos = await Promise.all(rutas.map((ruta) => readFile(ruta, "utf8")));
for (const [indice, contenido] of contenidos.entries()) {
  assert.match(contenido, /calcularPrecios/, `${rutas[indice]} debe usar el motor único`);
}
const motor = await readFile("src/lib/precios-db.ts", "utf8");
assert.match(motor, /fechaLocal/);
assert.match(motor, /precioVolumen/);
assert.match(motor, /listaPrecio/);
assert.match(motor, /promocion/);
console.log(JSON.stringify({ motorUnico: true, caminos: rutas, vigenciaLocal: true }));
