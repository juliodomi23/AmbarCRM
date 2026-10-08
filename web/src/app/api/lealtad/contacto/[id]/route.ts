import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { aBigInt } from "@/lib/ids";
import { conModulo } from "@/lib/con-modulo";
import {
  accionTarjeta,
  clientesAurum,
  conexionDe,
  ErrorAurum,
  ligaDeAlta,
  moduloLealtad,
} from "@/lib/aurum";
import { buscarCliente, tarjetaPublica } from "@/lib/lealtad";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

async function tarjetaDelContacto(id: string, fresco = false) {
  const contactoId = aBigInt(id);
  const contacto = contactoId
    ? await db.contacto.findFirst({ where: { id: contactoId }, select: { telefono: true } })
    : null;
  if (!contacto) throw new ErrorAurum("contacto inexistente", 404);
  const conexion = conexionDe((await moduloLealtad())?.config);
  if (!conexion) return { conexion: null, cliente: null };
  const cliente = buscarCliente(await clientesAurum(conexion, { fresco }), contacto.telefono);
  return { conexion, cliente };
}

function respuestaError(error: unknown) {
  if (error instanceof ErrorAurum) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  throw error;
}

export const GET = conModulo("lealtad", {}, async (_sesion, _req: NextRequest, { params }: Props) => {
  try {
    const { conexion, cliente } = await tarjetaDelContacto((await params).id);
    if (!conexion) return NextResponse.json({ conectado: false });
    return NextResponse.json({
      conectado: true,
      ligaAlta: ligaDeAlta(conexion.slug),
      tarjeta: cliente ? tarjetaPublica(cliente) : null,
    });
  } catch (error) {
    return respuestaError(error);
  }
});

/** Sellar o canjear desde el CRM. Body: { accion: "sellar" | "canjear" } */
export const POST = conModulo("lealtad", {}, async (_sesion, req: NextRequest, { params }: Props) => {
  const { accion } = await req.json().catch(() => ({}));
  if (accion !== "sellar" && accion !== "canjear") {
    return NextResponse.json({ error: "acción inválida" }, { status: 400 });
  }
  try {
    const { conexion, cliente } = await tarjetaDelContacto((await params).id, true);
    if (!conexion) return NextResponse.json({ error: "Aurum no está conectado" }, { status: 409 });
    if (!cliente) {
      return NextResponse.json({ error: "Este contacto no tiene tarjeta de lealtad" }, { status: 404 });
    }
    const resultado = await accionTarjeta(conexion, accion === "sellar" ? "stamp" : "redeem", cliente.token);
    return NextResponse.json({
      ok: true,
      sellos: resultado.stamps ?? null,
      premiosNuevos: Array.isArray(resultado.earned)
        ? resultado.earned.map((premio: { description?: string }) => premio.description)
        : [],
    });
  } catch (error) {
    return respuestaError(error);
  }
});
