import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db, runWithOrg } from "@/lib/db";
import { requireSesion } from "@/lib/session";

export const dynamic = "force-dynamic";

const PLATAFORMA_ORG = 1n; // Ámbar Rojo: la única org que puede dar de alta clientes.

/**
 * Alta de un cliente nuevo (tenant). Reemplaza "un deploy por cliente".
 * Solo un admin de la org plataforma. Body:
 *   { nombre, slug, adminNombre, adminEmail, adminPassword }
 */
export async function POST(req: NextRequest) {
  const sesion = await requireSesion(true);
  if ("error" in sesion) return sesion.error;
  if (sesion.orgId !== PLATAFORMA_ORG) {
    return NextResponse.json({ error: "solo la org plataforma puede crear clientes" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const nombre = (body.nombre ?? "").toString().trim();
  const slug = (body.slug ?? "").toString().trim().toLowerCase();
  const adminNombre = (body.adminNombre ?? "").toString().trim();
  const adminEmail = (body.adminEmail ?? "").toString().trim().toLowerCase();
  const adminPassword = (body.adminPassword ?? "").toString();

  if (!nombre || !slug || !adminEmail || !adminPassword) {
    return NextResponse.json({ error: "faltan campos (nombre, slug, adminEmail, adminPassword)" }, { status: 400 });
  }
  if (adminPassword.length < 8) {
    return NextResponse.json({ error: "la contraseña debe tener al menos 8 caracteres" }, { status: 400 });
  }
  if (!/^[a-z0-9-]{2,40}$/.test(slug)) {
    return NextResponse.json({ error: "slug inválido (a-z, 0-9, guiones)" }, { status: 400 });
  }

  const existe = await db.org.findUnique({ where: { slug } });
  if (existe) return NextResponse.json({ error: "ese slug ya existe" }, { status: 409 });

  const org = await db.org.create({ data: { nombre, slug } });

  // Semilla del tenant: admin, ajustes, embudo de ventas con etapas y canal de WhatsApp
  // (misma semilla que schema.sql para la org 1). org_id lo pone el DEFAULT por contexto.
  await runWithOrg(org.id, async () => {
    await db.usuario.create({
      data: {
        nombre: adminNombre || "Admin",
        email: adminEmail,
        passwordHash: await bcrypt.hash(adminPassword, 10),
        rol: "admin"
      }
    });
    await db.ajustes.create({ data: {} });
    await db.embudo.create({
      data: {
        nombre: "Ventas",
        descripcion: "Embudo principal de ventas",
        etapas: {
          create: [
            { nombre: "Nuevo lead", color: "#94A3B8", orden: 0, tipo: "normal" },
            { nombre: "Contactado", color: "#3B82F6", orden: 1, tipo: "normal" },
            { nombre: "En negociación", color: "#B45309", orden: 2, tipo: "normal" },
            { nombre: "Propuesta", color: "#8B5CF6", orden: 3, tipo: "normal" },
            { nombre: "Ganado", color: "#16A34A", orden: 4, tipo: "ganado" },
            { nombre: "Perdido", color: "#DC2626", orden: 5, tipo: "perdido" }
          ]
        }
      }
    });
    // Instancia de Evolution propia del tenant (el slug): sus envíos no se mezclan con otras orgs.
    await db.canalWhatsapp.create({
      data: { nombre: "WhatsApp principal", proveedor: "evolution", estado: "desconectado", instancia: slug }
    });
  });

  return NextResponse.json({ ok: true, org: { id: Number(org.id), nombre: org.nombre, slug: org.slug } });
}
