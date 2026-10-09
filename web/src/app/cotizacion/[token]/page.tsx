import type { CSSProperties } from "react";
import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { RespuestaCotizacion } from "@/components/cotizaciones/RespuestaCotizacion";
import { normalizarMarca, variablesMarca } from "@/lib/brand";
import { cotizacionPublica, resolverOrgCotizacion } from "@/lib/cotizaciones-db";
import { runWithOrg } from "@/lib/db";
import { serializar } from "@/lib/serialize";
import { getAjustes } from "@/lib/services/config";
import estilos from "./cotizacion.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cotización",
  robots: { index: false, follow: false },
};

function moneda(valor: unknown) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(valor));
}

export default async function CotizacionPublicaPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const orgId = await resolverOrgCotizacion(token);
  if (orgId === null) notFound();
  const [cotizacion, marca] = await Promise.all([
    cotizacionPublica(orgId, token),
    runWithOrg(orgId, async () => normalizarMarca(await getAjustes())),
  ]);
  if (!cotizacion) notFound();
  const documento = serializar(cotizacion);
  return (
    <main className={`${estilos.pagina} marca-local`} style={variablesMarca(marca) as CSSProperties}>
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

        <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-y bg-muted/40"><tr><th className="p-3 text-left">Concepto</th><th className="p-3 text-right">Cantidad</th><th className="p-3 text-right">Precio</th><th className="p-3 text-right">Importe</th></tr></thead><tbody>{cotizacion.partidas.map((partida) => <tr key={String(partida.id)} className="border-b"><td className="p-3">{partida.concepto}</td><td className="p-3 text-right">{Number(partida.cantidad)}</td><td className="p-3 text-right">{moneda(partida.precio)}</td><td className="p-3 text-right">{moneda(partida.total)}</td></tr>)}</tbody></table></div>

        <div className="ml-auto mt-6 w-full max-w-xs space-y-2 text-sm"><p className="flex justify-between"><span>Subtotal</span><span>{moneda(cotizacion.subtotal)}</span></p>{cotizacion.descuento.gt(0) && <p className="flex justify-between"><span>Descuento</span><span>−{moneda(cotizacion.descuento)}</span></p>}<p className="flex justify-between"><span>IVA ({Number(cotizacion.ivaPorcentaje)}%{cotizacion.preciosConIva ? " incluido" : ""})</span><span>{moneda(cotizacion.impuestos)}</span></p><p className="flex justify-between border-t pt-2 text-lg font-bold"><span>Total</span><span>{moneda(cotizacion.total)}</span></p></div>

        {cotizacion.notas && <section className="mt-8"><h3 className="font-semibold">Notas</h3><p className="whitespace-pre-wrap text-sm text-muted-foreground">{cotizacion.notas}</p></section>}
        {cotizacion.condiciones && <section className="mt-5"><h3 className="font-semibold">Condiciones</h3><p className="whitespace-pre-wrap text-sm text-muted-foreground">{cotizacion.condiciones}</p></section>}

        <div className={estilos.respuesta}><RespuestaCotizacion token={token} estadoInicial={documento.estado} respondidoPor={documento.respondidoPor} respondidoAt={documento.respondidoAt} /></div>
      </article>
    </main>
  );
}
