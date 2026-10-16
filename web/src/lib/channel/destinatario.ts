import type { ChannelProvider, ContextoEnvio, ProveedorCanal } from "./types";

export function destinatarioDelCanal(
  proveedor: ProveedorCanal,
  contacto: { telefono: string | null; identificadorExterno?: string | null },
) {
  return proveedor === "cloud_api" ? contacto.telefono : contacto.identificadorExterno;
}

export async function responderTexto(
  provider: ChannelProvider,
  contacto: { telefono: string | null; identificadorExterno?: string | null },
  texto: string,
  contexto?: ContextoEnvio,
) {
  const destinatario = destinatarioDelCanal(provider.nombre, contacto);
  if (!destinatario) return { ok: false, error: "el contacto no tiene destinatario para este canal" };
  return provider.enviarTexto(destinatario, texto, contexto);
}
