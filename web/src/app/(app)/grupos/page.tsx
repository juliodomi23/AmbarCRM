import { listarGrupos } from "@/lib/services/grupos";
import { serializar } from "@/lib/serialize";
import { GruposCliente } from "@/components/grupos/GruposCliente";

export const dynamic = "force-dynamic";

export default async function GruposPage() {
  const grupos = serializar(await listarGrupos()).map((g: any) => ({
    id: g.id,
    nombre: g.nombre,
    noLeidos: g.noLeidos,
    ultimoMensajeAt: g.ultimoMensajeAt,
    preview: g.mensajes[0]?.contenido ?? (g.mensajes[0] ? "[archivo]" : "")
  }));
  return <GruposCliente gruposIniciales={grupos} />;
}
