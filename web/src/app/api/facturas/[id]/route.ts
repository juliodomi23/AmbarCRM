import { NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { obtenerFactura } from "@/lib/cfdi/servicio";
import { idDeRuta, noEncontrado, type PropsId } from "@/lib/rutas-edicion";
import { serializar } from "@/lib/serialize";

export const GET = conModulo("facturacion", {}, async (_sesion, _req, props: PropsId) => {
  const id = await idDeRuta(props);
  if (!id) return noEncontrado();
  const factura = await obtenerFactura(id);
  if (!factura) return noEncontrado();
  return NextResponse.json(serializar({ factura }));
});
