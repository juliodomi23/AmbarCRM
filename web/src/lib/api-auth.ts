import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";

function igual(a: string, b: string) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/**
 * Valida la API key que usa n8n/Evolution para llamar los endpoints /api/wa/*.
 * Solo por header `x-api-key` (Evolution lo reenvía en cada webhook): la query string
 * se loguea en proxies y filtraría la credencial maestra.
 */
export function requireApiKey(req: NextRequest): NextResponse | null {
  const key = req.headers.get("x-api-key");
  const esperada = process.env.WA_API_KEY;
  if (!key || !esperada || !igual(key, esperada)) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }
  return null;
}
