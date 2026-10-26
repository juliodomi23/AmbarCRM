import { NextRequest, NextResponse } from "next/server";
import { db, runWithOrg } from "@/lib/db";
import {
  MODULOS,
  moduloPorClave,
  puestoPuedeAcceder,
  puestosPermitidosModulo,
} from "@/lib/modulos";
import { configSinSecretos } from "@/lib/lealtad";
import { referenciaPropia } from "@/lib/referencias";
import { requireSesion } from "@/lib/session";
import { conErrores } from "@/lib/errores-api";
import { moduloVisibleEnOrg } from "@/lib/modulos-plataforma";
import { VARIABLES_RECORDATORIO } from "@/lib/citas";

export const dynamic = "force-dynamic";

function configObjeto(config: unknown): Record<string, unknown> {
  return config && typeof config === "object" && !Array.isArray(config)
    ? (config as Record<string, unknown>)
    : {};
}

function normalizarPuestos(valor: unknown) {
  if (!Array.isArray(valor)) return null;
  return [
    ...new Set(
      valor
        .filter((puesto): puesto is string => typeof puesto === "string")
        .map((puesto) => puesto.trim().slice(0, 80))
        .filter(Boolean),
    ),
  ];
}

async function manejarGET() {
  const s = await requireSesion();
  if ("error" in s) return s.error;
  const activos = await db.moduloOrg.findMany({
    where: { activo: true },
    select: { clave: true, config: true },
  });
  return NextResponse.json({
    modulos: MODULOS.filter((m) => moduloVisibleEnOrg(m, s.orgId)).map((m) => {
      const guardado = activos.find((a) => a.clave === m.clave);
      const config = configSinSecretos(configObjeto(guardado?.config));
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
async function manejarPATCH(req: NextRequest) {
  const s = await requireSesion(true);
  if ("error" in s) return s.error;
  const { clave, config } = await req.json().catch(() => ({}));
  const catalogo = moduloPorClave(String(clave));
  if (catalogo && !moduloVisibleEnOrg(catalogo, s.orgId))
    return NextResponse.json({ error: "módulo no activo" }, { status: 404 });
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
  // La conexión con Aurum (clave cifrada) solo se cambia desde /api/lealtad/conexion.
  if (
    clave === "citas" &&
    Object.hasOwn(config, "duracionMin") &&
    (!Number.isInteger(config.duracionMin) ||
      config.duracionMin < 5 ||
      config.duracionMin > 480)
  ) {
    return NextResponse.json(
      {
        error:
          "La duración por defecto debe ser un entero entre 5 y 480 minutos",
      },
      { status: 400 },
    );
  }
  if (
    clave === "citas" &&
    Object.hasOwn(config, "mapeoVariables") &&
    (!Array.isArray(config.mapeoVariables) ||
      config.mapeoVariables.length > 100 ||
      config.mapeoVariables.some(
        (v: unknown) =>
          typeof v !== "string" ||
          !VARIABLES_RECORDATORIO.some((permitida) => permitida === v),
      ))
  ) {
    return NextResponse.json(
      { error: "Las variables del recordatorio no son válidas" },
      { status: 400 },
    );
  }
  if (clave === "pagos_en_linea") {
    const pagos = config as Record<string, unknown>;
    if (
      ["accessToken", "webhookSecret", "access_token", "webhook_secret"].some(
        (secreto) => Object.hasOwn(pagos, secreto),
      )
    ) {
      return NextResponse.json(
        { error: "Las credenciales se guardan en la configuración segura de pagos" },
        { status: 400 },
      );
    }
    if (
      Object.hasOwn(pagos, "proveedor") &&
      !["mercado_pago", "stripe", "mock"].includes(String(pagos.proveedor))
    ) {
      return NextResponse.json(
        { error: "Proveedor de pagos inválido" },
        { status: 400 },
      );
    }
    if (
      pagos.proveedor === "mock" &&
      process.env.NODE_ENV === "production" &&
      process.env.PAGOS_PERMITIR_MOCK !== "1"
    ) {
      return NextResponse.json(
        { error: "El proveedor mock está bloqueado en producción" },
        { status: 400 },
      );
    }
    if (Object.hasOwn(pagos, "moneda") && pagos.moneda !== "MXN") {
      return NextResponse.json(
        { error: "Por ahora solo se admite MXN" },
        { status: 400 },
      );
    }
    if (Object.hasOwn(pagos, "sandbox") && typeof pagos.sandbox !== "boolean") {
      return NextResponse.json(
        { error: "El modo sandbox es inválido" },
        { status: 400 },
      );
    }
    if (
      Object.hasOwn(pagos, "publicKey") &&
      (typeof pagos.publicKey !== "string" || pagos.publicKey.length > 180)
    ) {
      return NextResponse.json(
        { error: "La llave pública es inválida" },
        { status: 400 },
      );
    }
  }
  delete (config as Record<string, unknown>).aurum;
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
  if (Object.hasOwn(config as object, "canalId")) {
    const canalId = await referenciaPropia(
      "canal",
      (config as Record<string, unknown>).canalId,
    );
    if (canalId === false)
      return NextResponse.json({ error: "canal inexistente" }, { status: 400 });
    (config as Record<string, unknown>).canalId =
      canalId === null ? null : String(canalId);
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
async function manejarPOST(req: NextRequest) {
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
  if (!moduloVisibleEnOrg(catalogo, String(orgId)))
    return NextResponse.json({ error: "módulo no activo" }, { status: 404 });
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

export const GET = conErrores(manejarGET);
export const PATCH = conErrores(manejarPATCH);
export const POST = conErrores(manejarPOST);
