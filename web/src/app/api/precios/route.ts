import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { cantidad } from "@/lib/cantidad";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { dinero } from "@/lib/dinero";
import { serializar } from "@/lib/serialize";

const tiposLista = new Set(["publico", "cliente", "mayoreo"]);
const tiposPromocion = new Set(["porcentaje", "monto", "nxm", "precio_especial"]);
const id = (valor: unknown) => /^\d+$/.test(String(valor ?? "")) ? BigInt(String(valor)) : null;
const fecha = (valor: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(valor ?? "")) ? new Date(`${valor}T12:00:00.000Z`) : null;

export const GET = conModulo("productos", { admin: true }, async () => {
  const [listas, escalas, promociones] = await Promise.all([
    db.listaPrecio.findMany({ include: { productos: { include: { producto: true } }, _count: { select: { contactos: true } } }, orderBy: { nombre: "asc" } }),
    db.precioVolumen.findMany({ include: { producto: true }, orderBy: [{ productoId: "asc" }, { desde: "asc" }] }),
    db.promocion.findMany({ include: { producto: true }, orderBy: [{ activa: "desc" }, { termina: "desc" }] }),
  ]);
  return NextResponse.json(serializar({ listas, escalas, promociones }));
});

export const POST = conModulo("productos", { admin: true }, async (_sesion, req: NextRequest) => {
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const accion = String(body.accion ?? "");
  try {
    if (accion === "lista") {
      const nombre = String(body.nombre ?? "").trim();
      const tipo = String(body.tipo ?? "cliente");
      if (!nombre || nombre.length > 120 || !tiposLista.has(tipo)) return NextResponse.json({ error: "Revisa nombre y tipo de lista" }, { status: 400 });
      const lista = await db.listaPrecio.create({ data: { nombre, tipo } });
      return NextResponse.json(serializar({ lista }), { status: 201 });
    }
    if (accion === "asignar_lista") {
      const contactoId = id(body.contactoId);
      const listaId = body.listaId ? id(body.listaId) : null;
      if (!contactoId || (body.listaId && !listaId)) return NextResponse.json({ error: "Cliente o lista inválidos" }, { status: 400 });
      if (listaId && !(await db.listaPrecio.findUnique({ where: { id: listaId } }))) return NextResponse.json({ error: "Lista no encontrada" }, { status: 404 });
      const contacto = await db.contacto.update({ where: { id: contactoId }, data: { listaPrecioId: listaId } });
      return NextResponse.json(serializar({ contacto }));
    }
    if (accion === "volumen") {
      const productoId = id(body.productoId);
      const desde = cantidad(body.desde, new Prisma.Decimal("0.001"));
      const precio = dinero(body.precio);
      if (!productoId || !desde || precio === null) return NextResponse.json({ error: "Revisa producto, cantidad y precio" }, { status: 400 });
      const escala = await db.precioVolumen.upsert({
        where: { productoId_desde: { productoId, desde } },
        create: { productoId, desde, precio },
        update: { precio },
      });
      return NextResponse.json(serializar({ escala }), { status: 201 });
    }
    if (accion === "precio_lista") {
      const listaId = id(body.listaId);
      const productoId = id(body.productoId);
      const precio = dinero(body.precio);
      if (!listaId || !productoId || precio === null) return NextResponse.json({ error: "Revisa lista, producto y precio" }, { status: 400 });
      const precioLista = await db.listaPrecioProducto.upsert({
        where: { listaId_productoId: { listaId, productoId } },
        create: { listaId, productoId, precio },
        update: { precio },
      });
      return NextResponse.json(serializar({ precioLista }), { status: 201 });
    }
    if (accion === "promocion") {
      const nombre = String(body.nombre ?? "").trim();
      const tipo = String(body.tipo ?? "");
      const productoId = body.productoId ? id(body.productoId) : null;
      const categoria = String(body.categoria ?? "").trim() || null;
      const valorNumero = body.valor === "" || body.valor == null ? null : dinero(body.valor);
      const cantidadCompra = body.cantidadCompra == null ? null : Number(body.cantidadCompra);
      const cantidadPaga = body.cantidadPaga == null ? null : Number(body.cantidadPaga);
      const inicia = fecha(body.inicia);
      const termina = fecha(body.termina);
      const nxmValido = tipo === "nxm" && Number.isInteger(cantidadCompra) && Number.isInteger(cantidadPaga) && cantidadCompra! > 1 && cantidadPaga! > 0 && cantidadPaga! < cantidadCompra!;
      const valorValido = tipo !== "nxm" && valorNumero !== null;
      if (!nombre || !tiposPromocion.has(tipo) || (!productoId && !categoria) || !inicia || !termina || termina < inicia || (!nxmValido && !valorValido)) {
        return NextResponse.json({ error: "Revisa los datos de la promoción" }, { status: 400 });
      }
      const promocion = await db.promocion.create({ data: { nombre, tipo, productoId, categoria, valor: valorNumero, cantidadCompra, cantidadPaga, inicia, termina } });
      return NextResponse.json(serializar({ promocion }), { status: 201 });
    }
    return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Ya existe un registro con esos datos" }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Registro no encontrado" }, { status: 404 });
    }
    throw error;
  }
});

export const DELETE = conModulo("productos", { admin: true }, async (_sesion, req: NextRequest) => {
  const recurso = req.nextUrl.searchParams.get("recurso");
  const registroId = id(req.nextUrl.searchParams.get("id"));
  if (!registroId) return NextResponse.json({ error: "Id inválido" }, { status: 400 });
  if (recurso === "lista") await db.listaPrecio.delete({ where: { id: registroId } });
  else if (recurso === "volumen") await db.precioVolumen.delete({ where: { id: registroId } });
  else if (recurso === "promocion") await db.promocion.delete({ where: { id: registroId } });
  else return NextResponse.json({ error: "Recurso no válido" }, { status: 400 });
  return NextResponse.json({ ok: true });
});
