import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";
import { getProvider } from "@/lib/channel";
import { crearPlantillaMeta } from "@/lib/meta/crearPlantilla";
import { conErrores } from "@/lib/errores-api";

export const dynamic = "force-dynamic";

async function channel(id: string | null) {
  if (!id || !/^\d+$/.test(id)) return null;
  return db.canalWhatsapp.findFirst({
    where: { id: BigInt(id), proveedor: "cloud_api", activo: true }
  });
}

async function manejarGET(req: NextRequest) {
  const session = await requireSesion();
  if ("error" in session) return session.error;
  const canal = await channel(req.nextUrl.searchParams.get("canalId"));
  if (!canal) return NextResponse.json({ error: "canal inexistente" }, { status: 404 });
  const provider = getProvider("cloud_api", canal.config, canal.instancia);
  return NextResponse.json({ plantillas: await provider.listarPlantillas!() });
}

async function manejarPOST(req: NextRequest) {
  const session = await requireSesion(true);
  if ("error" in session) return session.error;
  const body = await req.json().catch(() => ({}));
  const canal = await channel(String(body.canalId || ""));
  if (!canal) return NextResponse.json({ error: "canal inexistente" }, { status: 404 });

  const resultado = await crearPlantillaMeta(canal.config, body);
  if (!resultado.plantilla) return NextResponse.json({ error: resultado.error }, { status: resultado.status });
  const { name, language, category, status, id } = resultado.plantilla;
  return NextResponse.json({ ok: true, plantilla: { name, language, category, status, id } }, { status: 201 });
}

export const GET = conErrores(manejarGET);
export const POST = conErrores(manejarPOST);
