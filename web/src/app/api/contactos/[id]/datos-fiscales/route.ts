import { NextRequest, NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { guardarDatosFiscales, obtenerDatosFiscales } from "@/lib/cfdi/servicio";
import { idDeRuta, noEncontrado, type PropsId } from "@/lib/rutas-edicion";
import { serializar } from "@/lib/serialize";

export const GET = conModulo("facturacion", {}, async (_sesion, _req, props: PropsId) => {
  const id = await idDeRuta(props);
  if (!id) return noEncontrado();
  return NextResponse.json(serializar({ datosFiscales: await obtenerDatosFiscales(id) }));
});

export const PUT = conModulo("facturacion", {}, async (sesion, req: NextRequest, props: PropsId) => {
  if (sesion.orgId === null) {
    return NextResponse.json({ error: "Organización no disponible" }, { status: 400 });
  }
  const id = await idDeRuta(props);
  if (!id) return noEncontrado();
  const body = await req.json().catch(() => ({}));
  const datosFiscales = await guardarDatosFiscales(sesion.orgId, id, body);
  return NextResponse.json(serializar({ datosFiscales }));
});
