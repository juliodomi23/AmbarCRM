import type { CSSProperties } from "react";
import { normalizarMarca, variablesMarca } from "@/lib/brand";
import { db, runWithOrg } from "@/lib/db";
import { enlaceAprobacionTaller, TEXTO_ESTADO_TALLER } from "@/lib/taller-whatsapp";

const DIAS_VIGENCIA_ENTREGADO = 30;
const TOKEN_SEGUIMIENTO = /^(\d+)-([a-f0-9]{48})$/;

export function partesTokenSeguimiento(token: string) {
  const match = TOKEN_SEGUIMIENTO.exec(token);
  return match ? { orgId: BigInt(match[1]), valor: match[2] } : null;
}

export type EstadoPublicoTaller = {
  numero: string;
  estado: string;
  estadoTexto: string;
  vehiculo: { marca: string; modelo: string; anio: number | null; placa: string; color: string | null };
  fechaPromesa: string | null;
  saldo: number;
  entregadoEn: string | null;
  enlaceAprobacion: string | null;
};

export type VistaEstadoTaller = {
  marca: { nombre: string; logo: string | null; estilo: CSSProperties };
  orden: EstadoPublicoTaller;
};

/**
 * Datos que puede ver el cliente final: estado, vehículo, promesa y saldo.
 * Nunca expone conceptos, precios unitarios ni teléfonos.
 */
export async function cargarEstadoPublico(token: string): Promise<VistaEstadoTaller | null> {
  const partes = partesTokenSeguimiento(token);
  if (!partes) return null;
  return runWithOrg(partes.orgId, async () => {
    const modulo = await db.moduloOrg.findFirst({ where: { clave: "taller", activo: true }, select: { id: true } });
    if (!modulo) return null;
    const orden = await db.tallerOrden.findFirst({
      where: { seguimientoToken: partes.valor },
      select: {
        numero: true,
        estado: true,
        fechaPromesa: true,
        total: true,
        updatedAt: true,
        aprobacionToken: true,
        vehiculo: { select: { marca: true, modelo: true, anio: true, placa: true, color: true } },
        pagos: { select: { monto: true } },
        cambios: { where: { estado: "entregado" }, orderBy: { creadoAt: "desc" }, take: 1, select: { creadoAt: true } },
      },
    });
    if (!orden || orden.estado === "cancelado") return null;
    const entregadoEn = orden.cambios[0]?.creadoAt ?? (orden.estado === "entregado" ? orden.updatedAt : null);
    if (
      entregadoEn &&
      Date.now() - new Date(entregadoEn).getTime() > DIAS_VIGENCIA_ENTREGADO * 24 * 60 * 60 * 1000
    ) {
      return null;
    }
    const pagado = orden.pagos.reduce((suma, pago) => suma + Number(pago.monto), 0);
    const saldo = Math.max(0, Number(orden.total) - pagado);
    const ajustes = await db.ajustes.findUnique({
      where: { orgId: partes.orgId },
      select: { marcaNombre: true, marcaLogo: true, marcaColorPrimario: true, marcaColorAcento: true, marcaPreset: true },
    });
    const marca = normalizarMarca(ajustes);
    let enlaceAprobacion: string | null = null;
    if (orden.estado === "esperando_aprobacion" && orden.aprobacionToken) {
      try {
        enlaceAprobacion = enlaceAprobacionTaller(partes.orgId, orden.aprobacionToken);
      } catch {
        enlaceAprobacion = null;
      }
    }
    return {
      marca: { nombre: marca.nombre, logo: marca.logo, estilo: variablesMarca(marca) as CSSProperties },
      orden: {
        numero: String(orden.numero),
        estado: orden.estado,
        estadoTexto: TEXTO_ESTADO_TALLER[orden.estado] ?? orden.estado.replaceAll("_", " "),
        vehiculo: orden.vehiculo,
        fechaPromesa: orden.fechaPromesa?.toISOString() ?? null,
        saldo,
        entregadoEn: entregadoEn?.toISOString() ?? null,
        enlaceAprobacion,
      },
    };
  });
}
