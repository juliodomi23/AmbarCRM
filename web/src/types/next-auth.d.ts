import "next-auth";

declare module "next-auth" {
  interface User {
    rol?: "admin" | "agente";
    orgId?: string;
    puesto?: string;
    passwordCambiadaAt?: Date | null;
  }
  interface Session {
    user: {
      id?: string;
      name?: string | null;
      email?: string | null;
      rol?: "admin" | "agente";
      orgId?: string;
      puesto?: string;
      passwordCambiadaAt?: Date | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    iat?: number;
    emitidoAt?: number;
    checkedAt?: number;
    revocado?: boolean;
    id?: string;
    rol?: "admin" | "agente";
    orgId?: string;
    puesto?: string;
    passwordCambiadaAt?: number | null;
  }
}
