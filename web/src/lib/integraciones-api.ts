import { NextRequest, NextResponse } from "next/server";
import { requireSesion } from "@/lib/session";
import { runWithOrg } from "@/lib/db";
import { ErrorRetail } from "@/lib/retail-db";
import { serializar } from "@/lib/serialize";
import { Prisma } from "@prisma/client";

export function respuestaIntegracion(datos: unknown, status = 200) {
  return NextResponse.json(serializar(datos), { status, headers: { "Cache-Control": "no-store" } });
}

export function conAdminIntegracion<T extends unknown[]>(
  handler: (req: NextRequest, orgId: bigint, ...args: T) => Promise<Response>,
) {
  return async (req: NextRequest, ...args: T) => {
    const sesion = await requireSesion(true);
    if ("error" in sesion) return sesion.error!;
    if (sesion.orgId === null) return respuestaIntegracion({ error: "no autorizado" }, 401);
    try {
      return await runWithOrg(sesion.orgId, () => handler(req, sesion.orgId!, ...args));
    } catch (error) {
      if (error instanceof ErrorRetail) return respuestaIntegracion({ error: error.message }, error.status);
      if (error instanceof SyntaxError || error instanceof RangeError) return respuestaIntegracion({ error: "datos inválidos" }, 400);
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
        return respuestaIntegracion({ error: "registro inexistente" }, 404);
      }
      return respuestaIntegracion({ error: "No se pudo completar la operación" }, 500);
    }
  };
}

export async function leerObjeto(req: NextRequest) {
  if (Number(req.headers.get("content-length")) > 16384) throw new ErrorRetail("datos demasiado grandes", 413);
  const texto = await req.text();
  if (Buffer.byteLength(texto) > 16384) throw new ErrorRetail("datos demasiado grandes", 413);
  const body: unknown = JSON.parse(texto);
  return objetoEstricto(body);
}

export function objetoEstricto(valor: unknown, claves?: readonly string[]): Record<string, unknown> {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) throw new ErrorRetail("objeto inválido");
  if (claves && Object.keys(valor).some((k) => !claves.includes(k))) throw new ErrorRetail("campo no permitido");
  return valor as Record<string, unknown>;
}

export function idIntegracion(valor: unknown): bigint {
  if (typeof valor !== "string" || !/^[1-9]\d{0,18}$/.test(valor)) throw new ErrorRetail("identificador inválido");
  return BigInt(valor);
}
