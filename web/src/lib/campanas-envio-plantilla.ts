import type { ChannelProvider, PlantillaOficial } from "@/lib/channel/types";
import { variablesDePlantilla } from "@/lib/meta/plantillaMeta";

export const estadosPlantillaElegibles = ["APPROVED", "PENDING", "IN_APPEAL"];
export const estadosPlantillaEnRevision = ["PENDING", "IN_APPEAL"];

export function incluyeAvisoBaja(texto: string) {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().includes("BAJA");
}

export function cantidadVariablesPlantilla(plantilla: PlantillaOficial) {
  const cuerpo = plantilla.components?.find((componente) => (componente as { type?: string }).type?.toUpperCase() === "BODY") as { text?: string } | undefined;
  return variablesDePlantilla(cuerpo?.text ?? "").length;
}

export function motivoPlantillaNoDisponible(plantilla: PlantillaOficial | undefined) {
  if (!plantilla) return "La plantilla ya no existe en Meta";
  const motivo = plantilla.rejectedReason ? `: ${plantilla.rejectedReason}` : ` (${plantilla.status ?? "sin estado"})`;
  return `Meta rechazó la plantilla${motivo}`;
}

export async function evaluarPlantillaParaLanzar(provider: ChannelProvider, nombre: string, idioma: string) {
  const consulta = await provider.consultarPlantillas!();
  if (!consulta.ok) {
    const bloqueo = consulta.motivo === "no_disponible"
      ? Response.json({ error: "Meta no está disponible; vuelve a intentar en unos minutos" }, { status: 503 })
      : Response.json({ error: consulta.motivo === "sin_waba" ? "El canal de Meta no tiene WABA configurado" : "Meta rechazó la consulta de plantillas; revisa la credencial del canal" }, { status: 400 });
    return { bloqueo, plantilla: null };
  }
  const plantilla = consulta.plantillas.find((item) => item.name === nombre && item.language === idioma);
  if (!plantilla || !plantilla.status || !estadosPlantillaElegibles.includes(plantilla.status))
    return { bloqueo: Response.json({ error: motivoPlantillaNoDisponible(plantilla) }, { status: 400 }), plantilla: null };
  return { bloqueo: null, plantilla };
}

export async function comprobarPlantillaParaLanzar(provider: ChannelProvider, nombre: string, idioma: string) {
  return (await evaluarPlantillaParaLanzar(provider, nombre, idioma)).bloqueo;
}
