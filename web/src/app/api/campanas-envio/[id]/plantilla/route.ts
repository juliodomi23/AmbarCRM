import { NextRequest } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { crearPlantillaParaCampana } from "@/lib/campanas-envio-crear-plantilla";

type Props = { params: Promise<{ id: string }> };

export const POST = conModulo("campanas_envio", { admin: true }, async (_sesion, req: NextRequest, { params }: Props) => {
  const id = BigInt((await params).id);
  const body = await req.json().catch(() => ({}));
  const resultado = await crearPlantillaParaCampana(id, body);
  if (!resultado.plantilla) return Response.json({ error: resultado.error }, { status: resultado.status });
  return Response.json({ ok: true, plantilla: resultado.plantilla }, { status: 201 });
});
