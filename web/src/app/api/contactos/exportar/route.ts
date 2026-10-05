import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";
import { toCSV, respuestaCSV } from "@/lib/csv";

export const dynamic = "force-dynamic";

/** Exporta todos los contactos a CSV (solo admin: son los datos del negocio). */
export async function GET() {
  const s = await requireSesion(true);
  if ("error" in s) return s.error;

  const contactos = await db.contacto.findMany({
    orderBy: { nombre: "asc" },
    include: { etiquetas: { include: { etiqueta: true } }, responsable: true }
  });

  const csv = toCSV(
    ["nombre", "telefono", "email", "empresa", "fuente", "etiquetas", "responsable", "notas", "creado"],
    contactos.map((c) => [
      c.nombre,
      c.telefono,
      c.email,
      c.empresa,
      c.fuente,
      c.etiquetas.map((e) => e.etiqueta.nombre).join(" | "),
      c.responsable?.nombre ?? "",
      c.notas,
      c.createdAt.toISOString().slice(0, 10)
    ])
  );
  return respuestaCSV(csv, `contactos_${new Date().toISOString().slice(0, 10)}.csv`);
}
