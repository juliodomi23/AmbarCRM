import { NextRequest, NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { cifrarCredencialPago } from "@/lib/pagos/credenciales";
import {
  ErrorConfiguracionPagos,
  mockPagosPermitido,
  validarConfiguracionPagosAplicacion,
} from "@/lib/pagos/proveedor";
import { transaccionTenant } from "@/lib/retail-db";

function dto(credencial: {
  proveedor: string;
  accessTokenEncrypted: string | null;
  publicKey: string | null;
  sandbox: boolean;
  activo: boolean;
  proveedorUserId: string | null;
  expiresAt: Date | null;
  requiereReconexion: boolean;
  stripeChargesEnabled?: boolean;
  stripeDetailsSubmitted?: boolean;
}) {
  return {
    proveedor: credencial.proveedor,
    publicKey: credencial.publicKey,
    sandbox: credencial.sandbox,
    activo: credencial.activo,
    configurado: Boolean(credencial.activo && (credencial.proveedor === "stripe" ? credencial.proveedorUserId : credencial.accessTokenEncrypted)),
    usuarioProveedor: credencial.proveedorUserId,
    expiresAt: credencial.expiresAt,
    requiereReconexion: credencial.requiereReconexion,
    chargesEnabled: credencial.stripeChargesEnabled ?? false,
    detailsSubmitted: credencial.stripeDetailsSubmitted ?? false,
  };
}

export const GET = conModulo("pagos_en_linea", { admin: true }, async () => {
  const credenciales = await db.credencialPago.findMany({ where: { activo: true }, orderBy: { updatedAt: "desc" } });
  const modulo = await db.moduloOrg.findFirst({ where: { clave: "pagos_en_linea", activo: true }, select: { config: true } });
  const config = modulo?.config && typeof modulo.config === "object" && !Array.isArray(modulo.config) ? modulo.config as Record<string, unknown> : {};
  let erroresConfiguracion: Record<string, string | null> = {};
  try {
    erroresConfiguracion = validarConfiguracionPagosAplicacion();
  } catch (error) {
    const mensaje = error instanceof ErrorConfiguracionPagos ? error.message : "Pagos no configurados";
    erroresConfiguracion = { mercado_pago: mensaje, stripe: mensaje };
  }
  return NextResponse.json({
    credenciales: credenciales.map(dto),
    proveedorPredeterminado: typeof config.proveedor === "string" ? config.proveedor : process.env.PAGOS_PROVEEDOR ?? "mercado_pago",
    erroresConfiguracion,
  });
});

export const PUT = conModulo(
  "pagos_en_linea",
  { admin: true },
  async (_sesion, req: NextRequest) => {
    if (
      process.env.NODE_ENV === "production" ||
      process.env.PAGOS_PERMITIR_CREDENCIALES_MANUALES !== "1"
    )
      return NextResponse.json(
        { error: "Las credenciales manuales están deshabilitadas; usa OAuth" },
        { status: 403 },
      );
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const proveedor = String(body.proveedor ?? "");
    const accessToken = typeof body.accessToken === "string" ? body.accessToken.trim() : "";
    const publicKey = typeof body.publicKey === "string" ? body.publicKey.trim() : "";
    if (!["mercado_pago", "mock"].includes(proveedor))
      return NextResponse.json({ error: "Proveedor inválido" }, { status: 400 });
    if (proveedor === "mock" && !mockPagosPermitido())
      return NextResponse.json(
        { error: "El proveedor mock está bloqueado en producción" },
        { status: 400 },
      );
    if (!accessToken || accessToken.length > 500)
      return NextResponse.json(
        { error: "El access token es obligatorio" },
        { status: 400 },
      );
    if (publicKey.length > 180)
      return NextResponse.json({ error: "La llave pública es inválida" }, { status: 400 });

    await transaccionTenant(_sesion.orgId!, async (tx) => {
      await tx.credencialPago.updateMany({ data: { activo: false } });
      await tx.credencialPago.upsert({
        where: { orgId_proveedor: { orgId: _sesion.orgId!, proveedor } },
        create: {
          proveedor,
          accessTokenEncrypted: cifrarCredencialPago(accessToken),
          refreshTokenEncrypted: null,
          webhookSecretEncrypted: null,
          publicKey: publicKey || null,
          sandbox: body.sandbox !== false,
        },
        update: {
          accessTokenEncrypted: cifrarCredencialPago(accessToken),
          refreshTokenEncrypted: null,
          webhookSecretEncrypted: null,
          expiresAt: null,
          proveedorUserId: null,
          scope: null,
          publicKey: publicKey || null,
          sandbox: body.sandbox !== false,
          activo: true,
          requiereReconexion: false,
        },
      });
    });
    return NextResponse.json({ ok: true, configurado: true });
  },
);

export const DELETE = conModulo("pagos_en_linea", { admin: true }, async (_sesion, req: NextRequest) => {
  const proveedor = req.nextUrl.searchParams.get("proveedor");
  if (proveedor && !["mercado_pago", "stripe", "mock"].includes(proveedor)) return NextResponse.json({ error: "Proveedor inválido" }, { status: 400 });
  await db.credencialPago.updateMany({
    where: proveedor ? { proveedor } : {},
    data: {
      activo: false,
      accessTokenEncrypted: null,
      refreshTokenEncrypted: null,
      expiresAt: null,
      proveedorUserId: null,
      scope: null,
      requiereReconexion: false,
      stripeChargesEnabled: false,
      stripeDetailsSubmitted: false,
    },
  });
  return NextResponse.json({ ok: true, configurado: false });
});
