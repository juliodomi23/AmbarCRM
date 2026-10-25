import { redirect } from "next/navigation";
import { VentasCliente } from "@/components/retail/VentasCliente";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";
import { serializar } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export default async function VentasPage() {
  if (!(await moduloActivo("ventas"))) redirect("/");
  const pagosActivos = await moduloActivo("pagos_en_linea");
  const [ventasBase, productos, contactos, pagos] = await Promise.all([
    db.venta.findMany({
      include: {
        contacto: { select: { id: true, nombre: true, telefono: true } },
        creadoPor: { select: { id: true, nombre: true } },
        partidas: {
          include: {
            producto: {
              select: { id: true, nombre: true, sku: true, unidad: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.producto.findMany({
      where: { activo: true },
      orderBy: { nombre: "asc" },
    }),
    db.contacto.findMany({
      select: { id: true, nombre: true, telefono: true },
      orderBy: { nombre: "asc" },
      take: 250,
    }),
    pagosActivos
      ? db.pagoOnline.findMany({ orderBy: { createdAt: "desc" }, take: 500 })
      : Promise.resolve([]),
  ]);
  const pagoPorVenta = new Map(
    pagos
      .filter((pago) => pago.origenTipo === "venta")
      .map((pago) => [String(pago.origenId), pago]),
  );
  const ventas = ventasBase.map((venta) => ({
    ...venta,
    pagoOnline: pagoPorVenta.get(String(venta.id)) ?? null,
  }));
  return (
    <VentasCliente
      ventas={serializar(ventas)}
      productos={serializar(productos)}
      contactos={serializar(contactos)}
      pagosActivos={pagosActivos}
    />
  );
}
