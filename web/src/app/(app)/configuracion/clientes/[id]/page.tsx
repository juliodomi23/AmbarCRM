import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db, runWithOrg } from "@/lib/db";
import { aBigInt } from "@/lib/ids";
import { MODULOS, moduloPorClave } from "@/lib/modulos";
import { getSesion } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function DetalleOrganizacionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sesion = await getSesion();
  if (sesion?.user?.rol !== "admin" || sesion.user.orgId !== "1") {
    redirect("/configuracion");
  }
  const id = aBigInt((await params).id);
  if (id === null) notFound();
  const organizacion = await db.org.findUnique({ where: { id } });
  if (!organizacion) notFound();

  const datos = await runWithOrg(id, async () => {
    const [
      usuarios,
      modulos,
      ajustes,
      canales,
      contactos,
      conversaciones,
      oportunidades,
      citas,
      vehiculos,
      propiedades,
      productos,
      ventas,
      proveedores,
      compras,
    ] =
      await Promise.all([
        db.usuario.findMany({
          select: { id: true, nombre: true, email: true, rol: true, puesto: true, activo: true },
          orderBy: { nombre: "asc" },
        }),
        db.moduloOrg.findMany({ orderBy: { clave: "asc" } }),
        db.ajustes.findFirst({
          select: { marcaNombre: true, nombreNegocio: true, marcaPreset: true },
        }),
        db.canalWhatsapp.findMany({
          select: { id: true, nombre: true, telefono: true, estado: true, activo: true },
          orderBy: { id: "asc" },
        }),
        db.contacto.count(),
        db.conversacion.count(),
        db.oportunidad.count(),
        db.cita.count(),
        db.vehiculo.count(),
        db.propiedad.count(),
        db.producto.count(),
        db.venta.count(),
        db.proveedor.count(),
        db.compra.count(),
      ]);
    return {
      usuarios,
      modulos,
      ajustes,
      canales,
      metricas: {
        contactos,
        conversaciones,
        oportunidades,
        citas,
        vehiculos,
        propiedades,
        productos,
        ventas,
        proveedores,
        compras,
      },
    };
  });
  const activos = datos.modulos.filter((modulo) => modulo.activo);

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/configuracion?tab=clientes"
            className="text-sm text-primary hover:underline"
          >
            ← Clientes Ámbar CRM
          </Link>
          <h1 className="mt-1 text-2xl font-bold">{organizacion.nombre}</h1>
          <p className="text-sm text-muted-foreground">
            Organización #{String(organizacion.id)} · {organizacion.slug} ·{" "}
            {organizacion.activo ? "Activa" : "Inactiva"}
          </p>
        </div>
        <a
          href={`/login?org=${organizacion.slug}`}
          target="_blank"
          rel="noreferrer"
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Abrir acceso del cliente
        </a>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Object.entries(datos.metricas).map(([nombre, valor]) => (
          <div key={nombre} className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs uppercase text-muted-foreground">{nombre}</p>
            <p className="mt-1 text-2xl font-bold">{valor}</p>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold">Módulos activos</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          {activos.map((modulo) => (
            <span
              key={modulo.clave}
              className="rounded-full bg-primary/10 px-3 py-1 text-sm text-primary"
            >
              {moduloPorClave(modulo.clave)?.nombre ?? modulo.clave}
            </span>
          ))}
          {activos.length === 0 && (
            <p className="text-sm text-muted-foreground">Sin módulos activos.</p>
          )}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Disponibles: {MODULOS.map((modulo) => modulo.nombre).join(", ")}.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold">Negocio</h2>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Marca</dt>
            <dd>{datos.ajustes?.marcaNombre ?? organizacion.nombre}</dd>
            <dt className="text-muted-foreground">Nombre operativo</dt>
            <dd>{datos.ajustes?.nombreNegocio ?? "Sin configurar"}</dd>
            <dt className="text-muted-foreground">Estilo</dt>
            <dd>{datos.ajustes?.marcaPreset ?? "Predeterminado"}</dd>
            <dt className="text-muted-foreground">Alta</dt>
            <dd>{organizacion.createdAt.toLocaleDateString("es-MX")}</dd>
          </dl>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="font-semibold">Canales de WhatsApp</h2>
          <div className="mt-3 space-y-2 text-sm">
            {datos.canales.map((canal) => (
              <div key={String(canal.id)} className="flex justify-between gap-3">
                <span>{canal.nombre} · {canal.telefono ?? "Sin número"}</span>
                <span className="capitalize text-muted-foreground">
                  {canal.activo ? canal.estado : "inactivo"}
                </span>
              </div>
            ))}
            {datos.canales.length === 0 && (
              <p className="text-muted-foreground">Sin canales conectados.</p>
            )}
          </div>
        </div>
      </section>

      <section className="overflow-x-auto rounded-xl border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <h2 className="font-semibold">Equipo y accesos</h2>
          <p className="text-xs text-muted-foreground">
            Las contraseñas nunca se muestran. Para soporte, usa una cuenta autorizada.
          </p>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-5 py-3">Nombre</th>
              <th className="px-5 py-3">Correo</th>
              <th className="px-5 py-3">Puesto</th>
              <th className="px-5 py-3">Permiso</th>
              <th className="px-5 py-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {datos.usuarios.map((usuario) => (
              <tr key={String(usuario.id)} className="border-t border-border">
                <td className="px-5 py-3 font-medium">{usuario.nombre}</td>
                <td className="px-5 py-3 text-muted-foreground">{usuario.email}</td>
                <td className="px-5 py-3">{usuario.puesto}</td>
                <td className="px-5 py-3 capitalize">{usuario.rol}</td>
                <td className="px-5 py-3">{usuario.activo ? "Activo" : "Inactivo"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
