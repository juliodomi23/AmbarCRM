import { NextRequest, NextResponse } from "next/server";

/** Valida la API key que usa n8n para llamar los endpoints /api/wa/*. */
export function requireApiKey(req: NextRequest): NextResponse | null {
  // Acepta el header x-api-key o el query ?apikey= (fallback por si el proveedor no reenvía headers).
  const key = req.headers.get("x-api-key") || req.nextUrl.searchParams.get("apikey");
  if (!key || key !== process.env.WA_API_KEY) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }
  return null;
}
