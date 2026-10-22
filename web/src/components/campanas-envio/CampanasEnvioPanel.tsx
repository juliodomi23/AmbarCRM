"use client";

import { useCallback, useEffect, useState } from "react";
import { parseCSV, toCSV } from "@/lib/csv";
import { fechaEnZona } from "@/lib/campanas-envio-fecha";

type Plantilla = { name: string; language: string; status: string; components?: Array<{ type?: string; text?: string }> };
type Config = { canales: Array<{ id: string; nombre: string }>; plantillas: Plantilla[]; etiquetas: Array<{ id: string; nombre: string }>; tarifaMarketingUsd: number; campanasEnvioActivas: boolean };
type Campana = { id: string; nombre: string; estado: string; motivoPausa: string | null; canalId: string; plantillaNombre: string; plantillaIdioma: string; diasSemana: number[]; horaInicio: string; horaFin: string; zonaHoraria: string; tandaTamano: number; pausaTandaMin: number; topeDiario: number; _count: { destinatarios: number } };
type Preview = { headers: string[]; conteos: { validos: number; duplicados: number; invalidos: number; existentes: number; optOut: number; recientes: number }; muestra: Array<{ numeroFila: number; fila: string[]; motivo: string | null }>; rechazadas: Array<{ numeroFila: number; fila: string[]; motivo: string }> };
type Reporte = { campana: Campana; conteos: Record<string, number>; hoy: number; diasEstimados: number; costoEstimadoUsd: number; destinatarios: Array<{ id: string; telefono: string; nombre: string; estado: string; motivo: string | null }> };

async function json(url: string, options?: RequestInit) {
  const respuesta = await fetch(url, options);
  const cuerpo = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) throw new Error(cuerpo.error ?? "No se pudo completar la operación");
  return cuerpo;
}

function descargar(csv: string, nombre: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const enlace = document.createElement("a");
  enlace.href = url; enlace.download = nombre; enlace.click();
  URL.revokeObjectURL(url);
}

export function CampanasEnvioPanel({ esAdmin }: { esAdmin: boolean }) {
  const [config, setConfig] = useState<Config>({ canales: [], plantillas: [], etiquetas: [], tarifaMarketingUsd: 0.04, campanasEnvioActivas: false });
  const [configCargada, setConfigCargada] = useState(false);
  const [campanas, setCampanas] = useState<Campana[]>([]);
  const [canalId, setCanalId] = useState("");
  const [plantilla, setPlantilla] = useState("");
  const [nombre, setNombre] = useState("");
  const [filas, setFilas] = useState<string[][]>([]);
  const [mapeo, setMapeo] = useState<{ telefono: number; nombre?: number; empresa?: number; giro?: number }>({ telefono: -1 });
  const [variablesTexto, setVariablesTexto] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [campanaId, setCampanaId] = useState("");
  const [reporte, setReporte] = useState<Reporte | null>(null);
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroGiro, setFiltroGiro] = useState("");
  const [etiquetaId, setEtiquetaId] = useState("");
  const [permiso, setPermiso] = useState(false);
  const [dias, setDias] = useState([1, 2, 3, 4, 5]);
  const [horaInicio, setHoraInicio] = useState("09:30");
  const [horaFin, setHoraFin] = useState("17:30");
  const [zonaHoraria, setZonaHoraria] = useState("America/Mexico_City");
  const [tandaTamano, setTandaTamano] = useState(5);
  const [pausaTandaMin, setPausaTandaMin] = useState(10);
  const [topeDiario, setTopeDiario] = useState(50);
  const [fechaInicio, setFechaInicio] = useState("");
  const [error, setError] = useState("");
  const [mensaje, setMensaje] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const cargarLista = useCallback(async () => { setCampanas((await json("/api/campanas-envio")).campanas); }, []);
  const cargarConfig = useCallback(async (id?: string) => { const datos = await json(`/api/campanas-envio/config${id ? `?canalId=${id}` : ""}`); setConfig(datos); setConfigCargada(true); if (!id && datos.canales[0]) setCanalId(datos.canales[0].id); }, []);
  const cargarReporte = useCallback(async (id: string, estado = "") => { setReporte(await json(`/api/campanas-envio/${id}${estado ? `?estado=${estado}` : ""}`)); }, []);
  useEffect(() => { void Promise.all([cargarConfig(), cargarLista()]).catch((e) => setError(e.message)); }, [cargarConfig, cargarLista]);

  async function archivoSeleccionado(file?: File) {
    setError(""); setPreview(null); setFilas([]);
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { setError("El archivo supera 5 MB"); return; }
    const extension = file.name.toLowerCase().split(".").pop();
    if (extension !== "csv" && extension !== "xlsx") { setError("Sube un CSV o XLSX"); return; }
    try {
      let contenido: string[][];
      if (extension === "csv") contenido = parseCSV(await file.text());
      else {
        const ExcelJS = (await import("exceljs")).default;
        const libro = new ExcelJS.Workbook();
        await libro.xlsx.load(await file.arrayBuffer());
        const hoja = libro.worksheets[0];
        if (!hoja) throw new Error("El Excel no tiene hojas");
        contenido = [];
        hoja.eachRow({ includeEmpty: false }, (fila) => {
          contenido.push(Array.from({ length: hoja.columnCount }, (_, i) => String(fila.getCell(i + 1).text ?? "")));
        });
      }
      contenido = contenido.filter((fila) => fila.some((valor) => valor.trim()));
      if (contenido.length < 2 || contenido.length > 10_001) throw new Error("El archivo debe tener de 1 a 10,000 filas de datos");
      setFilas(contenido);
      const headers = contenido[0].map((h) => h.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
      const buscar = (opciones: string[]) => headers.findIndex((h) => opciones.includes(h));
      const telefono = buscar(["telefono", "celular", "whatsapp", "phone"]);
      const nombreCol = buscar(["nombre", "name"]), empresaCol = buscar(["empresa", "company", "negocio"]), giroCol = buscar(["giro", "sector"]);
      setMapeo({ telefono, ...(nombreCol >= 0 ? { nombre: nombreCol } : {}), ...(empresaCol >= 0 ? { empresa: empresaCol } : {}), ...(giroCol >= 0 ? { giro: giroCol } : {}) });
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo leer el archivo"); }
  }

  async function ejecutar(fn: () => Promise<void>) {
    setOcupado(true); setError(""); setMensaje("");
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Error inesperado"); }
    finally { setOcupado(false); }
  }

  const cuerpo = (extra: Record<string, unknown>) => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(extra) });
  const calendario = () => ({ diasSemana: dias, horaInicio, horaFin, zonaHoraria, tandaTamano, pausaTandaMin, topeDiario, ...(fechaInicio ? { fechaInicio: fechaEnZona(fechaInicio, zonaHoraria) } : {}) });
  const plantillaElegida = config.plantillas.find((p) => `${p.name}|${p.language}` === plantilla);
  const hayCampanasEnMarcha = campanas.some((c) => c.estado === "programada" || c.estado === "en_curso");

  function cambiarEnvios() {
    const activar = !config.campanasEnvioActivas;
    if (activar && !window.confirm("Se empezará a enviar según el calendario de cada campaña en curso")) return;
    void ejecutar(async () => {
      const actualizado = await json("/api/campanas-envio/config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campanasEnvioActivas: activar }) });
      setConfig((anterior) => ({ ...anterior, campanasEnvioActivas: actualizado.campanasEnvioActivas }));
      setMensaje(activar ? "Envíos activados." : "Envíos pausados.");
    });
  }

  return <main className="mx-auto max-w-6xl space-y-7 p-6">
    <header><h1 className="text-2xl font-semibold">Campañas de envío</h1><p className="text-sm text-slate-600">EXI Chiapas · Plantillas aprobadas de Meta · Responde BAJA para no recibir más mensajes.</p></header>
    <section className="rounded border p-5 space-y-3" aria-label="Control de envíos">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-medium">Envíos: {config.campanasEnvioActivas ? "ACTIVOS" : "PAUSADOS"}</h2><p className="text-sm text-slate-600">Control general de esta organización. Las campañas conservan su estado y calendario.</p></div>
        {esAdmin && <button type="button" role="switch" aria-checked={config.campanasEnvioActivas} aria-label="Envíos de campañas" disabled={ocupado || !configCargada} onClick={cambiarEnvios} className={`rounded px-4 py-2 text-white disabled:opacity-50 ${config.campanasEnvioActivas ? "bg-slate-700" : "bg-green-700"}`}>{config.campanasEnvioActivas ? "Pausar envíos" : "Activar envíos"}</button>}
      </div>
      {!config.campanasEnvioActivas && hayCampanasEnMarcha && <p role="status" className="rounded bg-amber-50 p-3 text-amber-900">Los envíos están pausados; ninguna campaña enviará hasta que lo actives</p>}
    </section>
    {error && <p role="alert" className="rounded bg-red-50 p-3 text-red-700">{error}</p>}
    {mensaje && <p role="status" className="rounded bg-green-50 p-3 text-green-700">{mensaje}</p>}
    <section className="rounded border p-5 space-y-4">
      <h2 className="text-lg font-medium">Nueva campaña</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <label>Nombre<input className="block w-full rounded border p-2" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={120} /></label>
        <label>Canal conectado<select className="block w-full rounded border p-2" value={canalId} onChange={(e) => { setCanalId(e.target.value); setPlantilla(""); void cargarConfig(e.target.value).catch((error) => setError(error.message)); }}>{config.canales.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}</select></label>
        <label>Plantilla APPROVED<select className="block w-full rounded border p-2" value={plantilla} onChange={(e) => setPlantilla(e.target.value)}><option value="">Seleccionar</option>{config.plantillas.map((p) => <option key={`${p.name}|${p.language}`} value={`${p.name}|${p.language}`}>{p.name} · {p.language}</option>)}</select></label>
        <label>Archivo CSV o XLSX<input className="block w-full rounded border p-2" type="file" accept=".csv,.xlsx" onChange={(e) => void archivoSeleccionado(e.target.files?.[0])} /></label>
      </div>
      {filas.length > 0 && <div className="space-y-3"><h3 className="font-medium">Mapeo de columnas</h3><div className="grid gap-3 md:grid-cols-4">{(["telefono", "nombre", "empresa", "giro"] as const).map((campo) => <label key={campo}>{campo}<select className="block w-full rounded border p-2" value={mapeo[campo] ?? -1} onChange={(e) => { const valor = Number(e.target.value); setMapeo({ ...mapeo, [campo]: valor < 0 && campo !== "telefono" ? undefined : valor }); setPreview(null); }}><option value={-1}>Sin mapear</option>{filas[0].map((h, i) => <option key={i} value={i}>{h}</option>)}</select></label>)}</div>
          <label>Variables de la plantilla (en orden, separadas por coma; usa nombres de columna)<input className="block w-full rounded border p-2" value={variablesTexto} onChange={(e) => { setVariablesTexto(e.target.value); setPreview(null); }} placeholder="nombre, empresa" /></label>
          <button className="rounded bg-slate-800 px-4 py-2 text-white disabled:opacity-50" disabled={ocupado || mapeo.telefono < 0} onClick={() => void ejecutar(async () => { setPreview(await json("/api/campanas-envio/preview", cuerpo({ filas, mapeo, mapeoVariables: variablesTexto.split(",").map((v) => v.trim()).filter(Boolean) }))); })}>Ver vista previa</button>
      </div>}
      {preview && <div className="space-y-3"><p>Válidos: {preview.conteos.validos} · Duplicados: {preview.conteos.duplicados} · Teléfono inválido: {preview.conteos.invalidos} · Ya existentes: {preview.conteos.existentes} · Bajas: {preview.conteos.optOut} · Contactados en 30 días: {preview.conteos.recientes}</p>
        <button className="underline disabled:opacity-50" disabled={!preview.rechazadas.length} onClick={() => descargar(toCSV([...preview.headers, "motivo"], preview.rechazadas.map((r) => [...r.fila, r.motivo])), "filas-rechazadas.csv")}>Descargar rechazados</button>
        <div className="max-h-64 overflow-auto rounded border"><table className="w-full text-sm"><thead><tr><th>Fila</th>{preview.headers.map((h, i) => <th key={i}>{h}</th>)}<th>Resultado</th></tr></thead><tbody>{preview.muestra.map((r) => <tr key={r.numeroFila} className="border-t"><td>{r.numeroFila}</td>{r.fila.map((v, i) => <td key={i} className="px-2">{v}</td>)}<td>{r.motivo ?? "Válida"}</td></tr>)}</tbody></table></div>
      </div>}
      <div className="space-y-3"><h3 className="font-medium">Calendario</h3><div className="flex flex-wrap gap-3">{["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((d, i) => <label key={d} className="flex gap-1"><input type="checkbox" checked={dias.includes(i)} onChange={(e) => setDias(e.target.checked ? [...dias, i].sort() : dias.filter((x) => x !== i))} />{d}</label>)}</div>
        <div className="grid gap-3 md:grid-cols-3"><label>Desde<input className="block w-full rounded border p-2" type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} /></label><label>Hasta<input className="block w-full rounded border p-2" type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} /></label><label>Zona horaria<input className="block w-full rounded border p-2" value={zonaHoraria} onChange={(e) => setZonaHoraria(e.target.value)} /></label><label>Tamaño de tanda (1–20)<input className="block w-full rounded border p-2" type="number" min={1} max={20} value={tandaTamano} onChange={(e) => setTandaTamano(Number(e.target.value))} /></label><label>Pausa entre tandas (min, ≥5)<input className="block w-full rounded border p-2" type="number" min={5} value={pausaTandaMin} onChange={(e) => setPausaTandaMin(Number(e.target.value))} /></label><label>Tope diario (máx. 150)<input className="block w-full rounded border p-2" type="number" min={1} max={150} value={topeDiario} onChange={(e) => setTopeDiario(Number(e.target.value))} /></label><label>Fecha de inicio<input className="block w-full rounded border p-2" type="datetime-local" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} /></label></div>
      </div>
      <div className="grid gap-3 md:grid-cols-2"><label>Solo giro (opcional)<input className="block w-full rounded border p-2" value={filtroGiro} onChange={(e) => setFiltroGiro(e.target.value)} /></label><label>Solo contactos con etiqueta existente (opcional)<select className="block w-full rounded border p-2" value={etiquetaId} onChange={(e) => setEtiquetaId(e.target.value)}><option value="">Todos</option>{config.etiquetas.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}</select></label></div>
      {preview && <p>Estimación previa: hasta {preview.conteos.validos} destinatarios · US${(preview.conteos.validos * config.tarifaMarketingUsd).toFixed(2)} si todos se entregan. Meta cobra directamente a EXI.</p>}
      {esAdmin && <button disabled={ocupado || !preview || !nombre || !plantillaElegida} className="rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50" onClick={() => void ejecutar(async () => { const creada = await json("/api/campanas-envio", cuerpo({ nombre, canalId, plantillaNombre: plantillaElegida!.name, plantillaIdioma: plantillaElegida!.language, mapeoVariables: variablesTexto.split(",").map((v) => v.trim()).filter(Boolean), ...calendario() })); setCampanaId(creada.id); await cargarLista(); setMensaje("Borrador creado. Confirma la importación para agregar destinatarios."); })}>Crear borrador</button>}
      {esAdmin && campanaId && preview && <button disabled={ocupado} className="ml-2 rounded bg-blue-700 px-4 py-2 text-white disabled:opacity-50" onClick={() => void ejecutar(async () => { const r = await json(`/api/campanas-envio/${campanaId}/importar`, cuerpo({ filas, mapeo, filtroGiro, etiquetaId })); await cargarReporte(campanaId); await cargarLista(); setMensaje(`${r.importados} destinatarios preparados. No se envió ningún mensaje.`); })}>Confirmar importación</button>}
      {reporte?.campana.id === campanaId && reporte.campana.estado === "borrador" && <div className="rounded bg-amber-50 p-4 space-y-2"><p>Resumen antes de lanzar: {reporte.conteos.total} destinatarios · aproximadamente {reporte.diasEstimados} días de envío · US${reporte.costoEstimadoUsd.toFixed(2)} estimados si se entregan todos.</p><label className="flex gap-2"><input type="checkbox" checked={permiso} onChange={(e) => setPermiso(e.target.checked)} />Confirmo que estos contactos conocen a EXI y aceptaron recibir mensajes</label><p className="text-sm">La plantilla debe incluir “Responde BAJA para no recibir más mensajes”.</p>{esAdmin && <button disabled={!permiso || ocupado || !reporte.conteos.total} className="rounded bg-green-700 px-4 py-2 text-white disabled:opacity-50" onClick={() => void accion("lanzar", true)}>Lanzar campaña</button>}</div>}
    </section>
    <section className="rounded border p-5 space-y-3"><h2 className="text-lg font-medium">Campañas</h2><div className="space-y-2">{campanas.map((c) => <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 border-b pb-2"><div><strong>{c.nombre}</strong> <span className="text-sm">{c.estado} · {c._count.destinatarios} destinatarios</span>{c.motivoPausa && <p className="text-sm text-red-700">{c.motivoPausa}</p>}</div><div className="flex gap-2"><button className="underline" onClick={() => { setCampanaId(c.id); void cargarReporte(c.id).catch((e) => setError(e.message)); }}>Ver reporte</button>{esAdmin && ["programada", "en_curso"].includes(c.estado) && <button className="underline" onClick={() => void accion("pausar", false, c.id)}>Pausar</button>}{esAdmin && c.estado === "pausada" && <button className="underline" onClick={() => void accion("reanudar", false, c.id)}>Reanudar</button>}{esAdmin && !["completada", "cancelada"].includes(c.estado) && <button className="text-red-700 underline" onClick={() => void accion("cancelar", false, c.id)}>Cancelar</button>}</div></div>)}</div></section>
    {reporte && <section className="rounded border p-5 space-y-3"><h2 className="text-lg font-medium">Reporte · {reporte.campana.nombre}</h2><p>{Object.entries(reporte.conteos).map(([k, v]) => `${k}: ${v}`).join(" · ")}</p><p>Hoy: {reporte.hoy} / {reporte.campana.topeDiario} · Costo estimado: US${reporte.costoEstimadoUsd.toFixed(2)}</p><div className="flex gap-3"><select className="rounded border p-2" value={filtroEstado} onChange={(e) => { setFiltroEstado(e.target.value); void cargarReporte(reporte.campana.id, e.target.value).catch((error) => setError(error.message)); }}><option value="">Todos los estados</option>{["pendiente", "enviando", "enviado", "entregado", "leido", "respondio", "fallido", "omitido"].map((e) => <option key={e} value={e}>{e}</option>)}</select><a className="underline" href={`/api/campanas-envio/${reporte.campana.id}/exportar`}>Exportar CSV</a></div><p className="text-xs">Se muestran los primeros 200 destinatarios. El CSV incluye todos.</p><div className="max-h-80 overflow-auto"><table className="w-full text-sm"><thead><tr><th>Nombre</th><th>Teléfono</th><th>Estado</th><th>Motivo</th></tr></thead><tbody>{reporte.destinatarios.map((d) => <tr key={d.id} className="border-t"><td>{d.nombre}</td><td>{d.telefono}</td><td>{d.estado}</td><td>{d.motivo ?? ""}</td></tr>)}</tbody></table></div></section>}
  </main>;

  function accion(tipo: string, confirmoPermiso: boolean, id = campanaId) {
    void ejecutar(async () => { await json(`/api/campanas-envio/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: tipo, confirmoPermiso }) }); await Promise.all([cargarLista(), cargarReporte(id)]); setMensaje(`Campaña ${tipo === "lanzar" ? "programada" : tipo === "pausar" ? "pausada" : tipo === "reanudar" ? "reanudada" : "cancelada"}.`); });
  }
}
