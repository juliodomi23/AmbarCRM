import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { conBot, conversacionDelBot } from "@/lib/bot-auth";
import { db } from "@/lib/db";
import { conErrores } from "@/lib/errores-api";
import { telefonoContacto } from "@/lib/reservas/telefono";
import { auditarBot, notaDelBot } from "@/lib/services/bots";
import { validarCampos, type DefinicionCampo } from "@/lib/campos-personalizados";

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
    const q = req.nextUrl.searchParams.get("q");
    const phone = req.nextUrl.searchParams.get("phone");
    if (q !== null && phone !== null) return NextResponse.json({ error: "phone y q son excluyentes" }, { status: 400 });
    if (q !== null) {
      const texto = q.trim();
      if (texto.length < 2) return NextResponse.json({ error: "q requiere al menos 2 caracteres" }, { status: 400 });
      const contactos = await db.contacto.findMany({
        where: { OR: ["nombre", "email", "empresa", "telefono"].map((campo) => ({
          [campo]: { contains: texto, mode: "insensitive" }
        })) },
        orderBy: [{ nombre: "asc" }, { id: "asc" }], take: 20
      });
      return NextResponse.json({ contactos: contactos.map(vista) });
    }
    const telefono = telefonoContacto(req.nextUrl.searchParams.get("phone"));
    if (!telefono) return NextResponse.json({ error: "phone inválido (10 a 15 dígitos)" }, { status: 400 });
    const contacto = await buscarPorTelefono(telefono.ultimos10);
    return NextResponse.json({ encontrado: contacto !== null, contacto: contacto ? vista(contacto) : null });
  });
}

async function manejarPATCH(req: NextRequest, props: Props) {
  const { conversationId } = await props.params;
  return conBot(req, "editar_contacto", async (bot) => {
    const acceso = await conversacionDelBot(bot, conversationId);
    if (!acceso.conv) return acceso.respuesta;
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "body inválido" }, { status: 400 });
    if ("telefono" in body) return NextResponse.json({ error: "telefono no se puede cambiar" }, { status: 400 });
    const actual = acceso.conv.contacto;
    const data: { nombre?: string; email?: string | null; empresa?: string | null; notas?: string | null; campos?: Record<string, unknown> } = {};
    if ("nombre" in body) {
      const nombre = typeof body.nombre === "string" ? body.nombre.trim() : "";
      if (!nombre || nombre.length > 120) return NextResponse.json({ error: "nombre requerido (máx. 120 caracteres)" }, { status: 400 });
      data.nombre = nombre;
    }
    if ("email" in body || "correo" in body) {
      const correo = body.correo ?? body.email;
      const texto = correo === null ? "" : String(correo).trim();
      if (texto && (texto.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(texto))) return NextResponse.json({ error: "correo inválido" }, { status: 400 });
      data.email = texto || null;
    }
    for (const campo of ["empresa", "notas"] as const) {
      if (campo in body) {
        if (body[campo] !== null && typeof body[campo] !== "string") return NextResponse.json({ error: `${campo} inválido` }, { status: 400 });
        data[campo] = (body[campo] as string | null)?.trim() || null;
      }
    }
    if ("campos" in body) {
      if (!body.campos || typeof body.campos !== "object" || Array.isArray(body.campos)) return NextResponse.json({ error: "campos inválidos" }, { status: 400 });
      const enviados = body.campos as Record<string, unknown>;
      const definiciones = await db.campoPersonalizado.findMany({ where: { entidad: "contacto", activo: true } });
      const desconocidas = Object.keys(enviados).filter((clave) => !definiciones.some((d) => d.clave === clave));
      if (desconocidas.length) return NextResponse.json({ error: "campos desconocidos", claves: desconocidas }, { status: 400 });
      const relevantes = definiciones.filter((d) => Object.hasOwn(enviados, d.clave))
        .map((d) => ({ ...d, obligatorio: false })) as DefinicionCampo[];
      const resultado = validarCampos(relevantes, enviados);
      if (resultado.errores.length) return NextResponse.json({ error: resultado.errores.join(", ") }, { status: 400 });
      const anteriores = actual.campos && typeof actual.campos === "object" && !Array.isArray(actual.campos)
        ? actual.campos as Record<string, unknown> : {};
      const campos = { ...anteriores };
      for (const [clave, valor] of Object.entries(enviados)) {
        if (valor === null || valor === "") delete campos[clave];
        else campos[clave] = resultado.campos[clave];
      }
      data.campos = campos;
    }
    const antes: Record<string, unknown> = {};
    const despues: Record<string, unknown> = {};
    for (const [clave, valor] of Object.entries(data)) {
      if (JSON.stringify(actual[clave as keyof typeof actual]) !== JSON.stringify(valor)) {
        antes[clave] = actual[clave as keyof typeof actual];
        despues[clave] = valor;
      }
    }
    const editado = Object.keys(despues).length ? await db.contacto.update({ where: { id: actual.id }, data }) : actual;
    if (Object.keys(despues).length) {
      await auditarBot(bot, acceso.conv.id, "contacto_editado", { entidad: "contacto", entidadId: actual.id, antes, despues });
      await notaDelBot(acceso.conv.id, `Editó contacto: ${editado.nombre}`);
    }
    return NextResponse.json({ contacto: { ...vista(editado), campos: editado.campos } });
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
    await notaDelBot(conv.id, `Creó contacto: ${nombre}`);
    return NextResponse.json({ contacto: vista(creado), repetida: false }, { status: 201 });
  });
}

export const GET = conErrores(manejarGET);
export const POST = conErrores(manejarPOST);
export const PATCH = conErrores(manejarPATCH);
