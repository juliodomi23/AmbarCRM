import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { conModulo } from "@/lib/con-modulo";

export const PATCH = conModulo(
  "citas",
  {},
  async (sesion, req: NextRequest, props: { params: Promise<{ id: string }> }) => {
  const body = await req.json().catch(() => ({}));
  const { id } = await props.params;
  await db.doctor.update({
    where: { id: BigInt(id) },
    data: { activo: Boolean(body.activo) },
  });
  return NextResponse.json({ ok: true });
  },
);
