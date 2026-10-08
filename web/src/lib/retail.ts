import { dinero } from "./dinero.ts";
import { Prisma } from "@prisma/client";

export const ESTADOS_VENTA = [
  "borrador",
  "pendiente",
  "pagada",
  "preparando",
  "lista",
  "entregada",
  "cancelada",
] as const;

export const CANALES_VENTA = ["mostrador", "whatsapp", "tienda_en_linea", "telefono"] as const;
export const METODOS_PAGO = ["efectivo", "tarjeta", "transferencia", "enlace", "otro"] as const;
export const TIPOS_MOVIMIENTO = ["entrada", "salida"] as const;
export const ESTADOS_COMPRA = ["borrador", "ordenada", "recibida", "cancelada"] as const;

export type EstadoVenta = (typeof ESTADOS_VENTA)[number];
export type CanalVenta = (typeof CANALES_VENTA)[number];
export type MetodoPago = (typeof METODOS_PAGO)[number];
export type TipoMovimiento = (typeof TIPOS_MOVIMIENTO)[number];
export type EstadoCompra = (typeof ESTADOS_COMPRA)[number];

function texto(valor: unknown) {
  return String(valor ?? "").trim() || null;
}

function entero(valor: unknown, minimo = 0) {
  const numero = Number(valor);
  return Number.isInteger(numero) && numero >= minimo ? numero : null;
}

function decimal(valor: unknown) {
  return dinero(valor);
}

function idBigInt(valor: unknown) {
  const textoId = String(valor ?? "");
  return /^\d+$/.test(textoId) ? BigInt(textoId) : null;
}

export function validarProducto(body: Record<string, unknown>) {
  const nombre = texto(body.nombre);
  const precio = decimal(body.precio);
  const costo = decimal(body.costo ?? 0);
  const stock = entero(body.stock ?? 0);
  const stockMinimo = entero(body.stockMinimo ?? 0);

  if (!nombre) return { error: "El nombre del producto es obligatorio" } as const;
  if (precio === null) return { error: "El precio no es válido" } as const;
  if (costo === null) return { error: "El costo no es válido" } as const;
  if (stock === null) return { error: "La existencia no es válida" } as const;
  if (stockMinimo === null) return { error: "El stock mínimo no es válido" } as const;

  const data: Prisma.ProductoUncheckedCreateInput = {
    nombre,
    sku: texto(body.sku)?.toUpperCase() ?? null,
    codigoBarras: texto(body.codigoBarras),
    categoria: texto(body.categoria),
    descripcion: texto(body.descripcion),
    precio,
    costo,
    stock,
    stockMinimo,
    moneda: texto(body.moneda) ?? "MXN",
    fotoUrl: texto(body.fotoUrl),
    activo: body.activo === undefined ? true : Boolean(body.activo),
  };
  return { data } as const;
}

export function validarMovimiento(body: Record<string, unknown>) {
  const tipo = String(body.tipo ?? "") as TipoMovimiento;
  const cantidad = entero(body.cantidad, 1);
  if (!TIPOS_MOVIMIENTO.includes(tipo)) {
    return { error: "El tipo de movimiento no es válido" } as const;
  }
  if (cantidad === null) return { error: "La cantidad debe ser un entero mayor a cero" } as const;
  return { tipo, cantidad, motivo: texto(body.motivo) } as const;
}

export function validarProveedor(body: Record<string, unknown>) {
  const nombre = texto(body.nombre);
  if (!nombre) return { error: "El nombre del proveedor es obligatorio" } as const;
  const email = texto(body.email)?.toLowerCase() ?? null;
  if (email && !/^\S+@\S+\.\S+$/.test(email)) {
    return { error: "El correo del proveedor no es válido" } as const;
  }
  return {
    data: {
      nombre,
      contactoNombre: texto(body.contactoNombre),
      telefono: texto(body.telefono),
      email,
      rfc: texto(body.rfc)?.toUpperCase() ?? null,
      notas: texto(body.notas),
      activo: body.activo === undefined ? true : Boolean(body.activo),
    } satisfies Prisma.ProveedorUncheckedCreateInput,
  } as const;
}

export type PartidaEntrada = { productoId: bigint; cantidad: number };
export type PartidaCompraEntrada = PartidaEntrada & { costoUnitario: number };

export function validarVenta(body: Record<string, unknown>) {
  const estado = String(body.estado ?? "pendiente") as EstadoVenta;
  const canal = String(body.canal ?? "mostrador") as CanalVenta;
  const metodoPagoValor = texto(body.metodoPago);
  const metodoPago = metodoPagoValor as MetodoPago | null;
  const descuento = decimal(body.descuento ?? 0);
  const contactoId = body.contactoId ? idBigInt(body.contactoId) : null;

  if (!ESTADOS_VENTA.includes(estado)) return { error: "El estado no es válido" } as const;
  if (!CANALES_VENTA.includes(canal)) return { error: "El canal no es válido" } as const;
  if (metodoPago && !METODOS_PAGO.includes(metodoPago)) {
    return { error: "El método de pago no es válido" } as const;
  }
  if (descuento === null) return { error: "El descuento no es válido" } as const;
  if (body.contactoId && contactoId === null) return { error: "El cliente no es válido" } as const;
  if (!Array.isArray(body.partidas) || body.partidas.length === 0) {
    return { error: "Agrega al menos un producto" } as const;
  }

  const acumuladas = new Map<string, PartidaEntrada>();
  for (const valor of body.partidas) {
    if (!valor || typeof valor !== "object") return { error: "Hay una partida inválida" } as const;
    const partida = valor as Record<string, unknown>;
    const productoId = idBigInt(partida.productoId);
    const cantidad = entero(partida.cantidad, 1);
    if (productoId === null || cantidad === null) {
      return { error: "Revisa los productos y sus cantidades" } as const;
    }
    const clave = String(productoId);
    const anterior = acumuladas.get(clave);
    acumuladas.set(clave, {
      productoId,
      cantidad: cantidad + (anterior?.cantidad ?? 0),
    });
  }

  return {
    data: {
      estado,
      canal,
      metodoPago,
      descuento,
      contactoId,
      notas: texto(body.notas),
      partidas: [...acumuladas.values()],
    },
  } as const;
}

export function estadoUsaInventario(estado: string) {
  return estado !== "borrador" && estado !== "cancelada";
}

export function validarCompra(body: Record<string, unknown>) {
  const proveedorId = idBigInt(body.proveedorId);
  const estado = String(body.estado ?? "ordenada") as EstadoCompra;
  if (proveedorId === null) return { error: "Selecciona un proveedor" } as const;
  if (!ESTADOS_COMPRA.includes(estado)) return { error: "El estado no es válido" } as const;
  if (!Array.isArray(body.partidas) || body.partidas.length === 0) {
    return { error: "Agrega al menos un producto" } as const;
  }
  const acumuladas = new Map<string, PartidaCompraEntrada>();
  for (const valor of body.partidas) {
    if (!valor || typeof valor !== "object") return { error: "Hay una partida inválida" } as const;
    const partida = valor as Record<string, unknown>;
    const productoId = idBigInt(partida.productoId);
    const cantidad = entero(partida.cantidad, 1);
    const costoUnitario = decimal(partida.costoUnitario);
    if (productoId === null || cantidad === null || costoUnitario === null) {
      return { error: "Revisa los productos, cantidades y costos" } as const;
    }
    const clave = String(productoId);
    acumuladas.set(clave, {
      productoId,
      cantidad: cantidad + (acumuladas.get(clave)?.cantidad ?? 0),
      costoUnitario,
    });
  }
  return {
    data: {
      proveedorId,
      estado,
      notas: texto(body.notas),
      partidas: [...acumuladas.values()],
    },
  } as const;
}

export function compraUsaInventario(estado: string) {
  return estado === "recibida";
}

export function folioVenta() {
  return `V-${Date.now().toString(36).toUpperCase()}`;
}

export function folioCompra() {
  return `C-${Date.now().toString(36).toUpperCase()}`;
}
