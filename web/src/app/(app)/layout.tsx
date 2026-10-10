import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { getAjustes } from "@/lib/services/config";
import { obtenerContadoresShell } from "@/lib/services/shell";
import { normalizarMarca } from "@/lib/brand";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const userId = session.user.id ? BigInt(session.user.id) : null;
  const [contadoresIniciales, ajustes] = await Promise.all([obtenerContadoresShell(userId), getAjustes()]);
  const marca = normalizarMarca(ajustes);

  return (
    <AppShell
      usuario={{
        nombre: session.user.name ?? "Usuario",
        rol: (session.user.rol as "admin" | "agente") ?? "agente"
      }}
      contadoresIniciales={contadoresIniciales}
      marca={marca}
      identidad={session.user.orgId && session.user.id ? { orgId: String(session.user.orgId), userId: String(session.user.id) } : undefined}
    >
      {children}
    </AppShell>
  );
}
