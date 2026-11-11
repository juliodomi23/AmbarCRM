import { redirect } from "next/navigation";
import { moduloActivo } from "@/lib/modulos";
import { serializar } from "@/lib/serialize";
import { getSesion } from "@/lib/session";
import { datosContenido, hoyMexico } from "@/lib/contenido-datos";
import { ContenidoNavegacion } from "@/components/contenido/ContenidoNavegacion";
import { ContenidoPanel } from "@/components/contenido/ContenidoPanel";

export const dynamic = "force-dynamic";

export default async function ContenidoSemanaPage() {
  if (!(await moduloActivo("contenido"))) redirect("/");
  const [{ piezas, usuarios, campanas, contactos }, sesion] = await Promise.all([datosContenido(), getSesion()]);
  const pendientes = piezas.filter((pieza) => ["revision", "cambios"].includes(pieza.estado)).length;
  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 p-4 md:p-6 lg:p-8">
      <ContenidoNavegacion actual="semana" titulo="Semana de contenido" descripcion="Qué se publica cada día y en qué canal." pendientes={pendientes} />
      <ContenidoPanel vista="semana" iniciales={serializar(piezas)} usuarios={serializar(usuarios)} campanas={serializar(campanas)} contactos={serializar(contactos)} usuarioId={sesion?.user?.id ?? null} puesto={sesion?.user?.puesto ?? "Agente"} rol={sesion?.user?.rol ?? "agente"} semanaInicial={hoyMexico()} />
    </div>
  );
}
