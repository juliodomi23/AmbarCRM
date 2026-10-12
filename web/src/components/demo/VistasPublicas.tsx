"use client";

// Páginas públicas dentro de /demo: los mismos componentes y el mismo JSX que las rutas reales
// (/tienda, /reservar, /cotizacion, /opinion y el ticket de caja) con datos del almacén. Ninguna llama al servidor.
import Image from "next/image";
import Link from "next/link";
import { BotonImprimir } from "@/components/caja/BotonImprimir";
import { RespuestaCotizacion } from "@/components/cotizaciones/RespuestaCotizacion";
import { TiendaPublica } from "@/components/pedidos/TiendaPublica";
import { GestionCita } from "@/components/reservas/GestionCita";
import { ReservaPublica } from "@/components/reservas/ReservaPublica";
import { OpinionPublica } from "@/components/resenas/OpinionPublica";
import { Badge, type TonoBadge } from "@/components/ui";
import { origenValido } from "@/lib/resenas";
import { irA, useNavegacionDemo } from "@/lib/demo/navegacion";
import { useDatos } from "@/lib/demo/usar-almacen";
import type { Datos } from "@/lib/demo/tipos";
import estilosCotizacion from "@/app/cotizacion/[token]/cotizacion.module.css";
import estilosTicket from "@/app/caja/ticket/[ventaId]/ticket.module.css";

/** Decimal mínimo (lo que las páginas reales usan de Prisma.Decimal: gt, minus y conversión a número). */
class Dec {
  constructor(private v: number) {}
  gt(n: number) { return this.v > n; }
  minus(o: unknown) { return new Dec(this.v - Number(o)); }
  valueOf() { return this.v; }
  toFixed(d: number) { return this.v.toFixed(d); }
  toString() { return String(this.v); }
}
const dec = (n: number | null | undefined) => new Dec(Number(n ?? 0));

export const PREFIJOS_PUBLICOS = ["/tienda", "/reservar", "/cotizacion", "/opinion", "/caja/ticket"];
export const esRutaPublica = (ruta: string) => PREFIJOS_PUBLICOS.some((p) => ruta === p || ruta.startsWith(`${p}/`)) || ruta === "/opinion-gracias";

function NoEncontrada({ ruta }: { ruta: string }) {
  return (
    <main className="mx-auto max-w-md space-y-3 p-10 text-center">
      <h1 className="text-xl font-bold">Esta página pública no existe en la demo</h1>
      <p className="text-sm text-muted-foreground">{ruta}</p>
    </main>
  );
}

const nombres: Record<string, string> = { pendiente: "Recibido", pagada: "Confirmado", preparando: "Preparando", lista: "Listo", entregada: "Entregado", cancelada: "Cancelado" };
const tonos: Record<string, TonoBadge> = { pendiente: "warning", pagada: "success", preparando: "info", lista: "info", entregada: "success", cancelada: "destructive" };

function SeguimientoPedido({ token, d }: { token: string; d: Datos }) {
  const v = (d.extra.ventas ?? []).find((x) => x.tokenSeguimiento === token);
  if (!v) return <NoEncontrada ruta={`/tienda/pedido/${token}`} />;
  const pedido = { folio: v.folio, estado: v.estado, total: dec(v.total), tipoEntrega: v.tipoEntrega === "envio" ? "domicilio" : v.tipoEntrega, createdAt: new Date(v.createdAt) };
  return (
    <div className="marca-local min-h-screen bg-background bg-mesh px-4 py-12 text-foreground" >
      <main className="surface surface-lift animate-fade-up mx-auto max-w-lg space-y-3 rounded-2xl p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[.14em] text-primary">Seguimiento de pedido</p>
        <h1 className="text-3xl font-bold">{pedido.folio}</h1>
        <h2 className="text-lg font-semibold"><Badge tono={tonos[pedido.estado] ?? "neutral"} punto className="px-3 py-1 text-sm">{nombres[pedido.estado] ?? pedido.estado}</Badge></h2>
        <p className="tnum text-base">Total: ${pedido.total.toFixed(2)}</p>
        <p className="text-sm text-muted-foreground">{pedido.tipoEntrega === "domicilio" ? "Entrega a domicilio" : "Recoger en tienda"}</p>
        <small className="block text-xs text-muted-foreground">Recibido {pedido.createdAt.toLocaleString("es-MX")}</small>
      </main>
    </div>
  );}

function CotizacionPublica({ token, d }: { token: string; d: Datos }) {
  const c = (d.extra.cotizaciones ?? []).find((x) => x.tokenPublico === token);
  if (!c) return <NoEncontrada ruta={`/cotizacion/${token}`} />;
  const config = (d.modulos.cotizaciones?.config ?? {}) as { ivaPorcentaje?: string; preciosConIva?: boolean };
  const marca = d.marca;
  const estilos = estilosCotizacion;
  const moneda = (valor: unknown) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(valor));
  const cotizacion = {
    ...c, vigencia: new Date(c.vigencia), contacto: d.contactos.find((x) => x.id === c.contactoId) ?? { nombre: "—" }, oportunidad: null, descuento: dec(0),
    ivaPorcentaje: Number(config.ivaPorcentaje ?? 16), preciosConIva: Boolean(config.preciosConIva),
  };
  const documento = { estado: c.estado, respondidoPor: c.respondidoPor ?? null, respondidoAt: c.respondidoAt ?? null };
  return (
    <main className={`${estilos.pagina} marca-local`} >
      <div className={estilos.acciones}>
        <span className="text-sm text-muted-foreground">Guarda una copia con “Imprimir → PDF”.</span>
        <RespuestaCotizacion token={token} estadoInicial={documento.estado} modo="imprimir" />
      </div>
      <article className={estilos.documento}>
        <header className="flex items-start justify-between gap-6 border-b border-border pb-6">
          <div className="flex items-center gap-3">
            {marca.logo && <Image unoptimized src={marca.logo} alt="" width={64} height={64} className="h-16 w-16 object-contain" />}
            <div><h1 className="text-2xl font-bold text-primary">{marca.nombre}</h1><p className="text-sm text-muted-foreground">Cotización {cotizacion.folio}</p></div>
          </div>
          <div className="text-right text-sm"><p className="font-semibold capitalize">{cotizacion.estado}</p><p>Válida hasta {cotizacion.vigencia.toLocaleDateString("es-MX", { timeZone: "UTC" })}</p></div>
        </header>

        <section className="my-6"><p className="text-xs uppercase tracking-wide text-muted-foreground">Preparada para</p><h2 className="text-lg font-semibold">{cotizacion.contacto.nombre}</h2>{cotizacion.oportunidad && <p className="text-sm text-muted-foreground">{cotizacion.oportunidad.titulo}</p>}</section>

        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-y bg-muted/40"><tr><th className="p-3 text-left">Concepto</th><th className="p-3 text-right">Cantidad</th><th className="p-3 text-right">Precio</th><th className="p-3 text-right">Importe</th></tr></thead><tbody>{cotizacion.partidas.map((partida: any) => <tr key={String(partida.id)} className="border-b"><td className="p-3">{partida.concepto}</td><td className="p-3 text-right">{Number(partida.cantidad)}</td><td className="p-3 text-right">{moneda(partida.precio)}</td><td className="p-3 text-right">{moneda(partida.total)}</td></tr>)}</tbody></table></div>

        <div className="ml-auto mt-6 w-full max-w-xs space-y-2 text-sm"><p className="flex justify-between"><span>Subtotal</span><span>{moneda(cotizacion.subtotal)}</span></p>{cotizacion.descuento.gt(0) && <p className="flex justify-between"><span>Descuento</span><span>−{moneda(cotizacion.descuento)}</span></p>}<p className="flex justify-between"><span>IVA ({Number(cotizacion.ivaPorcentaje)}%{cotizacion.preciosConIva ? " incluido" : ""})</span><span>{moneda(cotizacion.impuestos)}</span></p><p className="flex justify-between border-t pt-2 text-lg font-bold"><span>Total</span><span>{moneda(cotizacion.total)}</span></p></div>

        {cotizacion.notas && <section className="mt-8"><h3 className="font-semibold">Notas</h3><p className="whitespace-pre-wrap text-sm text-muted-foreground">{cotizacion.notas}</p></section>}
        {cotizacion.condiciones && <section className="mt-5"><h3 className="font-semibold">Condiciones</h3><p className="whitespace-pre-wrap text-sm text-muted-foreground">{cotizacion.condiciones}</p></section>}

        <div className={estilos.respuesta}><RespuestaCotizacion token={token} estadoInicial={documento.estado} respondidoPor={documento.respondidoPor} respondidoAt={documento.respondidoAt} /></div>
      </article>
    </main>
  );
}

function TicketVenta({ ventaId, query, d }: { ventaId: string; query: string; d: Datos }) {
  const v = (d.extra.ventas ?? []).find((x) => x.id === ventaId);
  if (!v?.turnoId) return <NoEncontrada ruta={`/caja/ticket/${ventaId}`} />;
  const estilos = estilosTicket;
  const consulta = Object.fromEntries(new URLSearchParams(query)) as { ancho?: string };
  const ancho = consulta.ancho === "58" ? 58 : 80;
  const marca = d.marca;
  const moneda = (valor: unknown) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(valor));
  const caja = (d.extra.cajas ?? []).find((c) => c.id === v.cajaId);
  const venta = {
    ...v, createdAt: new Date(v.createdAt), moneda: "MXN", caja, creadoPor: d.usuarios.find((u) => u.id === v.creadoPorId) ?? null, contacto: v.contactoId ? d.contactos.find((c) => c.id === v.contactoId) ?? null : null,
    subtotal: dec(v.subtotal), descuento: dec(v.descuento), total: dec(v.total), cambio: dec(Math.max(0, v.pagos.reduce((s: number, p: any) => s + p.monto, 0) - v.total)),
    partidas: v.partidas.map((l: any) => ({ ...l, producto: (d.extra.productos ?? []).find((p) => p.id === l.productoId) ?? { nombre: "—", unidad: "pieza" }, descuento: dec(0), descuentoPromocion: dec(0), promocionDescripcion: null, precioUnitario: dec(l.precioUnitario), total: dec(l.total) })),
    pagos: v.pagos.map((p: any, i: number) => ({ id: i, metodo: p.metodo, monto: dec(p.monto) })),
  };
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
          <BotonImprimir />
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
          {venta.partidas.map((partida: any) => (
            <div key={String(partida.id)} className="mb-1">
              <p>{partida.producto.nombre}</p>
              <p className="flex justify-between gap-2">
                <span>
                  {Number(partida.cantidad)} {partida.producto.unidad} × {moneda(partida.precioUnitario)}
                </span>
                <span>{moneda(partida.total)}</span>
              </p>
              {partida.descuentoPromocion.gt(0) && <p className="text-right">Promo {partida.promocionDescripcion ?? "aplicada"}: −{moneda(partida.descuentoPromocion)}</p>}
              {partida.descuento.minus(partida.descuentoPromocion).gt(0) && <p className="text-right">Desc. manual {moneda(partida.descuento.minus(partida.descuentoPromocion))}</p>}
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
          {venta.pagos.map((pago: any) => (
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

/** Vista pública de ejemplo: cada ruta pública del CRM, pintada con su componente real y datos ficticios. */
export function VistaPublica({ ruta }: { ruta: string }) {
  const d = useDatos();
  const { query } = useNavegacionDemo();
  const [, base, a, b] = ruta.split("/");
  // Igual que las páginas del servidor real: si el negocio no tiene el módulo, la página no existe
  // (los componentes públicos asumen que ya se validó y no saben pintar un 404 de su API).
  const activo = (clave: string) => Boolean((d.modulos as Record<string, { activo?: boolean } | undefined>)[clave]?.activo);
  const requiere = { tienda: "pedidos_en_linea", reservar: "reservas_en_linea", opinion: "resenas" } as Record<string, string>;
  const esGestion = (base === "tienda" && a === "pedido") || (base === "reservar" && a === "cita");
  if (requiere[base] && !esGestion && !activo(requiere[base])) return <NoEncontrada ruta={ruta} />;
  if (base === "tienda" && a === "pedido" && b) return <SeguimientoPedido token={b} d={d} />;
  if (base === "tienda" && a) return <TiendaPublica slug={a} />;
  if (base === "reservar" && a === "cita" && b) return <GestionCita token={b} />;
  if (base === "reservar" && a) return <ReservaPublica slug={a} />;
  if (base === "cotizacion" && a) return <CotizacionPublica token={a} d={d} />;
  if (base === "caja" && a === "ticket" && b) return <TicketVenta ventaId={b} query={query} d={d} />;
  if (base === "opinion" && a) {
    const enlace = (d.modulos.resenas?.config as { enlaceGoogle?: string } | undefined)?.enlaceGoogle;
    // En el CRM real el cliente sale a Google. En la demo se queda aquí (cambio solo de hash: sin recarga).
    const destino = `${window.location.pathname}${window.location.search}#/opinion-gracias`;
    void enlace;
    return <OpinionPublica slug={a} nombre={d.marca.nombre} enlaceGoogle={destino} origen={origenValido(new URLSearchParams(query).get("o"))} />;
  }
  if (base === "opinion-gracias") {
    return (
      <main className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-5xl">★</p>
        <h1 className="text-2xl font-bold">¡Gracias por tu opinión!</h1>
        <p className="text-sm text-muted-foreground">En el CRM real aquí se abre la página de reseñas de Google del negocio. En la demo tu calificación ya quedó en el panel de Reseñas.</p>
        <button type="button" onClick={() => irA("/resenas")} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Ver el panel de reseñas</button>
      </main>
    );
  }
  return <NoEncontrada ruta={ruta} />;
}
