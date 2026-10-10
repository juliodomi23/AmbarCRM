import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { parseCSV } from "@/lib/csv";
import { dinero } from "@/lib/dinero";
import { transaccionTenant } from "@/lib/retail-db";

type FilaCatalogo = {
  linea: number;
  sku: string;
  nombre: string;
  codigoBarras: string | null;
  categoria: string | null;
  precio: Prisma.Decimal;
  costo: Prisma.Decimal;
  unidad: string;
  vendePorPeso: boolean;
  activo: boolean;
  grupoSku: string | null;
  atributos: Prisma.InputJsonObject;
};

const booleano = (valor: string, defecto: boolean) => valor === "" ? defecto : ["1", "si", "sí", "true", "activo"].includes(valor.toLowerCase());

export const POST = conModulo("productos", { admin: true }, async (sesion, req: NextRequest) => {
  const { csv } = await req.json().catch(() => ({}));
  if (typeof csv !== "string" || !csv.trim()) return NextResponse.json({ error: "Falta el CSV" }, { status: 400 });
  if (csv.length > 5_000_000) return NextResponse.json({ error: "El CSV pesa más de 5 MB" }, { status: 413 });
  const filas = parseCSV(csv).filter((fila) => fila.some((campo) => campo.trim()));
  if (filas.length < 2 || filas.length > 10_001) return NextResponse.json({ error: "El CSV debe tener entre 1 y 10,000 productos" }, { status: 400 });
  const encabezados = filas[0].map((campo) => campo.trim().toLowerCase());
  const indice = (nombres: string[]) => encabezados.findIndex((campo) => nombres.includes(campo));
  const idx = {
    sku: indice(["sku"]), nombre: indice(["nombre", "name"]), codigo: indice(["codigo_barras", "código_barras", "codigo"]),
    categoria: indice(["categoria", "categoría"]), precio: indice(["precio"]), costo: indice(["costo"]), unidad: indice(["unidad"]),
    peso: indice(["vende_por_peso", "por_peso"]), activo: indice(["activo"]), grupo: indice(["grupo_sku", "producto_padre_sku"]), atributos: indice(["atributos", "atributos_json"]),
  };
  if (idx.sku < 0 || idx.nombre < 0 || idx.precio < 0) return NextResponse.json({ error: "El CSV requiere sku, nombre y precio" }, { status: 400 });
  const errores: Array<{ linea: number; campo: string; mensaje: string }> = [];
  const datos: FilaCatalogo[] = [];
  const vistos = new Set<string>();
  const codigos = new Set<string>();
  for (const [posicion, fila] of filas.slice(1).entries()) {
    const linea = posicion + 2;
    const valor = (i: number) => i < 0 ? "" : (fila[i] ?? "").trim();
    const sku = valor(idx.sku).toUpperCase();
    const nombre = valor(idx.nombre);
    const precioNumero = dinero(valor(idx.precio));
    const costoNumero = dinero(valor(idx.costo) || "0");
    const codigoBarras = valor(idx.codigo) || null;
    if (!sku || sku.length > 100) errores.push({ linea, campo: "sku", mensaje: "SKU obligatorio (máximo 100 caracteres)" });
    if (vistos.has(sku)) errores.push({ linea, campo: "sku", mensaje: "SKU duplicado dentro del archivo" });
    vistos.add(sku);
    if (!nombre || nombre.length > 240) errores.push({ linea, campo: "nombre", mensaje: "Nombre obligatorio (máximo 240 caracteres)" });
    if (precioNumero === null) errores.push({ linea, campo: "precio", mensaje: "El precio debe ser mayor o igual a 0 y tener máximo 2 decimales" });
    if (costoNumero === null) errores.push({ linea, campo: "costo", mensaje: "El costo debe ser mayor o igual a 0 y tener máximo 2 decimales" });
    if (codigoBarras && codigos.has(codigoBarras)) errores.push({ linea, campo: "codigo_barras", mensaje: "Código duplicado dentro del archivo" });
    if (codigoBarras) codigos.add(codigoBarras);
    let atributos: Prisma.InputJsonObject = {};
    try {
      const bruto = valor(idx.atributos);
      const objeto = bruto ? JSON.parse(bruto) : {};
      if (!objeto || typeof objeto !== "object" || Array.isArray(objeto)) throw new Error();
      atributos = objeto;
    } catch { errores.push({ linea, campo: "atributos", mensaje: "Debe ser un objeto JSON" }); }
    if (sku && nombre && precioNumero !== null && costoNumero !== null) datos.push({
      linea, sku, nombre, codigoBarras, categoria: valor(idx.categoria) || null,
      precio: new Prisma.Decimal(String(precioNumero)), costo: new Prisma.Decimal(String(costoNumero)), unidad: valor(idx.unidad) || "pieza",
      vendePorPeso: booleano(valor(idx.peso), false), activo: booleano(valor(idx.activo), true), grupoSku: valor(idx.grupo).toUpperCase() || null, atributos,
    });
  }
  if (errores.length) return NextResponse.json({ error: "Hay errores en el CSV", errores }, { status: 400 });

  const resultado = await transaccionTenant(sesion.orgId!, async (tx) => {
    const existentesCodigo = codigos.size ? await tx.producto.findMany({ where: { codigoBarras: { in: [...codigos] } }, select: { sku: true, codigoBarras: true } }) : [];
    for (const existente of existentesCodigo) {
      const fila = datos.find((dato) => dato.codigoBarras === existente.codigoBarras);
      if (fila && existente.sku !== fila.sku) errores.push({ linea: fila.linea, campo: "codigo_barras", mensaje: "Ya pertenece a otro producto de la empresa" });
    }
    if (errores.length) return { creados: 0, actualizados: 0, errores };
    const existentes = new Set((await tx.producto.findMany({ where: { sku: { in: datos.map((dato) => dato.sku) } }, select: { sku: true } })).flatMap((producto) => producto.sku ? [producto.sku] : []));
    const productos = new Map<string, bigint>();
    for (const dato of datos) {
      const producto = await tx.producto.upsert({
        where: { orgId_sku: { orgId: sesion.orgId!, sku: dato.sku } },
        create: { sku: dato.sku, nombre: dato.nombre, codigoBarras: dato.codigoBarras, categoria: dato.categoria, precio: dato.precio, costo: dato.costo, unidad: dato.unidad, vendePorPeso: dato.vendePorPeso, activo: dato.activo, atributos: dato.atributos },
        update: { nombre: dato.nombre, codigoBarras: dato.codigoBarras, categoria: dato.categoria, precio: dato.precio, costo: dato.costo, unidad: dato.unidad, vendePorPeso: dato.vendePorPeso, activo: dato.activo, atributos: dato.atributos },
      });
      productos.set(dato.sku, producto.id);
    }
    const gruposExternos = await tx.producto.findMany({ where: { sku: { in: datos.flatMap((dato) => dato.grupoSku ? [dato.grupoSku] : []) } }, select: { id: true, sku: true } });
    for (const grupo of gruposExternos) if (grupo.sku) productos.set(grupo.sku, grupo.id);
    for (const dato of datos) {
      const grupoId = dato.grupoSku ? productos.get(dato.grupoSku) : undefined;
      if (dato.grupoSku && !grupoId) errores.push({ linea: dato.linea, campo: "grupo_sku", mensaje: "No existe el producto padre" });
      if (grupoId === productos.get(dato.sku)) errores.push({ linea: dato.linea, campo: "grupo_sku", mensaje: "Un producto no puede ser su propio padre" });
    }
    if (errores.length) throw new Error(JSON.stringify(errores));
    for (const dato of datos) await tx.producto.update({ where: { id: productos.get(dato.sku)! }, data: { grupoId: dato.grupoSku ? productos.get(dato.grupoSku)! : null } });
    return { creados: datos.filter((dato) => !existentes.has(dato.sku)).length, actualizados: datos.filter((dato) => existentes.has(dato.sku)).length, errores: [] };
  }).catch((error) => {
    try { return { creados: 0, actualizados: 0, errores: JSON.parse(error instanceof Error ? error.message : "[]") as typeof errores }; }
    catch { throw error; }
  });
  if (resultado.errores.length) return NextResponse.json({ error: "Hay errores en el CSV", errores: resultado.errores }, { status: 400 });
  return NextResponse.json({ ok: true, creados: resultado.creados, actualizados: resultado.actualizados });
});
