import { NextResponse } from "next/server";
import { ErrorRetail } from "@/lib/retail-db";

export function respuestaErrorCotizacion(error: unknown) {
  // ErrorRetail incluye ErrorCotizacion y los errores del motor de precios (producto inactivo, 404).
  if (error instanceof ErrorRetail) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  throw error;
}
