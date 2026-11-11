import { NextRequest, NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { serializar } from "@/lib/serialize";
import { transaccionTenant } from "@/lib/retail-db";
import { aBigInt } from "@/lib/ids";
import { texto } from "@/lib/despacho-api";
import { puedeEditarPieza } from "@/lib/contenido";

type Props = { params: Promise<{ id: string }> };

export const GET = conModulo("contenido", {}, async (_sesion, _req: NextRequest, props: Props) => {
  const piezaId = aBigInt((await props.params).id);
  if (!piezaId || piezaId <= 0n) return NextResponse.json({ error: "Pieza inválida" }, { status: 400 });
  const comentarios = await db.contenidoComentario.findMany({ where: { piezaId }, orderBy: { creadoAt: "asc" } });
  return NextResponse.json(serializar({ comentarios }));
});

export const POST = conModulo("contenido", {}, async (sesion, req: NextRequest, props: Props) => {
  const piezaId = aBigInt((await props.params).id);
  if (!piezaId || piezaId <= 0n) return NextResponse.json({ error: "Pieza inválida" }, { status: 400 });
  if (sesion.userId === null) return NextResponse.json({ error: "Sesión sin usuario" }, { status: 403 });
  const body = await req.json().catch(() => null);
  const contenido = texto(body?.texto).slice(0, 5000);
  const tipo = texto(body?.tipo) || "comentario";
  if (!contenido) return NextResponse.json({ error: "Escribe un comentario" }, { status: 400 });
  if (!["comentario", "cambio_solicitado"].includes(tipo)) return NextResponse.json({ error: "Tipo de comentario inválido" }, { status: 400 });
  const result = await transaccionTenant(sesion.orgId!, async (tx) => {
    const pieza = await tx.contenidoPieza.findUnique({ where: { id: piezaId } });
    if (!pieza) return { error: "Pieza no encontrada", status: 404 } as const;
    if (!puedeEditarPieza(pieza, sesion.userId, sesion.puesto, sesion.rol)) {
      return { error: "No tienes permiso para comentar esta pieza", status: 403 } as const;
    }
    const comentario = await tx.contenidoComentario.create({
      data: { piezaId, usuarioId: sesion.userId!, texto: contenido, tipo },
    });
    let estado = pieza.estado;
    if (tipo === "cambio_solicitado" && pieza.estado === "revision") {
      estado = "cambios";
      await tx.contenidoPieza.update({ where: { id: piezaId }, data: { estado, version: { increment: 1 } } });
      await tx.contenidoCambio.create({
        data: { piezaId, estadoAnterior: pieza.estado, estadoNuevo: estado, userId: sesion.userId, nota: contenido.slice(0, 500) },
      });
    }
    return { comentario, estado } as const;
  });
  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json(serializar({ comentario: result.comentario, estado: result.estado }), { status: 201 });
});
