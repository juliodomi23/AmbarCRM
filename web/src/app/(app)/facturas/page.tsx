import { redirect } from "next/navigation";
import { FacturasCliente } from "@/components/facturacion/FacturasCliente";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";
import { puedeTimbrarCancelar } from "@/lib/cfdi/permisos";
import { getSesion } from "@/lib/session";
import { serializar } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export default async function FacturasPage({
  searchParams,
}: {
  searchParams: Promise<{ ventaId?: string }>;
}) {
  if (!(await moduloActivo("facturacion"))) redirect("/");
  const [facturas, ventas, emisor, sesion] = await Promise.all([
    db.factura.findMany({
      orderBy: { id: "desc" },
      take: 100,
      select: {
        id: true,
        serie: true,
        folio: true,
        uuid: true,
        estado: true,
        total: true,
        moneda: true,
        usoCfdi: true,
        formaPago: true,
        metodoPago: true,
        createdAt: true,
        timbrandoAt: true,
        timbradaAt: true,
        canceladaAt: true,
        error: true,
        proveedor: true,
        contacto: { select: { id: true, nombre: true } },
        venta: { select: { id: true, folio: true } },
        pago: { select: { id: true, referenciaExterna: true } },
        conceptos: { select: { id: true } },
      },
    }),
    db.venta.findMany({
      where: {
        estado: { not: "cancelada" },
        total: { gt: 0 },
        facturas: { none: { estado: { in: ["borrador", "timbrando", "timbrada"] } } },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        contacto: {
          select: {
            id: true,
            nombre: true,
            datosFiscales: {
              select: {
                rfc: true,
                razonSocial: true,
                regimenFiscal: true,
                codigoPostal: true,
                usoCfdi: true,
                correo: true,
              },
            },
          },
        },
      },
    }),
    db.datosEmisor.findFirst(),
    getSesion(),
  ]);

  return (
    <FacturasCliente
      facturas={serializar(facturas)}
      ventas={serializar(ventas)}
      emisor={serializar(emisor)}
      ventaIdInicial={(await searchParams).ventaId ?? ""}
      puedeTimbrar={puedeTimbrarCancelar({
        rol: sesion?.user.rol,
        puesto: sesion?.user.puesto,
      })}
      puedeConfigurarEmisor={sesion?.user.rol === "admin"}
    />
  );
}
