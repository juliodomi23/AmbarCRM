import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/api-auth";
import { dbRaw } from "@/lib/db";
import { sincronizarCalendario } from "@/lib/calendario/servicio";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const noAutorizado = requireApiKey(req);
  if (noAutorizado) return noAutorizado;
  const orgs = await dbRaw.org.findMany({ where: { activo: true }, select: { id: true } });
  let sincronizados = 0; let ocupados = 0; let errores = 0;
  for (const org of orgs) {
    try {
      const result = await sincronizarCalendario(org.id);
      if (result.ocupado) ocupados++; else sincronizados++;
    } catch { errores++; }
  }
  return NextResponse.json({ ok: errores === 0, organizaciones: orgs.length, sincronizados, ocupados, errores }, { status: errores ? 207 : 200 });
}
