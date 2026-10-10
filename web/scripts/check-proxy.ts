import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// El matcher del proxy excluye rutas por prefijo: "cotizacion" también dejaría fuera la página
// interna /cotizaciones. Las públicas se excluyen con su barra (/cotizacion/<token>).
const fuente = await readFile("src/proxy.ts", "utf8");
const patron = /matcher:\s*\["([^"]+)"\]/.exec(fuente)?.[1];
assert.ok(patron, "no se encontró el matcher");
// Next.js interpreta "/((?!...).*)" como una expresión anclada.
const regla = new RegExp(`^${patron.replace(/^\//, "/")}$`);
const protegida = (ruta: string) => regla.test(ruta);

for (const ruta of ["/cotizaciones", "/cotizaciones/nueva", "/reservas-en-linea", "/reservas-tours", "/resenas", "/pedidos-en-linea", "/ventas", "/caja", "/api/cotizaciones", "/api/productos"]) {
  assert.equal(protegida(ruta), true, `${ruta} debe pasar por el middleware de sesión`);
}
for (const ruta of ["/cotizacion/abc123", "/opinion/mi-negocio", "/tienda/mi-negocio", "/tienda/pedido/tok", "/reservar/mi-negocio", "/reservar/cita/tok", "/api/public/tienda/x", "/api/v1/accounts/1", "/login", "/api/auth/session"]) {
  assert.equal(protegida(ruta), false, `${ruta} es pública (valida su propio token)`);
}
console.log("proxy: rutas públicas con barra, /cotizaciones y demás internas protegidas OK");
