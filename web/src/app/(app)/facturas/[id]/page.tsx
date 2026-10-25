import { notFound, redirect } from "next/navigation";
import { FacturaDetalle } from "@/components/facturacion/FacturaDetalle";
import { db } from "@/lib/db";
import { aBigInt } from "@/lib/ids";
import { moduloActivo } from "@/lib/modulos";
import { puedeTimbrarCancelar } from "@/lib/cfdi/permisos";
import { obtenerFactura } from "@/lib/cfdi/servicio";
import { getSesion } from "@/lib/session";
import { serializar } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export default async function FacturaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await moduloActivo("facturacion"))) redirect("/");
  const id = aBigInt((await params).id);
  if (id === null) notFound();
  const factura = await obtenerFactura(id);
  if (!factura) notFound();
  const historica = factura.estado === "timbrada" || factura.estado === "cancelada";
  const [eventos, datosFiscales, emisor, sesion] = await Promise.all([
    db.eventoFactura.findMany({
      where: { facturaId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
    !historica && factura.contactoId
      ? db.datosFiscales.findFirst({ where: { contactoId: factura.contactoId, activo: true } })
      : Promise.resolve(null),
    !historica ? db.datosEmisor.findFirst() : Promise.resolve(null),
    getSesion(),
  ]);
  const puedeOperar = puedeTimbrarCancelar({
    rol: sesion?.user.rol,
    puesto: sesion?.user.puesto,
  });
  const vista = {
    ...factura,
    eventos,
    receptorRfc: factura.receptorRfc ?? datosFiscales?.rfc ?? null,
    receptorRazonSocial: factura.receptorRazonSocial ?? datosFiscales?.razonSocial ?? null,
    receptorRegimenFiscal: factura.receptorRegimenFiscal ?? datosFiscales?.regimenFiscal ?? null,
    receptorCodigoPostal: factura.receptorCodigoPostal ?? datosFiscales?.codigoPostal ?? null,
    receptorUsoCfdi: factura.receptorUsoCfdi ?? datosFiscales?.usoCfdi ?? null,
    receptorCorreo: factura.receptorCorreo ?? datosFiscales?.correo ?? null,
    emisorRfc: factura.emisorRfc ?? emisor?.rfc ?? null,
    emisorRazonSocial: factura.emisorRazonSocial ?? emisor?.razonSocial ?? null,
    emisorRegimenFiscal: factura.emisorRegimenFiscal ?? emisor?.regimenFiscal ?? null,
    emisorCodigoPostal: factura.emisorCodigoPostal ?? emisor?.codigoPostal ?? null,
  };
  return <FacturaDetalle factura={serializar(vista)} puedeOperar={puedeOperar} />;
}
