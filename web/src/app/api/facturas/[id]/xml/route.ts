import { conModulo } from "@/lib/con-modulo";
import { descargarFactura } from "@/lib/cfdi/servicio";
import { idDeRuta, noEncontrado, type PropsId } from "@/lib/rutas-edicion";

export const GET = conModulo("facturacion", {}, async (sesion, _req, props: PropsId) => {
  if (sesion.orgId === null) return new Response("Organización no disponible", { status: 400 });
  const id = await idDeRuta(props);
  if (!id) return noEncontrado();
  const archivo = await descargarFactura(sesion.orgId, id, "xml");
  return new Response(archivo.contenido as BodyInit, {
    headers: {
      "Content-Type": archivo.tipoContenido,
      "Content-Disposition": `attachment; filename="${archivo.nombre}"`,
      "Cache-Control": "no-store",
    },
  });
});
