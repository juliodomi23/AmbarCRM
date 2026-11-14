import { redirect } from "next/navigation";
import { moduloActivo } from "@/lib/modulos";
import { serializar } from "@/lib/serialize";
import { getSesion } from "@/lib/session";
import { datosContenido, hoyMexico } from "@/lib/contenido-datos";
import { ContenidoNavegacion } from "@/components/contenido/ContenidoNavegacion";
import { ContenidoPanel } from "@/components/contenido/ContenidoPanel";

export const dynamic = "force-dynamic";

export default async function ContenidoTableroPage() {
  if (!(await moduloActivo("contenido"))) redirect("/");
  const sesion = await getSesion();
  const { piezas, usuarios, campanas, contactos } = await datosContenido(sesion?.user);
  const pendientes = piezas.filter((pieza) => ["revision", "cambios"].includes(pieza.estado)).length;
  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 p-4 md:p-6 lg:p-8">
      <ContenidoNavegacion actual="tablero" titulo="Tablero editorial" descripcion="Todas las piezas agrupadas por etapa del flujo." pendientes={pendientes} />
      <ContenidoPanel vista="tablero" iniciales={serializar(piezas)} usuarios={serializar(usuarios)} campanas={serializar(campanas)} contactos={serializar(contactos)} usuarioId={sesion?.user?.id ?? null} puesto={sesion?.user?.puesto ?? "Agente"} rol={sesion?.user?.rol ?? "agente"} semanaInicial={hoyMexico()} />
    </div>
  );
}
