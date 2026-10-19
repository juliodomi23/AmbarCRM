import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";
import { serializar } from "@/lib/serialize";
import { configReservasEmpresa } from "@/lib/reservas/servidor";
import { CitasCliente } from "@/components/citas/CitasCliente";
import { duracionCitas } from "@/lib/citas-duracion";
import { aBigInt } from "@/lib/ids";
export const dynamic = "force-dynamic";
export default async function CitasPage({ searchParams }: { searchParams: Promise<{ contactoId?: string | string[] }> }) {
  if (!(await moduloActivo("citas"))) redirect("/");
  const parametros = await searchParams;
  const contactoId = typeof parametros.contactoId === "string" ? aBigInt(parametros.contactoId) : null;
  const [contactos, usuarios, doctores, servicios, moduloCitas] = await Promise.all([
    db.contacto.findMany({
      select: { id: true, nombre: true, expediente: { select: { id: true } } },
      orderBy: { nombre: "asc" },
      take: 500,
    }),
    db.usuario.findMany({ where: { activo: true }, select: { id: true, nombre: true } }),
    db.doctor.findMany({ orderBy: [{ activo: "desc" }, { nombre: "asc" }], include: { horarios: true, excepciones: true } }),
    db.servicioReserva.findMany({ where: { activo: true }, include: { doctores: { select: { doctorId: true } } }, orderBy: { nombre: "asc" } }),
    db.moduloOrg.findFirst({ where: { clave: "citas" }, select: { config: true } }),
  ]);
  if (contactoId && contactoId <= 9223372036854775807n && !contactos.some((contacto) => contacto.id === contactoId)) {
    const precargado = await db.contacto.findFirst({ where: { id: contactoId }, select: { id: true, nombre: true, expediente: { select: { id: true } } } });
    if (precargado) contactos.push(precargado);
  }
  return (
    <CitasCliente
      servicios={serializar(servicios)}
      duracionMin={duracionCitas(moduloCitas?.config)}
      zona={(await configReservasEmpresa()).zona}
      contactos={serializar(contactos)}
      usuarios={serializar(usuarios)}
      doctores={serializar(doctores)}
    />
  );
}
