import Link from "next/link";
import type { CSSProperties } from "react";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { aBigInt } from "@/lib/ids";
import { normalizarMarca, variablesMarca } from "@/lib/brand";
import { moduloActivo } from "@/lib/modulos";
import { getSesion } from "@/lib/session";
import { configTaller, monedaTallerTexto } from "@/lib/taller-whatsapp";
import { BotonImprimirDoc } from "@/components/taller/BotonImprimirDoc";
import estilos from "./imprimir.module.css";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Imprimir orden de taller",
  robots: { index: false, follow: false },
};

function fecha(valor: Date | null | undefined, conHora = true) {
  if (!valor) return "—";
  return new Date(valor).toLocaleString("es-MX", {
    ...(conHora ? { dateStyle: "long", timeStyle: "short" } : { dateStyle: "long" }),
    timeZone: "America/Mexico_City",
  });
}

export default async function TallerImprimirPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ doc?: string }>;
}) {
  if (!(await moduloActivo("taller"))) redirect("/");
  const id = aBigInt((await params).id);
  if (!id) notFound();
  const doc = (await searchParams).doc === "cotizacion" ? "cotizacion" : "recepcion";

  const [orden, sesion] = await Promise.all([
    db.tallerOrden.findUnique({
      where: { id },
      include: {
        vehiculo: { include: { contacto: true } },
        conceptos: { orderBy: { id: "asc" } },
        pagos: { select: { monto: true } },
      },
    }),
    getSesion(),
  ]);
  if (!orden) notFound();

  const ajustes = await db.ajustes.findUnique({
    where: { orgId: orden.orgId },
    select: {
      marcaNombre: true,
      marcaLogo: true,
      marcaColorPrimario: true,
      marcaColorAcento: true,
      marcaPreset: true,
    },
  });
  const modulo = await db.moduloOrg.findFirst({ where: { clave: "taller", activo: true }, select: { config: true } });
  const leyenda = configTaller(modulo?.config).leyendaRecepcion;
  const marca = normalizarMarca(ajustes);
  const estilo = variablesMarca(marca);

  const manoObra = orden.conceptos
    .filter((concepto) => concepto.tipo === "mano_obra")
    .reduce((suma, concepto) => suma + Number(concepto.cantidad) * Number(concepto.precioUnitario), 0);
  const refacciones = orden.conceptos
    .filter((concepto) => concepto.tipo === "refaccion")
    .reduce((suma, concepto) => suma + Number(concepto.cantidad) * Number(concepto.precioUnitario), 0);
  const pagado = orden.pagos.reduce((suma, pago) => suma + Number(pago.monto), 0);
  const saldo = Math.max(0, Number(orden.total) - pagado);

  return (
    <main style={estilo as CSSProperties} className="min-h-svh bg-background px-4 py-6 sm:px-6">
      <div className={`${estilos.acciones} mx-auto mb-4 flex max-w-[52rem] flex-wrap items-center justify-between gap-3`}>
        <Link
          href={`/taller/ordenes/${orden.id}`}
          className="inline-flex min-h-11 items-center rounded-lg border border-border bg-card px-4 text-sm font-semibold hover:bg-muted"
        >
          Volver a la orden
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/taller/ordenes/${orden.id}/imprimir?doc=recepcion`}
            className={`inline-flex min-h-11 items-center rounded-lg border px-3 text-sm font-semibold ${doc === "recepcion" ? "border-primary bg-primary/10 text-primary" : "border-border bg-card hover:bg-muted"}`}
          >
            Recepción
          </Link>
          <Link
            href={`/taller/ordenes/${orden.id}/imprimir?doc=cotizacion`}
            className={`inline-flex min-h-11 items-center rounded-lg border px-3 text-sm font-semibold ${doc === "cotizacion" ? "border-primary bg-primary/10 text-primary" : "border-border bg-card hover:bg-muted"}`}
          >
            Cotización
          </Link>
          <BotonImprimirDoc />
        </div>
      </div>

      <article className={estilos.documento}>
        <header className={estilos.encabezado}>
          <div className="flex items-center gap-3">
            {marca.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={marca.logo} alt={marca.nombre} className="h-12 w-12 object-contain" />
            ) : (
              <span className="grid h-12 w-12 place-items-center rounded-lg bg-primary/10 text-lg font-bold text-primary">
                {marca.nombre.slice(0, 1)}
              </span>
            )}
            <div>
              <p className="text-sm font-semibold">{marca.nombre}</p>
              <p className={estilos.etiqueta}>Servicio automotriz</p>
            </div>
          </div>
          <div className="text-right">
            <p className={estilos.titulo}>{doc === "recepcion" ? "Orden de recepción" : "Cotización"}</p>
            <p className={`${estilos.folio} mt-1 text-sm`}>Orden #{String(orden.numero)}</p>
            <p className="text-xs text-muted-foreground">{fecha(orden.createdAt)}</p>
          </div>
        </header>

        <div className={`${estilos.grilla} ${estilos.grillaDos} mt-4`}>
          <section className={estilos.bloque}>
            <p className={estilos.etiqueta}>Cliente</p>
            <p className="mt-1 text-sm font-semibold">{orden.vehiculo.contacto.nombre}</p>
            <p className="text-sm text-muted-foreground">{orden.vehiculo.contacto.telefono ?? "Sin teléfono"}</p>
          </section>
          <section className={estilos.bloque}>
            <p className={estilos.etiqueta}>Vehículo</p>
            <p className="mt-1 text-sm font-semibold">
              {orden.vehiculo.marca} {orden.vehiculo.modelo}
              {orden.vehiculo.anio ? ` · ${orden.vehiculo.anio}` : ""}
            </p>
            <p className="text-sm text-muted-foreground">
              Placa {orden.vehiculo.placa}
              {orden.vehiculo.color ? ` · ${orden.vehiculo.color}` : ""}
              {orden.vehiculo.vin ? ` · VIN ${orden.vehiculo.vin}` : ""}
            </p>
          </section>
          <section className={estilos.bloque}>
            <p className={estilos.etiqueta}>Kilometraje de entrada</p>
            <p className="mt-1 text-sm font-semibold">{orden.kmEntrada.toLocaleString("es-MX")} km</p>
          </section>
          <section className={estilos.bloque}>
            <p className={estilos.etiqueta}>Promesa de entrega</p>
            <p className="mt-1 text-sm font-semibold">{orden.fechaPromesa ? fecha(orden.fechaPromesa) : "Por confirmar"}</p>
            <p className="text-xs text-muted-foreground">Atendió: {sesion?.user?.name ?? "Equipo del taller"}</p>
          </section>
        </div>

        {doc === "recepcion" ? (
          <>
            <section className={`${estilos.bloque} mt-4`}>
              <p className={estilos.etiqueta}>Falla reportada por el cliente</p>
              <p className="mt-1 whitespace-pre-wrap text-sm">{orden.fallaReportada || "—"}</p>
            </section>
            {orden.diagnostico && (
              <section className={`${estilos.bloque} mt-4`}>
                <p className={estilos.etiqueta}>Diagnóstico preliminar</p>
                <p className="mt-1 whitespace-pre-wrap text-sm">{orden.diagnostico}</p>
              </section>
            )}
            <section className="mt-4">
              <p className={estilos.etiqueta}>Estado del vehículo al ingreso</p>
              <div className={`${estilos.casillas} mt-2`}>
                <div className={estilos.casilla}>
                  <p className="text-xs font-semibold">Combustible</p>
                  <p className="text-xs text-muted-foreground">Anota la cantidad observada</p>
                </div>
                <div className={estilos.casilla}>
                  <p className="text-xs font-semibold">Objetos y observaciones</p>
                  <p className="text-xs text-muted-foreground">Documenta pertenencias y daños visibles</p>
                </div>
              </div>
            </section>
            <div className={estilos.firmas}>
              <p className={estilos.firma}>Firma de conformidad del cliente</p>
              <p className={estilos.firma}>Recibido por el taller</p>
            </div>
            <p className={estilos.leyenda}>{leyenda}</p>
          </>
        ) : (
          <>
            <table className={`${estilos.tabla} mt-4`}>
              <thead>
                <tr>
                  <th>Tipo</th>
                  <th>Descripción</th>
                  <th className={estilos.numero}>Cantidad</th>
                  <th className={estilos.numero}>Precio unitario</th>
                  <th className={estilos.numero}>Importe</th>
                </tr>
              </thead>
              <tbody>
                {orden.conceptos.length === 0 ? (
                  <tr>
                    <td colSpan={5}>Sin conceptos registrados.</td>
                  </tr>
                ) : (
                  orden.conceptos.map((concepto) => (
                    <tr key={String(concepto.id)}>
                      <td>{concepto.tipo === "refaccion" ? "Refacción" : "Mano de obra"}</td>
                      <td>{concepto.descripcion}</td>
                      <td className={estilos.numero}>{Number(concepto.cantidad).toLocaleString("es-MX")}</td>
                      <td className={estilos.numero}>{monedaTallerTexto(Number(concepto.precioUnitario))}</td>
                      <td className={estilos.numero}>
                        {monedaTallerTexto(Number(concepto.cantidad) * Number(concepto.precioUnitario))}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            <div className="mt-4 flex justify-end">
              <table className="text-sm">
                <tbody>
                  <tr>
                    <td className="pr-6 text-muted-foreground">Mano de obra</td>
                    <td className={`${estilos.numero} font-medium`}>{monedaTallerTexto(manoObra)}</td>
                  </tr>
                  <tr>
                    <td className="pr-6 text-muted-foreground">Refacciones</td>
                    <td className={`${estilos.numero} font-medium`}>{monedaTallerTexto(refacciones)}</td>
                  </tr>
                  <tr className="border-t border-border">
                    <td className="pt-2 pr-6 font-semibold">Total</td>
                    <td className={`${estilos.numero} pt-2 text-base font-bold`}>{monedaTallerTexto(Number(orden.total))}</td>
                  </tr>
                  {pagado > 0 && (
                    <tr>
                      <td className="pr-6 text-muted-foreground">Pagado</td>
                      <td className={`${estilos.numero}`}>{monedaTallerTexto(pagado)}</td>
                    </tr>
                  )}
                  {pagado > 0 && (
                    <tr>
                      <td className="pr-6 font-semibold">Saldo</td>
                      <td className={`${estilos.numero} font-semibold`}>{monedaTallerTexto(saldo)}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className={estilos.firmas}>
              <p className={estilos.firma}>Aprobación del cliente</p>
              <p className={estilos.firma}>Autorizó el taller</p>
            </div>
            <p className={estilos.leyenda}>
              Cotización válida por 15 días naturales. Los trabajos adicionales que se detecten durante la reparación
              se cotizarán y requerirán una nueva aprobación.
            </p>
          </>
        )}
      </article>
    </main>
  );
}
