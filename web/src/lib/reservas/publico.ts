import { NextRequest, NextResponse } from "next/server";
import { ipCliente, permitido } from "@/lib/rate-limit";
export { telefonoMx } from "@/lib/reservas/telefono";

export const errorPublico = (mensaje: string, status: number) => NextResponse.json({ error: mensaje }, { status });

/** Límite por IP para las rutas públicas; devuelve la respuesta 429 o null. */
export function limitarIp(req: NextRequest, accion: string, max: number, ventanaMs: number) {
  const ip = ipCliente(Object.fromEntries(req.headers.entries()));
  return permitido(`reservas:${accion}:${ip}`, max, ventanaMs)
    ? null
    : errorPublico("Demasiadas solicitudes; intenta en unos minutos", 429);
}
