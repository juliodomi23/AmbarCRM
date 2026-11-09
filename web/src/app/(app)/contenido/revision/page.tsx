import { redirect } from "next/navigation";
import { moduloActivo } from "@/lib/modulos";
import { serializar } from "@/lib/serialize";
import { getSesion } from "@/lib/session";
import { datosContenido, hoyMexico } from "@/lib/contenido-datos";
import { ContenidoNavegacion } from "@/components/contenido/ContenidoNavegacion";
import { ContenidoPanel } from "@/components/contenido/ContenidoPanel";

export const dynamic = "force-dynamic";

export default async function ContenidoRevisionPage() {
  if (!(await moduloActivo("contenido"))) redirect("/");
  const [{ piezas, usuarios, campanas, contactos }, sesion] = await Promise.all([datosContenido(), getSesion()]);
  const pendientes = piezas.filter((pieza) => ["revision", "cambios"].includes(pieza.estado)).length;
  return (
    <div className="space-y-5">
      <ContenidoNavegacion actual="revision" titulo="Por revisar" descripcion="Piezas esperando aprobación o con cambios solicitados." pendientes={pendientes} />
      <ContenidoPanel vista="revision" iniciales={serializar(piezas)} usuarios={serializar(usuarios)} campanas={serializar(campanas)} contactos={serializar(contactos)} usuarioId={sesion?.user?.id ?? null} puesto={sesion?.user?.puesto ?? "Agente"} rol={sesion?.user?.rol ?? "agente"} semanaInicial={hoyMexico()} />
    </div>
  );
}
