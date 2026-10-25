import { NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { exigirTimbrarCancelar } from "@/lib/cfdi/permisos";
import { timbrarFactura } from "@/lib/cfdi/servicio";
import { idDeRuta, noEncontrado, type PropsId } from "@/lib/rutas-edicion";
import { serializar } from "@/lib/serialize";

export const POST = conModulo("facturacion", {}, async (sesion, _req, props: PropsId) => {
  if (sesion.orgId === null) {
    return NextResponse.json({ error: "Organización no disponible" }, { status: 400 });
  }
  exigirTimbrarCancelar(sesion);
  const id = await idDeRuta(props);
  if (!id) return noEncontrado();
  const factura = await timbrarFactura(sesion.orgId, id);
  return NextResponse.json(serializar({ factura }));
});
