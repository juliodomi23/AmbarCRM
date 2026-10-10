import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { normalizarMarca } from "@/lib/brand";
import { db, runWithOrg } from "@/lib/db";
import { enviarPushAOrg } from "@/lib/push";
import { ipCliente } from "@/lib/rate-limit";
import { avisarClientePedido } from "@/lib/pedidos-envio";
import { crearPedido, ErrorPedido, negocioPublico } from "@/lib/pedidos-db";
import { validarPartidasPedido } from "@/lib/pedidos";
import { errorPublico, limitarIp, telefonoMx } from "@/lib/reservas/publico";
import { getAjustes } from "@/lib/services/config";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };

export async function GET(req: NextRequest, { params }: Props) {
  const limitado = limitarIp(req, "tienda-consulta", 120, 60_000);
  if (limitado) return limitado;
  const negocio = await negocioPublico((await params).slug);
  if (!negocio) return errorPublico("Este negocio no tiene pedidos en línea", 404);
  return runWithOrg(negocio.orgId, async () => {
    const [ajustes, productos, reservas] = await Promise.all([
      getAjustes(),
      db.producto.findMany({ where: { activo: true, visibleEnLinea: true }, orderBy: [{ categoria: "asc" }, { nombre: "asc" }] }),
      db.reservaPedido.groupBy({ by: ["productoId"], where: { activa: true }, _sum: { cantidad: true } }),
    ]);
    const ocupada = new Map(reservas.map((r) => [String(r.productoId), r._sum.cantidad ?? new Prisma.Decimal(0)]));
    const marca = normalizarMarca(ajustes);
    return NextResponse.json({
      negocio: { nombre: marca.nombre || negocio.nombre, logo: marca.logo, colorPrimario: marca.colorPrimario },
      config: {
        permiteEntrega: negocio.config.permiteEntrega, permiteRecoger: negocio.config.permiteRecoger,
        minimoCompra: negocio.config.minimoCompra.toFixed(2), costoEnvio: negocio.config.costoEnvio.toFixed(2),
      },
      productos: productos.map((producto) => {
        const disponible = Prisma.Decimal.max(producto.stock.minus(ocupada.get(String(producto.id)) ?? 0), 0);
        return {
          id: String(producto.id), nombre: producto.nombre, descripcion: producto.descripcion, categoria: producto.categoria,
          precio: producto.precio.toFixed(2), unidad: producto.unidad, vendePorPeso: producto.vendePorPeso,
          fotoUrl: producto.fotoUrl, etiquetas: producto.etiquetasEnLinea,
          agotado: producto.agotadoManual || disponible.lte(0), disponible: disponible.toFixed(3),
        };
      }),
    });
  });
}

export async function POST(req: NextRequest, { params }: Props) {
  const limitado = limitarIp(req, "tienda-pedido", 30, 60 * 60_000);
  if (limitado) return limitado;
  const negocio = await negocioPublico((await params).slug);
  if (!negocio) return errorPublico("Este negocio no tiene pedidos en línea", 404);
  const body = await req.json().catch(() => ({}));
  const uuidCliente = String(body.uuidCliente ?? "").trim();
  const nombre = String(body.nombre ?? "").trim().slice(0, 120);
  const telefono10 = telefonoMx(body.telefono);
  const tipoEntrega = body.tipoEntrega === "domicilio" ? "domicilio" : body.tipoEntrega === "recoger" ? "recoger" : null;
  const direccion = String(body.direccion ?? "").trim().slice(0, 500) || null;
  const notas = String(body.notas ?? "").trim().slice(0, 500) || null;
  const horarioDeseado = body.horarioDeseado ? new Date(String(body.horarioDeseado)) : null;
  const partidas = validarPartidasPedido(body.partidas);
  if (!/^[0-9a-f-]{36}$/i.test(uuidCliente) || !nombre || !telefono10 || !tipoEntrega || !partidas) return errorPublico("Revisa los datos del pedido", 400);
  if (horarioDeseado && Number.isNaN(+horarioDeseado)) return errorPublico("El horario no es válido", 400);
  if (tipoEntrega === "domicilio" && (!negocio.config.permiteEntrega || !direccion)) return errorPublico("La entrega a domicilio no está disponible o falta la dirección", 400);
  if (tipoEntrega === "recoger" && !negocio.config.permiteRecoger) return errorPublico("Recoger en tienda no está disponible", 400);
  const ip = ipCliente(Object.fromEntries(req.headers.entries()));
  try {
    const resultado = await crearPedido(negocio.orgId, negocio.config, { uuidCliente, nombre, telefono10, ip, tipoEntrega, direccion, horarioDeseado, notas, partidas });
    if (!resultado.repetido) {
      void runWithOrg(negocio.orgId, async () => {
        await Promise.allSettled([
          enviarPushAOrg("Nuevo pedido en línea", `${resultado.venta.folio} · $${resultado.venta.total.toFixed(2)}`, `/ventas/${resultado.venta.id}`),
          avisarClientePedido(resultado.venta.id, negocio.config),
        ]);
      });
    }
    return NextResponse.json({ token: resultado.venta.tokenSeguimiento, folio: resultado.venta.folio, total: resultado.venta.total.toFixed(2), repetido: resultado.repetido }, { status: resultado.repetido ? 200 : 201 });
  } catch (error) {
    if (error instanceof ErrorPedido) return errorPublico(error.message, error.status);
    throw error;
  }
}
