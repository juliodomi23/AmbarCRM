import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSesion } from "@/lib/session";
import { conErrores } from "@/lib/errores-api";
import { agregarEtiquetaContacto } from "@/lib/services/acciones-conversacion";
import { transaccionTenant } from "@/lib/retail-db";

export const dynamic = "force-dynamic";

/** Asigna una etiqueta al contacto. Body: { etiquetaId } */
async function manejarPOST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const s = await requireSesion();
  if ("error" in s) return s.error;

  const { etiquetaId } = await req.json().catch(() => ({}));
  if (!etiquetaId) return NextResponse.json({ error: "falta etiquetaId" }, { status: 400 });

  if (!s.orgId) return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  await transaccionTenant(s.orgId, (tx) => agregarEtiquetaContacto(tx, BigInt(params.id), BigInt(etiquetaId)));
  return NextResponse.json({ ok: true });
}

/** Quita una etiqueta. Body: { etiquetaId } */
async function manejarDELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const s = await requireSesion();
  if ("error" in s) return s.error;

  const { etiquetaId } = await req.json().catch(() => ({}));
  if (!etiquetaId) return NextResponse.json({ error: "falta etiquetaId" }, { status: 400 });

  await db.contactoEtiqueta.delete({
    where: { contactoId_etiquetaId: { contactoId: BigInt(params.id), etiquetaId: BigInt(etiquetaId) } }
  });
  return NextResponse.json({ ok: true });
}

export const POST = conErrores(manejarPOST);
export const DELETE = conErrores(manejarDELETE);
