import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { conBot } from "@/lib/bot-auth";
import { db } from "@/lib/db";
import { conErrores } from "@/lib/errores-api";
import { telefonoContacto } from "@/lib/reservas/telefono";
import { auditarBot } from "@/lib/services/bots";

export const dynamic = "force-dynamic";

type ContactoVista = {
  id: bigint;
  nombre: string;
  telefono: string | null;
  email: string | null;
  empresa: string | null;
  createdAt: Date;
};

/**
 * Mismo contacto que devuelven las rutas de conversación, más los alias que usan los flujos migrados de
 * Chatwoot (`name`, `phone_number`, `identifier`), para no tener que reescribir las expresiones de n8n.
 */
const vista = (c: ContactoVista) => ({
  id: Number(c.id),
  nombre: c.nombre,
  name: c.nombre,
  telefono: c.telefono,
  phone_number: c.telefono,
  email: c.email,
  empresa: c.empresa,
  creado: c.createdAt.toISOString(),
  identifier: c.telefono
});

/** Contacto de la empresa por los últimos 10 dígitos (cubre 52… y 521…). RLS limita a la empresa del bot. */
const buscarPorTelefono = (ultimos10: string) =>
  db.contacto.findFirst({ where: { telefono: { endsWith: ultimos10 } }, orderBy: { id: "asc" } });

/**
 * GET /api/v1/accounts/:accountId/contacts?phone=|q=  — permiso `gestionar_contactos`.
 * Busca contactos de la empresa (los contactos no se filtran por canal). Responde `{ meta: { count }, payload }`
 * con el mismo shape que `contacts/search` de Chatwoot.
 */
async function manejarGET(req: NextRequest) {
  return conBot(req, "gestionar_contactos", async () => {
    const params = req.nextUrl.searchParams;
    const phone = params.get("phone");
    const q = params.get("q");
    if (phone !== null && q !== null) return NextResponse.json({ error: "phone y q son excluyentes" }, { status: 400 });
    if (phone === null && q === null) return NextResponse.json({ error: "phone o q requerido" }, { status: 400 });

    if (phone !== null) {
      const telefono = telefonoContacto(phone);
      if (!telefono) return NextResponse.json({ error: "phone inválido (10 a 15 dígitos)" }, { status: 400 });
      const contacto = await buscarPorTelefono(telefono.ultimos10);
      return NextResponse.json({ meta: { count: contacto ? 1 : 0 }, payload: contacto ? [vista(contacto)] : [] });
    }

    const texto = q!.trim();
    if (texto.length < 2) return NextResponse.json({ error: "q requiere al menos 2 caracteres" }, { status: 400 });

    // Un `q` que solo trae dígitos (y signos de teléfono) se resuelve como teléfono, igual que `phone`.
    const pareceTelefono = /^[\d\s+().-]+$/.test(texto);
    const telefono = pareceTelefono ? telefonoContacto(texto) : null;
    if (telefono) {
      const contacto = await buscarPorTelefono(telefono.ultimos10);
      return NextResponse.json({ meta: { count: contacto ? 1 : 0 }, payload: contacto ? [vista(contacto)] : [] });
    }

    const contactos = await db.contacto.findMany({
      where: { OR: ["nombre", "email", "empresa", "telefono"].map((campo) => ({
        [campo]: { contains: texto, mode: "insensitive" }
      })) },
      orderBy: [{ nombre: "asc" }, { id: "asc" }],
      take: 20
    });
    return NextResponse.json({ meta: { count: contactos.length }, payload: contactos.map(vista) });
  });
}

/**
 * POST /api/v1/accounts/:accountId/contacts — permiso `gestionar_contactos`.
 * Body: { nombre | name, telefono | phone_number, correo | email? }. No duplica por teléfono: si ya existe
 * responde 200 con `repetida: true` (mismo criterio que la ruta de contactos de una conversación).
 */
async function manejarPOST(req: NextRequest) {
  return conBot(req, "gestionar_contactos", async (bot) => {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "body inválido" }, { status: 400 });
    }
    const nombre = String(body.nombre ?? body.name ?? "").trim();
    if (!nombre || nombre.length > 120) {
      return NextResponse.json({ error: "nombre requerido (máx. 120 caracteres)" }, { status: 400 });
    }
    const telefono = telefonoContacto(body.telefono ?? body.phone_number ?? body.phone);
    if (!telefono) return NextResponse.json({ error: "telefono inválido (10 a 15 dígitos)" }, { status: 400 });
    const correoTexto = String(body.correo ?? body.email ?? "").trim();
    if (correoTexto && (correoTexto.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoTexto))) {
      return NextResponse.json({ error: "correo inválido" }, { status: 400 });
    }

    const existente = await buscarPorTelefono(telefono.ultimos10);
    if (existente) {
      const contacto = vista(existente);
      return NextResponse.json({ contacto, payload: { contact: contacto }, repetida: true });
    }

    let creado;
    try {
      creado = await db.contacto.create({
        data: { nombre, telefono: telefono.completo, email: correoTexto || null, fuente: "whatsapp" }
      });
    } catch (error) {
      // Dos peticiones a la vez: la segunda pierde contra el índice único (empresa, teléfono).
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const ganador = await buscarPorTelefono(telefono.ultimos10);
        if (ganador) {
          const contacto = vista(ganador);
          return NextResponse.json({ contacto, payload: { contact: contacto }, repetida: true });
        }
      }
      throw error;
    }
    await auditarBot(bot, null, "contacto_creado", {
      entidad: "contacto",
      entidadId: creado.id,
      despues: { nombre, telefono: telefono.completo, correo: correoTexto || null }
    });
    const contacto = vista(creado);
    // `payload.contact` es el envoltorio de Chatwoot (`POST /contacts`), para reutilizar los flujos de n8n.
    return NextResponse.json({ contacto, payload: { contact: contacto }, repetida: false }, { status: 201 });
  });
}

export const GET = conErrores(manejarGET);
export const POST = conErrores(manejarPOST);
