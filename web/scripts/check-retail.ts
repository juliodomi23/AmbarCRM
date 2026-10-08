import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  compraUsaInventario,
  estadoUsaInventario,
  validarCompra,
  validarMovimiento,
  validarProducto,
  validarProveedor,
  validarVenta,
} from "../src/lib/retail.ts";

const catalogo = await readFile(new URL("../src/lib/modulos.ts", import.meta.url), "utf8");
const sql = await readFile(
  new URL("../prisma/sql/actualizaciones.sql", import.meta.url),
  "utf8",
);
const retailDb = await readFile(new URL("../src/lib/retail-db.ts", import.meta.url), "utf8");

assert.match(catalogo, /clave: "productos"[\s\S]*?ruta: "\/productos"/);
assert.match(catalogo, /clave: "compras"[\s\S]*?ruta: "\/compras"/);
assert.match(catalogo, /clave: "ventas"[\s\S]*?ruta: "\/ventas"/);
assert.match(sql, /CREATE TABLE IF NOT EXISTS productos/);
assert.match(sql, /CREATE TABLE IF NOT EXISTS ventas/);
assert.match(sql, /CREATE TABLE IF NOT EXISTS proveedores/);
assert.match(sql, /CREATE TABLE IF NOT EXISTS compras/);
assert.match(sql, /CREATE TABLE IF NOT EXISTS movimientos_inventario/);

assert.ok(
  "data" in validarProducto({
    nombre: "Producto demo",
    precio: 250,
    costo: 100,
    stock: 8,
    stockMinimo: 2,
  }),
);
assert.ok("error" in validarProducto({ nombre: "", precio: -1 }));
assert.deepEqual(validarMovimiento({ tipo: "entrada", cantidad: 4, motivo: "Compra" }), {
  tipo: "entrada",
  cantidad: 4,
  motivo: "Compra",
});
assert.ok("error" in validarMovimiento({ tipo: "salida", cantidad: 0 }));
assert.ok("data" in validarProveedor({ nombre: "Proveedor demo", email: "hola@demo.test" }));
assert.ok(
  "data" in validarCompra({
    proveedorId: "1",
    estado: "recibida",
    partidas: [{ productoId: "1", cantidad: 5, costoUnitario: 80 }],
  }),
);
assert.ok(
  "data" in validarVenta({
    estado: "pagada",
    canal: "mostrador",
    metodoPago: "tarjeta",
    partidas: [{ productoId: "1", cantidad: 2 }],
  }),
);
assert.equal(estadoUsaInventario("pendiente"), true);
assert.equal(estadoUsaInventario("cancelada"), false);
assert.equal(estadoUsaInventario("borrador"), false);
assert.equal(compraUsaInventario("recibida"), true);
assert.equal(compraUsaInventario("ordenada"), false);
assert.match(retailDb, /FROM productos[\s\S]*?FOR UPDATE/);
assert.match(retailDb, /FROM ventas[\s\S]*?FOR UPDATE/);
assert.match(retailDb, /FROM compras[\s\S]*?FOR UPDATE/);

console.log("retail: productos, inventario, compras, proveedores, ventas y pedidos OK");
