"use client";

import { useState } from "react";
import { toCSV } from "@/lib/csv";

export type FilaAceptadaVista = { numeroFila: number; telefono: string; nombre: string; empresa: string; giro: string; areaClave: string; ciudad: string; zonaClave: string };
export type AreaResumenVista = { clave: string; nombre: string; total: number; validos: number; rechazados: number; bajasRecientes: number; fueraDeFiltro: number };
export type ZonaResumenVista = AreaResumenVista;
export type FilaRechazadaVista = { numeroFila: number; fila: string[]; telefonoNormalizado: string | null; motivo: string };

type Props = {
  areas: AreaResumenVista[];
  zonas: ZonaResumenVista[];
  tieneZona: boolean;
  matrizAreaZona: Array<{ areaClave: string; zonaClave: string; validos: number }>;
  filas: FilaAceptadaVista[];
  rechazadas: FilaRechazadaVista[];
  headers: string[];
  areasSeleccionadas: string[];
  zonasSeleccionadas: string[];
  filasExcluidas: number[];
  onArea: (clave: string, activa: boolean) => void;
  onZonas: (claves: string[]) => void;
  onAreas: (claves: string[]) => void;
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

export function RevisionListaCampana({ areas, zonas, tieneZona, matrizAreaZona, filas, rechazadas, headers, areasSeleccionadas, zonasSeleccionadas, filasExcluidas, onArea, onAreas, onZonas, onFila }: Props) {
  const [busqueda, setBusqueda] = useState("");
  const [pagina, setPagina] = useState(1);
  const [zonaRapida, setZonaRapida] = useState<string | null>(null);
  const areasActivas = new Set(areasSeleccionadas);
  const zonasActivas = new Set(zonasSeleccionadas);
  const excluidas = new Set(filasExcluidas);
  const elegibles = filas.filter((fila) => areasActivas.has(fila.areaClave) && (!tieneZona || zonasActivas.has(fila.zonaClave)));
  const seleccionadas = elegibles.filter((fila) => !excluidas.has(fila.numeroFila)).length;
  const zonaRapidaActiva = zonaRapida !== null && zonasActivas.has(zonaRapida) ? zonaRapida : null;
  const termino = busqueda.trim().toLocaleLowerCase("es-MX");
  const encontradas = elegibles.filter((fila) => (zonaRapidaActiva === null || fila.zonaClave === zonaRapidaActiva) && [fila.telefono, fila.nombre, fila.empresa, fila.giro, fila.ciudad].some((valor) => valor.toLocaleLowerCase("es-MX").includes(termino)));
  const conteosMatriz = new Map(matrizAreaZona.map((celda) => [`${celda.areaClave}\u0000${celda.zonaClave}`, celda.validos]));
  const nombreArea = new Map(areas.map((area) => [area.clave, area.nombre]));
  const nombreZona = new Map(zonas.map((zona) => [zona.clave, zona.nombre]));
  const matrizCompacta = areas.length * zonas.length <= 400;
  const totalPaginas = Math.max(1, Math.ceil(encontradas.length / 25));
  const paginaActual = Math.min(pagina, totalPaginas);
  const visibles = encontradas.slice((paginaActual - 1) * 25, paginaActual * 25);

  return <div className="space-y-5">
    <div className="sticky top-0 z-10 rounded-xl border border-primary/25 bg-card p-4 shadow-soft" role="status" aria-live="polite">
      <strong className="text-lg text-foreground">{seleccionadas} números seleccionados de {filas.length} válidos</strong>
      <p className="text-sm text-muted-foreground">{areasSeleccionadas.length} de {areas.length} áreas{tieneZona ? ` · ${zonasSeleccionadas.length} de ${zonas.length} zonas` : ""}. Marca ambas para formar la intersección; después puedes excluir números individuales.</p>
    </div>

    <div className="flex flex-wrap items-center gap-2"><h3 className="mr-auto font-semibold">Por área · {areasSeleccionadas.length} de {areas.length} marcadas</h3><button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => onAreas(areas.filter((area) => area.validos > 0).map((area) => area.clave))}>Todas</button><button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => onAreas([])}>Ninguna</button></div>
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

    {tieneZona && <>
      <div className="flex flex-wrap items-center gap-2"><h3 className="mr-auto font-semibold">Por ciudad / zona · {zonasSeleccionadas.length} de {zonas.length} marcadas</h3><button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => onZonas(zonas.filter((zona) => zona.validos > 0).map((zona) => zona.clave))}>Todas</button><button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => onZonas([])}>Ninguna</button></div>
      <div className="max-w-full overflow-x-auto rounded-xl border border-border">
        <table className="min-w-[680px] w-full text-left text-sm"><thead className="sticky top-0 bg-muted text-foreground"><tr><th className="px-4 py-3">Incluir</th><th className="px-4 py-3">Ciudad / zona</th><th className="px-4 py-3 text-right">Filas</th><th className="px-4 py-3 text-right">Válidas</th><th className="px-4 py-3 text-right">Rechazadas</th><th className="px-4 py-3 text-right">Baja / recientes</th></tr></thead>
          <tbody>{zonas.map((zona) => <tr key={zona.clave} className="border-t border-border/70"><td className="px-4 py-3"><input type="checkbox" aria-label={`Incluir zona ${zona.nombre}`} checked={zonasActivas.has(zona.clave)} disabled={!zona.validos} onChange={(e) => onZonas(e.target.checked ? [...zonasSeleccionadas, zona.clave] : zonasSeleccionadas.filter((clave) => clave !== zona.clave))} /></td><td className="px-4 py-3 font-medium">{zona.nombre}{zona.fueraDeFiltro > 0 && <span className="block text-xs text-muted-foreground">{zona.fueraDeFiltro} fuera del filtro</span>}</td><td className="px-4 py-3 text-right tnum">{zona.total}</td><td className="px-4 py-3 text-right tnum text-success">{zona.validos}</td><td className="px-4 py-3 text-right tnum">{zona.rechazados}</td><td className="px-4 py-3 text-right tnum">{zona.bajasRecientes}</td></tr>)}</tbody></table>
      </div>
      <div className="max-h-[420px] max-w-full overflow-auto rounded-xl border border-border"><table className="w-full min-w-[500px] text-center text-sm"><caption className="p-3 text-left font-semibold">Matriz área × zona · números válidos{!matrizCompacta && " (solo combinaciones con números)"}</caption><thead className="sticky top-0 bg-muted"><tr><th className="px-3 py-2 text-left">Área</th>{matrizCompacta ? zonas.map((zona) => <th key={zona.clave} className="px-3 py-2">{zona.nombre}</th>) : <><th className="px-3 py-2">Zona</th><th className="px-3 py-2">Válidas</th></>}</tr></thead><tbody>{matrizCompacta ? areas.map((area) => <tr key={area.clave} className="border-t"><th className="px-3 py-2 text-left font-medium">{area.nombre}</th>{zonas.map((zona) => <td key={zona.clave} className={`px-3 py-2 tnum ${areasActivas.has(area.clave) && zonasActivas.has(zona.clave) ? "bg-success/10 font-semibold" : ""}`}>{conteosMatriz.get(`${area.clave}\u0000${zona.clave}`) ?? 0}</td>)}</tr>) : matrizAreaZona.map((celda) => <tr key={`${celda.areaClave}\u0000${celda.zonaClave}`} className={`border-t ${areasActivas.has(celda.areaClave) && zonasActivas.has(celda.zonaClave) ? "bg-success/10 font-semibold" : ""}`}><th className="px-3 py-2 text-left">{nombreArea.get(celda.areaClave)}</th><td className="px-3 py-2">{nombreZona.get(celda.zonaClave)}</td><td className="px-3 py-2 tnum">{celda.validos}</td></tr>)}</tbody></table></div>
    </>}

    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="font-semibold">Números que se prepararían</h3><p className="text-sm text-muted-foreground">Lista exacta tras validar el archivo y aplicar los filtros elegidos.</p></div>
      <button type="button" className="rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium disabled:opacity-50" disabled={!rechazadas.length} onClick={() => descargarRechazadas(headers, rechazadas)}>Descargar rechazados ({rechazadas.length})</button>
    </div>
    {elegibles.length ? <>
      <div className="grid gap-3 sm:grid-cols-2"><label className="block text-sm font-medium">Buscar número o contacto
        <input className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2" value={busqueda} onChange={(e) => { setBusqueda(e.target.value); setPagina(1); }} placeholder="Teléfono, nombre, empresa, área o ciudad" />
      </label>{tieneZona && <label className="block text-sm font-medium">Filtrar vista por zona<select className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2" value={zonaRapidaActiva ?? "__todas__"} onChange={(e) => { setZonaRapida(e.target.value === "__todas__" ? null : e.target.value); setPagina(1); }}><option value="__todas__">Todas las zonas marcadas</option>{zonas.filter((zona) => zonasActivas.has(zona.clave)).map((zona) => <option key={zona.clave} value={zona.clave}>{zona.nombre}</option>)}</select></label>}</div>
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
    </> : <p className="rounded-xl bg-muted p-5 text-sm text-muted-foreground">Marca al menos un área{tieneZona ? " y una zona" : ""} con números válidos para revisar la lista.</p>}
  </div>;
}
