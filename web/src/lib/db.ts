import { PrismaClient } from "@prisma/client";
import { AsyncLocalStorage } from "node:async_hooks";

// ─────────────────────────────────────────────────────────────────────────────
// MULTI-TENANT (ver MULTI-TENANT.md)
// `db` resuelve el tenant solo: de un contexto explícito (runWithOrg) o, si no hay,
// de la sesión NextAuth. Antes de cada operación setea `app.current_org` en una
// transacción; Postgres (RLS) filtra las lecturas y autollena `org_id` en los inserts.
// Por eso las rutas y servicios que usan `db.modelo...` NO cambian.
// ─────────────────────────────────────────────────────────────────────────────

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const base =
  globalForPrisma.prisma ??
  new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"] });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = base;

// Contexto de tenant para flujos SIN sesión (webhook, bots, cron).
const orgStore = new AsyncLocalStorage<bigint>();

/** Ejecuta `fn` con el tenant fijado. Úsalo en webhook/cron tras resolver la org. */
export function runWithOrg<T>(orgId: bigint, fn: () => Promise<T>): Promise<T> {
  // El await debe ocurrir DENTRO del contexto: las PrismaPromise son perezosas
  // (ejecutan hasta el await). Si el callback devuelve la promesa sin await
  // (p. ej. `() => db.usuario.findFirst(...)`) y se espera afuera, la extensión
  // ya no ve el tenant y RLS devuelve 0 filas. El wrapper async lo garantiza.
  return orgStore.run(orgId, async () => await fn());
}

/**
 * Fija el tenant para el RESTO del request actual (sin callback). Útil en helpers de auth
 * de API (bots) donde no se puede envolver el handler. Persiste en el contexto async actual.
 */
export function setOrg(orgId: bigint) {
  orgStore.enterWith(orgId);
}

/** Cliente SIN extensión: solo para llamar funciones SECURITY DEFINER de resolución cruzada. */
export const dbRaw = base;

async function resolverOrg(): Promise<bigint | null> {
  const fromCtx = orgStore.getStore();
  if (fromCtx != null) return fromCtx;
  // Sin contexto explícito: intentar la sesión (requests autenticados).
  try {
    const { getServerSession } = await import("next-auth");
    const { authOptions } = await import("@/lib/auth");
    const session = await getServerSession(authOptions);
    const oid = (session?.user as { orgId?: string } | undefined)?.orgId;
    return oid ? BigInt(oid) : null;
  } catch {
    return null;
  }
}

export const db = base.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, args, query }) {
        // La tabla raíz `Org` no tiene org_id ni RLS: pasa directo.
        if (model === "Org") return query(args);

        const orgId = await resolverOrg();
        // Sin tenant: la query corre sin contexto. RLS devuelve 0 filas en tablas de
        // negocio (fail-closed) y los inserts fallan por org_id NULL. Es lo deseado.
        if (orgId == null) return query(args);

        // set_config(..., true) = local a la transacción. El INSERT/SELECT corre en la
        // MISMA transacción batcheada, así RLS y el DEFAULT de org_id ven el tenant.
        const [, result] = await base.$transaction([
          base.$queryRawUnsafe("SELECT set_config('app.current_org', $1, true)", String(orgId)),
          query(args),
        ]);
        return result as unknown;
      },
    },
  },
});
