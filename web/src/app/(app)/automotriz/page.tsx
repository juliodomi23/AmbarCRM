import { redirect } from "next/navigation";
import { AutomotrizCliente } from "@/components/automotriz/AutomotrizCliente";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";
import { serializar } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export default async function AutomotrizPage() {
  if (!(await moduloActivo("automotriz"))) redirect("/");
  const vehiculos = await db.vehiculo.findMany({
    orderBy: [{ estado: "asc" }, { createdAt: "desc" }],
    // ponytail: el inventario se filtra en el navegador; con más de 500 unidades, mover la búsqueda al servidor.
    take: 500,
  });
  return <AutomotrizCliente vehiculos={serializar(vehiculos)} />;
}

