import Link from "next/link";
import { Badge } from "@/components/ui";
import { ESTILOS_AR } from "@/lib/ar-vistas";
import type { listarServidores } from "@/lib/servidores-db";
import { FormularioServidor, RegenerarToken } from "./FormularioServidor";
import { HistorialServidor } from "./HistorialServidor";

const ESTILOS = { verde: ESTILOS_AR.produccion, amarillo: ESTILOS_AR.en_desarrollo, rojo: ESTILOS_AR.vencido, "sin-datos": ESTILOS_AR.por_confirmar };
const ESTADOS = { verde: "Operativo", amarillo: "Atención", rojo: "Crítico", "sin-datos": "Sin datos" };
type ServidorVista = Awaited<ReturnType<typeof listarServidores>>[number];

function CargaAdicional({ texto }: { texto: string }) {
  const sinContrato = /sin contrato en CRM/i.test(texto);
  const porConfirmar = /⚠/u.test(texto);
  const baja = /\(baja\)/i.test(texto);
  const nombre = texto.replace(/⚠\uFE0F?/gu, "").replace(/sin contrato en CRM/gi, "").replace(/\(baja\)/gi, "").trim();
  return <li className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1">
    <span className="min-w-0 break-words [overflow-wrap:anywhere]">{nombre}</span>
    {baja && <Badge>Baja</Badge>}
    {sinContrato ? <Badge tono="warning">Sin contrato en CRM</Badge> : porConfirmar && <Badge tono="warning">Por confirmar</Badge>}
  </li>;
}

export function TarjetaServidor({ servidor: s }: { servidor: ServidorVista }) {
  const estilo = ESTILOS[s.estado];
  const pendientes = [
    s.costoAnualMxn === null && "Costo anual",
    s.ramTotalMb === null && "RAM total",
    s.vence === null && "Fecha de vencimiento",
    !s.contratos.length && !s.cargasLibres && "Cargas",
  ].filter(Boolean);
  const motivoAdicional = !/^(RAM|Disco) \d/.test(s.motivo);

  return <article className={`surface flex min-w-0 flex-col !border-l-4 p-4 sm:p-5 ${estilo.borde}`} data-servidor-id={String(s.id)}>
    <header>
      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${estilo.badge}`}>{s.activo ? ESTADOS[s.estado] : "Inactivo"}</span>
      <h2 className="mt-2 break-words text-xl font-semibold [overflow-wrap:anywhere]">{s.nombre}</h2>
      <p className="mt-1 break-words text-xs text-muted-foreground [overflow-wrap:anywhere]">{s.proveedor} · {s.ip} · {s.propietario}</p>
      {motivoAdicional && <p className="mt-2 text-sm text-muted-foreground">{s.motivo}</p>}
    </header>

    <section className="my-5 space-y-3" aria-label="Uso de recursos">
      {([["RAM", s.ultimo?.ramPct], ["CPU", s.ultimo?.cpuPct], ["Disco", s.ultimo?.discoPct]] as const).map(([nombre, valor]) => <div key={nombre}>
        <div className="mb-1.5 flex justify-between gap-2 text-sm"><span>{nombre}</span><span className="tnum font-medium">{valor === undefined ? "Sin datos" : `${valor.toFixed(1)} %`}</span></div>
        <div role={valor === undefined ? "img" : "meter"} aria-label={valor === undefined ? `${nombre}: sin datos` : nombre} aria-valuemin={valor === undefined ? undefined : 0} aria-valuemax={valor === undefined ? undefined : 100} aria-valuenow={valor} aria-valuetext={valor === undefined ? undefined : `${valor.toFixed(1)} %`} className="h-2 overflow-hidden rounded-full bg-muted">
          <div className={`h-full rounded-full ${valor === undefined ? "bg-muted-foreground" : valor >= 90 ? "bg-destructive" : valor >= 80 ? "bg-warning" : "bg-success"}`} style={{ width: `${valor ?? 0}%` }} />
        </div>
      </div>)}
      {s.ultimo && <p className="text-xs text-muted-foreground">Tiempo encendido: {s.ultimo.uptimeHoras.toFixed(1)} h</p>}
    </section>

    <HistorialServidor historial={s.historial} inicio={s.inicioHistorial} />

    <section className="my-4 space-y-2 border-t pt-4" aria-label="Vencimiento y capacidad">
      {s.diasParaVencer !== null && <p className="text-sm font-medium">{s.diasParaVencer < 0 ? `Venció hace ${-s.diasParaVencer} días` : `Vence en ${s.diasParaVencer} días`}{s.vence && <span className="ml-2 inline-block text-xs font-normal text-muted-foreground">{s.vence.toLocaleDateString("es-MX", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" })}</span>}</p>}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {s.costoAnualMxn !== null && <span>${s.costoAnualMxn.toFixed(2)} MXN / año</span>}
        {s.ramTotalMb !== null && <span>{s.ramTotalMb} MB RAM</span>}
        <span>{s.loPagamos ? "Lo paga AR" : "Pago externo"}</span>
      </div>
      {!!pendientes.length && <details className="text-xs text-muted-foreground">
        <summary className="min-h-11 w-fit cursor-pointer rounded-lg bg-muted px-3 py-3 font-medium">Datos por confirmar</summary>
        <p className="mt-2 leading-relaxed">{pendientes.join(" · ")}</p>
      </details>}
    </section>

    <section className="border-t pt-4"><h3 className="text-sm font-semibold">Cargas</h3>
      <ul className="mt-2 text-sm text-foreground">
        {s.contratos.map(c => <li key={String(c.id)} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1">
          <Link className="min-w-0 break-words rounded-sm underline decoration-border underline-offset-4 hover:decoration-foreground [overflow-wrap:anywhere]" href={`/contratos/${c.id}`}>{c.contacto.nombre} · {c.tipo.replaceAll("_", " ")}</Link>
          {c.estado === "baja" && <Badge>Baja</Badge>}
        </li>)}
        {s.cargasLibres?.split("\n").filter(Boolean).map((c, i) => <CargaAdicional key={i} texto={c} />)}
      </ul>
      {!s.contratos.length && !s.cargasLibres && <p className="mt-2 text-xs text-muted-foreground">Sin cargas registradas.</p>}
    </section>

    {s.notas && <details className="mt-4 text-xs text-muted-foreground"><summary className="min-h-11 w-fit cursor-pointer rounded-lg py-3 font-medium">Notas</summary><p className="mt-1 whitespace-pre-line break-words leading-relaxed [overflow-wrap:anywhere]">{s.notas}</p></details>}

    <footer className="mt-auto pt-5"><div className="flex flex-wrap gap-2 border-t pt-4">
      <FormularioServidor id={String(s.id)} valores={{ nombre: s.nombre, proveedor: s.proveedor, ip: s.ip, propietario: s.propietario, loPagamos: s.loPagamos, activo: s.activo, costoAnualMxn: s.costoAnualMxn?.toString() ?? "", vence: s.vence?.toISOString().slice(0, 10) ?? "", ramTotalMb: s.ramTotalMb?.toString() ?? "", notas: s.notas ?? "", cargasLibres: s.cargasLibres ?? "" }} />
      <RegenerarToken id={String(s.id)} nombre={s.nombre} />
    </div></footer>
  </article>;
}
