import "next-auth";

declare module "next-auth" {
  interface User {
    rol?: "admin" | "agente";
    orgId?: string;
  }
  interface Session {
    user: {
      id?: string;
      name?: string | null;
      email?: string | null;
      rol?: "admin" | "agente";
      orgId?: string;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    rol?: "admin" | "agente";
    orgId?: string;
  }
}
