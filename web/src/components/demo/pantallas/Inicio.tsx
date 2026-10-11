"use client";

// Inicio: misma estructura que app/(app)/page.tsx (server component) con métricas del almacén.
import { IconoDescargar } from "@/components/icons";
import { PrimerosPasos } from "@/components/PrimerosPasos";
import { KpiCard } from "@/components/DashboardVisuals";
import { EmptyState } from "@/components/EmptyState";
import { EncabezadoPagina } from "@/components/ui";
import { metricasDashboard, primerosPasos } from "@/lib/demo/metricas";
import { useDatos } from "@/lib/demo/usar-almacen";

function moneda(v: number) {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    maximumFractionDigits: 0,
  }).format(v);
}

export function PantallaInicio() {
  const d = useDatos();
  const esAdmin = d.usuarios[0].rol === "admin";
  const citasActivo = Boolean(d.modulos.citas?.activo);
  const m = metricasDashboard(d);
  const pasos = esAdmin ? primerosPasos(d) : null;
  const hoyIni = new Date();
  hoyIni.setHours(0, 0, 0, 0);
  const hoyFin = new Date();
  hoyFin.setHours(23, 59, 59, 999);
  const citasHoy = (d.extra.citas ?? []).filter((c: any) => new Date(c.inicio) >= hoyIni && new Date(c.inicio) <= hoyFin).length;
  const hoy = new Date();
  const mes = hoy.toLocaleDateString("es-MX", { month: "long" });
  const iniMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
  const finMes = hoy.toISOString().slice(0, 10);
  const maxEtapa = Math.max(1, ...m.porEtapa.map((e) => e.valor));

  return (
    <div className="space-y-6 p-4 md:p-6">
      <EncabezadoPagina
        eyebrow="Resumen operativo"
        titulo="Inicio"
        descripcion={`Datos reales de conversaciones y ventas de ${mes}.`}
      />

      {pasos && <PrimerosPasos pasos={pasos} />}

      {/* KPIs */}
      <div className="stagger grid grid-cols-2 gap-3 xl:grid-cols-5">
        <KpiCard
          titulo="Chats abiertos"
          valor={String(m.convAbiertas)}
          detalle="conversaciones activas"
          href="/chat"
          rail="bg-info"
          datos={m.serieConversaciones}
          tendencia={m.tendenciaConversaciones}
        />
        <KpiCard
          titulo="Sin responder"
          valor={String(m.sinResponder)}
          detalle="con mensajes sin leer"
          href="/chat"
          rail={m.sinResponder ? "bg-warning" : "bg-success"}
        />
        <KpiCard
          titulo="Oportunidades"
          valor={String(m.pipelineCount)}
          detalle={`${m.porEtapa.length} etapas activas`}
          href="/embudos"
          rail="bg-primary"
          datos={m.porEtapa.map((e) => e.count)}
        />
        <KpiCard
          titulo="Valor del embudo"
          valor={moneda(m.pipelineValor)}
          detalle="pipeline abierto"
          href="/embudos"
          rail="bg-success"
          datos={m.porEtapa.map((e) => e.valor)}
        />
        <KpiCard
          titulo="Satisfacción"
          valor={m.csatPromedio != null ? `${m.csatPromedio} / 5` : "—"}
          detalle={
            m.csatRespuestas
              ? `${m.csatRespuestas} respuestas`
              : "sin respuestas todavía"
          }
          rail="bg-warning"
        />
        {citasActivo && (
          <KpiCard
            titulo="Citas de hoy"
            valor={String(citasHoy)}
            detalle="agenda del día"
            href="/citas"
            rail="bg-info"
          />
        )}
      </div>

      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard
          titulo={`Ganado en ${mes}`}
          valor={moneda(m.ganadasValor)}
          detalle={`${m.ganadasCount} cerradas`}
          href="/embudos"
          rail="bg-success"
        />
        <KpiCard
          titulo="Conversión"
          valor={`${m.conversion}%`}
          detalle={`${m.ganadasCount} ganadas · ${m.perdidasCount} perdidas`}
          rail="bg-info"
        />
        <KpiCard
          titulo={`Leads en ${mes}`}
          valor={String(m.leadsMes)}
          href="/contactos"
          rail="bg-primary"
        />
        <KpiCard
          titulo="Primera respuesta"
          valor={
            m.primeraRespuestaMin != null
              ? m.primeraRespuestaMin >= 90
                ? `${Math.round(m.primeraRespuestaMin / 6) / 10} h`
                : `${m.primeraRespuestaMin} min`
              : "—"
          }
          detalle={
            m.primeraRespuestaMuestras
              ? `mediana · ${m.primeraRespuestaMuestras} chats`
              : "sin datos este mes"
          }
          rail="bg-warning"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Pipeline por etapa */}
        <div className="surface p-4">
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
            Pipeline por etapa{m.embudoNombre ? ` · ${m.embudoNombre}` : ""}
          </h2>
          {m.porEtapa.length === 0 && (
            <EmptyState
              titulo="Sin embudo configurado"
              descripcion="Crea las etapas de tu proceso comercial para ver aquí el avance."
              accion="Configurar embudo"
              href="/configuracion?tab=embudos"
            />
          )}
          <div className="space-y-3">
            {m.porEtapa.map((e) => (
              <div key={e.nombre}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium text-muted-foreground">
                    {e.nombre}{" "}
                    <span className="text-muted-foreground">({e.count})</span>
                  </span>
                  <span className="text-muted-foreground">
                    {moneda(e.valor)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.round((e.valor / maxEtapa) * 100)}%`,
                      background: e.color,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Ranking de agentes */}
        <div className="surface p-4">
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
            Ranking de ventas · {mes}
          </h2>
          {m.ranking.length === 0 && (
            <EmptyState
              titulo="Aún no hay cierres"
              descripcion="El ranking aparecerá cuando se ganen oportunidades este mes."
              accion="Abrir embudo"
              href="/embudos"
            />
          )}
          <div className="divide-y divide-border/60">
            {m.ranking.map((r, i) => (
              <div
                key={r.nombre}
                className="fila-lista -mx-2 flex items-center justify-between rounded-md px-2 py-2"
              >
                <span className="flex items-center gap-2 text-sm text-foreground">
                  <span
                    className={[
                      "grid h-6 w-6 place-items-center rounded-full",
                      "bg-primary/10 text-xs font-bold text-primary",
                    ].join(" ")}
                  >
                    {i + 1}
                  </span>
                  {r.nombre}
                </span>
                <span className="text-sm text-muted-foreground">
                  <span className="font-semibold text-success">
                    {moneda(r.valor)}
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {r.count} ventas
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Reportes descargables */}
      <div className="surface p-4">
        <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
          Reportes (CSV)
        </h2>
        <div className="flex flex-wrap gap-2 text-sm">
          <a
            href={`/api/reportes/oportunidades?desde=${iniMes}&hasta=${finMes}`}
            download
            className={[
              "flex items-center gap-1.5 rounded-lg border border-border",
              "px-3 py-1.5 text-primary transition hover:border-primary/40 hover:bg-muted/60",
            ].join(" ")}
          >
            <IconoDescargar className="h-4 w-4" /> Oportunidades ({mes})
          </a>
          <a
            href="/api/reportes/oportunidades"
            download
            className={[
              "flex items-center gap-1.5 rounded-lg border border-border",
              "px-3 py-1.5 text-primary transition hover:border-primary/40 hover:bg-muted/60",
            ].join(" ")}
          >
            <IconoDescargar className="h-4 w-4" /> Oportunidades (todo)
          </a>
          <a
            href={`/api/reportes/csat?desde=${iniMes}&hasta=${finMes}`}
            download
            className={[
              "flex items-center gap-1.5 rounded-lg border border-border",
              "px-3 py-1.5 text-primary transition hover:border-primary/40 hover:bg-muted/60",
            ].join(" ")}
          >
            <IconoDescargar className="h-4 w-4" /> CSAT ({mes})
          </a>
        </div>
      </div>
    </div>
  );
}
