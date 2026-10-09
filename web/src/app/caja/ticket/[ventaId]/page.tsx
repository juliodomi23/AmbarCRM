import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BotonImprimir } from "@/components/caja/BotonImprimir";
import { authOptions } from "@/lib/auth";
import { normalizarMarca } from "@/lib/brand";
import { db } from "@/lib/db";
import { aBigInt } from "@/lib/ids";
import { moduloActivo } from "@/lib/modulos";
import { getAjustes } from "@/lib/services/config";
import estilos from "./ticket.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Ticket de venta | AmbarCRM",
  robots: { index: false, follow: false },
};

type ParametrosTicket = {
  params: Promise<{ ventaId: string }>;
  searchParams: Promise<{ imprimir?: string; ancho?: string }>;
};

export default async function TicketPage({ params, searchParams }: ParametrosTicket) {
  const sesion = await getServerSession(authOptions);
  if (!sesion?.user) redirect("/login");
  if (!(await moduloActivo("caja"))) notFound();

  const ventaId = aBigInt((await params).ventaId);
  if (ventaId === null) notFound();

  // `db` fija app.current_org desde la sesión. RLS convierte un id de otra
  // empresa en una venta inexistente, por lo que la respuesta es 404.
  const venta = await db.venta.findUnique({
    where: { id: ventaId },
    include: {
      contacto: true,
      creadoPor: { select: { id: true, nombre: true } },
      caja: true,
      pagos: true,
      partidas: { include: { producto: true } },
    },
  });
  if (!venta?.turnoId) notFound();

  const consulta = await searchParams;
  const ancho = consulta.ancho === "58" ? 58 : 80;
  const marca = normalizarMarca(await getAjustes());
  const moneda = (valor: unknown) =>
    new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: venta.moneda,
    }).format(Number(valor));

  return (
    <main className={estilos.pagina}>
      <div className={estilos.acciones}>
        <Link href="/caja" className="rounded-lg bg-muted px-4 py-2 text-sm">
          Volver a caja
        </Link>
        <div className="flex items-center gap-2">
          <Link
            href={`/caja/ticket/${venta.id}?ancho=${ancho === 80 ? 58 : 80}`}
            className="rounded-lg border border-border bg-card px-3 py-2 text-sm"
          >
            Papel {ancho === 80 ? "58" : "80"} mm
          </Link>
          <BotonImprimir automatico={consulta.imprimir === "1"} />
        </div>
      </div>

      <article
        className={`${estilos.ticket} ${ancho === 58 ? estilos.ticket58 : estilos.ticket80} font-mono text-[11px] leading-4`}
      >
        <header className="text-center">
          {marca.logo && (
            <Image
              unoptimized
              src={marca.logo}
              width={56}
              height={56}
              alt=""
              className="mx-auto mb-1 h-14 w-14 object-contain"
            />
          )}
          <h1 className="font-sans text-base font-bold">{marca.nombre}</h1>
          <p>{venta.caja?.nombre}</p>
        </header>

        <div className="my-2 border-y border-dashed border-black py-2">
          <p>Folio: {venta.folio}</p>
          <p>
            Fecha: {venta.createdAt.toLocaleString("es-MX", { timeZone: "America/Mexico_City" })}
          </p>
          <p>Cajero: {venta.creadoPor?.nombre ?? "—"}</p>
          {venta.contacto && <p>Cliente: {venta.contacto.nombre}</p>}
        </div>

        <div>
          {venta.partidas.map((partida) => (
            <div key={String(partida.id)} className="mb-1">
              <p>{partida.producto.nombre}</p>
              <p className="flex justify-between gap-2">
                <span>
                  {Number(partida.cantidad)} {partida.producto.unidad} × {moneda(partida.precioUnitario)}
                </span>
                <span>{moneda(partida.total)}</span>
              </p>
              {partida.descuento.gt(0) && <p className="text-right">Desc. {moneda(partida.descuento)}</p>}
            </div>
          ))}
        </div>

        <div className="my-2 border-y border-dashed border-black py-2">
          <p className="flex justify-between"><span>Subtotal</span><span>{moneda(venta.subtotal)}</span></p>
          {venta.descuento.gt(0) && (
            <p className="flex justify-between"><span>Descuento</span><span>−{moneda(venta.descuento)}</span></p>
          )}
          <p className="flex justify-between text-sm font-bold"><span>Total</span><span>{moneda(venta.total)}</span></p>
        </div>

        <div>
          {venta.pagos.map((pago) => (
            <p key={String(pago.id)} className="flex justify-between capitalize">
              <span>{pago.metodo}</span><span>{moneda(pago.monto)}</span>
            </p>
          ))}
          <p className="flex justify-between font-bold"><span>Cambio</span><span>{moneda(venta.cambio)}</span></p>
        </div>

        {venta.estado === "cancelada" && (
          <p className="mt-3 border-2 border-black p-1 text-center font-bold">VENTA CANCELADA</p>
        )}
        <p className="mt-4 text-center">Gracias por su compra</p>
      </article>
    </main>
  );
}
