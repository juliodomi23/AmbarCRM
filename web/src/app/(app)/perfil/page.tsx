import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSesion } from "@/lib/session";
import { PerfilCliente } from "@/components/perfil/PerfilCliente";

export const dynamic = "force-dynamic";

export default async function PerfilPage() {
  const sesion = await getSesion();
  if (!sesion?.user?.id) redirect("/login");

  const usuario = await db.usuario.findUnique({ where: { id: BigInt(sesion.user.id) } });
  if (!usuario) redirect("/login");

  return (
    <PerfilCliente
      perfil={{ nombre: usuario.nombre, email: usuario.email, rol: usuario.rol, puesto: usuario.puesto ?? "" }}
    />
  );
}
