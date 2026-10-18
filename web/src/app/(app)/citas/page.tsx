import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";
import { serializar } from "@/lib/serialize";
import { configReservasEmpresa } from "@/lib/reservas/servidor";
import { CitasCliente } from "@/components/citas/CitasCliente";
export const dynamic = "force-dynamic";
export default async function CitasPage() {
  if (!(await moduloActivo("citas"))) redirect("/");
  const [clientesActivo, pacientesActivo] = await Promise.all([
    moduloActivo("clientes"),
    moduloActivo("pacientes"),
  ]);
  const [contactos, usuarios, doctores] = await Promise.all([
    db.contacto.findMany({
      where:
        clientesActivo || pacientesActivo
          ? { expediente: { isNot: null } }
          : undefined,
      select: { id: true, nombre: true, expediente: { select: { id: true } } },
      orderBy: { nombre: "asc" },
      take: 500,
    }),
    db.usuario.findMany({ where: { activo: true }, select: { id: true, nombre: true } }),
    db.doctor.findMany({ orderBy: [{ activo: "desc" }, { nombre: "asc" }], include: { horarios: true, excepciones: true } }),
  ]);
  return (
    <CitasCliente
      zona={(await configReservasEmpresa()).zona}
      contactos={serializar(contactos)}
      usuarios={serializar(usuarios)}
      doctores={serializar(doctores)}
    />
  );
}
