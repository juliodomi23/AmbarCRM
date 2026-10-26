import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";
import { serializar } from "@/lib/serialize";
import { configReservasEmpresa } from "@/lib/reservas/servidor";
import { CitasCliente } from "@/components/citas/CitasCliente";
import { duracionCitas } from "@/lib/citas-duracion";
import { aBigInt } from "@/lib/ids";
import { accesoAgendaActual } from "@/lib/citas-acceso";
import { getSesion } from "@/lib/session";
import { CalendarioPanel } from "@/components/calendario/CalendarioPanel";
export const dynamic = "force-dynamic";
export default async function CitasPage({ searchParams }: { searchParams: Promise<{ contactoId?: string | string[]; conexion?: string }> }) {
  if (!(await moduloActivo("citas"))) redirect("/");
  const [acceso, sesion] = await Promise.all([accesoAgendaActual(), getSesion()]);
  const parametros = await searchParams;
  const contactoId = typeof parametros.contactoId === "string" ? aBigInt(parametros.contactoId) : null;
  const calendarioActivo = await moduloActivo("calendario");
  const [contactos, usuarios, doctores, servicios, moduloCitas] = await Promise.all([
    db.contacto.findMany({
      select: { id: true, nombre: true, expediente: { select: { id: true } } },
      orderBy: { nombre: "asc" },
      take: 30,
    }),
    db.usuario.findMany({ where: { activo: true }, select: { id: true, nombre: true } }),
    db.doctor.findMany({ where: acceso.restringida ? { id: acceso.doctorId ?? 0n } : {}, orderBy: [{ activo: "desc" }, { nombre: "asc" }], include: { horarios: true, excepciones: true } }),
    db.servicioReserva.findMany({ where: { activo: true, ...(acceso.restringida ? { doctores: { some: { doctorId: acceso.doctorId ?? 0n } } } : {}) }, include: { doctores: { select: { doctorId: true } } }, orderBy: { nombre: "asc" } }),
    db.moduloOrg.findFirst({ where: { clave: "citas" }, select: { config: true } }),
  ]);
  if (contactoId && contactoId <= 9223372036854775807n && !contactos.some((contacto) => contacto.id === contactoId)) {
    const precargado = await db.contacto.findFirst({ where: { id: contactoId }, select: { id: true, nombre: true, expediente: { select: { id: true } } } });
    if (precargado) contactos.push(precargado);
  }
  return (
    <>
    <CitasCliente
      agendaPropia={acceso.restringida}
      puedeAdministrar={sesion?.user?.rol === "admin"}
      servicios={serializar(servicios)}
      duracionMin={duracionCitas(moduloCitas?.config)}
      zona={(await configReservasEmpresa()).zona}
      contactos={serializar(contactos)}
      usuarios={serializar(usuarios)}
      doctores={serializar(doctores)}
    />
    {calendarioActivo && <CalendarioPanel embebido admin={sesion?.user?.rol === "admin"} resultadoOAuth={parametros.conexion} />}
    </>
  );
}
