import { NextRequest, NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { crearCheckoutVenta, ErrorPago } from "@/lib/pagos/servicio";
import { serializar } from "@/lib/serialize";

export const POST = conModulo(
  "pagos_en_linea",
  {},
  async (sesion, req: NextRequest) => {
    if (sesion.orgId === null)
      return NextResponse.json(
        { error: "Organización no disponible" },
        { status: 400 },
      );
    try {
      const pago = await crearCheckoutVenta(
        { ...sesion, orgId: sesion.orgId },
        await req.json().catch(() => ({})),
      );
      return NextResponse.json(serializar({ pago, url: pago.checkoutUrl }));
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
