import { NextRequest, NextResponse } from "next/server";
import { requireApiKey } from "@/lib/api-auth";
import { procesarRecordatorios } from "@/lib/recordatorios-envio";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const noAuth = requireApiKey(req);
  if (noAuth) return noAuth;
  return NextResponse.json(await procesarRecordatorios());
}
