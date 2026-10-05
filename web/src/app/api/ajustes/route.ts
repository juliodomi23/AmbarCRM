import { NextRequest, NextResponse } from "next/server";
import { requireSesion } from "@/lib/session";
import { actualizarAjustes } from "@/lib/services/config";

export const dynamic = "force-dynamic";

/** Edita las automatizaciones. Body: { autoAsignar?, bienvenidaActiva?, bienvenidaTexto? } */
export async function PATCH(req: NextRequest) {
  const s = await requireSesion(true);
  if ("error" in s) return s.error;

  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  const bools = ["autoAsignar", "bienvenidaActiva", "crearLeadAuto", "csatActivo", "horarioActivo", "autoResolverActivo"];
  const strs = ["bienvenidaTexto", "csatTexto", "horarioInicio", "horarioFin", "horarioDias", "fueraHorarioTexto", "nombreNegocio", "iaPromptSistema"];
  for (const k of bools) if (typeof body[k] === "boolean") data[k] = body[k];
  for (const k of strs) if (typeof body[k] === "string") data[k] = body[k];
  if (typeof body.autoResolverHoras === "number") data.autoResolverHoras = body.autoResolverHoras;

  await actualizarAjustes(data);
  return NextResponse.json({ ok: true });
}
