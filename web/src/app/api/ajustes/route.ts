import { NextRequest, NextResponse } from "next/server";
import { requireSesion } from "@/lib/session";
import { actualizarAjustes } from "@/lib/services/config";
import { BRAND_PRESETS, esColorHex } from "@/lib/brand";

export const dynamic = "force-dynamic";

/** Edita las automatizaciones. Body: { autoAsignar?, bienvenidaActiva?, bienvenidaTexto? } */
export async function PATCH(req: NextRequest) {
  const s = await requireSesion(true);
  if ("error" in s) return s.error;

  const body = await req.json().catch(() => ({}));
  if (body.marcaNombre !== undefined && (typeof body.marcaNombre !== "string" || body.marcaNombre.trim().length > 80))
    return NextResponse.json({ error: "El nombre de marca no es válido" }, { status: 400 });
  if (body.marcaPreset !== undefined && !(typeof body.marcaPreset === "string" && body.marcaPreset in BRAND_PRESETS))
    return NextResponse.json({ error: "El preset de marca no es válido" }, { status: 400 });
  for (const campo of ["marcaColorPrimario", "marcaColorAcento"])
    if (body[campo] !== undefined && !esColorHex(body[campo]))
      return NextResponse.json({ error: "Los colores deben usar formato hexadecimal" }, { status: 400 });
  if (body.marcaLogo !== undefined) {
    const logo = body.marcaLogo;
    const match = typeof logo === "string" && logo.match(/^data:image\/(png|webp|svg\+xml);base64,([A-Za-z0-9+/=]+)$/);
    if (logo !== "" && (!match || Buffer.byteLength(match[2], "base64") > 300 * 1024))
      return NextResponse.json({ error: "El logo debe ser PNG, WEBP o SVG y pesar máximo 300 KB" }, { status: 400 });
  }
  const data: Record<string, unknown> = {};
  const bools = ["autoAsignar", "bienvenidaActiva", "crearLeadAuto", "csatActivo", "horarioActivo", "autoResolverActivo"];
  const strs = ["bienvenidaTexto", "csatTexto", "horarioInicio", "horarioFin", "horarioDias", "fueraHorarioTexto", "nombreNegocio", "iaPromptSistema", "marcaNombre", "marcaLogo", "marcaColorPrimario", "marcaColorAcento", "marcaPreset"];
  for (const k of bools) if (typeof body[k] === "boolean") data[k] = body[k];
  for (const k of strs) if (typeof body[k] === "string") data[k] = body[k];
  if (typeof body.autoResolverHoras === "number") data.autoResolverHoras = body.autoResolverHoras;

  await actualizarAjustes(data);
  return NextResponse.json({ ok: true });
}
