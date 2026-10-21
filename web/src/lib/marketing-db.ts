import { Prisma, type CampanaMarketing } from "@prisma/client";
import type { SesionModulo } from "@/lib/con-modulo";
import { transaccionTenant } from "@/lib/retail-db";
import {
  ErrorMarketing, estadoTrasAccion, faltantesRevision, validarCambioCampana, validarCamposCampana,
  type CamposCampana, type CampanaMarketingDto, type ListaCampanasDto, type TipoCampana,
  type EstadoCampana, type validarFiltrosCampanas,
} from "@/lib/marketing";

function exigirIdentidad(sesion: SesionModulo) {
  if (!sesion.orgId || !sesion.userId) throw new ErrorMarketing("Inicia sesión para continuar.", 401);
  return { orgId: sesion.orgId, userId: sesion.userId };
}

export function campanaDto(campana: CampanaMarketing): CampanaMarketingDto {
  return {
    id: String(campana.id), tipo: campana.tipo as TipoCampana, nombre: campana.nombre,
    objetivo: campana.objetivo as CampanaMarketingDto["objetivo"], canal: campana.canal as CampanaMarketingDto["canal"],
    audiencia: campana.audiencia, contenido: campana.contenido,
    fechaInicio: campana.fechaInicio?.toISOString().slice(0, 10) ?? null,
    fechaFin: campana.fechaFin?.toISOString().slice(0, 10) ?? null,
    presupuesto: campana.presupuesto?.toFixed(2) ?? null,
    estado: campana.estado as EstadoCampana, version: campana.version,
    aprobadaPorId: campana.aprobadaPorId === null ? null : String(campana.aprobadaPorId),
    aprobadaAt: campana.aprobadaAt?.toISOString() ?? null,
    createdAt: campana.createdAt.toISOString(), updatedAt: campana.updatedAt.toISOString(),
  };
}

function camposParaGuardar(campos: CamposCampana) {
  return {
    ...campos,
    fechaInicio: campos.fechaInicio ? new Date(`${campos.fechaInicio}T00:00:00.000Z`) : null,
    fechaFin: campos.fechaFin ? new Date(`${campos.fechaFin}T00:00:00.000Z`) : null,
    presupuesto: campos.presupuesto === null ? null : new Prisma.Decimal(campos.presupuesto),
  };
}

function camposDeDto(dto: CampanaMarketingDto): CamposCampana {
  return {
    nombre: dto.nombre, objetivo: dto.objetivo, canal: dto.canal, audiencia: dto.audiencia,
    contenido: dto.contenido, fechaInicio: dto.fechaInicio, fechaFin: dto.fechaFin, presupuesto: dto.presupuesto,
  };
}

export async function listarCampanas(sesion: SesionModulo, tipo: TipoCampana, filtros: ReturnType<typeof validarFiltrosCampanas>): Promise<ListaCampanasDto> {
  const { orgId } = exigirIdentidad(sesion);
  return transaccionTenant(orgId, async tx => {
    const base: Prisma.CampanaMarketingWhereInput = {
      orgId, tipo,
      ...(filtros.q ? { OR: [
        { nombre: { contains: filtros.q, mode: "insensitive" } },
        { audiencia: { contains: filtros.q, mode: "insensitive" } },
      ] } : {}),
    };
    const where = { ...base, ...(filtros.estado ? { estado: filtros.estado } : {}) };
    const campanas = await tx.campanaMarketing.findMany({
      where, orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip: (filtros.page - 1) * filtros.limite, take: filtros.limite,
    });
    const total = await tx.campanaMarketing.count({ where });
    const grupos = await tx.campanaMarketing.groupBy({ by: ["estado"], where: base, _count: true });
    const resumen: ListaCampanasDto["resumen"] = { borrador: 0, en_revision: 0, aprobada: 0, archivada: 0 };
    for (const grupo of grupos) resumen[grupo.estado as EstadoCampana] = grupo._count;
    return { campanas: campanas.map(campanaDto), total, page: filtros.page, limite: filtros.limite, resumen };
  });
}

export async function obtenerCampana(sesion: SesionModulo, tipo: TipoCampana, id: bigint) {
  const { orgId } = exigirIdentidad(sesion);
  return transaccionTenant(orgId, async tx => {
    const campana = await tx.campanaMarketing.findFirst({ where: { id, orgId, tipo } });
    if (!campana) throw new ErrorMarketing("No se encontró la campaña.", 404);
    return campanaDto(campana);
  });
}

export async function crearCampana(sesion: SesionModulo, tipo: TipoCampana, entrada: unknown) {
  const { orgId } = exigirIdentidad(sesion);
  const campos = validarCamposCampana(tipo, entrada);
  return transaccionTenant(orgId, async tx => campanaDto(await tx.campanaMarketing.create({
    data: { ...camposParaGuardar(campos), tipo, estado: "borrador" },
  })));
}

export async function cambiarCampana(sesion: SesionModulo, tipo: TipoCampana, id: bigint, entrada: unknown) {
  const { orgId, userId } = exigirIdentidad(sesion);
  const solicitud = validarCambioCampana(entrada);
  return transaccionTenant(orgId, async tx => {
    const actual = await tx.campanaMarketing.findFirst({ where: { id, orgId, tipo } });
    if (!actual) throw new ErrorMarketing("No se encontró la campaña.", 404);
    if (actual.version !== solicitud.version) throw new ErrorMarketing("Otra persona guardó cambios en esta campaña. Recarga antes de continuar.", 409);
    const dto = campanaDto(actual);
    let cambios: Prisma.CampanaMarketingUpdateManyMutationInput;
    if (solicitud.accion) {
      const estado = estadoTrasAccion(dto.estado, solicitud.accion, sesion.rol === "admin");
      if (estado === "en_revision" || estado === "aprobada") {
        const faltantes = faltantesRevision(dto);
        if (faltantes.length) throw new ErrorMarketing(`Completa antes de enviar a revisión: ${faltantes.join(", ")}.`);
      }
      cambios = {
        estado,
        ...(estado === "aprobada" ? { aprobadaPorId: userId, aprobadaAt: new Date() } : {}),
        ...(estado === "borrador" ? { aprobadaPorId: null, aprobadaAt: null } : {}),
      };
    } else {
      if (actual.estado !== "borrador") throw new ErrorMarketing("Solo se pueden editar borradores. Devuelve la campaña a borrador antes de modificarla.", 409);
      cambios = camposParaGuardar(validarCamposCampana(tipo, { ...camposDeDto(dto), ...solicitud.cambios }));
    }
    const resultado = await tx.campanaMarketing.updateMany({
      where: { id, orgId, tipo, version: solicitud.version, estado: actual.estado },
      data: { ...cambios, version: { increment: 1 } },
    });
    if (resultado.count !== 1) throw new ErrorMarketing("Otra persona actualizó esta campaña. Recarga para revisar la versión más reciente.", 409);
    return campanaDto(await tx.campanaMarketing.findFirstOrThrow({ where: { id, orgId, tipo } }));
  });
}

export function respuestaErrorMarketing(error: unknown): Response {
  if (error instanceof ErrorMarketing) return Response.json({ error: error.message }, { status: error.status });
  throw error;
}
