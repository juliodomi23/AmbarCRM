import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";
import { serializar } from "@/lib/serialize";
import { CitasCliente } from "@/components/citas/CitasCliente";
export const dynamic = "force-dynamic";
export default async function CitasPage() {
  if (!(await moduloActivo("citas"))) redirect("/");
  const [contactos, usuarios, doctores] = await Promise.all([
    db.contacto.findMany({ orderBy: { nombre: "asc" }, take: 500 }),
    db.usuario.findMany({ where: { activo: true } }),
    db.doctor.findMany({ orderBy: [{ activo: "desc" }, { nombre: "asc" }] }),
  ]);
  return (
    <CitasCliente
      contactos={serializar(contactos)}
      usuarios={serializar(usuarios)}
      doctores={serializar(doctores)}
    />
  );
}
