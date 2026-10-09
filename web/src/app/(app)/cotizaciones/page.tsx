import { redirect } from "next/navigation";
import { CotizacionesCliente } from "@/components/cotizaciones/CotizacionesCliente";
import { configCotizaciones } from "@/lib/cotizaciones";
import { db } from "@/lib/db";
import { moduloActivo } from "@/lib/modulos";
import { serializar } from "@/lib/serialize";
import { getSesion } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function CotizacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ nueva?: string; contactoId?: string; oportunidadId?: string }>;
}) {
  if (!(await moduloActivo("cotizaciones"))) redirect("/");
  const sesion = await getSesion();
  if (!sesion?.user) redirect("/login");
  const consulta = await searchParams;
  const contactoId = /^\d+$/.test(consulta.contactoId ?? "") ? BigInt(consulta.contactoId!) : null;
  const [cotizaciones, productos, contacto, modulo] = await Promise.all([
    db.cotizacion.findMany({
      include: { contacto: true, oportunidad: true, venta: true, partidas: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    db.producto.findMany({
      where: { activo: true },
      select: { id: true, nombre: true, sku: true, precio: true, unidad: true, stock: true },
      orderBy: { nombre: "asc" },
    }),
    contactoId ? db.contacto.findUnique({ where: { id: contactoId }, select: { id: true, nombre: true } }) : null,
    db.moduloOrg.findFirst({ where: { clave: "cotizaciones", activo: true }, select: { config: true } }),
  ]);
  const config = configCotizaciones(modulo?.config);
  return (
    <CotizacionesCliente
      cotizaciones={serializar(cotizaciones)}
      productos={serializar(productos)}
      config={serializar(config)}
      esAdmin={sesion.user.rol === "admin"}
      abrirNueva={consulta.nueva === "1"}
      contactoInicial={contacto ? serializar(contacto) : null}
      oportunidadInicial={/^\d+$/.test(consulta.oportunidadId ?? "") ? consulta.oportunidadId! : ""}
      baseUrl={(process.env.NEXTAUTH_URL ?? "").replace(/\/+$/, "")}
    />
  );
}
