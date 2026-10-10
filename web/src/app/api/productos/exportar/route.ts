import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { respuestaCSV, toCSV } from "@/lib/csv";

export const GET = conModulo("productos", { admin: true }, async () => {
  const productos = await db.producto.findMany({ include: { grupo: { select: { sku: true } } }, orderBy: { nombre: "asc" } });
  return respuestaCSV(toCSV(
    ["sku", "nombre", "codigo_barras", "categoria", "precio", "costo", "unidad", "vende_por_peso", "activo", "grupo_sku", "atributos"],
    productos.map((producto) => [producto.sku, producto.nombre, producto.codigoBarras, producto.categoria, producto.precio.toFixed(2), producto.costo.toFixed(2), producto.unidad, producto.vendePorPeso ? "sí" : "no", producto.activo ? "sí" : "no", producto.grupo?.sku, JSON.stringify(producto.atributos)]),
  ), `catalogo_${new Date().toISOString().slice(0, 10)}.csv`);
});
