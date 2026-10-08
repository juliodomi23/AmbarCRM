import { redirect } from "next/navigation";
import { ProductosCliente } from "@/components/retail/ProductosCliente";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";
import { serializar } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export default async function ProductosPage() {
  if (!(await moduloActivo("productos"))) redirect("/");
  const productos = await db.producto.findMany({
    include: {
      movimientos: {
        include: { usuario: { select: { nombre: true } } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: [{ activo: "desc" }, { nombre: "asc" }],
  });
  return <ProductosCliente productos={serializar(productos)} />;
}
