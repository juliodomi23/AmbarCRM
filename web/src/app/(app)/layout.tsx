import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { contarTareasUrgentes } from "@/lib/services/tareas";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const userId = session.user.id ? BigInt(session.user.id) : null;
  const tareasPendientes = await contarTareasUrgentes(userId);

  return (
    <AppShell
      usuario={{
        nombre: session.user.name ?? "Usuario",
        rol: (session.user.rol as "admin" | "agente") ?? "agente"
      }}
      tareasPendientes={tareasPendientes}
    >
      {children}
    </AppShell>
  );
}
