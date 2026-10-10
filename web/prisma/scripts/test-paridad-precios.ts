import assert from "node:assert/strict";
import pg from "pg";
import { Prisma } from "@prisma/client";
import { construirCatalogoCaja } from "../../src/lib/caja-catalogo-db";
import { calcularLineaLocal } from "../../src/lib/caja-offline/catalogo";
import { dbRaw } from "../../src/lib/db";
import { calcularPrecios } from "../../src/lib/precios-db";
import { transaccionTenant } from "../../src/lib/retail-db";

// El servidor (calcularPrecios, con base de datos) y la caja sin internet (regla pura + catálogo)
// deben dar exactamente el mismo precio. Casos aleatorios con semilla fija para poder repetirlos.
const { Pool } = pg;
const adminUrl = process.env.ADMIN_DATABASE_URL;
if (!adminUrl) throw new Error("Define ADMIN_DATABASE_URL con el usuario dueño");
const admin = new Pool({ connectionString: adminUrl, max: 1 });
const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
const orgId = BigInt(Date.now()) * 1000n + 951n;

let semilla = Number(process.env.PARIDAD_SEMILLA ?? 20261010);
const azar = () => {
  semilla = (semilla * 1664525 + 1013904223) % 4294967296;
  return semilla / 4294967296;
};
const entero = (min: number, max: number) => min + Math.floor(azar() * (max - min + 1));
const elegir = <T,>(lista: readonly T[]) => lista[entero(0, lista.length - 1)];
const dinero = (min: number, max: number) => (entero(min * 100, max * 100) / 100).toFixed(2);

async function main() {
  await admin.query("INSERT INTO orgs (id, nombre, slug) VALUES ($1, 'Paridad de precios', $2)", [String(orgId), `paridad-${sufijo}`]);
  const categorias = ["Bebidas", "Botanas", null] as const;
  const preparado = await transaccionTenant(orgId, async (tx) => {
    const publica = await tx.listaPrecio.create({ data: { nombre: "Pública", tipo: "publico" } });
    const productos = [];
    for (let i = 0; i < 24; i++) {
      const porPeso = i % 4 === 0;
      const producto = await tx.producto.create({ data: {
        sku: `PAR-${sufijo}-${i}`, nombre: `Producto ${i}`, precio: dinero(5, 400), costo: 1, stock: 100,
        categoria: elegir(categorias), vendePorPeso: porPeso, unidad: porPeso ? "kg" : "pieza",
      } });
      productos.push(producto);
      if (azar() < 0.4) await tx.listaPrecioProducto.create({ data: { listaId: publica.id, productoId: producto.id, precio: dinero(3, 380) } });
      if (azar() < 0.5) {
        await tx.precioVolumen.create({ data: { productoId: producto.id, desde: entero(3, 6), precio: dinero(2, 300) } });
        if (azar() < 0.5) await tx.precioVolumen.create({ data: { productoId: producto.id, desde: entero(7, 15), precio: dinero(1, 250) } });
      }
    }
    const vigente = { inicia: new Date("2020-01-01T12:00:00Z"), termina: new Date("2099-12-31T12:00:00Z") };
    const pasada = { inicia: new Date("2020-01-01T12:00:00Z"), termina: new Date("2020-12-31T12:00:00Z") };
    for (const producto of productos) {
      const tipo = elegir(["porcentaje", "monto", "precio_especial", "nxm", null] as const);
      if (tipo === null) continue;
      await tx.promocion.create({ data: {
        nombre: `${tipo} ${producto.nombre}`, tipo, productoId: producto.id,
        valor: tipo === "nxm" ? null : dinero(1, tipo === "porcentaje" ? 40 : 60),
        cantidadCompra: tipo === "nxm" ? entero(2, 4) : null, cantidadPaga: tipo === "nxm" ? 1 : null,
        ...(azar() < 0.8 ? vigente : pasada),
      } });
    }
    for (const categoria of ["Bebidas", "Botanas"]) {
      await tx.promocion.create({ data: { nombre: `${categoria} 12%`, tipo: "porcentaje", categoria, valor: 12, ...vigente } });
    }
    await tx.promocion.create({ data: { nombre: "Apagada", tipo: "porcentaje", productoId: productos[1].id, valor: 90, activa: false, ...vigente } });
    return { productos };
  });

  const catalogo = await construirCatalogoCaja(orgId);
  assert.equal(catalogo.productos.length, 24);
  const porId = new Map(catalogo.productos.map((producto) => [producto.id, producto]));
  let casos = 0;
  let conPromocion = 0;
  let conVolumen = 0;
  let conLista = 0;
  for (const producto of preparado.productos) {
    for (let intento = 0; intento < 12; intento++) {
      const cantidad = producto.vendePorPeso ? (entero(1, 20000) / 1000).toFixed(3) : String(entero(1, 18));
      const servidor = (await transaccionTenant(orgId, (tx) => calcularPrecios(tx, [{ productoId: producto.id, cantidad: new Prisma.Decimal(cantidad) }])))[0];
      const local = calcularLineaLocal(catalogo, porId.get(String(producto.id))!, cantidad);
      const contexto = `${producto.nombre} x ${cantidad}`;
      assert.equal(local.precioUnitario, servidor.precioUnitario.toFixed(2), `precio unitario: ${contexto}`);
      assert.equal(local.bruto, servidor.bruto.toFixed(2), `bruto: ${contexto}`);
      assert.equal(local.descuentoPromocion, servidor.descuentoPromocion.toFixed(2), `descuento: ${contexto}`);
      assert.equal(local.total, servidor.total.toFixed(2), `total: ${contexto}`);
      assert.equal(local.promocionDescripcion, servidor.promocionDescripcion, `promoción: ${contexto}`);
      assert.equal(local.fuentePrecio, servidor.fuentePrecio, `fuente: ${contexto}`);
      casos++;
      if (servidor.descuentoPromocion.gt(0)) conPromocion++;
      if (servidor.fuentePrecio === "volumen") conVolumen++;
      if (servidor.fuentePrecio === "lista") conLista++;
    }
  }
  assert.ok(conPromocion > 20 && conVolumen > 10 && conLista > 10, "el generador debe cubrir promoción, volumen y lista");
  console.log(JSON.stringify({ casos, iguales: casos, conPromocion, conVolumen, conLista, version: catalogo.version }));
}

async function limpiar() {
  await admin.query("SET session_replication_role = replica");
  try {
    const tablas = await admin.query<{ table_name: string }>("SELECT table_name FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'org_id'");
    for (const { table_name } of tablas.rows) await admin.query(`DELETE FROM "${table_name.replaceAll('"', '""')}" WHERE org_id = $1`, [String(orgId)]);
    await admin.query("DELETE FROM orgs WHERE id = $1", [String(orgId)]);
  } finally { await admin.query("SET session_replication_role = origin"); }
}

main().catch((error) => { console.error("FALLO:", error); process.exitCode = 1; }).finally(async () => {
  await limpiar().catch(console.error);
  await Promise.all([dbRaw.$disconnect(), admin.end()]);
});
