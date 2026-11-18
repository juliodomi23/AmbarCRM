import { NextRequest, NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { transaccionTenant } from "@/lib/retail-db";

export const dynamic = "force-dynamic";

/**
 * GET /api/meta-ads/clientes
 * Lista los clientes de la organización con su estado de conexión.
 */
export const GET = conModulo("meta_ads", {}, async (sesion) => {
  if (!sesion.orgId) {
    return NextResponse.json({ error: "Sesión sin organización" }, { status: 400 });
  }
  try {
    const clientes = await transaccionTenant(sesion.orgId, async (tx) => {
      const rows = await tx.metaAdsCliente.findMany({
        where: { orgId: sesion.orgId!, activo: true },
        include: {
          conexiones: {
            select: {
              id: true,
              adAccountId: true,
              estado: true,
              sincronizadoAt: true,
              ultimoError: true,
            },
            take: 1,
          },
        },
        orderBy: { id: "asc" },
      });
      return rows;
    });

    return NextResponse.json({
      clientes: clientes.map((c) => ({
        id: c.id.toString(),
        nombre: c.nombre,
        activo: c.activo,
        conexion: c.conexiones[0] ?? null,
      })),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 },
    );
  }
});

/**
 * POST /api/meta-ads/clientes
 * Crea un cliente nuevo (solo nombre, admin-only).
 */
export const POST = conModulo("meta_ads", { admin: true }, async (sesion, req: Request) => {
  if (!sesion.orgId) {
    return NextResponse.json({ error: "Sesión sin organización" }, { status: 400 });
  }
  const body = await req.json().catch(() => ({})) as { nombre?: string };
  if (!body.nombre || !body.nombre.trim()) {
    return NextResponse.json({ error: "Nombre inválido" }, { status: 400 });
  }
  const nombre = body.nombre.trim();
  try {
    const cliente = await transaccionTenant(sesion.orgId, async (tx) => {
      return tx.metaAdsCliente.create({
        data: {
          orgId: sesion.orgId!,
          nombre,
        },
      });
    });
    return NextResponse.json(
      { ok: true, cliente: { id: cliente.id.toString(), nombre: cliente.nombre, activo: cliente.activo } },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 },
    );
  }
});
