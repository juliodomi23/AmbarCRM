import { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";
import { toCSV, rangoFechas, respuestaCSV } from "@/lib/csv";

export const dynamic = "force-dynamic";

const fecha = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

/** CSV de oportunidades. Query opcional: ?desde=YYYY-MM-DD&hasta=YYYY-MM-DD (por fecha de creación). */
export async function GET(req: NextRequest) {
  const s = await requireSesion(true);
  if ("error" in s) return s.error;

  const rango = rangoFechas(req.nextUrl.searchParams.get("desde"), req.nextUrl.searchParams.get("hasta"));
  const ops = await db.oportunidad.findMany({
    where: rango ? { createdAt: rango } : undefined,
    include: { contacto: true, embudo: true, etapa: true, responsable: true },
    orderBy: { createdAt: "desc" }
  });

  const csv = toCSV(
    ["ID", "Título", "Contacto", "Teléfono", "Embudo", "Etapa", "Valor", "Estado", "Responsable", "Creada", "Cerrada"],
    ops.map((o) => [
      o.id.toString(),
      o.titulo,
      o.contacto.nombre,
      o.contacto.telefono ?? "",
      o.embudo.nombre,
      o.etapa.nombre,
      Number(o.valor),
      o.estado,
      o.responsable?.nombre ?? "",
      fecha(o.createdAt),
      fecha(o.closedAt)
    ])
  );
  return respuestaCSV(csv, "oportunidades.csv");
}
