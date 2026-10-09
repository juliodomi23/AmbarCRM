import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { conModulo } from "@/lib/con-modulo";
import { validarAjustesReservas } from "@/lib/reservas/validar";

/** Anticipación mínima, días a futuro, cada cuánto se ofrecen horarios y tope de citas por teléfono. */
export const PATCH = conModulo("reservas_en_linea", { admin: true }, async (_sesion, req: NextRequest) => {
  const validacion = validarAjustesReservas(await req.json().catch(() => ({})));
  if ("error" in validacion) return NextResponse.json({ error: validacion.error }, { status: 400 });
  const modulo = await db.moduloOrg.findFirst({ where: { clave: "reservas_en_linea", activo: true } });
  if (!modulo) return NextResponse.json({ error: "módulo no activo" }, { status: 404 });
  await db.moduloOrg.update({
    where: { id: modulo.id },
    data: { config: { ...(modulo.config as Record<string, unknown>), ...validacion.data } },
  });
  return NextResponse.json({ ok: true });
});
