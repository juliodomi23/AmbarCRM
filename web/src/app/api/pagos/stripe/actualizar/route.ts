import { NextRequest, NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";
import { crearStatePago, leerCookieOAuth, validarStatePago } from "@/lib/pagos/oauth";
import { crearAccountLink } from "@/lib/pagos/stripe";

export const GET = conModulo("pagos_en_linea", { admin: true }, async (sesion, req: NextRequest) => {
  const { orgId, userId } = sesion;
  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  const state = req.nextUrl.searchParams.get("state") ?? "";
  const cookie = leerCookieOAuth(req.cookies.get("ambar_pagos_onboarding")?.value ?? "");
  if (!secret || orgId === null || userId === null || !cookie || !validarStatePago(state, cookie.nonce, orgId, userId, "stripe")) {
    return NextResponse.redirect(new URL("/configuracion?tab=modulos&pagos=error", req.url));
  }
  const credencial = await db.credencialPago.findUnique({ where: { orgId_proveedor: { orgId, proveedor: "stripe" } } });
  if (!credencial?.proveedorUserId || credencial.sandbox !== secret.startsWith("sk_test_")) return NextResponse.redirect(new URL("/configuracion?tab=modulos&pagos=error", req.url));
  try {
    const nuevo = crearStatePago(orgId, userId, "stripe");
    const base = (process.env.PAGOS_BASE_URL ?? process.env.NEXTAUTH_URL ?? new URL(req.url).origin).replace(/\/$/, "");
    const destino = (ruta: string) => { const url = new URL(ruta, base); url.searchParams.set("state", nuevo.state); return url.toString(); };
    const url = await crearAccountLink(secret, credencial.proveedorUserId, destino("/api/pagos/stripe/actualizar"), destino("/api/pagos/stripe/retorno"), `stripe-link-${nuevo.nonce}`);
    const respuesta = NextResponse.redirect(url);
    respuesta.cookies.set("ambar_pagos_onboarding", nuevo.cookie, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/pagos/stripe", maxAge: 10 * 60 });
    return respuesta;
  } catch {
    return NextResponse.redirect(new URL("/configuracion?tab=modulos&pagos=error", req.url));
  }
});
