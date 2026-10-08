import Link from "next/link";
import { redirect } from "next/navigation";
import { PanelListado } from "@/components/modulos/PanelListado";
import { clientesAurum, conexionDe, ErrorAurum, moduloLealtad } from "@/lib/aurum";
import type { ClienteAurum } from "@/lib/lealtad";
import { moduloActivo } from "@/lib/modulos";

export const dynamic = "force-dynamic";

function Aviso({ texto }: { texto: string }) {
  return (
    <div className="space-y-2 p-6">
      <h1 className="text-xl font-semibold">Lealtad</h1>
      <p className="text-sm text-muted-foreground">{texto}</p>
      <Link href="/configuracion?tab=modulos" className="text-sm font-medium text-primary">
        Ir a Configuración → Módulos
      </Link>
    </div>
  );
}

export default async function LealtadPage() {
  if (!(await moduloActivo("lealtad"))) redirect("/");
  const conexion = conexionDe((await moduloLealtad())?.config);
  if (!conexion) return <Aviso texto="Conecta el negocio de Aurum para ver las tarjetas de tus clientes." />;
  let clientes: ClienteAurum[];
  try {
    clientes = await clientesAurum(conexion);
  } catch (error) {
    if (error instanceof ErrorAurum) return <Aviso texto={error.message} />;
    throw error;
  }
  return <PanelListado titulo="Lealtad" descripcion={`Tarjetas de sellos de Aurum · ${conexion.slug}`}
    metricas={[
      { etiqueta: "Clientes", valor: String(clientes.length) },
      { etiqueta: "Sellos activos", valor: String(clientes.reduce((suma, c) => suma + c.stamps, 0)) },
      { etiqueta: "Premios ganados", valor: String(clientes.reduce((suma, c) => suma + c.rewards, 0)) },
      { etiqueta: "Por canjear", valor: String(clientes.reduce((suma, c) => suma + c.pending_rewards, 0)) },
    ]}
    items={clientes.slice(0, 200).map((cliente, indice) => ({
      id: String(indice), titulo: cliente.name || cliente.phone,
      descripcion: cliente.phone,
      estado: cliente.pending_rewards > 0 ? "premio pendiente" : "activo",
      dato: `${cliente.stamps} sello(s)`,
    }))} />;
}
