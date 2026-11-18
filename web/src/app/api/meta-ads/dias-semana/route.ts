import { NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { listarDiasSemanaOrg } from "@/lib/meta-ads/servicio";

export const dynamic = "force-dynamic";

export const GET = conModulo("meta_ads", {}, async (sesion) => {
  if (!sesion.userId) return NextResponse.json({ dias: [] });
  const dias = await listarDiasSemanaOrg(sesion.orgId!);
  return NextResponse.json(
    { dias },
    { headers: { "Cache-Control": "no-store" } },
  );
});
