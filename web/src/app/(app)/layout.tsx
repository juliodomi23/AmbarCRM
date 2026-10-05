import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { AppShell } from "@/components/AppShell";
import { contarTareasUrgentes } from "@/lib/services/tareas";
import { getAjustes } from "@/lib/services/config";
import { normalizarMarca } from "@/lib/brand";
import { BrandRuntime } from "@/components/BrandRuntime";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const userId = session.user.id ? BigInt(session.user.id) : null;
  const [tareasPendientes, ajustes] = await Promise.all([contarTareasUrgentes(userId), getAjustes()]);
  const marca = normalizarMarca(ajustes);

  return (
    <>
    <BrandRuntime marca={marca} />
    <AppShell
      usuario={{
        nombre: session.user.name ?? "Usuario",
        rol: (session.user.rol as "admin" | "agente") ?? "agente"
      }}
      tareasPendientes={tareasPendientes}
      marca={marca}
    >
      {children}
    </AppShell>
    </>
  );
}
