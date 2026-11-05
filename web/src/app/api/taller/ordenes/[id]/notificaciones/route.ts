import { NextRequest, NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { aBigInt } from "@/lib/ids";
import { serializar } from "@/lib/serialize";
import {
  enviarMensajeTaller,
  ErrorTaller,
  TIPOS_NOTIFICACION_TALLER,
  type TipoNotificacionTaller,
} from "@/lib/taller-whatsapp";

type Props = { params: Promise<{ id: string }> };

export const POST = conModulo("taller", {}, async (sesion, req: NextRequest, props: Props) => {
  const id = aBigInt((await props.params).id);
  if (!id || id <= 0n) return NextResponse.json({ error: "Orden inválida" }, { status: 400 });
  const body = await req.json().catch(() => null);
  const tipo = String((body as Record<string, unknown> | null)?.tipo ?? "");
  if (!TIPOS_NOTIFICACION_TALLER.includes(tipo as TipoNotificacionTaller)) {
    return NextResponse.json({ error: "Tipo de aviso inválido" }, { status: 400 });
  }
  try {
    const resultado = await enviarMensajeTaller(id, tipo as TipoNotificacionTaller, sesion.userId);
    return NextResponse.json(serializar(resultado));
  } catch (error) {
    if (error instanceof ErrorTaller) {
      return NextResponse.json({ error: error.message, codigo: error.codigo }, { status: error.status });
    }
    throw error;
  }
});
