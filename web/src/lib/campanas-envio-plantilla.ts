import type { ChannelProvider } from "@/lib/channel/types";

export async function comprobarPlantillaParaLanzar(provider: ChannelProvider, nombre: string, idioma: string) {
  const consulta = await provider.consultarPlantillas!();
  if (!consulta.ok) {
    if (consulta.motivo === "no_disponible") return Response.json({ error: "Meta no está disponible; vuelve a intentar en unos minutos" }, { status: 503 });
    return Response.json({ error: consulta.motivo === "sin_waba" ? "El canal de Meta no tiene WABA configurado" : "Meta rechazó la consulta de plantillas; revisa la credencial del canal" }, { status: 400 });
  }
  if (!consulta.plantillas.some((p) => p.name === nombre && p.language === idioma && p.status === "APPROVED")) return Response.json({ error: "La plantilla ya no está aprobada" }, { status: 400 });
  return null;
}
