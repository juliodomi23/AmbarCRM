import { NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { listarHorariosOrg } from "@/lib/meta-ads/servicio";

export const dynamic = "force-dynamic";

export const GET = conModulo("meta_ads", {}, async (sesion, req: Request) => {
  if (!sesion.userId) return NextResponse.json({ horarios: [] });
  const clienteId = new URL(req.url).searchParams.get("clienteId");
  if (!clienteId || !/^\d+$/.test(clienteId)) {
    return NextResponse.json({ horarios: [], error: "Falta clienteId" }, { status: 400 });
  }
  const horarios = await listarHorariosOrg(sesion.orgId!, BigInt(clienteId));
  return NextResponse.json(
    { horarios },
    { headers: { "Cache-Control": "no-store" } },
  );
});
