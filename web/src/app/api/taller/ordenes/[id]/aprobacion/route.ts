import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { transaccionTenant } from "@/lib/retail-db";
import { aBigInt } from "@/lib/ids";

export const POST = conModulo("taller", {}, async (sesion, req: NextRequest, props: { params: Promise<{ id: string }> }) => {
  const id = aBigInt((await props.params).id), body = await req.json().catch(() => null), version = Number(body?.version);
  if (!id || id <= 0n || !Number.isSafeInteger(version) || version < 1) return NextResponse.json({ error: "Orden o versión inválida" }, { status: 400 });
  const token = randomBytes(24).toString("hex");
  const result = await transaccionTenant(sesion.orgId!, async (tx) => {
    const [orden] = await tx.$queryRaw<{ id: bigint; estado: string; version: number }[]>`SELECT id, estado, version FROM taller_ordenes WHERE id = ${id} FOR UPDATE`;
    if (!orden) return { error: "Orden no encontrada", status: 404 } as const;
    if (orden.version !== version) return { error: "La orden cambió desde que la abriste", status: 409 } as const;
    if (orden.estado !== "diagnostico") return { error: "La orden debe estar en diagnóstico para solicitar aprobación", status: 409 } as const;
    await tx.tallerOrden.update({ where: { id }, data: { estado: "esperando_aprobacion", aprobacionToken: token, aprobacionResultado: null, version: { increment: 1 } } });
    await tx.tallerOrdenCambio.create({ data: { ordenId: id, estado: "esperando_aprobacion", userId: sesion.userId } });
    return { ok: true } as const;
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  // req.url trae el host interno del contenedor (localhost:3000); el enlace público se arma con NEXTAUTH_URL como el resto del CRM.
  const base = (process.env.NEXTAUTH_URL ?? new URL(req.url).origin).replace(/\/+$/, "");
  const url = `${base}/taller-aprobacion/${sesion.orgId}-${token}`;
  return NextResponse.json({ url });
});
