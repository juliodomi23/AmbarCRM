import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aBigInt } from "@/lib/ids";
import { requireSesion } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const sesion = await requireSesion();
  if ("error" in sesion) return sesion.error;

  const id = aBigInt((await params).id);
  if (!id) {
    return NextResponse.json({ error: "contacto inválido" }, { status: 400 });
  }

  const contacto = await db.contacto.findUnique({
    where: { id },
    select: {
      id: true,
      nombre: true,
      telefono: true,
      email: true,
      empresa: true,
      notas: true,
      fuente: true,
      optOutDifusion: true,
      campos: true,
      responsable: { select: { nombre: true } },
      expediente: { select: { id: true } },
      etiquetas: {
        select: {
          etiqueta: { select: { id: true, nombre: true, color: true } },
        },
      },
      oportunidades: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          titulo: true,
          valor: true,
          moneda: true,
          estado: true,
          createdAt: true,
          embudo: { select: { id: true, nombre: true } },
          etapa: { select: { id: true, nombre: true, color: true } },
        },
      },
    },
  });
  if (!contacto) {
    return NextResponse.json(
      { error: "contacto no encontrado" },
      { status: 404 },
    );
  }

  return NextResponse.json(
    {
      id: String(contacto.id),
      nombre: contacto.nombre,
      telefono: contacto.telefono,
      email: contacto.email,
      empresa: contacto.empresa,
      notas: contacto.notas,
      fuente: contacto.fuente,
      responsable: contacto.responsable?.nombre ?? null,
      optOutDifusion: contacto.optOutDifusion,
      esCliente: Boolean(contacto.expediente),
      campos: contacto.campos,
      etiquetas: contacto.etiquetas.map(({ etiqueta }) => ({
        id: String(etiqueta.id),
        nombre: etiqueta.nombre,
        color: etiqueta.color,
      })),
      oportunidades: contacto.oportunidades.map((oportunidad) => ({
        id: String(oportunidad.id),
        titulo: oportunidad.titulo,
        valor: Number(oportunidad.valor),
        moneda: oportunidad.moneda,
        estado: oportunidad.estado,
        embudoId: String(oportunidad.embudo.id),
        embudoNombre: oportunidad.embudo.nombre,
        etapaId: String(oportunidad.etapa.id),
        etapaNombre: oportunidad.etapa.nombre,
        etapaColor: oportunidad.etapa.color,
        diasEnEtapa: Math.max(
          0,
          Math.floor(
            (Date.now() - oportunidad.createdAt.getTime()) / 86_400_000,
          ),
        ),
      })),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
