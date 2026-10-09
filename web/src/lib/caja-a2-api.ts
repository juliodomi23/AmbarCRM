import { NextResponse } from "next/server";
import { ErrorCajaA2 } from "@/lib/caja-a2-db";

export function respuestaErrorCajaA2(error: unknown) {
  if (error instanceof ErrorCajaA2) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  throw error;
}
