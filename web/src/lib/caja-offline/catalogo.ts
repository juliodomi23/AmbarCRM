import { Prisma } from "@prisma/client";
import { calcularLineaPura } from "@/lib/precios-puro";
import { fechaLocal } from "@/lib/reservas/horarios";
import { claveIdentidad, type Almacen } from "@/lib/caja-offline/almacen";
import type { CatalogoCaja, ProductoCatalogoCaja } from "@/lib/caja-offline/tipos";

export type IdentidadCaja = { orgId: string; userId: string };

export type CatalogoLocal = {
  identidad: IdentidadCaja;
  sinTopeDescuento: boolean;
  catalogo: CatalogoCaja;
  guardadoAt: string;
};

export type Sincronizacion =
  | { estado: "actualizado" | "local"; datos: CatalogoLocal }
  | { estado: "apagado" | "sin_catalogo" };

export async function leerCatalogoLocal(almacen: Almacen, identidad: IdentidadCaja) {
  return almacen.obtener<CatalogoLocal>("catalogo", claveIdentidad(identidad));
}

/**
 * Baja el catálogo con red y lo guarda por identidad; sin red (o con error del servidor) usa el último guardado.
 * 403 SIN_RED_APAGADO borra el catálogo local: el modo ya no está permitido para la empresa.
 */
export async function sincronizarCatalogo(
  almacen: Almacen,
  identidad: IdentidadCaja,
  buscar: typeof fetch = fetch,
): Promise<Sincronizacion> {
  try {
    const respuesta = await buscar("/api/caja/catalogo", { cache: "no-store" });
    if (respuesta.status === 403) {
      await almacen.borrar("catalogo", claveIdentidad(identidad));
      return { estado: "apagado" };
    }
    if (respuesta.ok) {
      const cuerpo = await respuesta.json();
      if (cuerpo.identidad?.orgId === identidad.orgId && cuerpo.identidad?.userId === identidad.userId) {
        const datos: CatalogoLocal = {
          identidad,
          sinTopeDescuento: Boolean(cuerpo.sinTopeDescuento),
          catalogo: cuerpo.catalogo,
          guardadoAt: new Date().toISOString(),
        };
        await almacen.guardar("catalogo", claveIdentidad(identidad), datos);
        return { estado: "actualizado", datos };
      }
    }
  } catch {
    /* sin red: se usa el catálogo local */
  }
  const local = await leerCatalogoLocal(almacen, identidad);
  return local ? { estado: "local", datos: local } : { estado: "sin_catalogo" };
}

const decimal = (valor: string) => new Prisma.Decimal(valor);

/** Mismo cálculo que `calcularPrecios` del servidor (lista pública), con el catálogo guardado. */
export function calcularLineaLocal(
  catalogo: CatalogoCaja,
  producto: ProductoCatalogoCaja,
  cantidad: string,
  ahora: Date = new Date(),
) {
  const linea = calcularLineaPura({
    productoId: producto.id,
    categoria: producto.categoria,
    precioCatalogo: decimal(producto.precio),
    precioLista: producto.precioLista === null ? null : decimal(producto.precioLista),
    escalas: producto.escalas.map((escala) => ({ desde: decimal(escala.desde), precio: decimal(escala.precio) })),
    cantidad: decimal(cantidad),
    promociones: catalogo.promociones.map((promo) => ({ ...promo, valor: promo.valor === null ? null : decimal(promo.valor) })),
    hoy: fechaLocal(ahora, catalogo.zona),
  });
  return {
    precioUnitario: linea.precioUnitario.toFixed(2),
    bruto: linea.bruto.toFixed(2),
    descuentoPromocion: linea.descuentoPromocion.toFixed(2),
    promocionDescripcion: linea.promocionDescripcion,
    total: linea.total.toFixed(2),
    fuentePrecio: linea.fuentePrecio,
  };
}

/** Edad del catálogo en horas, para avisar cuando es viejo. */
export function horasDeCatalogo(datos: CatalogoLocal, ahora: Date = new Date()) {
  return (ahora.getTime() - new Date(datos.catalogo.generadoAt).getTime()) / 3_600_000;
}
