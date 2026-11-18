import { NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { listarDiasSemanaOrg } from "@/lib/meta-ads/servicio";

export const dynamic = "force-dynamic";

export const GET = conModulo("meta_ads", {}, async (sesion, req: Request) => {
  if (!sesion.userId) return NextResponse.json({ dias: [] });
  const clienteId = new URL(req.url).searchParams.get("clienteId");
  if (!clienteId || !/^\d+$/.test(clienteId)) {
    return NextResponse.json({ dias: [], error: "Falta clienteId" }, { status: 400 });
  }
  const dias = await listarDiasSemanaOrg(sesion.orgId!, BigInt(clienteId));
  return NextResponse.json(
    { dias },
    { headers: { "Cache-Control": "no-store" } },
  );
});
