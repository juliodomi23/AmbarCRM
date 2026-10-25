import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    { error: "Usa la ruta de webhook con la organización en el path" },
    { status: 410 },
  );
}
