import { NextResponse } from "next/server";
import { cargarEstadoPublico } from "@/lib/taller-estado";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, props: { params: Promise<{ token: string }> }) {
  const vista = await cargarEstadoPublico((await props.params).token);
  if (!vista) return NextResponse.json({ error: "no encontrado" }, { status: 404 });
  return NextResponse.json(
    { taller: vista.marca.nombre, orden: vista.orden },
    { headers: { "Cache-Control": "no-store" } },
  );
}
