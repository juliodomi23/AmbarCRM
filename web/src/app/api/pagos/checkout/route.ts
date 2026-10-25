import { NextRequest, NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { crearCheckoutVenta, ErrorPago } from "@/lib/pagos/servicio";
import { serializar } from "@/lib/serialize";
import { permitido } from "@/lib/rate-limit";

export const POST = conModulo(
  "pagos_en_linea",
  {},
  async (sesion, req: NextRequest) => {
    if (sesion.orgId === null)
      return NextResponse.json(
        { error: "Organización no disponible" },
        { status: 400 },
      );
    if (!permitido(`pagos-checkout:${sesion.orgId}:${sesion.userId ?? "sin-usuario"}`, 20, 60_000))
      return NextResponse.json(
        { error: "Demasiados intentos de cobro. Espera un minuto." },
        { status: 429 },
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
