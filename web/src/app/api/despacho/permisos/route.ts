import { NextRequest, NextResponse } from "next/server";
import { conModulo } from "@/lib/con-modulo";
import { db } from "@/lib/db";

function idsValidos(valor: unknown) {
  if (!Array.isArray(valor) || valor.length > 50) return null;
  const ids: bigint[] = [];
  for (const item of valor) {
    if (typeof item !== "string" || !/^\d{1,20}$/.test(item)) return null;
    const id = BigInt(item);
    if (id <= 0n) return null;
    ids.push(id);
  }
  return [...new Set(ids.map(String))].map(BigInt);
}

function objeto(config: unknown): Record<string, unknown> {
  return config && typeof config === "object" && !Array.isArray(config)
    ? config as Record<string, unknown>
    : {};
}

export const GET = conModulo("despacho", {}, async (sesion) => {
  if (sesion.rol !== "admin") return NextResponse.json({ error: "Solo una persona administradora del CRM puede consultar la configuración" }, { status: 403 });
  const modulo = await db.moduloOrg.findFirst({
    where: { clave: "despacho", activo: true },
    select: { config: true },
  });
  const config = objeto(modulo?.config);
  const usuariosAccesoTotal = Array.isArray(config.usuariosAccesoTotal)
    ? config.usuariosAccesoTotal.map(String)
    : [];
  const usuariosConfirmadores = Array.isArray(config.usuariosConfirmadores)
    ? config.usuariosConfirmadores.map(String)
    : [];
  return NextResponse.json({ usuariosAccesoTotal, usuariosConfirmadores });
});

export const PATCH = conModulo("despacho", {}, async (sesion, req: NextRequest) => {
  if (sesion.rol !== "admin") {
    return NextResponse.json({ error: "Solo una persona administradora del CRM puede cambiar estos permisos" }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Permisos inválidos" }, { status: 400 });
  }
  const usuariosAccesoTotal = idsValidos((body as Record<string, unknown>).usuariosAccesoTotal);
  const usuariosConfirmadores = idsValidos((body as Record<string, unknown>).usuariosConfirmadores);
  if (!usuariosAccesoTotal || !usuariosConfirmadores) {
    return NextResponse.json({ error: "Selecciona hasta 50 usuarios activos" }, { status: 400 });
  }
  const ids = [...new Set([...usuariosAccesoTotal, ...usuariosConfirmadores].map(String))].map(BigInt);
  const activos = ids.length
    ? await db.usuario.findMany({ where: { id: { in: ids }, activo: true }, select: { id: true } })
    : [];
  if (activos.length !== ids.length) {
    return NextResponse.json({ error: "Todos los usuarios deben estar activos en esta organización" }, { status: 400 });
  }
  const modulo = await db.moduloOrg.findFirst({ where: { clave: "despacho", activo: true } });
  if (!modulo) return NextResponse.json({ error: "El módulo Despacho no está activo" }, { status: 404 });
  await db.moduloOrg.update({
    where: { id: modulo.id },
    data: {
      config: {
        ...objeto(modulo.config),
        usuariosAccesoTotal: usuariosAccesoTotal.map(String),
        usuariosConfirmadores: usuariosConfirmadores.map(String),
      },
    },
  });
  return NextResponse.json({ ok: true });
});
