import { db, runWithOrg } from "@/lib/db";
import { configReservas, horariosDeDoctor, orgDeToken } from "./servidor";

export async function citaDelToken(token: string) {
  const orgId = await orgDeToken(token);
  if (!orgId) return null;
  return runWithOrg(orgId, async () => {
    const [cita, modulo, org] = await Promise.all([
      db.cita.findFirst({
        where: { tokenGestion: token },
        select: {
          id: true, titulo: true, inicio: true, fin: true, estado: true, origen: true,
          doctorId: true, doctor: { select: { nombre: true, activo: true } },
          servicioId: true, servicio: { select: { activo: true, bufferMin: true, doctores: { select: { doctorId: true } } } },
        },
      }),
      db.moduloOrg.findFirst({ where: { clave: "reservas_en_linea" }, select: { config: true, activo: true } }),
      db.org.findUnique({ where: { id: orgId }, select: { activo: true } }),
    ]);
    if (!cita || !org?.activo) return null;
    const config = configReservas(modulo?.config);
    const reprogramable = Boolean(modulo?.activo && cita.doctorId && cita.doctor?.activo && cita.servicio?.activo &&
      cita.servicio.doctores.some((d) => d.doctorId === cita.doctorId) &&
      ["programada", "confirmada"].includes(cita.estado) && cita.inicio > new Date());
    return { orgId, cita, config, reprogramable };
  });
}

export type CitaGestion = NonNullable<Awaited<ReturnType<typeof citaDelToken>>>;

export function detalleGestion({ cita, config, reprogramable }: CitaGestion) {
  return {
    servicio: cita.titulo, inicio: cita.inicio, fin: cita.fin, estado: cita.estado,
    especialista: cita.doctor?.nombre ?? null, zona: config.zona, reprogramable,
    confirmable: cita.estado === "programada" && cita.inicio > new Date(),
  };
}

export function horariosGestion(encontrada: CitaGestion, fecha: string) {
  const { orgId, cita, config, reprogramable } = encontrada;
  if (!reprogramable || !cita.doctorId) return Promise.resolve([] as string[]);
  return runWithOrg(orgId, () => horariosDeDoctor(config, {
    duracionMin: (+cita.fin - +cita.inicio) / 60_000,
    bufferMin: cita.origen === "interna" ? cita.servicio?.bufferMin ?? 0 : 0,
  }, cita.doctorId!, fecha, new Date(), cita.id));
}
