import { NextRequest, NextResponse } from "next/server";
import { requireSesion } from "@/lib/session";
import { crearCanalApi, guardarCanalMessenger } from "@/lib/services/canales";
import { ErrorRetail } from "@/lib/retail-db";
import { conErrores } from "@/lib/errores-api";

export const dynamic = "force-dynamic";

export const POST = conErrores(async (req: NextRequest) => {
  const sesion = await requireSesion(true);
  if ("error" in sesion) return sesion.error;
  const body = await req.json();
  if (!["api", "messenger"].includes(body.proveedor)) return NextResponse.json({ error: "proveedor inválido" }, { status: 400 });
  try {
    const canal = body.proveedor === "api" ? await crearCanalApi(String(body.nombre ?? ""), body.webhook_url) : await guardarCanalMessenger(body);
    return NextResponse.json(canal, {
      status: 201, headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    if (e instanceof ErrorRetail) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
});
