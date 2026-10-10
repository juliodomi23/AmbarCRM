import { NextRequest, NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { enlaceGoogleValido } from "@/lib/resenas";

export const PATCH = conModulo("resenas", { admin: true }, async (_sesion, req: NextRequest) => {
  const body = await req.json().catch(() => ({}));
  const enlaceTexto = String(body.enlaceGoogle ?? "").trim();
  const enlaceGoogle = enlaceTexto ? enlaceGoogleValido(enlaceTexto) : null;
  if (enlaceTexto && !enlaceGoogle) {
    return NextResponse.json({ error: "El enlace debe ser https y de Google (g.page, google.com o maps.app.goo.gl)" }, { status: 400 });
  }
  const dias = Number(body.diasEntreSolicitudes);
  if (!Number.isInteger(dias) || dias < 1 || dias > 365) {
    return NextResponse.json({ error: "Los días entre solicitudes van de 1 a 365" }, { status: 400 });
  }
  const modulo = await db.moduloOrg.findFirst({ where: { clave: "resenas", activo: true } });
  if (!modulo) return NextResponse.json({ error: "Módulo no encontrado" }, { status: 404 });
  const plantillaNombre = String(body.plantillaNombre ?? "").trim();
  const anterior = (modulo.config ?? {}) as Record<string, unknown>;
  await db.moduloOrg.update({
    where: { id: modulo.id },
    data: {
      config: {
        ...anterior,
        enlaceGoogle,
        diasEntreSolicitudes: dias,
        plantillaResena: plantillaNombre
          ? { name: plantillaNombre, language: String(body.plantillaIdioma ?? "es_MX").trim() || "es_MX" }
          : null,
      },
    },
  });
  return NextResponse.json({ ok: true });
});
