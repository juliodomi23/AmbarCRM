import { redirect } from "next/navigation";
import { PreciosCliente } from "@/components/retail/PreciosCliente";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";
import { serializar } from "@/lib/serialize";
import { getSesion } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function PreciosPage() {
  const sesion = await getSesion();
  if (!sesion?.user?.orgId) redirect("/login");
  if (sesion.user.rol !== "admin" || !(await moduloActivo("productos"))) redirect("/productos");
  const [productos, contactos, listas, escalas, promociones] = await Promise.all([
    db.producto.findMany({ where: { activo: true }, select: { id: true, nombre: true, sku: true }, orderBy: { nombre: "asc" } }),
    db.contacto.findMany({ select: { id: true, nombre: true, listaPrecioId: true }, orderBy: { nombre: "asc" } }),
    db.listaPrecio.findMany({ include: { productos: true }, orderBy: { nombre: "asc" } }),
    db.precioVolumen.findMany({ include: { producto: { select: { nombre: true } } }, orderBy: [{ productoId: "asc" }, { desde: "asc" }] }),
    db.promocion.findMany({ include: { producto: { select: { nombre: true } } }, orderBy: { termina: "desc" } }),
  ]);
  return <PreciosCliente datos={serializar({ productos, contactos, listas, escalas, promociones })} />;
}
