"use client";

import { useState } from "react";
import { toCSV } from "@/lib/csv";

export type FilaAceptadaVista = { numeroFila: number; telefono: string; nombre: string; empresa: string; giro: string; areaClave: string; ciudad: string };
export type AreaResumenVista = { clave: string; nombre: string; total: number; validos: number; rechazados: number; bajasRecientes: number; fueraDeFiltro: number };
export type FilaRechazadaVista = { numeroFila: number; fila: string[]; telefonoNormalizado: string | null; motivo: string };

type Props = {
  areas: AreaResumenVista[];
  filas: FilaAceptadaVista[];
  rechazadas: FilaRechazadaVista[];
  headers: string[];
  areasSeleccionadas: string[];
  filasExcluidas: number[];
  onArea: (clave: string, activa: boolean) => void;
  onFila: (numeroFila: number, incluida: boolean) => void;
};

function descargarRechazadas(headers: string[], rechazadas: FilaRechazadaVista[]) {
  const contenido = toCSV(["fila", ...headers, "teléfono normalizado", "motivo"], rechazadas.map((fila) => [String(fila.numeroFila), ...fila.fila, fila.telefonoNormalizado ?? "", fila.motivo]));
  const url = URL.createObjectURL(new Blob([contenido], { type: "text/csv;charset=utf-8" }));
  const enlace = document.createElement("a");
  enlace.href = url;
  enlace.download = "campana-filas-rechazadas.csv";
  enlace.click();
  URL.revokeObjectURL(url);
}

export function RevisionListaCampana({ areas, filas, rechazadas, headers, areasSeleccionadas, filasExcluidas, onArea, onFila }: Props) {
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);
  const areasActivas = new Set(areasSeleccionadas);
  const excluidas = new Set(filasExcluidas);
  const elegibles = filas.filter((fila) => areasActivas.has(fila.areaClave));
  const seleccionadas = elegibles.filter((fila) => !excluidas.has(fila.numeroFila)).length;
  const termino = busqueda.trim().toLocaleLowerCase("es-MX");
  const encontradas = elegibles.filter((fila) => [fila.telefono, fila.nombre, fila.empresa, fila.giro, fila.ciudad].some((valor) => valor.toLocaleLowerCase("es-MX").includes(termino)));
  const totalPaginas = Math.max(1, Math.ceil(encontradas.length / 25));
  const paginaActual = Math.min(pagina, totalPaginas);
  const visibles = encontradas.slice((paginaActual - 1) * 25, paginaActual * 25);

  return <div className="space-y-5">
    <div className="sticky top-0 z-10 rounded-xl border border-primary/25 bg-card p-4 shadow-soft" role="status" aria-live="polite">
      <strong className="text-lg text-foreground">{seleccionadas} números seleccionados de {filas.length} válidos</strong>
      <p className="text-sm text-muted-foreground">Marca las áreas que deseas incluir. Todas empiezan desmarcadas; después puedes excluir números individuales.</p>
    </div>

    <div className="max-w-full overflow-x-auto rounded-xl border border-border">
      <table className="min-w-[680px] w-full text-left text-sm">
        <thead className="sticky top-0 bg-muted text-foreground"><tr><th className="px-4 py-3">Incluir</th><th className="px-4 py-3">Área</th><th className="px-4 py-3 text-right">Filas</th><th className="px-4 py-3 text-right">Válidas</th><th className="px-4 py-3 text-right">Rechazadas</th><th className="px-4 py-3 text-right">Baja / recientes</th></tr></thead>
        <tbody>{areas.map((area) => <tr key={area.clave} className="border-t border-border/70">
          <td className="px-4 py-3"><input type="checkbox" aria-label={`Incluir área ${area.nombre}`} checked={areasActivas.has(area.clave)} disabled={!area.validos} onChange={(e) => onArea(area.clave, e.target.checked)} /></td>
          <td className="px-4 py-3 font-medium">{area.nombre}{area.fueraDeFiltro > 0 && <span className="block text-xs text-muted-foreground">{area.fueraDeFiltro} fuera del filtro</span>}</td>
          <td className="px-4 py-3 text-right tnum">{area.total}</td><td className="px-4 py-3 text-right tnum text-success">{area.validos}</td><td className="px-4 py-3 text-right tnum">{area.rechazados}</td><td className="px-4 py-3 text-right tnum">{area.bajasRecientes}</td>
        </tr>)}</tbody>
      </table>
    </div>

    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="font-semibold">Números que se prepararían</h3><p className="text-sm text-muted-foreground">Lista exacta tras validar el archivo y aplicar los filtros elegidos.</p></div>
      <button type="button" className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium disabled:opacity-50" disabled={!rechazadas.length} onClick={() => descargarRechazadas(headers, rechazadas)}>Descargar rechazados ({rechazadas.length})</button>
    </div>
    {elegibles.length ? <>
      <label className="block text-sm font-medium">Buscar número o contacto
        <input className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 md:max-w-sm" value={busqueda} onChange={(e) => { setBusqueda(e.target.value); setPagina(1); }} placeholder="Teléfono, nombre, empresa, área o ciudad" />
      </label>
      <div className="max-h-[420px] max-w-full overflow-auto rounded-xl border border-border">
        <table className="hidden w-full min-w-[650px] text-left text-sm md:table">
          <thead className="sticky top-0 bg-muted text-foreground"><tr><th className="px-4 py-3">Incluir</th><th className="px-4 py-3">Teléfono 52…</th><th className="px-4 py-3">Nombre</th><th className="px-4 py-3">Empresa</th><th className="px-4 py-3">Área</th><th className="px-4 py-3">Ciudad</th></tr></thead>
          <tbody>{visibles.map((fila) => <tr key={fila.numeroFila} className="border-t border-border/70">
            <td className="px-4 py-3"><input type="checkbox" aria-label={`Incluir ${fila.telefono}`} checked={!excluidas.has(fila.numeroFila)} onChange={(e) => onFila(fila.numeroFila, e.target.checked)} /></td>
            <td className="px-4 py-3 font-mono">{fila.telefono}</td><td className="px-4 py-3">{fila.nombre || "—"}</td><td className="px-4 py-3">{fila.empresa || "—"}</td><td className="px-4 py-3">{fila.giro || "Sin área"}</td><td className="px-4 py-3">{fila.ciudad || "—"}</td>
          </tr>)}</tbody>
        </table>
        <div className="divide-y divide-border md:hidden">{visibles.map((fila) => <label key={fila.numeroFila} className="flex gap-3 p-4 text-sm">
          <input type="checkbox" aria-label={`Incluir ${fila.telefono}`} checked={!excluidas.has(fila.numeroFila)} onChange={(e) => onFila(fila.numeroFila, e.target.checked)} />
          <span className="min-w-0"><strong className="block break-all font-mono">{fila.telefono}</strong><span className="block">{fila.nombre || "Sin nombre"}</span><span className="block text-muted-foreground">{[fila.empresa, fila.giro || "Sin área", fila.ciudad].filter(Boolean).join(" · ")}</span></span>
        </label>)}</div>
      </div>
      {!visibles.length && <p className="rounded-lg bg-muted p-4 text-sm text-muted-foreground">No hay números que coincidan con la búsqueda.</p>}
      <div className="flex items-center justify-between gap-3 text-sm"><span>Página {paginaActual} de {totalPaginas}</span><div className="flex gap-2"><button type="button" className="rounded-lg border px-3 py-2 disabled:opacity-50" disabled={paginaActual <= 1} onClick={() => setPagina(paginaActual - 1)}>Anterior</button><button type="button" className="rounded-lg border px-3 py-2 disabled:opacity-50" disabled={paginaActual >= totalPaginas} onClick={() => setPagina(paginaActual + 1)}>Siguiente</button></div></div>
    </> : <p className="rounded-xl bg-muted p-5 text-sm text-muted-foreground">Marca al menos un área con números válidos para revisar la lista.</p>}
  </div>;
}
