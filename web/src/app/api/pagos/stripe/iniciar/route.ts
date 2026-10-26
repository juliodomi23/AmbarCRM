import { NextRequest, NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { transaccionTenant } from "@/lib/retail-db";
import { crearStatePago } from "@/lib/pagos/oauth";
import { crearAccountLink, crearCuentaStripe } from "@/lib/pagos/stripe";

export const GET = conModulo("pagos_en_linea", { admin: true }, async (sesion, req: NextRequest) => {
  const orgId = sesion.orgId;
  const userId = sesion.userId;
  if (orgId === null || userId === null) return NextResponse.json({ error: "La sesión no tiene organización" }, { status: 400 });
  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secret) return NextResponse.json({ error: "Pagos no configurados: STRIPE_SECRET_KEY sin configurar" }, { status: 503 });
  if (!secret.startsWith("sk_test_") && !secret.startsWith("sk_live_")) return NextResponse.json({ error: "STRIPE_SECRET_KEY debe empezar con sk_test_ o sk_live_" }, { status: 503 });
  const country = (process.env.STRIPE_PAIS?.trim() || "MX").toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) return NextResponse.json({ error: "STRIPE_PAIS debe ser un código ISO de dos letras" }, { status: 503 });
  try {
    const { state, cookie, nonce } = crearStatePago(orgId, userId, "stripe");
    let credencial = await db.credencialPago.findUnique({ where: { orgId_proveedor: { orgId, proveedor: "stripe" } } });
    const sandbox = secret.startsWith("sk_test_");
    if (credencial?.proveedorUserId && credencial.sandbox !== sandbox) {
      return NextResponse.json({ error: "La cuenta conectada pertenece a otro modo de Stripe. Desconéctala y vuelve a iniciar con la llave actual." }, { status: 409 });
    }
    if (!credencial?.proveedorUserId) {
      const cuenta = await crearCuentaStripe(secret, `ambarcrm-standard-org-${orgId}-${country}-${sandbox ? "test" : "live"}`, country);
      await transaccionTenant(orgId, async (tx) => {
        credencial = await tx.credencialPago.upsert({
          where: { orgId_proveedor: { orgId, proveedor: "stripe" } },
          create: { proveedor: "stripe", proveedorUserId: cuenta.id!, accessTokenEncrypted: null, refreshTokenEncrypted: null, webhookSecretEncrypted: null, sandbox, activo: true, requiereReconexion: false, stripeChargesEnabled: cuenta.charges_enabled === true, stripeDetailsSubmitted: cuenta.details_submitted === true },
          update: { proveedorUserId: cuenta.id!, sandbox, activo: true, requiereReconexion: false, stripeChargesEnabled: cuenta.charges_enabled === true, stripeDetailsSubmitted: cuenta.details_submitted === true },
        });
      });
    }
    const accountId = credencial?.proveedorUserId;
    if (!accountId) throw new Error("Stripe no devolvió una cuenta conectada");
    const base = (process.env.PAGOS_BASE_URL ?? process.env.NEXTAUTH_URL ?? new URL(req.url).origin).replace(/\/$/, "");
    const destino = (ruta: string) => { const url = new URL(ruta, base); url.searchParams.set("state", state); return url.toString(); };
    const url = await crearAccountLink(secret, accountId, destino("/api/pagos/stripe/actualizar"), destino("/api/pagos/stripe/retorno"), `stripe-link-${nonce}`);
    const respuesta = NextResponse.redirect(url);
    respuesta.cookies.set("ambar_pagos_onboarding", cookie, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/pagos/stripe", maxAge: 10 * 60 });
    return respuesta;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "No se pudo iniciar el onboarding de Stripe" }, { status: 503 });
  }
});
