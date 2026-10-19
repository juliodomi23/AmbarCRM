import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export type IdentidadAgenda = { userId: bigint | null };
export type AccesoAgenda = { restringida: boolean; doctorId: bigint | null; where: Prisma.CitaWhereInput };

export async function accesoAgenda(sesion: IdentidadAgenda, tx?: Prisma.TransactionClient): Promise<AccesoAgenda> {
  if (tx && sesion.userId) await tx.$queryRaw`SELECT id FROM usuarios WHERE id = ${sesion.userId} FOR SHARE`;
  const consulta = {
    where: { id: sesion.userId ?? 0n, activo: true },
    select: { rol: true, agendaSoloPropia: true, agendaDoctorId: true },
  } satisfies Prisma.UsuarioFindFirstArgs;
  const usuario = sesion.userId ? await (tx ? tx.usuario.findFirst(consulta) : db.usuario.findFirst(consulta)) : null;
  if (usuario && (usuario.rol === "admin" || !usuario.agendaSoloPropia)) return { restringida: false, doctorId: null, where: {} };
  const doctorId = usuario?.agendaDoctorId ?? null;
  return { restringida: true, doctorId, where: doctorId ? { doctorId } : { id: { in: [] } } };
}

export async function accesoAgendaActual() {
  const { getSesion } = await import("@/lib/session");
  const sesion = await getSesion();
  return accesoAgenda({ userId: sesion?.user?.id ? BigInt(sesion.user.id) : null });
}

export function permiteEspecialista(acceso: AccesoAgenda, doctorId: bigint | null) {
  return !acceso.restringida || (acceso.doctorId !== null && acceso.doctorId === doctorId);
}

/** Valida únicamente los campos de acceso enviados por el administrador. */
export async function validarAccesoAgenda(body: Record<string, unknown>) {
  const data: { agendaSoloPropia?: boolean; agendaDoctorId?: bigint | null } = {};
  if ("agendaSoloPropia" in body) {
    if (typeof body.agendaSoloPropia !== "boolean") return { error: "El acceso a la agenda debe ser válido" } as const;
    data.agendaSoloPropia = body.agendaSoloPropia;
  }
  if ("agendaDoctorId" in body) {
    const id = body.agendaDoctorId;
    if (id === null || id === "") data.agendaDoctorId = null;
    else {
      if (typeof id !== "string" || !/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n) return { error: "Especialista inválido" } as const;
      const doctor = await db.doctor.findFirst({ where: { id: BigInt(id), activo: true }, select: { id: true } });
      if (!doctor) return { error: "Especialista inexistente o inactivo" } as const;
      data.agendaDoctorId = doctor.id;
    }
  }
  if (data.agendaSoloPropia === true && !data.agendaDoctorId) return { error: "Selecciona el especialista cuya agenda podrá consultar" } as const;
  return { data } as const;
}
