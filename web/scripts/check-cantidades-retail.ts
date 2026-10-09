import assert from "node:assert/strict";
import { cantidad, cantidadValidaParaProducto } from "../src/lib/cantidad.ts";
import { validarCompra, validarProducto, validarVenta } from "../src/lib/retail.ts";

const piezaFraccionaria = cantidad("1.5");
assert.ok(piezaFraccionaria);
assert.equal(
  cantidadValidaParaProducto(piezaFraccionaria, false),
  false,
  "una pieza con cantidad 1.5 debe rechazarse con 400 en la ruta",
);

const kilos = cantidad("1.234");
assert.ok(kilos);
assert.equal(cantidadValidaParaProducto(kilos, true), true);
assert.equal(cantidad("1.2345"), null, "más de tres decimales debe rechazarse con 400");

assert.ok("data" in validarProducto({
  nombre: "Manzana a granel",
  precio: "32.00",
  costo: "20.00",
  stock: "2.000",
  stockMinimo: "0.250",
  unidad: "kg",
  vendePorPeso: true,
}));
assert.ok("error" in validarProducto({
  nombre: "Taza",
  precio: "100.00",
  stock: "1.5",
  unidad: "pieza",
  vendePorPeso: false,
}));
assert.ok("data" in validarVenta({
  partidas: [{ productoId: "1", cantidad: "1.234" }],
}));
assert.ok("error" in validarVenta({
  partidas: [{ productoId: "1", cantidad: "1.2345" }],
}));
assert.ok("data" in validarCompra({
  proveedorId: "1",
  partidas: [{ productoId: "1", cantidad: "1.234", costoUnitario: "20.00" }],
}));

console.log("cantidades retail: pieza 1.5 rechazada; 1.234 kg aceptado; 1.2345 rechazado");
