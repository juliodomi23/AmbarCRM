import { NextRequest, NextResponse } from "next/server";
import { db, runWithOrg } from "@/lib/db";
import {
  MODULOS,
  moduloPorClave,
  puestoPuedeAcceder,
  puestosPermitidosModulo,
} from "@/lib/modulos";
import { requireSesion } from "@/lib/session";

export const dynamic = "force-dynamic";

function configObjeto(config: unknown): Record<string, unknown> {
  return config && typeof config === "object" && !Array.isArray(config)
    ? (config as Record<string, unknown>)
    : {};
}

function normalizarPuestos(valor: unknown) {
  if (!Array.isArray(valor)) return null;
  return [...new Set(
    valor
      .filter((puesto): puesto is string => typeof puesto === "string")
      .map((puesto) => puesto.trim().slice(0, 80))
      .filter(Boolean),
  )];
}

export async function GET() {
  const s = await requireSesion();
  if ("error" in s) return s.error;
  const activos = await db.moduloOrg.findMany({
    where: { activo: true },
    select: { clave: true, config: true },
  });
  return NextResponse.json({
    modulos: MODULOS.map((m) => {
      const guardado = activos.find((a) => a.clave === m.clave);
      const config = configObjeto(guardado?.config);
      return {
        ...m,
        activo:
          Boolean(guardado) &&
          puestoPuedeAcceder(m.clave, config, s.puesto, s.rol),
        config: {
          ...config,
          puestosPermitidos: puestosPermitidosModulo(m.clave, config),
        },
      };
    }),
  });
}

/** El admin de una empresa solo configura módulos que ya estén habilitados. */
export async function PATCH(req: NextRequest) {
  const s = await requireSesion(true);
  if ("error" in s) return s.error;
  const { clave, config } = await req.json().catch(() => ({}));
  const catalogo = moduloPorClave(String(clave));
  if (
    !catalogo ||
    !config ||
    typeof config !== "object" ||
    Array.isArray(config)
  )
    return NextResponse.json(
      { error: "configuración inválida" },
      { status: 400 },
    );
  const puestos = normalizarPuestos(
    (config as Record<string, unknown>).puestosPermitidos,
  );
  if (
    Object.hasOwn(config as object, "puestosPermitidos") &&
    puestos === null
  ) {
    return NextResponse.json(
      { error: "puestosPermitidos debe ser una lista" },
      { status: 400 },
    );
  }
  const existente = await db.moduloOrg.findFirst({
    where: { clave: String(clave), activo: true },
  });
  if (!existente)
    return NextResponse.json({ error: "módulo no activo" }, { status: 404 });
  const actual = configObjeto(existente.config);
  const siguiente = {
    ...actual,
    ...(config as Record<string, unknown>),
    puestosPermitidos:
      puestos ?? puestosPermitidosModulo(catalogo.clave, actual),
  };
  await db.moduloOrg.update({
    where: { id: existente.id },
    data: { config: siguiente },
  });
  return NextResponse.json({ ok: true });
}

/** La organización plataforma habilita o apaga módulos de cualquier cliente. */
export async function POST(req: NextRequest) {
  const s = await requireSesion(true);
  if ("error" in s) return s.error;
  if (s.orgId !== 1n)
    return NextResponse.json(
      { error: "solo la plataforma administra módulos" },
      { status: 403 },
    );
  const { orgId, clave, activo } = await req.json().catch(() => ({}));
  const catalogo = moduloPorClave(String(clave));
  if (!orgId || !catalogo || typeof activo !== "boolean")
    return NextResponse.json({ error: "datos inválidos" }, { status: 400 });
  await runWithOrg(BigInt(orgId), async () => {
    const actual = await db.moduloOrg.findFirst({
      where: { clave: String(clave) },
    });
    if (actual) {
      const config = configObjeto(actual.config);
      await db.moduloOrg.update({
        where: { id: actual.id },
        data: {
          activo,
          config: {
            ...config,
            puestosPermitidos: puestosPermitidosModulo(catalogo.clave, config),
          },
        },
      });
    } else {
      await db.moduloOrg.create({
        data: {
          clave: catalogo.clave,
          activo,
          config: {
            puestosPermitidos: [...catalogo.acceso.puestosPorDefecto],
          },
        },
      });
    }
  });
  return NextResponse.json({ ok: true });
}
