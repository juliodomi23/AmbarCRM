import { NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { obtenerHorariosHoy } from "@/lib/meta-ads/servicio";

export const dynamic = "force-dynamic";

export const GET = conModulo("meta_ads", {}, async (sesion, req: Request) => {
  if (!sesion.userId) return NextResponse.json({ error: "Sesión sin usuario" }, { status: 400 });
  const clienteId = new URL(req.url).searchParams.get("clienteId");
  if (!clienteId || !/^\d+$/.test(clienteId)) {
    return NextResponse.json({ error: "Falta clienteId" }, { status: 400 });
  }
  const clienteIdBigint = BigInt(clienteId);
  const connection = await db.metaAdsConexion.findFirst({
    where: { orgId: sesion.orgId!, clienteId: clienteIdBigint, estado: "activa" },
    select: { id: true, adAccountId: true, estado: true, sincronizadoAt: true, ultimoError: true }
  });
  if (!connection) return NextResponse.json({ horarios: [] });

  const horarios = await obtenerHorariosHoy(sesion.orgId!, clienteIdBigint, connection.adAccountId);

  return NextResponse.json({ horarios });
});
