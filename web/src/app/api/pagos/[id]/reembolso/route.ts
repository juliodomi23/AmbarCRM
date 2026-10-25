import { NextRequest, NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { aBigInt } from "@/lib/ids";
import { ErrorPago, reembolsarPago } from "@/lib/pagos/servicio";

export const POST = conModulo(
  "pagos_en_linea",
  {},
  async (
    sesion,
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
  ) => {
    const id = aBigInt((await params).id);
    if (!id || sesion.orgId === null)
      return NextResponse.json({ error: "Pago inválido" }, { status: 400 });
    const body = (await req.json().catch(() => ({}))) as { monto?: unknown };
    try {
      const resultado = await reembolsarPago(
        { ...sesion, orgId: sesion.orgId },
        id,
        typeof body.monto === "string" ? body.monto : undefined,
      );
      return NextResponse.json({ resultado });
    } catch (error) {
      if (error instanceof ErrorPago)
        return NextResponse.json(
          { error: error.message },
          { status: error.status },
        );
      throw error;
    }
  },
);
