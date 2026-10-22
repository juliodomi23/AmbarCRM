"use client";

import { useCallback, useEffect, useState } from "react";
import { detectarFilaEncabezados, mapearColumnas, normalizarTelefonoCampana, prepararArchivoCampana, type MapeoColumnas } from "@/lib/campanas-envio-archivo";
import { parseCSV } from "@/lib/csv";
import { fechaEnZona } from "@/lib/campanas-envio-fecha";
import { incluyeAvisoBaja } from "@/lib/campanas-envio-plantilla";
import { variablesDePlantilla } from "@/lib/meta/plantillaMeta";
import { RevisionListaCampana, type AreaResumenVista, type FilaAceptadaVista, type FilaRechazadaVista, type ZonaResumenVista } from "./RevisionListaCampana";

type Plantilla = { name: string; language: string; status: string; components?: Array<{ type: string; text?: string }> };
type Config = { canales: Array<{ id: string; nombre: string }>; plantillas: Plantilla[]; etiquetas: Array<{ id: string; nombre: string }>; tarifaMarketingUsd: number; campanasEnvioActivas: boolean };
type Campana = { id: string; canalId: string; nombre: string; estado: string; mapeoVariables: string[]; plantillaNombre: string; plantillaIdioma: string; plantillaEstado: string | null; plantillaConsultadaAt: string | null; motivoPausa: string | null; _count: { destinatarios: number } };
type Preview = {
  filaEncabezados: number;
  headers: string[];
  conteos: { validos: number; duplicados: number; invalidos: number; existentes: number; optOut: number; recientes: number };
  muestra: Array<{ numeroFila: number; fila: string[]; telefonoNormalizado: string | null; motivo: string | null }>;
  rechazadas: FilaRechazadaVista[];
  resumenAreas: AreaResumenVista[];
  resumenZonas: ZonaResumenVista[];
  matrizAreaZona: Array<{ areaClave: string; zonaClave: string; validos: number }>;
  tieneZona: boolean;
  aceptadas: FilaAceptadaVista[];
};
type ListaAceptada = { areas: Array<{ clave: string; nombre: string; seleccionados: number }>; zonas?: Array<{ clave: string; nombre: string; seleccionados: number }>; totalSeleccionados: number; importados: number };
type Reporte = { campana: Campana & { topeDiario: number; listaAceptadaPorArea: ListaAceptada | null; listaAceptadaPor: string | null; listaAceptadaAt: string | null }; conteos: Record<string, number>; hoy: number; diasEstimados: number; costoEstimadoUsd: number; destinatarios: Array<{ id: string; telefono: string; nombre: string; estado: string; motivo: string | null }> };

const pasos = ["Subir archivo", "Revisar columnas", "Revisar y aceptar", "Programar", "Reporte"];
const inputClass = "mt-1 block min-h-10 w-full rounded-lg border border-input bg-card px-3 py-2 text-foreground";
const primaryClass = "rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50";
const secondaryClass = "rounded-lg border border-border bg-card px-4 py-2.5 font-medium text-foreground hover:bg-muted disabled:opacity-50";

async function json(url: string, options?: RequestInit) {
  const respuesta = await fetch(url, options);
  const cuerpo = await respuesta.json().catch(() => ({}));
  if (!respuesta.ok) throw new Error(cuerpo.error ?? "No se pudo completar la operación");
  return cuerpo;
}

function estadoPlantilla(campana: Campana) {
  if (!campana.plantillaNombre) return "Sin plantilla";
  if (["PENDING", "IN_APPEAL"].includes(campana.plantillaEstado ?? "")) return "Esperando aprobación de Meta";
  if (campana.plantillaEstado === "APPROVED") return "Plantilla aprobada";
  return `Plantilla: ${campana.plantillaEstado ?? "sin comprobar"}`;
}

function etiquetaEstadoPlantilla(estado: string) {
  return estado === "APPROVED" ? "Aprobada" : ["PENDING", "IN_APPEAL"].includes(estado) ? "En revisión de Meta" : estado;
}

export function CampanasEnvioPanel({ esAdmin }: { esAdmin: boolean }) {
  const [config, setConfig] = useState<Config>({ canales: [], plantillas: [], etiquetas: [], tarifaMarketingUsd: 0.04, campanasEnvioActivas: false });
  const [configCargada, setConfigCargada] = useState(false);
  const [campanas, setCampanas] = useState<Campana[]>([]);
  const [paso, setPaso] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [archivoNombre, setArchivoNombre] = useState("");
  const [filas, setFilas] = useState<string[][]>([]);
  const [filaEncabezados, setFilaEncabezados] = useState(0);
  const [filaDetectada, setFilaDetectada] = useState<number | null>(null);
  const [mapeo, setMapeo] = useState<MapeoColumnas>({ telefono: -1 });
  const [variablesTexto, setVariablesTexto] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [areasSeleccionadas, setAreasSeleccionadas] = useState<string[]>([]);
  const [zonasSeleccionadas, setZonasSeleccionadas] = useState<string[]>([]);
  const [filasExcluidas, setFilasExcluidas] = useState<number[]>([]);
  const [filtroGiro, setFiltroGiro] = useState("");
  const [filtroZona, setFiltroZona] = useState("");
  const [etiquetaId, setEtiquetaId] = useState("");
  const [nombre, setNombre] = useState("");
  const [canalId, setCanalId] = useState("");
  const [plantilla, setPlantilla] = useState("");
  const [mostrarCrearPlantilla, setMostrarCrearPlantilla] = useState(false);
  const [nombrePlantillaNueva, setNombrePlantillaNueva] = useState("");
  const [idiomaPlantillaNueva, setIdiomaPlantillaNueva] = useState("es_MX");
  const [cuerpoPlantillaNueva, setCuerpoPlantillaNueva] = useState("");
  const [ejemplosPlantillaNueva, setEjemplosPlantillaNueva] = useState<string[]>([]);
  const [campanaId, setCampanaId] = useState("");
  const [reporte, setReporte] = useState<Reporte | null>(null);
  const [filtroEstado, setFiltroEstado] = useState("");
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
  const cargarConfig = useCallback(async (id?: string) => {
    const datos = await json(`/api/campanas-envio/config${id ? `?canalId=${id}` : ""}`);
    setConfig(datos);
    setConfigCargada(true);
    if (!id && datos.canales[0]) setCanalId(datos.canales[0].id);
  }, []);
  const cargarReporte = useCallback(async (id: string, estado = "") => {
    const datos = await json(`/api/campanas-envio/${id}${estado ? `?estado=${estado}` : ""}`) as Reporte;
    setReporte(datos);
    return datos;
  }, []);
  useEffect(() => { void Promise.all([cargarConfig(), cargarLista()]).catch((e) => setError(e.message)); }, [cargarConfig, cargarLista]);

  async function ejecutar(fn: () => Promise<void>) {
    setOcupado(true); setError(""); setMensaje("");
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Error inesperado"); }
    finally { setOcupado(false); }
  }

  function cuerpo(extra: Record<string, unknown>): RequestInit {
    return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(extra) };
  }

  function calendario() {
    return { diasSemana: dias, horaInicio, horaFin, zonaHoraria, tandaTamano, pausaTandaMin, topeDiario, ...(fechaInicio ? { fechaInicio: fechaEnZona(fechaInicio, zonaHoraria) } : {}) };
  }

  async function archivoSeleccionado(file?: File) {
    setError(""); setMensaje(""); setPreview(null); setCampanaId(""); setReporte(null); setFilas([]); setAreasSeleccionadas([]); setZonasSeleccionadas([]); setFiltroZona("");
    if (!file) { setArchivoNombre(""); setPaso(1); return; }
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
        contenido = Array.from({ length: hoja.rowCount }, (_, i) => Array.from({ length: hoja.columnCount }, (_, j) => String(hoja.getRow(i + 1).getCell(j + 1).text ?? "")));
      }
      if (contenido.filter((fila) => fila.some((celda) => celda.trim())).length > 10_016) throw new Error("El archivo supera 10,000 filas de datos");
      const detectada = detectarFilaEncabezados(contenido);
      setFilas(contenido);
      setArchivoNombre(file.name);
      setFilaDetectada(detectada);
      setFilaEncabezados(detectada ?? 0);
      setMapeo(detectada ? mapearColumnas(contenido[detectada - 1]) : { telefono: -1 });
      setPaso(2);
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo leer el archivo"); }
  }

  function elegirEncabezados(numero: number) {
    setFilaEncabezados(numero);
    setMapeo(numero >= 1 && numero <= filas.length ? mapearColumnas(filas[numero - 1]) : { telefono: -1 });
    setFiltroZona("");
    setPreview(null);
  }

  function invalidarPreview() { setPreview(null); setAreasSeleccionadas([]); setZonasSeleccionadas([]); setFilasExcluidas([]); }

  function revisarColumnas() {
    void ejecutar(async () => {
      const archivo = prepararArchivoCampana(filas, filaEncabezados);
      const datos = await json("/api/campanas-envio/preview", cuerpo({ filas, filaEncabezados: archivo.filaEncabezados, mapeo, mapeoVariables: variablesTexto.split(",").map((v) => v.trim()).filter(Boolean), filtroGiro, filtroZona, etiquetaId }));
      setPreview(datos);
      setAreasSeleccionadas([]);
      setZonasSeleccionadas([]);
      setFilasExcluidas([]);
      setPaso(3);
      setMensaje("Revisa las áreas, zonas y cada número antes de aceptar. Aún no se guardó ningún contacto.");
    });
  }

  const plantillaElegida = config.plantillas.find((item) => `${item.name}|${item.language}` === plantilla);
  const textoPlantillaElegida = plantillaElegida?.components?.find((item) => item.type === "BODY")?.text ?? "";
  const variablesNuevas = variablesDePlantilla(cuerpoPlantillaNueva);
  const variablesMapeadas = variablesTexto.split(",").map((valor) => valor.trim()).filter(Boolean);
  const areasActivas = new Set(areasSeleccionadas);
  const zonasActivas = new Set(zonasSeleccionadas);
  const excluidas = new Set(filasExcluidas);
  const seleccionadas = preview?.aceptadas.filter((fila) => areasActivas.has(fila.areaClave) && (!preview.tieneZona || zonasActivas.has(fila.zonaClave)) && !excluidas.has(fila.numeroFila)) ?? [];
  const hayCampanasEnMarcha = campanas.some((campana) => ["programada", "en_curso"].includes(campana.estado));

  function aceptarLista() {
    void ejecutar(async () => {
      if (!preview || !seleccionadas.length) throw new Error("Completa la campaña y selecciona al menos un número");
      let id = campanaId;
      if (!id) {
        const creada = await json("/api/campanas-envio", cuerpo({ nombre, canalId, mapeoVariables: variablesMapeadas, ...calendario() }));
        id = creada.id;
        setCampanaId(id);
      }
      const resultado = await json(`/api/campanas-envio/${id}/importar`, cuerpo({ filas, filaEncabezados, mapeo, areasSeleccionadas, zonasSeleccionadas, filasAceptadas: seleccionadas.map((fila) => fila.numeroFila), filtroGiro, filtroZona, etiquetaId }));
      await Promise.all([cargarLista(), cargarReporte(id)]);
      setPaso(4);
      setPermiso(false);
      setMensaje(`${resultado.importados} destinatarios preparados. No se envió ningún mensaje.`);
    });
  }

  function seleccionarPlantilla(valor: string) {
    void ejecutar(async () => {
      if (!campanaId) throw new Error("Primero acepta una lista");
      const elegida = config.plantillas.find((item) => `${item.name}|${item.language}` === valor);
      if (!elegida) throw new Error("Selecciona una plantilla");
      await json(`/api/campanas-envio/${campanaId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "plantilla", plantillaNombre: elegida.name, plantillaIdioma: elegida.language }) });
      setPlantilla(valor);
      await cargarReporte(campanaId);
      setMensaje(`Plantilla ${elegida.name} seleccionada (${etiquetaEstadoPlantilla(elegida.status)}).`);
    });
  }

  function crearPlantilla() {
    void ejecutar(async () => {
      if (!campanaId) throw new Error("Primero acepta una lista");
      const creada = await json(`/api/campanas-envio/${campanaId}/plantilla`, cuerpo({ name: nombrePlantillaNueva, language: idiomaPlantillaNueva, body: cuerpoPlantillaNueva, ejemplos: ejemplosPlantillaNueva }));
      const nueva = creada.plantilla as Plantilla;
      setConfig((anterior) => ({ ...anterior, plantillas: [...anterior.plantillas.filter((item) => item.name !== nueva.name || item.language !== nueva.language), nueva] }));
      setPlantilla(`${nueva.name}|${nueva.language}`);
      setMostrarCrearPlantilla(false);
      await cargarReporte(campanaId);
      setMensaje(`Plantilla enviada a Meta para revisión (${etiquetaEstadoPlantilla(nueva.status)}). Ya puedes programar la campaña.`);
    });
  }

  function cambiarEnvios() {
    const activar = !config.campanasEnvioActivas;
    if (activar && !window.confirm("Se empezará a enviar según el calendario de cada campaña en curso")) return;
    void ejecutar(async () => {
      const actualizado = await json("/api/campanas-envio/config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campanasEnvioActivas: activar }) });
      setConfig((anterior) => ({ ...anterior, campanasEnvioActivas: actualizado.campanasEnvioActivas }));
      setMensaje(activar ? "Envíos activados." : "Envíos pausados.");
    });
  }

  function guardarCalendario() {
    void ejecutar(async () => {
      if (!campanaId) throw new Error("Primero acepta una lista");
      await json(`/api/campanas-envio/${campanaId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "configurar", ...calendario() }) });
      await cargarReporte(campanaId);
      setMensaje("Calendario guardado. Revisa el resumen y confirma el permiso antes de lanzar.");
    });
  }

  function lanzar() {
    void ejecutar(async () => {
      if (!campanaId || !permiso || !reporte?.campana.plantillaNombre) throw new Error("Selecciona una plantilla y confirma el permiso de los contactos antes de lanzar");
      await json(`/api/campanas-envio/${campanaId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "configurar", ...calendario() }) });
      await json(`/api/campanas-envio/${campanaId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: "lanzar", confirmoPermiso: true }) });
      await Promise.all([cargarLista(), cargarReporte(campanaId)]);
      setPaso(5);
      setMensaje(["PENDING", "IN_APPEAL"].includes(reporte.campana.plantillaEstado ?? "") ? "Campaña programada. Empezará sola cuando Meta apruebe la plantilla, dentro del calendario y con los envíos activos." : "Campaña programada. Los envíos seguirán el calendario si el interruptor general está activo.");
    });
  }

  function mostrarReporte(id: string) {
    void ejecutar(async () => {
      setCampanaId(id);
      const datos = await cargarReporte(id);
      setCanalId(datos.campana.canalId);
      setVariablesTexto(Array.isArray(datos.campana.mapeoVariables) ? datos.campana.mapeoVariables.join(", ") : "");
      await cargarConfig(datos.campana.canalId);
      setPlantilla(datos.campana.plantillaNombre ? `${datos.campana.plantillaNombre}|${datos.campana.plantillaIdioma}` : "");
      setPaso(5);
    });
  }

  function accion(tipo: "pausar" | "reanudar" | "cancelar", id: string) {
    void ejecutar(async () => {
      await json(`/api/campanas-envio/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accion: tipo }) });
      await cargarLista();
      if (reporte?.campana.id === id) await cargarReporte(id);
      setMensaje(`Campaña ${tipo === "pausar" ? "pausada" : tipo === "reanudar" ? "reanudada" : "cancelada"}.`);
    });
  }

  return <main className="mx-auto max-w-7xl min-w-0 space-y-6 p-4 pb-12 sm:p-6">
    <header><p className="text-sm font-semibold text-primary">EXI Chiapas</p><h1 className="mt-1 text-2xl font-bold sm:text-3xl">Campañas de envío</h1><p className="mt-1 text-sm text-muted-foreground">Prepara una lista revisada antes de programar mensajes con una plantilla de Meta.</p></header>

    <section className={`surface border-l-4 p-4 sm:p-5 ${config.campanasEnvioActivas ? "border-l-success" : "border-l-warning"}`} aria-label="Control general de envíos">
      <div className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Control de esta organización</p><h2 className={`mt-1 text-xl font-bold ${config.campanasEnvioActivas ? "text-success" : "text-warning"}`}>Envíos: {config.campanasEnvioActivas ? "ACTIVOS" : "PAUSADOS"}</h2><p className="mt-1 text-sm text-muted-foreground">Las campañas conservan su estado y calendario al pausar.</p></div>
        {esAdmin && <button type="button" role="switch" aria-label="Envíos de campañas" aria-checked={config.campanasEnvioActivas} disabled={ocupado || !configCargada} onClick={cambiarEnvios} className={primaryClass}>{config.campanasEnvioActivas ? "Pausar envíos" : "Activar envíos"}</button>}
      </div>
      {!config.campanasEnvioActivas && hayCampanasEnMarcha && <p role="status" className="mt-4 rounded-lg bg-warning/10 p-3 text-sm font-medium text-foreground">Los envíos están pausados; ninguna campaña enviará hasta que lo actives</p>}
    </section>

    <section className="surface min-w-0 p-4 sm:p-6" aria-label="Preparar campaña">
      <div className="max-w-full overflow-x-auto pb-2"><ol className="flex min-w-[620px] items-center gap-2" aria-label="Pasos de la campaña">{pasos.map((etiqueta, i) => <li key={etiqueta} className={`flex flex-1 items-center gap-2 rounded-lg px-3 py-2 text-sm ${paso === i + 1 ? "bg-primary text-primary-foreground" : paso > i + 1 ? "bg-success/10 text-foreground" : "bg-muted text-muted-foreground"}`} aria-current={paso === i + 1 ? "step" : undefined}><span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-current text-xs font-bold">{i + 1}</span><span className="font-medium">{etiqueta}</span></li>)}</ol></div>
      {error && <p role="alert" className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-foreground">{error}</p>}
      {mensaje && <p role="status" className="mt-4 rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-foreground">{mensaje}</p>}

      {paso === 1 && <div className="mt-6 space-y-4"><div><h2 className="text-xl font-semibold">1. Subir archivo</h2><p className="text-sm text-muted-foreground">CSV o XLSX, primera hoja, máximo 5 MB y 10,000 filas de datos.</p></div><label className="block max-w-xl rounded-xl border border-dashed border-input bg-muted/40 p-6 text-sm font-medium">Selecciona un archivo
        <input type="file" accept=".csv,.xlsx" className="mt-3 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-primary-foreground" onChange={(e) => void archivoSeleccionado(e.target.files?.[0])} />
      </label></div>}

      {paso === 2 && <div className="mt-6 space-y-5"><div><h2 className="text-xl font-semibold">2. Revisar columnas</h2><p className="text-sm text-muted-foreground">{archivoNombre}. {filaDetectada ? `Encabezados detectados en la fila ${filaDetectada}.` : "No encontramos encabezados automáticamente; selecciona su fila."} Las filas anteriores se omitirán.</p></div>
        <div className="grid gap-4 md:grid-cols-2"><label className="text-sm font-medium">Los encabezados están en la fila N
          <select value={filaEncabezados || ""} onChange={(e) => elegirEncabezados(Number(e.target.value))} className={inputClass}>
            <option value="">Selecciona la fila de encabezados</option>
            {filas.map((fila, indice) => ({ fila, numero: indice + 1 })).filter(({ fila }) => fila.some((celda) => celda.trim())).slice(0, 30).map(({ fila, numero }) => <option key={numero} value={numero}>Fila {numero}: {fila.filter(Boolean).slice(0, 3).join(" · ")}</option>)}
          </select>
          <span className="mt-2 block text-xs text-muted-foreground">Si no aparece, indica su número:</span>
          <input type="number" min={1} max={filas.length} value={filaEncabezados || ""} onChange={(e) => elegirEncabezados(Number(e.target.value))} className={inputClass} />
        </label><p className="self-end rounded-lg bg-muted p-3 text-sm text-muted-foreground">{filaEncabezados > 0 && filas[filaEncabezados - 1] ? filas[filaEncabezados - 1].filter(Boolean).slice(0, 7).join(" · ") : "Selecciona la fila que contiene teléfono, nombre y las demás columnas."}</p></div>
        {filaEncabezados > 0 && filas[filaEncabezados - 1] && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{(["telefono", "nombre", "empresa", "giro", "zona"] as const).map((campo) => <label key={campo} className="text-sm font-medium">{campo === "giro" ? "Área / giro" : campo === "zona" ? "Ciudad / zona" : campo === "telefono" ? "Teléfono" : campo[0].toUpperCase() + campo.slice(1)}
          <select className={inputClass} value={mapeo[campo] ?? -1} onChange={(e) => { const numero = Number(e.target.value); setMapeo((anterior) => ({ ...anterior, [campo]: numero < 0 && campo !== "telefono" ? undefined : numero })); if (campo === "zona") setFiltroZona(""); invalidarPreview(); }}><option value={-1}>Sin mapear</option>{filas[filaEncabezados - 1].map((header, indice) => <option key={indice} value={indice}>{header || `Columna ${indice + 1}`}</option>)}</select>
        </label>)}</div>}
        {filaEncabezados > 0 && mapeo.telefono >= 0 && <div className="rounded-xl bg-muted/50 p-4 text-sm"><p className="font-medium">Muestra de teléfonos</p>{filas.slice(filaEncabezados).filter((fila) => fila.some(Boolean)).slice(0, 3).map((fila, indice) => <p key={indice} className="mt-1 break-all font-mono text-muted-foreground">{fila[mapeo.telefono] || "Sin teléfono"} → {normalizarTelefonoCampana(fila[mapeo.telefono]) ?? "Inválido"}</p>)}</div>}
        <label className="block text-sm font-medium">Variables de la plantilla, en orden, separadas por coma
          <input className={inputClass} value={variablesTexto} onChange={(e) => { setVariablesTexto(e.target.value); invalidarPreview(); }} placeholder="nombre, ciudad" /><span className="mt-1 block text-xs text-muted-foreground">Cualquier columna del archivo puede usarse como variable, por ejemplo ciudad.</span>
        </label>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><label className="text-sm font-medium">Solo área / giro (opcional)<input className={inputClass} value={filtroGiro} onChange={(e) => { setFiltroGiro(e.target.value); invalidarPreview(); }} placeholder="Colegio privado" /></label>{mapeo.zona !== undefined && <label className="text-sm font-medium">Solo ciudad / zona (opcional)<input className={inputClass} value={filtroZona} onChange={(e) => { setFiltroZona(e.target.value); invalidarPreview(); }} placeholder="Tuxtla Gutiérrez" /></label>}<label className="text-sm font-medium">Solo contactos con etiqueta existente (opcional)<select className={inputClass} value={etiquetaId} onChange={(e) => { setEtiquetaId(e.target.value); invalidarPreview(); }}><option value="">Todos</option>{config.etiquetas.map((etiqueta) => <option key={etiqueta.id} value={etiqueta.id}>{etiqueta.nombre}</option>)}</select></label></div>
        <div className="flex flex-wrap gap-3"><button type="button" className={secondaryClass} onClick={() => setPaso(1)}>Cambiar archivo</button><button type="button" className={primaryClass} disabled={ocupado || mapeo.telefono < 0 || !filaEncabezados} onClick={revisarColumnas}>Ver vista previa</button></div>
      </div>}

      {paso === 3 && preview && <div className="mt-6 space-y-6"><div><h2 className="text-xl font-semibold">3. Revisar y aceptar</h2><p className="text-sm text-muted-foreground">Encabezados en fila {preview.filaEncabezados}. Ningún contacto se guarda hasta que aceptes esta lista.</p></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{[["Válidos", preview.conteos.validos], ["Duplicados", preview.conteos.duplicados], ["Inválidos", preview.conteos.invalidos], ["Ya existentes", preview.conteos.existentes], ["Bajas", preview.conteos.optOut]].map(([titulo, valor]) => <div key={titulo} className="rounded-xl border bg-muted/40 p-4"><p className="text-sm text-muted-foreground">{titulo}</p><strong className="tnum text-2xl">{valor}</strong></div>)}</div>
        <details className="rounded-xl border border-border p-4"><summary className="cursor-pointer font-medium">Ver muestra del archivo y teléfonos normalizados</summary><div className="mt-3 max-h-72 max-w-full overflow-auto"><table className="min-w-[600px] w-full text-left text-sm"><thead className="sticky top-0 bg-muted"><tr><th className="px-3 py-2">Fila</th><th className="px-3 py-2">Teléfono original</th><th className="px-3 py-2">Teléfono normalizado</th><th className="px-3 py-2">Resultado</th></tr></thead><tbody>{preview.muestra.map((fila) => <tr key={fila.numeroFila} className="border-t"><td className="px-3 py-3">{fila.numeroFila}</td><td className="px-3 py-3">{fila.fila[mapeo.telefono] || "—"}</td><td className="px-3 py-3 font-mono">{fila.telefonoNormalizado ?? "—"}</td><td className="px-3 py-3">{fila.motivo ? <span className="rounded bg-destructive/10 px-2 py-1 text-destructive">{fila.motivo}</span> : <span className="rounded bg-success/10 px-2 py-1 text-success">Válida</span>}</td></tr>)}</tbody></table></div></details>
        <RevisionListaCampana areas={preview.resumenAreas} zonas={preview.resumenZonas} tieneZona={preview.tieneZona} matrizAreaZona={preview.matrizAreaZona} filas={preview.aceptadas} rechazadas={preview.rechazadas} headers={preview.headers} areasSeleccionadas={areasSeleccionadas} zonasSeleccionadas={zonasSeleccionadas} filasExcluidas={filasExcluidas} onArea={(clave, activa) => setAreasSeleccionadas((actuales) => activa ? [...actuales, clave] : actuales.filter((item) => item !== clave))} onAreas={setAreasSeleccionadas} onZonas={setZonasSeleccionadas} onFila={(numero, incluida) => setFilasExcluidas((actuales) => incluida ? actuales.filter((item) => item !== numero) : [...actuales, numero])} />
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Nombre de campaña<input className={inputClass} value={nombre} maxLength={120} onChange={(e) => setNombre(e.target.value)} placeholder="Campaña colegios" /></label><label className="text-sm font-medium">Canal conectado<select className={inputClass} value={canalId} onChange={(e) => { setCanalId(e.target.value); setPlantilla(""); void cargarConfig(e.target.value).catch((error) => setError(error.message)); }}>{config.canales.map((canal) => <option key={canal.id} value={canal.id}>{canal.nombre}</option>)}</select></label></div>
        <p className="text-sm text-muted-foreground">Estimación de la lista elegida: US${(seleccionadas.length * config.tarifaMarketingUsd).toFixed(2)} si todos se entregan. Meta cobra directamente a EXI.</p>
        <div className="flex flex-wrap items-center gap-3"><button type="button" className={secondaryClass} onClick={() => setPaso(2)}>Cambiar columnas o filtros</button><span className="text-sm text-muted-foreground">{areasSeleccionadas.length} de {preview.resumenAreas.length} áreas{preview.tieneZona ? ` · ${zonasSeleccionadas.length} de ${preview.resumenZonas.length} zonas` : ""}</span>{esAdmin && <button type="button" className={primaryClass} disabled={ocupado || !seleccionadas.length || !nombre.trim() || !canalId} onClick={aceptarLista}>Aceptar lista ({seleccionadas.length} números)</button>}</div>
      </div>}

      {paso === 4 && <div className="mt-6 space-y-5"><div><h2 className="text-xl font-semibold">4. Programar</h2><p className="text-sm text-muted-foreground">La lista ya está preparada. Define cuándo podrá enviarse cada tanda.</p></div>
        <div className="rounded-xl border border-border bg-muted/40 p-4"><p className="font-medium">{reporte?.campana.nombre ?? nombre}</p><p className="mt-1 text-sm text-muted-foreground">{reporte?.conteos.total ?? 0} destinatarios · aproximadamente {reporte?.diasEstimados ?? 0} días · US${(reporte?.costoEstimadoUsd ?? 0).toFixed(2)} estimados.</p></div>
        {reporte?.campana.listaAceptadaPorArea && <div className="rounded-xl border border-border p-4"><h3 className="font-semibold">Lista aceptada · solo lectura</h3><p className="mt-1 text-sm text-muted-foreground">{reporte.campana.listaAceptadaPorArea.totalSeleccionados} números aceptados. Los filtros de giro, zona y etiqueta solo acotan la lista al crear cada campaña; no pueden agregar números fuera de la selección aceptada.</p><div className="mt-3 flex flex-wrap gap-2">{reporte.campana.listaAceptadaPorArea.areas.map((area) => <span key={area.clave} className="rounded-full bg-muted px-3 py-1 text-sm">{area.nombre}: {area.seleccionados}</span>)}</div>{Boolean(reporte.campana.listaAceptadaPorArea.zonas?.length) && <div className="mt-2 flex flex-wrap gap-2">{reporte.campana.listaAceptadaPorArea.zonas!.map((zona) => <span key={zona.clave} className="rounded-full bg-primary/10 px-3 py-1 text-sm">{zona.nombre}: {zona.seleccionados}</span>)}</div>}</div>}
        <div className="rounded-xl border border-border p-4"><div className="flex flex-wrap items-end gap-3"><label className="min-w-64 flex-1 text-sm font-medium">Plantilla de Meta<select className={inputClass} value={plantilla || (reporte?.campana.plantillaNombre ? `${reporte.campana.plantillaNombre}|${reporte.campana.plantillaIdioma}` : "")} disabled={ocupado || !esAdmin} onChange={(e) => seleccionarPlantilla(e.target.value)}><option value="">Seleccionar plantilla</option>{config.plantillas.map((item) => <option key={`${item.name}|${item.language}`} value={`${item.name}|${item.language}`}>{item.name} · {item.language} · {etiquetaEstadoPlantilla(item.status)}</option>)}</select></label>{esAdmin && <button type="button" className={secondaryClass} disabled={ocupado} onClick={() => setMostrarCrearPlantilla((valor) => !valor)}>Crear plantilla nueva</button>}</div>
          {reporte?.campana.plantillaNombre && <p className="mt-2 text-sm">{estadoPlantilla(reporte.campana)}{reporte.campana.plantillaConsultadaAt ? ` · última consulta ${new Date(reporte.campana.plantillaConsultadaAt).toLocaleString("es-MX")}` : ""}</p>}
          {plantillaElegida && <p className="mt-2 text-sm text-muted-foreground">{variablesDePlantilla(textoPlantillaElegida).length} variables en el cuerpo · {variablesMapeadas.length} columnas mapeadas del archivo.</p>}
          {plantillaElegida && textoPlantillaElegida && !incluyeAvisoBaja(textoPlantillaElegida) && <p className="mt-2 text-sm text-warning">Revisa que la plantilla incluya “Responde BAJA para no recibir más mensajes”.</p>}
          {["PENDING", "IN_APPEAL"].includes(reporte?.campana.plantillaEstado ?? "") && <p className="mt-2 rounded-lg bg-warning/10 p-3 text-sm">Se programará ahora y empezará sola al aprobarse, dentro de la ventana configurada y si los envíos están activos.</p>}
        </div>
        {mostrarCrearPlantilla && esAdmin && <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-4"><h3 className="font-semibold">Crear plantilla de marketing</h3><p className="text-sm text-muted-foreground">Se enviará a Meta para revisión. Idioma predeterminado: es_MX. Categoría: MARKETING.</p><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Nombre<input className={inputClass} value={nombrePlantillaNueva} onChange={(e) => setNombrePlantillaNueva(e.target.value)} placeholder="campana_colegios" /></label><label className="text-sm font-medium">Idioma<input className={inputClass} value={idiomaPlantillaNueva} onChange={(e) => setIdiomaPlantillaNueva(e.target.value)} /></label></div><label className="block text-sm font-medium">Cuerpo del mensaje<textarea className={inputClass} rows={5} maxLength={1024} value={cuerpoPlantillaNueva} onChange={(e) => setCuerpoPlantillaNueva(e.target.value)} placeholder="Hola {{1}}, te escribimos de EXI. Responde BAJA para no recibir más mensajes." /></label>
          {variablesNuevas.map((numero, indice) => <label key={numero} className="block text-sm font-medium">Ejemplo de {`{{${numero}}}`}<input className={inputClass} value={ejemplosPlantillaNueva[indice] ?? ""} onChange={(e) => setEjemplosPlantillaNueva((actuales) => { const nuevos = [...actuales]; nuevos[indice] = e.target.value; return nuevos; })} placeholder={variablesMapeadas[indice] || "Ejemplo"} /></label>)}
          {!incluyeAvisoBaja(cuerpoPlantillaNueva) && <div className="rounded-lg bg-warning/10 p-3 text-sm"><p>Incluye “Responde BAJA para no recibir más mensajes”.</p><button type="button" className={secondaryClass} onClick={() => setCuerpoPlantillaNueva((texto) => `${texto.trim()}${texto.trim() ? "\n\n" : ""}Responde BAJA para no recibir más mensajes.`)}>Agregar aviso de baja</button></div>}
          <button type="button" className={primaryClass} disabled={ocupado || !nombrePlantillaNueva.trim() || !cuerpoPlantillaNueva.trim() || variablesNuevas.length !== variablesMapeadas.length} onClick={crearPlantilla}>Enviar plantilla a Meta</button></div>}
        <fieldset className="space-y-2"><legend className="font-semibold">Días de envío</legend><div className="flex flex-wrap gap-3">{["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((dia, i) => <label key={dia} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><input type="checkbox" checked={dias.includes(i)} onChange={(e) => setDias(e.target.checked ? [...dias, i].sort() : dias.filter((valor) => valor !== i))} />{dia}</label>)}</div></fieldset>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"><label className="text-sm font-medium">Desde<input className={inputClass} type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} /></label><label className="text-sm font-medium">Hasta<input className={inputClass} type="time" value={horaFin} onChange={(e) => setHoraFin(e.target.value)} /></label><label className="text-sm font-medium">Zona horaria<input className={inputClass} value={zonaHoraria} onChange={(e) => setZonaHoraria(e.target.value)} /></label><label className="text-sm font-medium">Tamaño de tanda (1–20)<input className={inputClass} type="number" min={1} max={20} value={tandaTamano} onChange={(e) => setTandaTamano(Number(e.target.value))} /></label><label className="text-sm font-medium">Pausa entre tandas (min, ≥5)<input className={inputClass} type="number" min={5} value={pausaTandaMin} onChange={(e) => setPausaTandaMin(Number(e.target.value))} /></label><label className="text-sm font-medium">Tope diario (máx. 150)<input className={inputClass} type="number" min={1} max={150} value={topeDiario} onChange={(e) => setTopeDiario(Number(e.target.value))} /></label><label className="text-sm font-medium">Fecha de inicio<input className={inputClass} type="datetime-local" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} /></label></div>
        <div className="rounded-xl border border-warning/40 bg-warning/10 p-4"><label className="flex items-start gap-3 font-medium"><input type="checkbox" className="mt-1" checked={permiso} onChange={(e) => setPermiso(e.target.checked)} />Confirmo que estos contactos conocen a EXI y aceptaron recibir mensajes</label><p className="mt-2 text-sm">La plantilla debe incluir “Responde BAJA para no recibir más mensajes”.</p></div>
        <div className="flex flex-wrap gap-3">{esAdmin && <><button type="button" className={secondaryClass} disabled={ocupado} onClick={guardarCalendario}>Guardar calendario</button><button type="button" className={primaryClass} disabled={ocupado || !permiso || !reporte?.conteos.total || !reporte.campana.plantillaNombre} onClick={lanzar}>Lanzar campaña</button></>}</div>
      </div>}

      {paso === 5 && <div className="mt-6 space-y-5"><div><h2 className="text-xl font-semibold">5. Reporte</h2><p className="text-sm text-muted-foreground">{reporte ? `Campaña ${reporte.campana.nombre}` : "Selecciona una campaña para ver su reporte."}</p></div>
        {reporte?.campana.plantillaNombre && <p className="rounded-xl border border-border bg-muted/40 p-4 text-sm">{estadoPlantilla(reporte.campana)} · {reporte.campana.plantillaNombre} ({reporte.campana.plantillaIdioma}){reporte.campana.plantillaConsultadaAt ? ` · última consulta ${new Date(reporte.campana.plantillaConsultadaAt).toLocaleString("es-MX")}` : ""}</p>}
        {reporte && <><div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border bg-muted/40 p-4"><p className="text-sm text-muted-foreground">Destinatarios</p><strong className="tnum text-2xl">{reporte.conteos.total}</strong></div><div className="rounded-xl border bg-muted/40 p-4"><p className="text-sm text-muted-foreground">Hoy / tope</p><strong className="tnum text-2xl">{reporte.hoy} / {reporte.campana.topeDiario}</strong></div><div className="rounded-xl border bg-muted/40 p-4"><p className="text-sm text-muted-foreground">Costo estimado</p><strong className="tnum text-2xl">US${reporte.costoEstimadoUsd.toFixed(2)}</strong></div></div>
          {reporte.campana.listaAceptadaPorArea && <div className="rounded-xl border p-4"><h3 className="font-semibold">Lista aceptada</h3><p className="text-sm text-muted-foreground">{reporte.campana.listaAceptadaPorArea.totalSeleccionados} números aceptados; {reporte.campana.listaAceptadaPorArea.importados} preparados · por usuario {reporte.campana.listaAceptadaPor ?? "—"} · {reporte.campana.listaAceptadaAt ? new Date(reporte.campana.listaAceptadaAt).toLocaleString("es-MX") : "—"}</p><div className="mt-2 flex flex-wrap gap-2">{reporte.campana.listaAceptadaPorArea.areas.map((area) => <span key={area.clave} className="rounded-full bg-muted px-3 py-1 text-sm">{area.nombre}: {area.seleccionados}</span>)}</div>{Boolean(reporte.campana.listaAceptadaPorArea.zonas?.length) && <div className="mt-2 flex flex-wrap gap-2">{reporte.campana.listaAceptadaPorArea.zonas!.map((zona) => <span key={zona.clave} className="rounded-full bg-primary/10 px-3 py-1 text-sm">{zona.nombre}: {zona.seleccionados}</span>)}</div>}</div>}
          <p className="text-sm">{Object.entries(reporte.conteos).map(([estado, cantidad]) => `${estado}: ${cantidad}`).join(" · ")}</p>
          <div className="flex flex-wrap items-center gap-3"><label className="text-sm font-medium">Estado<select className={inputClass} value={filtroEstado} onChange={(e) => { setFiltroEstado(e.target.value); void cargarReporte(reporte.campana.id, e.target.value).catch((fallo) => setError(fallo.message)); }}><option value="">Todos</option>{["pendiente", "enviando", "enviado", "entregado", "leido", "respondio", "fallido", "omitido"].map((estado) => <option key={estado} value={estado}>{estado}</option>)}</select></label><a className={secondaryClass} href={`/api/campanas-envio/${reporte.campana.id}/exportar`}>Exportar CSV</a></div>
          <div className="max-h-96 max-w-full overflow-auto rounded-xl border"><table className="min-w-[520px] w-full text-left text-sm"><thead className="sticky top-0 bg-muted"><tr><th className="px-4 py-3">Nombre</th><th className="px-4 py-3">Teléfono</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Motivo</th></tr></thead><tbody>{reporte.destinatarios.map((destinatario) => <tr key={destinatario.id} className="border-t"><td className="px-4 py-3">{destinatario.nombre}</td><td className="px-4 py-3 font-mono">{destinatario.telefono}</td><td className="px-4 py-3"><span className="rounded-full bg-muted px-2 py-1">{destinatario.estado}</span></td><td className="px-4 py-3">{destinatario.motivo ?? "—"}</td></tr>)}</tbody></table></div><p className="text-xs text-muted-foreground">Se muestran los primeros 200 destinatarios. El CSV incluye todos.</p>
          {reporte.campana.estado === "borrador" && esAdmin && <button type="button" className={secondaryClass} onClick={() => setPaso(4)}>Volver a programar</button>}
        </>}
      </div>}
    </section>

    <section className="surface min-w-0 p-4 sm:p-6"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-xl font-semibold">Campañas</h2><p className="text-sm text-muted-foreground">Borradores, campañas programadas y resultados.</p></div>{filas.length > 0 && paso >= 4 && <button type="button" className={secondaryClass} onClick={() => { setCampanaId(""); setReporte(null); setPreview(null); setAreasSeleccionadas([]); setFilasExcluidas([]); setNombre(""); setPlantilla(""); setPaso(2); }}>Nueva campaña con este archivo</button>}</div>
      {campanas.length ? <div className="mt-4 divide-y divide-border">{campanas.map((campana) => <div key={campana.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div className="min-w-0"><h3 className="break-words font-semibold">{campana.nombre}</h3><p className="text-sm text-muted-foreground"><span className="rounded-full bg-muted px-2 py-1 text-foreground">{campana.estado}</span> · {campana._count.destinatarios} destinatarios</p>{campana.plantillaNombre && <p className="mt-2 text-sm">{estadoPlantilla(campana)}{campana.plantillaConsultadaAt ? ` · última consulta ${new Date(campana.plantillaConsultadaAt).toLocaleString("es-MX")}` : ""}</p>}{campana.motivoPausa && <p className="mt-2 text-sm text-destructive">{campana.motivoPausa}</p>}</div><div className="flex flex-wrap gap-2"><button type="button" className={secondaryClass} onClick={() => mostrarReporte(campana.id)}>Ver reporte</button>{esAdmin && ["programada", "en_curso"].includes(campana.estado) && <button type="button" className={secondaryClass} onClick={() => accion("pausar", campana.id)}>Pausar</button>}{esAdmin && campana.estado === "pausada" && <button type="button" className={secondaryClass} onClick={() => accion("reanudar", campana.id)}>Reanudar</button>}{esAdmin && !["completada", "cancelada"].includes(campana.estado) && <button type="button" className="rounded-lg border border-destructive/40 px-4 py-2.5 text-destructive" onClick={() => accion("cancelar", campana.id)}>Cancelar</button>}</div></div>)}</div> : <p className="mt-4 rounded-xl bg-muted p-5 text-sm text-muted-foreground">Todavía no hay campañas. Sube un archivo para preparar la primera.</p>}
    </section>
  </main>;
}
