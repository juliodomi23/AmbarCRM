"use client";

// Reseñas de Google: mismo JSX que app/(app)/resenas/page.tsx (server component) con el panel calculado del almacén.
import { useState } from "react";
import { EnlacePublico } from "@/components/reservas/EnlacePublico";
import { FormularioModulo } from "@/components/modulos/FormularioModulo";
import { QrPorOrigen } from "@/components/resenas/QrPorOrigen";
import { configResenas, resumenResenas } from "@/lib/resenas";
import { EncabezadoPagina } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import { useDatos } from "@/lib/demo/usar-almacen";

export function PantallaResenas() {
  const d = useDatos();
  const [ahora] = useState(() => Date.now());
  const zona = "America/Mexico_City";
  const filas = d.resenas.map((r) => ({ calificacion: r.calificacion, origen: r.origen, createdAt: new Date(r.createdAt) }));
  const recientes = filas.filter((r) => r.createdAt.getTime() >= ahora - 12 * 7 * 86_400_000);
  const panel = { ...resumenResenas(filas, zona), zona, tendencia: resumenResenas(recientes, zona).tendencia };
  const config = configResenas(d.modulos.resenas?.config);
  const esAdmin = d.usuarios[0].rol === "admin";
  const enlace = `${window.location.origin}/demo#/opinion/demo`;
  const maximo = Math.max(1, ...panel.distribucion);
  return (
    <div className="space-y-5 p-4 md:p-6">
      <EncabezadoPagina className="print:hidden" titulo="Reseñas de Google" descripcion="Cada opinión se guarda y el cliente siempre pasa a tu ficha de Google." />
      <div className="print:hidden"><EnlacePublico url={enlace} /></div>
      <section className="flex flex-wrap items-center justify-between gap-3 surface p-4 print:hidden">
        <div>
          <h2 className="font-semibold">Ajustes</h2>
          <p className="text-xs text-muted-foreground">
            {config.enlaceGoogle ? `Enlace de Google configurado · una solicitud por cliente cada ${config.diasEntreSolicitudes} días.` : "Falta el enlace de reseñas de Google: sin él la página pública no está disponible."}
          </p>
        </div>
        {esAdmin && (
          <FormularioModulo
            boton="Cambiar"
            titulo="Ajustes de reseñas"
            endpoint="/api/resenas/ajustes"
            discreto
            valores={{
              enlaceGoogle: config.enlaceGoogle ?? "",
              diasEntreSolicitudes: String(config.diasEntreSolicitudes),
              plantillaNombre: config.plantillaResena?.name ?? "",
              plantillaIdioma: config.plantillaResena?.language ?? "es_MX",
            }}
            campos={[
              { nombre: "enlaceGoogle", etiqueta: "Enlace para reseñas de Google", tipo: "texto", ayuda: "https, de g.page, google.com o maps.app.goo.gl" },
              { nombre: "diasEntreSolicitudes", etiqueta: "Días entre solicitudes al mismo cliente", tipo: "numero" },
              { nombre: "plantillaNombre", etiqueta: "Plantilla aprobada de WhatsApp (opcional)", tipo: "texto", ayuda: "Se usa fuera de la ventana de 24 horas; {{1}} nombre y {{2}} enlace" },
              { nombre: "plantillaIdioma", etiqueta: "Idioma de plantilla", tipo: "texto" },
            ]}
          />
        )}
      </section>
      <section className="grid gap-4 md:grid-cols-3 print:hidden">
        <div className="surface p-4">
          <p className="text-xs uppercase text-muted-foreground">Promedio</p>
          <strong className="tnum text-3xl">{panel.promedio === null ? "—" : panel.promedio.toFixed(2)}</strong>
          <p className="text-xs text-muted-foreground">{panel.total} calificaciones</p>
        </div>
        <div className="surface p-4 md:col-span-2">
          <h2 className="mb-2 font-semibold">Distribución</h2>
          {[5, 4, 3, 2, 1].map((estrellas) => (
            <div key={estrellas} className="flex items-center gap-2 text-sm">
              <span className="w-8">{estrellas} ★</span>
              <div className="h-2 flex-1 rounded bg-muted"><div className="h-2 rounded bg-primary transition-all duration-500" style={{ width: `${(panel.distribucion[estrellas - 1] / maximo) * 100}%` }} /></div>
              <span className="w-8 text-right">{panel.distribucion[estrellas - 1]}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="grid gap-4 lg:grid-cols-2 print:hidden">
        <div className="surface p-4">
          <h2 className="mb-2 font-semibold">Tendencia semanal ({panel.zona})</h2>
          {panel.tendencia.length === 0 ? <EmptyState titulo="Sin opiniones recientes" descripcion="Aún no hay opiniones en las últimas 12 semanas." /> : (
            <table className="tabla"><thead><tr className="text-left"><th>Semana del</th><th className="text-right">Opiniones</th><th className="text-right">Promedio</th></tr></thead>
              <tbody>{panel.tendencia.map((fila) => <tr key={fila.clave}><td className="py-1">{fila.clave}</td><td className="text-right">{fila.total}</td><td className="text-right">{fila.promedio.toFixed(2)}</td></tr>)}</tbody>
            </table>
          )}
        </div>
        <div className="surface p-4">
          <h2 className="mb-2 font-semibold">Por origen</h2>
          {panel.origenes.length === 0 ? <EmptyState titulo="Sin opiniones" descripcion="Cuando tus clientes califiquen, verás aquí de dónde vienen." /> : (
            <table className="tabla"><thead><tr className="text-left"><th>Origen</th><th className="text-right">Opiniones</th><th className="text-right">Promedio</th></tr></thead>
              <tbody>{panel.origenes.map((fila) => <tr key={fila.clave}><td className="py-1">{fila.clave}</td><td className="text-right">{fila.total}</td><td className="text-right">{fila.promedio.toFixed(2)}</td></tr>)}</tbody>
            </table>
          )}
        </div>
      </section>
      <QrPorOrigen base={enlace} origenes={panel.origenes.map((fila) => fila.clave)} />
    </div>
  );
}
