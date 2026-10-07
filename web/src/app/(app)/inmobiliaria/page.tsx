import { redirect } from "next/navigation";
import { InmobiliariaCliente } from "@/components/inmobiliaria/InmobiliariaCliente";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";
import { serializar } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export default async function InmobiliariaPage() {
  if (!(await moduloActivo("inmobiliaria"))) redirect("/");
  const propiedades = await db.propiedad.findMany({
    orderBy: [{ estado: "asc" }, { createdAt: "desc" }],
  });
  return <InmobiliariaCliente propiedades={serializar(propiedades)} />;
}

