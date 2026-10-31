import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";
import { serializar } from "@/lib/serialize";
import { TallerRefacciones } from "@/components/taller/TallerRefacciones";

export const dynamic = "force-dynamic";
export default async function TallerRefaccionesPage() {
  if (!(await moduloActivo("taller"))) redirect("/");
  const refacciones = await db.tallerRefaccion.findMany({ orderBy: [{ existencia: "asc" }, { nombre: "asc" }], take: 500 });
  return <TallerRefacciones iniciales={serializar(refacciones)} />;
}
