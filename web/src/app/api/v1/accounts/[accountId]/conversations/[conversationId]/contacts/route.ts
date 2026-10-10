import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { conBot, conversacionDelBot } from "@/lib/bot-auth";
import { db } from "@/lib/db";
import { conErrores } from "@/lib/errores-api";
import { telefonoContacto } from "@/lib/reservas/telefono";
import { auditarBot } from "@/lib/services/bots";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ accountId: string; conversationId: string }> };

const vista = (c: { id: bigint; nombre: string; telefono: string | null; email: string | null; empresa: string | null; createdAt: Date }) => ({
  id: Number(c.id),
  nombre: c.nombre,
  telefono: c.telefono,
  email: c.email,
  empresa: c.empresa,
  creado: c.createdAt.toISOString()
});

/** Contacto de la empresa por los últimos 10 dígitos (cubre 52… y 521…). RLS limita a la empresa del bot. */
const buscarPorTelefono = (ultimos10: string) => db.contacto.findFirst({ where: { telefono: { endsWith: ultimos10 } } });

/**
 * Busca un contacto de la empresa por teléfono.
 * GET …/contacts?phone=  → 200 { encontrado, contacto | null }
 */
async function manejarGET(req: NextRequest, props: Props) {
  const { conversationId } = await props.params;
  return conBot(req, "gestionar_contactos", async (botAutenticado) => {
    const acceso = await conversacionDelBot(botAutenticado, conversationId);
    if (!acceso.conv) return acceso.respuesta;
    const telefono = telefonoContacto(req.nextUrl.searchParams.get("phone"));
    if (!telefono) return NextResponse.json({ error: "phone inválido (10 a 15 dígitos)" }, { status: 400 });
    const contacto = await buscarPorTelefono(telefono.ultimos10);
    return NextResponse.json({ encontrado: contacto !== null, contacto: contacto ? vista(contacto) : null });
  });
}

/**
 * Crea un contacto sin duplicar: si ya existe uno con ese teléfono lo devuelve con `repetida: true`.
 * POST …/contacts  Body: { nombre, telefono, correo? }
 */
async function manejarPOST(req: NextRequest, props: Props) {
  const { conversationId } = await props.params;
  return conBot(req, "gestionar_contactos", async (botAutenticado) => {
    const acceso = await conversacionDelBot(botAutenticado, conversationId);
    if (!acceso.conv) return acceso.respuesta;
    const { bot, conv } = acceso;

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const nombre = String(body.nombre ?? "").trim();
    if (!nombre || nombre.length > 120) return NextResponse.json({ error: "nombre requerido (máx. 120 caracteres)" }, { status: 400 });
    const telefono = telefonoContacto(body.telefono);
    if (!telefono) return NextResponse.json({ error: "telefono inválido (10 a 15 dígitos)" }, { status: 400 });
    const correoTexto = String(body.correo ?? body.email ?? "").trim();
    if (correoTexto && (correoTexto.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoTexto))) {
      return NextResponse.json({ error: "correo inválido" }, { status: 400 });
    }

    const existente = await buscarPorTelefono(telefono.ultimos10);
    if (existente) return NextResponse.json({ contacto: vista(existente), repetida: true });

    let creado;
    try {
      creado = await db.contacto.create({
        data: { nombre, telefono: telefono.completo, email: correoTexto || null, fuente: "whatsapp" }
      });
    } catch (error) {
      // Dos peticiones a la vez: la segunda pierde contra el índice único (empresa, teléfono).
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const ganador = await buscarPorTelefono(telefono.ultimos10);
        if (ganador) return NextResponse.json({ contacto: vista(ganador), repetida: true });
      }
      throw error;
    }
    await auditarBot(bot, conv.id, "contacto_creado", {
      entidad: "contacto",
      entidadId: creado.id,
      despues: { nombre, telefono: telefono.completo, correo: correoTexto || null }
    });
    return NextResponse.json({ contacto: vista(creado), repetida: false }, { status: 201 });
  });
}

export const GET = conErrores(manejarGET);
export const POST = conErrores(manejarPOST);
