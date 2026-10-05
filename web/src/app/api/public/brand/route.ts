import { NextRequest, NextResponse } from "next/server";
import { dbRaw, runWithOrg } from "@/lib/db";
import { getAjustes } from "@/lib/services/config";
import { DEFAULT_BRAND, normalizarMarca } from "@/lib/brand";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug")?.trim().toLowerCase();
  if (!slug) return NextResponse.json(DEFAULT_BRAND);
  const org = await dbRaw.org.findUnique({ where: { slug }, select: { id: true, activo: true } });
  if (!org?.activo) return NextResponse.json(DEFAULT_BRAND);
  const ajustes = await runWithOrg(org.id, getAjustes);
  return NextResponse.json(normalizarMarca(ajustes));
}
