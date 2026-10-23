import { NextRequest, NextResponse } from "next/server";
import { conBot, conversacionDelBot } from "@/lib/bot-auth";
import { conErrores } from "@/lib/errores-api";
import { referenciaPropia } from "@/lib/referencias";
import { db } from "@/lib/db";
import { puestoPuedeAtenderConversaciones } from "@/lib/modulos-catalogo";
import { actualizarConversacion } from "@/lib/services/conversacion-estado";
import { auditarBot, notaDelBot } from "@/lib/services/bots";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ accountId: string; conversationId: string }> };

async function manejarPOST(req: NextRequest, props: Props) {
  const { conversationId } = await props.params;
  return conBot(req, "asignar", async (bot) => {
    const acceso = await conversacionDelBot(bot, conversationId);
    if (!acceso.conv) return acceso.respuesta;
    const body = await req.json().catch(() => ({}));
    if (!body || typeof body !== "object" || !Object.hasOwn(body, "assignee_id")) {
      return NextResponse.json({ error: "responsable inexistente" }, { status: 400 });
    }
    const responsableId = await referenciaPropia("usuario", body.assignee_id);
    if (responsableId === false || (body.assignee_id !== null && responsableId === null)) {
      return NextResponse.json({ error: "responsable inexistente" }, { status: 400 });
    }
    const responsable = responsableId === null ? null : await db.usuario.findUnique({
      where: { id: responsableId }, select: { id: true, nombre: true, activo: true, puesto: true, rol: true }
    });
    if (responsable && (!responsable.activo || !puestoPuedeAtenderConversaciones(responsable.puesto, responsable.rol))) {
      return NextResponse.json({ error: "responsable no puede atender conversaciones" }, { status: 422 });
    }
    await actualizarConversacion(bot.orgId, acceso.conv.id, { responsableId });
    await auditarBot(bot, acceso.conv.id, "asignada", {
      entidad: "conversacion", entidadId: acceso.conv.id,
      antes: { responsableId: acceso.conv.responsableId }, despues: { responsableId }
    });
    await notaDelBot(acceso.conv.id, responsable ? `Asignó a ${responsable.nombre}` : "Quitó al responsable");
    return NextResponse.json({ id: Number(acceso.conv.id),
      responsable: responsable ? { id: Number(responsable.id), nombre: responsable.nombre } : null });
  });
}

export const POST = conErrores(manejarPOST);
