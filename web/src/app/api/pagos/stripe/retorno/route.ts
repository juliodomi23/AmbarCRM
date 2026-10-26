import { NextRequest, NextResponse } from "next/server";
import { requireSesion } from "@/lib/session";
import { db } from "@/lib/db";
import { transaccionTenant } from "@/lib/retail-db";
import { leerCookieOAuth, validarStatePago } from "@/lib/pagos/oauth";
import { consultarCuentaStripe } from "@/lib/pagos/stripe";

function borrarCookie(respuesta: NextResponse) {
  respuesta.cookies.set("ambar_pagos_onboarding", "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/pagos/stripe", maxAge: 0 });
}

export async function GET(req: NextRequest) {
  const sesion = await requireSesion(true);
  if ("error" in sesion) return NextResponse.redirect(new URL("/login?callbackUrl=%2Fconfiguracion%3Ftab%3Dmodulos%26pagos%3Derror", req.url));
  const orgId = sesion.orgId;
  const userId = sesion.userId;
  const state = req.nextUrl.searchParams.get("state") ?? "";
  const cookie = leerCookieOAuth(req.cookies.get("ambar_pagos_onboarding")?.value ?? "");
  let valido = false;
  try { valido = orgId !== null && userId !== null && cookie !== null && validarStatePago(state, cookie.nonce, orgId, userId, "stripe"); } catch { valido = false; }
  if (!valido || orgId === null) {
    const respuesta = NextResponse.redirect(new URL("/configuracion?tab=modulos&pagos=error", req.url));
    borrarCookie(respuesta);
    return respuesta;
  }
  const credencial = await db.credencialPago.findUnique({ where: { orgId_proveedor: { orgId, proveedor: "stripe" } } });
  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  try {
    if (!credencial?.proveedorUserId || !secret || credencial.sandbox !== secret.startsWith("sk_test_")) throw new Error("conexión incompleta");
    const estado = await consultarCuentaStripe(secret, credencial.proveedorUserId);
    await transaccionTenant(orgId, (tx) => tx.credencialPago.update({ where: { id: credencial.id }, data: { stripeChargesEnabled: estado.chargesEnabled, stripeDetailsSubmitted: estado.detailsSubmitted, requiereReconexion: false, activo: true } }));
    const destino = new URL("/configuracion?tab=modulos&pagos=stripe", req.url);
    destino.searchParams.set("stripe", estado.chargesEnabled ? "conectado" : "incompleto");
    const respuesta = NextResponse.redirect(destino);
    borrarCookie(respuesta);
    return respuesta;
  } catch {
    const respuesta = NextResponse.redirect(new URL("/configuracion?tab=modulos&pagos=error", req.url));
    borrarCookie(respuesta);
    return respuesta;
  }
}
