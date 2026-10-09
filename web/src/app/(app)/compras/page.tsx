import { redirect } from "next/navigation";
import { ComprasCliente } from "@/components/retail/ComprasCliente";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";
import { serializar } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export default async function ComprasPage() {
  if (!(await moduloActivo("compras"))) redirect("/");
  const [compras, productos, proveedores] = await Promise.all([
    db.compra.findMany({
      include: {
        proveedor: true,
        creadoPor: { select: { id: true, nombre: true } },
        partidas: {
          include: { producto: { select: { id: true, nombre: true, sku: true, unidad: true } } },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.producto.findMany({ where: { activo: true }, orderBy: { nombre: "asc" } }),
    db.proveedor.findMany({ orderBy: [{ activo: "desc" }, { nombre: "asc" }] }),
  ]);
  return (
    <ComprasCliente
      compras={serializar(compras)}
      productos={serializar(productos)}
      proveedores={serializar(proveedores)}
    />
  );
}
