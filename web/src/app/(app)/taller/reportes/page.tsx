import Link from "next/link";
import { redirect } from "next/navigation";
import { getSesion } from "@/lib/session";
import { moduloActivo } from "@/lib/modulos";
import { hoyTaller, periodoReporte, reportesTaller } from "@/lib/taller-reportes";
import { monedaTallerTexto, textoEstadoTaller } from "@/lib/taller-mensajes";
import { sumarDias } from "@/lib/reservas/horarios";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Reportes del taller",
  robots: { index: false, follow: false },
};

function fechaCorta(fecha: string) {
  const [, mes, dia] = fecha.split("-");
  return `${dia}/${mes}`;
}

function Tarjeta({ titulo, valor, nota }: { titulo: string; valor: string; nota?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{titulo}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{valor}</p>
      {nota && <p className="mt-1 text-xs text-muted-foreground">{nota}</p>}
    </div>
  );
}

export default async function TallerReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>;
}) {
  if (!(await moduloActivo("taller"))) redirect("/");
  const sesion = await getSesion();
  if (sesion?.user?.rol !== "admin") redirect("/taller/ordenes");

  const consulta = await searchParams;
  const periodo = periodoReporte(consulta.desde, consulta.hasta);
  const reporte = await reportesTaller(periodo.desde, periodo.hasta);
  const { resumen } = reporte;
  const maximoSerie = Math.max(1, ...reporte.serieDiaria.map((dia) => dia.monto));
  const consultaCsv = new URLSearchParams({ desde: periodo.desde, hasta: periodo.hasta, formato: "csv" });
  const hoy = hoyTaller();
  const inicioMes = `${hoy.slice(0, 7)}-01`;
  const finAnterior = sumarDias(inicioMes, -1);
  const presets = [
    { nombre: "Hoy", desde: hoy, hasta: hoy },
    { nombre: "7 días", desde: sumarDias(hoy, -6), hasta: hoy },
    { nombre: "Este mes", desde: inicioMes, hasta: hoy },
    { nombre: "Mes anterior", desde: `${finAnterior.slice(0, 7)}-01`, hasta: finAnterior },
  ];

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Reportes del taller</h1>
          <p className="text-sm text-muted-foreground">
            Del {periodo.desde} al {periodo.hasta} · hora de Ciudad de México
          </p>
        </div>
        <Link
          href={`/api/taller/reportes?${consultaCsv.toString()}`}
          className="inline-flex min-h-11 items-center rounded-lg border border-border bg-card px-4 text-sm font-semibold hover:bg-muted"
        >
          Exportar CSV
        </Link>
      </header>

      <div className="flex flex-wrap gap-2">
        {presets.map((preset) => {
          const activo = periodo.desde === preset.desde && periodo.hasta === preset.hasta;
          const busqueda = new URLSearchParams({ desde: preset.desde, hasta: preset.hasta });
          return (
            <Link
              key={preset.nombre}
              href={`/taller/reportes?${busqueda.toString()}`}
              className={`inline-flex min-h-10 items-center rounded-lg border px-3 text-sm font-medium ${activo ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            >
              {preset.nombre}
            </Link>
          );
        })}
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Desde</span>
          <input
            type="date"
            name="desde"
            defaultValue={periodo.desde}
            max={periodo.hasta}
            className="min-h-11 rounded-lg border border-border bg-background px-3"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Hasta</span>
          <input
            type="date"
            name="hasta"
            defaultValue={periodo.hasta}
            min={periodo.desde}
            className="min-h-11 rounded-lg border border-border bg-background px-3"
          />
        </label>
        <button
          type="submit"
          className="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          Aplicar
        </button>
        <p className="text-xs text-muted-foreground">Periodo máximo: 366 días.</p>
      </form>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tarjeta titulo="Órdenes ingresadas" valor={String(resumen.ingresadas)} nota="En el periodo" />
        <Tarjeta titulo="Entregadas" valor={String(resumen.entregadas)} nota={`${resumen.canceladas} canceladas`} />
        <Tarjeta titulo="Cobrado" valor={monedaTallerTexto(resumen.ingresosCobrados)} nota="Pagos del periodo" />
        <Tarjeta titulo="Por cobrar" valor={monedaTallerTexto(resumen.porCobrar)} nota="Saldos pendientes sin cancelar" />
        <Tarjeta titulo="Ticket promedio" valor={monedaTallerTexto(resumen.ticketPromedio)} nota="Sobre entregadas" />
        <Tarjeta
          titulo="Tiempo promedio"
          valor={resumen.tiempoPromedioEntregaDias === null ? "—" : `${resumen.tiempoPromedioEntregaDias} días`}
          nota="Ingreso → entrega"
        />
        <Tarjeta titulo="Órdenes abiertas" valor={String(resumen.ordenesAbiertas)} nota="Sin entregar ni cancelar" />
        <Tarjeta titulo="Recordatorios vencidos" valor={String(resumen.recordatoriosVencidos)} nota="Fecha o kilometraje" />
        <Tarjeta titulo="Piezas bajo mínimo" valor={String(resumen.piezasBajoMinimo)} nota="Refacciones por resurtir" />
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="text-base font-semibold">Ingresos por día</h2>
        <p className="text-xs text-muted-foreground">Pagos registrados, sin incluir propinas ni otros módulos.</p>
        {reporte.serieDiaria.every((dia) => dia.monto === 0) ? (
          <p className="mt-4 text-sm text-muted-foreground">Sin pagos registrados en el periodo.</p>
        ) : (
          <div className="mt-4 flex h-40 items-end gap-0.5 overflow-x-auto">
            {reporte.serieDiaria.map((dia) => (
              <div key={dia.fecha} className="flex h-full min-w-[6px] flex-1 flex-col justify-end items-center gap-1" title={`${dia.fecha}: ${monedaTallerTexto(dia.monto)}`}>
                <div
                  className="w-full rounded-t bg-primary/70"
                  style={{ height: `${Math.max(dia.monto > 0 ? 3 : 0, (dia.monto / maximoSerie) * 100)}%` }}
                />
                <span className="text-[9px] text-muted-foreground">{fechaCorta(dia.fecha)}</span>
              </div>
            ))}
          </div>
        )}
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">
            Ver tabla de valores
          </summary>
          <div className="mt-2 max-h-56 overflow-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="pb-1">Fecha</th>
                  <th className="pb-1 text-right">Pagos</th>
                  <th className="pb-1 text-right">Monto</th>
                </tr>
              </thead>
              <tbody>
                {reporte.serieDiaria.map((dia) => (
                  <tr key={dia.fecha} className="border-t border-border">
                    <td className="py-1">{dia.fecha}</td>
                    <td className="py-1 text-right tabular-nums">{dia.pagos}</td>
                    <td className="py-1 text-right tabular-nums">{monedaTallerTexto(dia.monto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-base font-semibold">Órdenes por estado</h2>
          {reporte.embudo.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Sin órdenes registradas.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {reporte.embudo.map((fila) => (
                <li key={fila.estado} className="flex items-center justify-between gap-3 border-b border-border pb-2 text-sm last:border-0 last:pb-0">
                  <span>{textoEstadoTaller(fila.estado)}</span>
                  <span className="font-semibold tabular-nums">{fila.total}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-base font-semibold">Clientes con saldo</h2>
          {reporte.clientesConSaldo.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Sin saldos pendientes.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {reporte.clientesConSaldo.map((cliente) => (
                <li key={cliente.contactoId} className="flex items-center justify-between gap-3 border-b border-border pb-2 text-sm last:border-0 last:pb-0">
                  <span>
                    {cliente.nombre}
                    <span className="ml-1 text-xs text-muted-foreground">({cliente.ordenes})</span>
                  </span>
                  <span className="font-semibold tabular-nums">{monedaTallerTexto(cliente.saldo)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-base font-semibold">Entregas por mecánico</h2>
          {reporte.porMecanico.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Sin entregas en el periodo.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2">Mecánico</th>
                    <th className="pb-2 text-right">Entregas</th>
                    <th className="pb-2 text-right">Mano de obra</th>
                    <th className="pb-2 text-right">Refacciones</th>
                    <th className="pb-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {reporte.porMecanico.map((fila) => (
                    <tr key={fila.mecanicoId ?? "sin"} className="border-t border-border">
                      <td className="py-2">{fila.nombre}</td>
                      <td className="py-2 text-right tabular-nums">{fila.entregadas}</td>
                      <td className="py-2 text-right tabular-nums">{monedaTallerTexto(fila.manoObra)}</td>
                      <td className="py-2 text-right tabular-nums">{monedaTallerTexto(fila.refacciones)}</td>
                      <td className="py-2 text-right font-semibold tabular-nums">{monedaTallerTexto(fila.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-xl border border-border bg-card p-4">
          <h2 className="text-base font-semibold">Refacciones usadas</h2>
          {reporte.refacciones.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Sin refacciones en las entregas del periodo.</p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2">Refacción</th>
                    <th className="pb-2 text-right">Cantidad</th>
                    <th className="pb-2 text-right">Cobrado</th>
                    <th className="pb-2 text-right">Margen</th>
                  </tr>
                </thead>
                <tbody>
                  {reporte.refacciones.map((fila) => (
                    <tr key={fila.refaccionId} className="border-t border-border">
                      <td className="py-2">{fila.nombre}</td>
                      <td className="py-2 text-right tabular-nums">{fila.cantidad}</td>
                      <td className="py-2 text-right tabular-nums">{monedaTallerTexto(fila.importe)}</td>
                      <td className="py-2 text-right font-semibold tabular-nums">{monedaTallerTexto(fila.margen)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {reporte.refaccionesBajoMinimo.length > 0 && (
            <div className="mt-4 border-t border-border pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bajo el mínimo</p>
              <ul className="mt-2 space-y-1 text-sm">
                {reporte.refaccionesBajoMinimo.map((refaccion) => (
                  <li key={refaccion.nombre} className="flex items-center justify-between gap-3">
                    <span>{refaccion.nombre}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {refaccion.existencia} / {refaccion.minimo}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
