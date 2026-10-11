import { db } from "@/lib/db";
import { puestoPuedeAcceder, type ClaveModulo } from "@/lib/modulos-catalogo";

// El catálogo y las reglas puras viven en modulos-catalogo.ts; se re-exportan para no cambiar a nadie.
export * from "@/lib/modulos-catalogo";

/** Se usa dentro de rutas y servicios: RLS limita siempre a la organización actual. */
export async function moduloActivo(clave: ClaveModulo) {
  const modulo = await db.moduloOrg.findFirst({
    where: { clave, activo: true },
    select: { config: true },
  });
  if (!modulo) return false;
  const { getSesion } = await import("@/lib/session");
  const sesion = await getSesion();
  if (!sesion?.user) return true;
  return puestoPuedeAcceder(
    clave,
    modulo.config,
    sesion.user.puesto,
    sesion.user.rol,
  );
}

export async function moduloHabilitado(clave: ClaveModulo) {
  return Boolean(
    await db.moduloOrg.findFirst({
      where: { clave, activo: true },
      select: { id: true },
    }),
  );
}

export async function requireModuloActivo(
  clave: ClaveModulo,
  sesionActual?: { rol?: string; puesto?: string },
) {
  const modulo = await db.moduloOrg.findFirst({
    where: { clave, activo: true },
    select: { config: true },
  });
  if (!modulo) {
    return Response.json({ error: "módulo no activo" }, { status: 404 });
  }
  const sesion = sesionActual
    ? { user: sesionActual }
    : await (await import("@/lib/session")).getSesion();
  if (
    sesion?.user &&
    !puestoPuedeAcceder(
      clave,
      modulo.config,
      sesion.user.puesto,
      sesion.user.rol,
    )
  ) {
    return Response.json({ error: "puesto sin acceso al módulo" }, { status: 403 });
  }
  return null;
}
