import { formatoMoneda } from "@/lib/formato-moneda";
import type { ResumenCobrosCliente as Resumen } from "@/lib/cobros-resumen-db";

export function ResumenCobrosCliente({ resumen }: { resumen: Resumen }) {
  const secundarios = [
    ...(resumen.contratos > 1 ? [{ titulo: "Este contrato", valor: `${formatoMoneda(resumen.cobradoContrato.toNumber(), "MXN", 2)} MXN` }] : []),
    { titulo: "Por cobrar", valor: `${formatoMoneda(resumen.porCobrar.toNumber(), "MXN", 2)} MXN` },
    ...(resumen.clienteDesde ? [{ titulo: "Cliente desde", valor: resumen.clienteDesde.toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "short", year: "numeric" }) }] : []),
    { titulo: "Mensualidades pagadas", valor: String(resumen.mensualidadesPagadas) },
  ];

  return <section aria-label="Resumen de cobros del cliente" className="grid min-w-0 gap-3 sm:grid-cols-2 xl:flex">
    <article className="surface min-w-0 !border-t-4 !border-t-emerald-600 p-5 sm:col-span-2 xl:flex-[2]">
      <p className="text-sm font-medium">Total cobrado con el cliente</p>
      <strong className="mt-3 block break-words text-3xl font-bold tracking-tight text-emerald-800 dark:text-emerald-200 tnum">{formatoMoneda(resumen.totalCobrado.toNumber(), "MXN", 2)} <span className="text-sm font-medium">MXN</span></strong>
      <p className="mt-3 text-xs text-muted-foreground">{resumen.totalCobrado.isZero() ? "Sin pagos registrados" : `Recibido en ${resumen.contratos} ${resumen.contratos === 1 ? "contrato" : "contratos"}`}</p>
    </article>
    {secundarios.map(({ titulo, valor }) => <article key={titulo} className="surface min-w-0 p-5 xl:flex-1">
      <p className="text-sm text-muted-foreground">{titulo}</p>
      <strong className="mt-3 block break-words text-xl tnum">{valor}</strong>
    </article>)}
  </section>;
}
