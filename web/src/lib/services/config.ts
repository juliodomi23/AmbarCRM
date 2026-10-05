import { db } from "@/lib/db";

export function getEmbudosConEtapas() {
  return db.embudo.findMany({
    orderBy: { orden: "asc" },
    include: { etapas: { orderBy: { orden: "asc" } } }
  });
}

export function listarUsuarios() {
  return db.usuario.findMany({ orderBy: { nombre: "asc" } });
}

export async function listarCanales() {
  const canales = await db.canalWhatsapp.findMany({
    where: { proveedor: "cloud_api" },
    orderBy: { id: "asc" }
  });
  return canales.map((canal) => {
    const config = (canal.config || {}) as Record<string, unknown>;
    return {
      id: canal.id,
      orgId: canal.orgId,
      nombre: canal.nombre,
      proveedor: canal.proveedor,
      telefono: canal.telefono,
      instancia: canal.instancia,
      estado: canal.estado,
      activo: canal.activo,
      createdAt: canal.createdAt,
      credencialesConfiguradas: Boolean(config.tokenEncrypted || config.token),
      wabaId: typeof config.wabaId === "string" ? config.wabaId : null,
      phoneNumberId: typeof config.phoneNumberId === "string" ? config.phoneNumberId : null
    };
  });
}

export function listarPlantillas() {
  return db.plantillaMensaje.findMany({ orderBy: { nombre: "asc" } });
}

const AJUSTES_DEFAULT = {
  id: 0n,
  autoAsignar: false,
  bienvenidaActiva: false,
  bienvenidaTexto: "" as string | null,
  crearLeadAuto: true,
  csatActivo: false,
  csatTexto: "" as string | null,
  horarioActivo: false,
  horarioInicio: "" as string | null,
  horarioFin: "" as string | null,
  horarioDias: "" as string | null,
  fueraHorarioTexto: "" as string | null,
  autoResolverActivo: false,
  autoResolverHoras: 24,
  nombreNegocio: "" as string | null,
  iaPromptSistema: "" as string | null,
  marcaNombre: null as string | null,
  marcaLogo: null as string | null,
  marcaColorPrimario: null as string | null,
  marcaColorAcento: null as string | null,
  marcaPreset: null as string | null,
  updatedAt: new Date()
};

/** Lee la fila única de ajustes (o defaults si aún no existe). */
export async function getAjustes() {
  const a = await db.ajustes.findFirst({ orderBy: { id: "asc" } });
  return a ?? AJUSTES_DEFAULT;
}

/** Actualiza la fila única de ajustes (la crea si no existe). */
export async function actualizarAjustes(data: {
  autoAsignar?: boolean;
  bienvenidaActiva?: boolean;
  bienvenidaTexto?: string | null;
  crearLeadAuto?: boolean;
  csatActivo?: boolean;
  csatTexto?: string | null;
  horarioActivo?: boolean;
  horarioInicio?: string | null;
  horarioFin?: string | null;
  horarioDias?: string | null;
  fueraHorarioTexto?: string | null;
  autoResolverActivo?: boolean;
  autoResolverHoras?: number;
  nombreNegocio?: string | null;
  iaPromptSistema?: string | null;
  marcaNombre?: string | null;
  marcaLogo?: string | null;
  marcaColorPrimario?: string | null;
  marcaColorAcento?: string | null;
  marcaPreset?: string | null;
}) {
  const a = await db.ajustes.findFirst({ orderBy: { id: "asc" } });
  if (a) return db.ajustes.update({ where: { id: a.id }, data });
  return db.ajustes.create({ data });
}
