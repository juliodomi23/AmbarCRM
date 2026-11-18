import { NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { obtenerConexionPorOrg, desconectarMetaAds } from "@/lib/meta-ads/servicio";
import { tokenMetaAds, guardarConexionMetaAds, listarCuentasPublicitarias } from "@/lib/meta-ads/oauth";

export const dynamic = "force-dynamic";

/**
 * GET: Devuelve las cuentas publicitarias disponibles para la organización de la sesión.
 * Se usa en la pantalla de selección para mostrar nombre + estado de cada cuenta.
 */
export const GET = conModulo("meta_ads", {}, async (sesion, req: Request) => {
  const clienteId = new URL(req.url).searchParams.get("clienteId");
  if (!clienteId || !/^\d+$/.test(clienteId)) {
    return NextResponse.json({ error: "Falta clienteId" }, { status: 400 });
  }
  try {
    const conexion = await obtenerConexionPorOrg(sesion.orgId!, BigInt(clienteId));
    if (!conexion) return NextResponse.json({ cuentas: [] });
    const token = await tokenMetaAds(sesion.orgId!, conexion);
    const cuentas = await listarCuentasPublicitarias(token);
    return NextResponse.json({ cuentas });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error desconocido" }, { status: 500 });
  }
});

/**
 * POST: Elige una cuenta publicitaria y la almacena en la conexión,
 * reemplazando el placeholder "<temp>" por el id real elegido por el usuario.
 */
export const POST = conModulo("meta_ads", { admin: true }, async (sesion, req: Request) => {
  const body = await req.json();
  if (!body.adAccountId) {
    return NextResponse.json({ error: "Cuenta inválida" }, { status: 400 });
  }
  const clienteId = body.clienteId && /^\d+$/.test(body.clienteId) ? BigInt(body.clienteId) : null;
  if (!clienteId) return NextResponse.json({ error: "Falta clienteId" }, { status: 400 });
  const orgId = sesion.orgId!;
  try {
    const conexion = await obtenerConexionPorOrg(orgId, clienteId);
    if (!conexion) {
      return NextResponse.json({ error: "No hay conexión de Meta Ads activa para este cliente" }, { status: 404 });
    }
    const token = await tokenMetaAds(orgId, conexion);
    await guardarConexionMetaAds(orgId, sesion.userId!, clienteId, body.adAccountId, token, null, new Date(Date.now() + 5184000 * 1000));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error desconocido" }, { status: 500 });
  }
});

export const DELETE = conModulo("meta_ads", { admin: true }, async (sesion, req: Request) => {
  const clienteId = new URL(req.url).searchParams.get("clienteId");
  if (!clienteId || !/^\d+$/.test(clienteId)) {
    return NextResponse.json({ error: "Falta clienteId" }, { status: 400 });
  }
  const orgId = sesion.orgId!;
  try {
    await desconectarMetaAds(orgId, BigInt(clienteId));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Error desconocido" }, { status: 500 });
  }
});
