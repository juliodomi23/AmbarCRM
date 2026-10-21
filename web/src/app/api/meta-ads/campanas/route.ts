import { NextRequest } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { validarFiltrosCampanas } from "@/lib/marketing";
import { crearCampana, listarCampanas, respuestaErrorMarketing } from "@/lib/marketing-db";

export const dynamic = "force-dynamic";

export const GET = conModulo("meta_ads", {}, async (sesion, req: NextRequest) => {
  try {
    return Response.json(await listarCampanas(sesion, "meta_ads", validarFiltrosCampanas(req.nextUrl.searchParams)), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return respuestaErrorMarketing(error); }
});

export const POST = conModulo("meta_ads", {}, async (sesion, req: NextRequest) => {
  try {
    return Response.json({ campana: await crearCampana(sesion, "meta_ads", await req.json()) }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return respuestaErrorMarketing(error); }
});
