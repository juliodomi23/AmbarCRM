import assert from "node:assert/strict";
import { almacenMemoria, claveIdentidad } from "../src/lib/caja-offline/almacen";
import { calcularLineaLocal, leerCatalogoLocal, sincronizarCatalogo } from "../src/lib/caja-offline/catalogo";
import type { CatalogoCaja } from "../src/lib/caja-offline/tipos";

const identidadA = { orgId: "1", userId: "10" };
const identidadB = { orgId: "1", userId: "11" };
const catalogo: CatalogoCaja = {
  version: "v1", generadoAt: new Date().toISOString(), zona: "America/Mexico_City", descuentoMaximo: 10, ventasSinRed: true,
  productos: [
    { id: "5", nombre: "Pieza", sku: "P", codigoBarras: null, categoria: "Bebidas", unidad: "pieza", vendePorPeso: false, stock: "3", precio: "100", precioLista: null, escalas: [{ desde: "10", precio: "90" }] },
    { id: "6", nombre: "Granel", sku: "G", codigoBarras: null, categoria: null, unidad: "kg", vendePorPeso: true, stock: "2", precio: "32", precioLista: "30", escalas: [] },
  ],
  promociones: [
    { id: "1", productoId: "5", categoria: null, tipo: "nxm", nombre: "3x2", valor: null, cantidadCompra: 3, cantidadPaga: 2, inicia: "2020-01-01", termina: "2099-12-31" },
    { id: "2", productoId: null, categoria: "Bebidas", tipo: "porcentaje", nombre: "10% bebidas", valor: "10", cantidadCompra: null, cantidadPaga: null, inicia: "2020-01-01", termina: "2099-12-31" },
  ],
};
const respuesta = (estado: number, cuerpo: unknown) => async () => new Response(JSON.stringify(cuerpo), { status: estado });
const buenaA = respuesta(200, { identidad: identidadA, sinTopeDescuento: false, catalogo });

// Con red: guarda por identidad.
const almacen = almacenMemoria();
const primera = await sincronizarCatalogo(almacen, identidadA, buenaA as typeof fetch);
assert.equal(primera.estado, "actualizado");
assert.equal((await leerCatalogoLocal(almacen, identidadA))?.catalogo.version, "v1");
assert.equal(await leerCatalogoLocal(almacen, identidadB), undefined, "otra persona no ve el catálogo");

// Sin red: usa el último guardado.
const sinRed = (async () => { throw new TypeError("Failed to fetch"); }) as typeof fetch;
assert.equal((await sincronizarCatalogo(almacen, identidadA, sinRed)).estado, "local");
assert.equal((await sincronizarCatalogo(almacen, identidadB, sinRed)).estado, "sin_catalogo");

// Error 500 del servidor: conserva el local, no lo borra.
assert.equal((await sincronizarCatalogo(almacen, identidadA, respuesta(500, {}) as typeof fetch)).estado, "local");

// Identidad que no coincide con la sesión: no se guarda (otra persona respondió).
const ajena = await sincronizarCatalogo(almacenMemoria(), identidadB, buenaA as typeof fetch);
assert.equal(ajena.estado, "sin_catalogo");

// Modo apagado (403): se borra el catálogo local.
assert.equal((await sincronizarCatalogo(almacen, identidadA, respuesta(403, { codigo: "SIN_RED_APAGADO" }) as typeof fetch)).estado, "apagado");
assert.equal(await leerCatalogoLocal(almacen, identidadA), undefined);

// Almacén: prefijos por identidad en orden.
const memoria = almacenMemoria();
await memoria.guardar("cola", `${claveIdentidad(identidadA)}:b`, { n: 2 });
await memoria.guardar("cola", `${claveIdentidad(identidadA)}:a`, { n: 1 });
await memoria.guardar("cola", `${claveIdentidad(identidadB)}:a`, { n: 9 });
assert.deepEqual(await memoria.listar("cola", `${claveIdentidad(identidadA)}:`), [{ n: 1 }, { n: 2 }]);

// Cálculo local: 3x2 y 10% de bebidas (gana la de mayor descuento), escala de volumen, lista pública.
const ahora = new Date("2026-10-10T18:00:00Z");
const [pieza, granel] = catalogo.productos;
assert.deepEqual(
  (({ precioUnitario, bruto, descuentoPromocion, total, promocionDescripcion }) => ({ precioUnitario, bruto, descuentoPromocion, total, promocionDescripcion }))(calcularLineaLocal(catalogo, pieza, "3", ahora)),
  { precioUnitario: "100.00", bruto: "300.00", descuentoPromocion: "100.00", total: "200.00", promocionDescripcion: "3x2" },
);
assert.equal(calcularLineaLocal(catalogo, pieza, "1", ahora).total, "90.00");
assert.equal(calcularLineaLocal(catalogo, pieza, "10", ahora).fuentePrecio, "volumen");
assert.equal(calcularLineaLocal(catalogo, granel, "0.75", ahora).total, "22.50");

console.log("caja offline: catálogo por identidad, sin red, 403 apagado, identidad ajena y cálculo local OK");
