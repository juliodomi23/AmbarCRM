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

export { leerObjeto, objetoEstricto, idIntegracion } from "@/lib/integraciones-validacion";
