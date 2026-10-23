import bcrypt from "bcryptjs";
import { db, runWithOrg } from "@/lib/db";
import { ipCliente, permitido } from "@/lib/rate-limit";

function resolverSlug(host?: string, orgSlug?: string): string {
  if (orgSlug) return orgSlug;
  const sub = host?.split(":")[0]?.split(".")[0];
  const base = process.env.BASE_DOMAIN_FIRST_LABEL || "www";
  if (sub && sub !== "www" && sub !== "localhost" && sub !== base) return sub;
  return process.env.DEFAULT_ORG_SLUG || "inicial";
}

export async function validarCredenciales({ email, password, orgSlug, headers }: {
  email?: string;
  password?: string;
  orgSlug?: string;
  headers?: Record<string, string>;
}) {
  if (!email || !password) return null;
  const slug = resolverSlug(headers?.host, orgSlug);
  if (!permitido(`login:${slug}:${email.toLowerCase()}`, 8, 5 * 60_000)) return null;
  if (!permitido(`login-ip:${ipCliente(headers)}`, 30, 15 * 60_000)) return null;

  const org = await db.org.findUnique({ where: { slug } });
  if (!org || !org.activo) return null;
  const u = await runWithOrg(org.id, () => db.usuario.findFirst({ where: { email } }));
  if (!u || !u.activo) return null;
  if (!await bcrypt.compare(password, u.passwordHash)) return null;
  return { id: String(u.id), name: u.nombre, email: u.email, rol: u.rol,
    orgId: String(org.id), puesto: u.puesto };
}
