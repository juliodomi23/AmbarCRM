import { NextResponse } from "next/server";
import { ErrorCotizacion } from "@/lib/cotizaciones-db";

export function respuestaErrorCotizacion(error: unknown) {
  if (error instanceof ErrorCotizacion) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  throw error;
}
