import { redirect } from "next/navigation";
import { svgCode128 } from "@/lib/code128";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";
import estilos from "./etiquetas.module.css";

export const dynamic = "force-dynamic";

export default async function EtiquetasProductosPage() {
  if (!(await moduloActivo("productos"))) redirect("/");
  const productos = await db.producto.findMany({
    where: { activo: true, OR: [{ codigoBarras: { not: null } }, { sku: { not: null } }] },
    include: { preciosVolumen: { orderBy: { desde: "asc" }, take: 1 } },
    orderBy: { nombre: "asc" },
  });
  return <main className="space-y-4 p-4 md:p-6">
    <header className={estilos.controles}><div><h1 className="text-2xl font-bold">Etiquetas de precio</h1><p className="text-sm text-muted-foreground">Code 128 en SVG, precio público y primera escala de mayoreo.</p></div><span className="rounded-lg bg-primary px-4 py-2 text-primary-foreground">Usa Ctrl+P para imprimir</span></header>
    <section className={estilos.hoja}>{productos.map((producto) => {
      const codigo = producto.codigoBarras ?? producto.sku!;
      let svg: string;
      try { svg = svgCode128(codigo, { modulo: 1, alto: 42 }); } catch { return null; }
      const mayoreo = producto.preciosVolumen[0];
      return <article className={estilos.etiqueta} key={String(producto.id)}>
        <strong>{producto.nombre}</strong><span className={estilos.precio}>${producto.precio.toFixed(2)}</span>
        {mayoreo && <small>Mayoreo {mayoreo.desde.toString()}+: ${mayoreo.precio.toFixed(2)}</small>}
        <div className={estilos.codigo} dangerouslySetInnerHTML={{ __html: svg }} />
      </article>;
    })}</section>
  </main>;
}
