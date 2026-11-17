import { NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";

export const GET = conModulo("meta_ads", {}, async (sesion) => {
  if (!sesion.userId) return NextResponse.json({ error: "Sesión sin usuario" }, { status: 400 });
  const connection = await db.metaAdsConexion.findFirst({
    where: { orgId: sesion.orgId!, estado: "activa" },
    select: { id: true, adAccountId: true, estado: true, sincronizadoAt: true, ultimoError: true }
  });
  if (!connection) return NextResponse.json({ connection: null, insights: [] });

  const insights = await db.metaAdsInsight.findMany({
    where: { orgId: sesion.orgId! },
    orderBy: [{ fecha: "desc" }, { id: "desc" }],
  });

  return NextResponse.json({
    connection: { 
      id: connection.id.toString(), 
      adAccountId: connection.adAccountId, 
      estado: connection.estado, 
      sincronizadoAt: connection.sincronizadoAt?.toISOString?.() ?? null,
      ultimoError: connection.ultimoError 
    },
    insights: insights.map((i) => ({
      id: i.id.toString(),
      adId: i.adId,
      nombreAnuncio: i.nombreAnuncio,
      fecha: i.fecha.toISOString().slice(0, 10),
      spend: Number(i.spend),
      ctr: Number(i.ctr),
      cpa: Number(i.cpa),
      impresiones: i.impresiones,
    })),
  });
});
