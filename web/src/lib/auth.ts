import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db, runWithOrg } from "@/lib/db";
import { permitido } from "@/lib/rate-limit";

/**
 * Resuelve el slug de la org del request: subdominio (cliente.tucrm.com),
 * o campo `orgSlug` del login, o DEFAULT_ORG_SLUG (dev / dominio único).
 */
function resolverSlug(host?: string, orgSlug?: string): string {
  if (orgSlug) return orgSlug;
  const sub = host?.split(":")[0]?.split(".")[0];
  const base = process.env.BASE_DOMAIN_FIRST_LABEL || "www";
  if (sub && sub !== "www" && sub !== "localhost" && sub !== base) return sub;
  return process.env.DEFAULT_ORG_SLUG || "inicial";
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Credenciales",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" },
        orgSlug: { label: "Organización", type: "text" }
      },
      async authorize(creds, req) {
        if (!creds?.email || !creds?.password) return null;
        const slug = resolverSlug(req?.headers?.host as string | undefined, creds.orgSlug);
        // Anti fuerza-bruta: máx 8 intentos por org+email cada 5 min.
        if (!permitido(`login:${slug}:${creds.email.toLowerCase()}`, 8, 5 * 60_000)) return null;

        const org = await db.org.findUnique({ where: { slug } });
        if (!org || !org.activo) return null;

        // Buscar el usuario DENTRO del tenant (RLS lo exige).
        const u = await runWithOrg(org.id, () =>
          db.usuario.findFirst({ where: { email: creds.email } })
        );
        if (!u || !u.activo) return null;
        const ok = await bcrypt.compare(creds.password, u.passwordHash);
        if (!ok) return null;
        return { id: String(u.id), name: u.nombre, email: u.email, rol: u.rol, orgId: String(org.id) };
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id;
        token.rol = (user as any).rol;
        token.orgId = (user as any).orgId;
        (token as any).checkedAt = Date.now();
      }
      // Revalida contra la BD cada 5 min: desactivar un usuario (o su org) mata su
      // sesión aunque el JWT siga vigente; un cambio de rol también se refleja.
      const checkedAt = (token as any).checkedAt as number | undefined;
      if (!user && token.id && token.orgId && (!checkedAt || Date.now() - checkedAt > 5 * 60_000)) {
        (token as any).checkedAt = Date.now();
        try {
          const u = await runWithOrg(BigInt(token.orgId), () =>
            db.usuario.findUnique({ where: { id: BigInt(token.id!) } })
          );
          if (!u || !u.activo) (token as any).revocado = true;
          else {
            (token as any).revocado = false;
            token.rol = u.rol as "admin" | "agente";
          }
        } catch {
          /* BD caída: no cerramos sesiones por un error transitorio */
        }
      }
      return token;
    },
    async session({ session, token }) {
      if ((token as any).revocado) {
        // Sin user, todos los guards (middleware, requireSesion) responden 401/redirect.
        (session as any).user = undefined;
        return session;
      }
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).rol = token.rol;
        (session.user as any).orgId = token.orgId;
      }
      return session;
    }
  }
};
