import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { permitido } from "@/lib/rate-limit";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Credenciales",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Contraseña", type: "password" }
      },
      async authorize(creds) {
        if (!creds?.email || !creds?.password) return null;
        // Anti fuerza-bruta: máx 8 intentos por email cada 5 min.
        if (!permitido(`login:${creds.email.toLowerCase()}`, 8, 5 * 60_000)) return null;
        const u = await db.usuario.findUnique({ where: { email: creds.email } });
        if (!u || !u.activo) return null;
        const ok = await bcrypt.compare(creds.password, u.passwordHash);
        if (!ok) return null;
        return { id: String(u.id), name: u.nombre, email: u.email, rol: u.rol };
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id;
        token.rol = (user as any).rol;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).rol = token.rol;
      }
      return session;
    }
  }
};
