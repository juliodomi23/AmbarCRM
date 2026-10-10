import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { db, dbRaw, runWithOrg } from "@/lib/db";
import { bloquearProductos, ErrorRetail, transaccionTenant } from "@/lib/retail-db";
import { cantidadPedidoValida, configPedidos, type ConfigPedidos, type PartidaPedidoEntrada } from "@/lib/pedidos";
import { calcularPrecios } from "@/lib/precios-db";

export class ErrorPedido extends ErrorRetail {}

export async function negocioPublico(slug: string) {
  const org = await dbRaw.org.findUnique({ where: { slug }, select: { id: true, activo: true, nombre: true } });
  if (!org?.activo) return null;
  const modulos = await runWithOrg(org.id, () =>
    db.moduloOrg.findMany({
      where: { clave: { in: ["pedidos_en_linea", "productos", "ventas"] }, activo: true },
      select: { clave: true, config: true },
    }),
  );
  const pedido = modulos.find((modulo) => modulo.clave === "pedidos_en_linea");
  if (!pedido || !modulos.some((m) => m.clave === "productos") || !modulos.some((m) => m.clave === "ventas")) return null;
  return { orgId: org.id, nombre: org.nombre, config: configPedidos(pedido.config) };
}

export async function orgDeTokenPedido(token: string) {
  if (!/^[0-9a-f]{32}$/.test(token)) return null;
  const [fila] = await dbRaw.$queryRaw<{ org_id: bigint | null }[]>`
    SELECT resolve_org_by_pedido_token(${token}) AS org_id
  `;
  return fila?.org_id ?? null;
}

async function bloqueoLogico(tx: Prisma.TransactionClient, clave: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${clave}, 0))`;
}

function folioPedido() {
  return `WEB-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
}

type CrearPedido = {
  uuidCliente: string;
  nombre: string;
  telefono10: string;
  ip: string;
  tipoEntrega: "domicilio" | "recoger";
  direccion: string | null;
  horarioDeseado: Date | null;
  notas: string | null;
  partidas: PartidaPedidoEntrada[];
};

/** Reserva existencia sin escribir stock. Los locks serializan idempotencia, límites y disponibilidad. */
export async function crearPedido(orgId: bigint, config: ConfigPedidos, datos: CrearPedido) {
  return transaccionTenant(orgId, async (tx) => {
    for (const clave of [`pedido:uuid:${datos.uuidCliente}`, `pedido:tel:${datos.telefono10}`, `pedido:ip:${datos.ip}`].sort()) {
      await bloqueoLogico(tx, `${orgId}:${clave}`);
    }
    const repetido = await tx.venta.findFirst({ where: { uuidCliente: datos.uuidCliente, canal: "tienda_en_linea" } });
    if (repetido) return { venta: repetido, repetido: true };

    const desde = new Date(Date.now() - 24 * 60 * 60_000);
    const [porTelefono, porIp] = await Promise.all([
      tx.venta.count({ where: { canal: "tienda_en_linea", createdAt: { gte: desde }, contacto: { telefono: { endsWith: datos.telefono10 } } } }),
      tx.venta.count({ where: { canal: "tienda_en_linea", createdAt: { gte: desde }, pedidoIp: datos.ip } }),
    ]);
    if (porTelefono >= config.maxPorTelefono) throw new ErrorPedido("Ya hiciste varios pedidos hoy. Contacta al negocio para pedir más.", 429);
    if (porIp >= config.maxPorIp) throw new ErrorPedido("Se alcanzó el límite de pedidos desde esta conexión.", 429);

    await bloquearProductos(tx, datos.partidas.map((partida) => partida.productoId));
    const productos = await tx.producto.findMany({
      where: { id: { in: datos.partidas.map((p) => p.productoId) }, activo: true, visibleEnLinea: true },
    });
    if (productos.length !== datos.partidas.length) throw new ErrorPedido("Uno de los productos ya no está disponible", 404);
    const reservadas = await tx.reservaPedido.groupBy({
      by: ["productoId"],
      where: { productoId: { in: productos.map((p) => p.id) }, activa: true },
      _sum: { cantidad: true },
    });
    const porProducto = new Map(reservadas.map((r) => [String(r.productoId), r._sum.cantidad ?? new Prisma.Decimal(0)]));
    const precios = await calcularPrecios(tx, datos.partidas, { publico: true });
    const precioPorProducto = new Map(precios.map((precio) => [String(precio.producto.id), precio]));
    let subtotal = new Prisma.Decimal(0);
    let descuentoPromociones = new Prisma.Decimal(0);
    const calculadas = datos.partidas.map((partida) => {
      const producto = productos.find((p) => p.id === partida.productoId)!;
      const precio = precioPorProducto.get(String(producto.id))!;
      if (!cantidadPedidoValida(partida.cantidad, producto.vendePorPeso)) throw new ErrorPedido(`Cantidad inválida para ${producto.nombre}`, 400);
      const disponible = producto.stock.minus(porProducto.get(String(producto.id)) ?? 0);
      if (producto.agotadoManual || disponible.lt(partida.cantidad)) throw new ErrorPedido(`${producto.nombre} está agotado`, 409);
      const total = precio.total;
      subtotal = subtotal.plus(precio.bruto);
      descuentoPromociones = descuentoPromociones.plus(precio.descuentoPromocion);
      return { producto, cantidad: partida.cantidad, precio, total };
    });
    const subtotalNeto = subtotal.minus(descuentoPromociones);
    if (subtotalNeto.lt(config.minimoCompra)) throw new ErrorPedido(`El pedido mínimo es de $${config.minimoCompra.toFixed(2)}`, 409);
    const costoEnvio = datos.tipoEntrega === "domicilio" ? config.costoEnvio : new Prisma.Decimal(0);

    let contacto = await tx.contacto.findFirst({ where: { telefono: { endsWith: datos.telefono10 } } });
    contacto ??= await tx.contacto.create({ data: { nombre: datos.nombre, telefono: `52${datos.telefono10}`, fuente: "web" } });
    const venta = await tx.venta.create({
      data: {
        folio: folioPedido(), contactoId: contacto.id, uuidCliente: datos.uuidCliente,
        tokenSeguimiento: crypto.randomBytes(16).toString("hex"), estado: "pendiente", canal: "tienda_en_linea",
        tipoEntrega: datos.tipoEntrega, direccionEntrega: datos.direccion, horarioDeseado: datos.horarioDeseado,
        costoEnvio, pedidoIp: datos.ip, subtotal, descuento: descuentoPromociones, total: subtotalNeto.plus(costoEnvio), notas: datos.notas, stockAplicado: false,
        partidas: { create: calculadas.map(({ producto, cantidad, precio, total }) => ({
          productoId: producto.id,
          cantidad,
          precioUnitario: precio.precioUnitario,
          costoUnitario: null,
          descuento: precio.descuentoPromocion,
          descuentoPromocion: precio.descuentoPromocion,
          promocionDescripcion: precio.promocionDescripcion,
          total,
        })) },
        reservasPedido: { create: calculadas.map(({ producto, cantidad }) => ({ productoId: producto.id, cantidad })) },
      },
      include: { contacto: true, partidas: { include: { producto: true } } },
    });
    let conversacion = await tx.conversacion.findFirst({ where: { contactoId: contacto.id }, orderBy: { ultimoMensajeAt: "desc" } });
    conversacion ??= await tx.conversacion.create({ data: { contactoId: contacto.id, ultimoMensajeAt: new Date() } });
    await tx.mensaje.create({
      data: { conversacionId: conversacion.id, direccion: "saliente", interna: true, contenido: `Nuevo pedido ${venta.folio} por $${venta.total.toFixed(2)}` },
    });
    return { venta, repetido: false };
  });
}
