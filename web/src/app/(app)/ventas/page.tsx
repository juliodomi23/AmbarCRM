import { redirect } from "next/navigation";
import { VentasCliente } from "@/components/retail/VentasCliente";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";
import { serializar } from "@/lib/serialize";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { puedeReembolsar } from "@/lib/pagos/servicio";

export const dynamic = "force-dynamic";

export default async function VentasPage() {
  if (!(await moduloActivo("ventas"))) redirect("/");
  const pagosActivos = await moduloActivo("pagos_en_linea");
  const [ventasBase, productos, contactos, sesion] = await Promise.all([
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
    getServerSession(authOptions),
  ]);
  const pagos = pagosActivos && ventasBase.length
    ? await db.pagoOnline.findMany({
        where: { origenTipo: "venta", origenId: { in: ventasBase.map((venta) => venta.id) } },
        orderBy: { createdAt: "desc" },
      })
    : [];
  const pagoPorVenta = new Map<string, (typeof pagos)[number]>();
  for (const pago of pagos) {
    const clave = String(pago.origenId);
    const actual = pagoPorVenta.get(clave);
    if (!actual || (pago.estado === "pendiente" && actual.estado !== "pendiente"))
      pagoPorVenta.set(clave, pago);
  }
  const ventas = ventasBase.map((venta) => ({
    ...venta,
    pagoOnline: pagoPorVenta.get(String(venta.id)) ?? null,
  }));
  const permisoReembolso = sesion?.user?.orgId
    ? puedeReembolsar({
        orgId: BigInt(sesion.user.orgId),
        userId: null,
        rol: sesion.user.rol,
        puesto: sesion.user.puesto,
      })
    : false;
  return (
    <VentasCliente
      ventas={serializar(ventas)}
      productos={serializar(productos)}
      contactos={serializar(contactos)}
      pagosActivos={pagosActivos}
      puedeReembolsar={permisoReembolso}
    />
  );
}
