import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { db, runWithOrg } from "@/lib/db";
import { DURACION_SESION, sesionAnteriorAlCambio } from "@/lib/password-sesion";
import { validarCredenciales } from "@/lib/auth-credenciales";

export const authOptions: NextAuthOptions = {
  // 7 días en lugar de los 30 por defecto: el CRM tiene datos de clientes y expedientes.
  session: { strategy: "jwt", maxAge: DURACION_SESION },
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
        return validarCredenciales({ email: creds?.email, password: creds?.password,
          orgSlug: creds?.orgSlug, headers: req?.headers as Record<string, string> });
      }
    })
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        token.rol = user.rol;
        token.orgId = user.orgId;
        token.puesto = user.puesto;
        token.emitidoAt = Date.now();
        token.checkedAt = Date.now();
      }
      token.emitidoAt ??= token.iat ? token.iat * 1000 : 0;
      // `update()` desde el cliente (Mi perfil): nombre y correo se releen de la BD, nunca del payload.
      if (trigger === "update" && token.id && token.orgId) {
        const u = await runWithOrg(BigInt(token.orgId), () =>
          db.usuario.findUnique({ where: { id: BigInt(token.id!) } })
        );
        if (u) {
          token.name = u.nombre;
          token.email = u.email;
        }
      }
      // Revalida contra la BD cada 5 min: desactivar un usuario (o su org) mata su
      // sesión aunque el JWT siga vigente; un cambio de rol también se refleja.
      const checkedAt = token.checkedAt;
      if (!user && token.id && token.orgId && (trigger === "update" || !checkedAt || Date.now() - checkedAt > 5 * 60_000)) {
        token.checkedAt = Date.now();
        try {
          const u = await runWithOrg(BigInt(token.orgId), () =>
            db.usuario.findUnique({ where: { id: BigInt(token.id!) } })
          );
          const org = await db.org.findUnique({ where: { id: BigInt(token.orgId) } });
          if (!u || !u.activo || !org?.activo || sesionAnteriorAlCambio(token, u.passwordCambiadaAt)) token.revocado = true;
          else {
            token.rol = u.rol as "admin" | "agente";
            token.puesto = u.puesto;
          }
        } catch {
          /* BD caída: no cerramos sesiones por un error transitorio */
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token.revocado) {
        // Sin user, todos los guards (middleware, requireSesion) responden 401/redirect.
        (session as { user?: typeof session.user }).user = undefined;
        return session;
      }
      if (session.user) {
        session.user.id = token.id;
        session.user.rol = token.rol;
        session.user.orgId = token.orgId;
        session.user.puesto = token.puesto;
      }
      return session;
    }
  }
};
