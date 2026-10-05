import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";
import { toCSV, rangoFechas, respuestaCSV } from "@/lib/csv";

export const dynamic = "force-dynamic";

const fecha = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

/** CSV de respuestas CSAT. Query opcional: ?desde=&hasta= (por fecha de envío de la encuesta). */
export async function GET(req: NextRequest) {
  const s = await requireSesion(true);
  if ("error" in s) return s.error;

  const rango = rangoFechas(req.nextUrl.searchParams.get("desde"), req.nextUrl.searchParams.get("hasta"));
  const convs = await db.conversacion.findMany({
    where: { csatScore: { not: null }, ...(rango ? { csatEnviadoAt: rango } : {}) },
    include: { contacto: true, responsable: true },
    orderBy: { csatEnviadoAt: "desc" }
  });

  const csv = toCSV(
    ["Contacto", "Teléfono", "Puntaje", "Responsable", "Fecha"],
    convs.map((c) => [
      c.contacto.nombre,
      c.contacto.telefono ?? "",
      c.csatScore ?? "",
      c.responsable?.nombre ?? "",
      fecha(c.csatEnviadoAt)
    ])
  );
  return respuestaCSV(csv, "csat.csv");
}
