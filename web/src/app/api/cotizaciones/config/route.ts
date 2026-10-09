import { NextRequest, NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { configCotizaciones } from "@/lib/cotizaciones";
import { db } from "@/lib/db";
import { dinero } from "@/lib/dinero";

export const PATCH = conModulo("cotizaciones", { admin: true }, async (_sesion, req: NextRequest) => {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const iva = dinero(body.ivaPorcentaje);
  if (iva === null || iva > 100) return NextResponse.json({ error: "El IVA debe estar entre 0 y 100" }, { status: 400 });
  const modulo = await db.moduloOrg.findFirst({ where: { clave: "cotizaciones", activo: true } });
  if (!modulo) return NextResponse.json({ error: "Módulo no activo" }, { status: 404 });
  const actual = configCotizaciones(modulo.config);
  const plantillaName = String(body.plantillaName ?? actual.plantillaCotizacion?.name ?? "").trim();
  const plantillaLanguage = String(body.plantillaLanguage ?? actual.plantillaCotizacion?.language ?? "").trim();
  const config = {
    ivaPorcentaje: String(iva),
    preciosConIva: body.preciosConIva === true || body.preciosConIva === "true",
    ...(plantillaName && plantillaLanguage ? { plantillaCotizacion: { name: plantillaName, language: plantillaLanguage } } : {}),
  };
  await db.moduloOrg.update({ where: { id: modulo.id }, data: { config } });
  return NextResponse.json({ config });
});
