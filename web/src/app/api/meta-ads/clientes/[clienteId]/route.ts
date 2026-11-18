import { NextRequest, NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { transaccionTenant } from "@/lib/retail-db";

export const dynamic = "force-dynamic";

type PropsClienteId = { params: Promise<{ clienteId: string }> };

/**
 * DELETE /api/meta-ads/clientes/[clienteId]
 * Elimina un cliente (y en cascada su conexión/datos). Es destructivo.
 */
export const DELETE = conModulo("meta_ads", { admin: true }, async (sesion, _req: NextRequest, props: PropsClienteId) => {
  if (!sesion.orgId) {
    return NextResponse.json({ error: "Sesión sin organización" }, { status: 400 });
  }
  const { clienteId } = await props.params;
  if (!/^\d+$/.test(clienteId)) {
    return NextResponse.json({ error: "clienteId inválido" }, { status: 400 });
  }
  const clienteIdBigint = BigInt(clienteId);
  try {
    await transaccionTenant(sesion.orgId, async (tx) => {
      await tx.metaAdsCliente.delete({
        where: { id: clienteIdBigint, orgId: sesion.orgId! },
      });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Error desconocido" },
      { status: 500 },
    );
  }
});
