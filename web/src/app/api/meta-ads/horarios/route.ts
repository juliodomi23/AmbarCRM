import { NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { listarHorariosOrg } from "@/lib/meta-ads/servicio";

export const dynamic = "force-dynamic";

export const GET = conModulo("meta_ads", {}, async (sesion) => {
  if (!sesion.userId) return NextResponse.json({ horarios: [] });
  const horarios = await listarHorariosOrg(sesion.orgId!);
  return NextResponse.json(
    { horarios },
    { headers: { "Cache-Control": "no-store" } },
  );
});