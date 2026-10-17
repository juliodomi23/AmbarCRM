"use client";
import { useEffect, useState } from "react";
import { Boton } from "@/components/ui";
import { confirmar } from "@/components/Confirmador";
import { toast } from "@/components/Toaster";
import type { AccionRegla, CondicionRegla } from "@/lib/automatizaciones-esquema";
import { EditorFilasRegla, TIPOS_ACCION, type FilaRegla, type OpcionesRegla } from "./EditorRegla";
import { peticionIntegracion } from "./integraciones-cliente";

type Regla = { id: string; nombre: string; evento: string; condiciones: CondicionRegla[]; acciones: AccionRegla[]; activo: boolean };
type Ejecucion = { id: string; conversacionId: string; creadoEn: string; resultado: string; detalle: string };
type Simulacion = { contexto: { texto: string; estado: string; canal: string; contactoNuevo: boolean; fueraHorario: boolean }; cumple: boolean; acciones: AccionRegla[]; aviso: string };
const ruta = "/api/automatizaciones";

export function ReglasAutomatizacion() {
  const [lista, setLista] = useState<Regla[]>([]);
  const [opciones, setOpciones] = useState<OpcionesRegla>({ agentes: [], etiquetas: [], plantillas: [], webhooks: [] });
  const [nombre, setNombre] = useState("");
  const [evento, setEvento] = useState("mensaje.recibido");
  const [condiciones, setCondiciones] = useState<FilaRegla[]>([]);
  const [acciones, setAcciones] = useState<FilaRegla[]>([{ tipo: "cambiar_estado", valor: "pendiente" }]);
  const [editando, setEditando] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [simulacion, setSimulacion] = useState<(Simulacion & { nombre: string }) | null>(null);
  const [bitacora, setBitacora] = useState<{ nombre: string; filas: Ejecucion[] } | null>(null);
  const [cargado, setCargado] = useState(false);
  async function cargar() {
    const datos = await peticionIntegracion<{ reglas: Regla[]; opciones: OpcionesRegla }>(ruta);
    if (datos) { setLista(datos.reglas); setOpciones(datos.opciones); }
    setCargado(true);
  }
  useEffect(() => { void cargar(); }, []);
  function limpiar() { setEditando(null); setNombre(""); setCondiciones([]); setAcciones([{ tipo: "cambiar_estado", valor: "pendiente" }]); }
  function editar(r: Regla) {
    setEditando(r.id); setNombre(r.nombre); setEvento(r.evento);
    setCondiciones(r.condiciones.map((c) => ({ tipo: c.tipo, valor: String(c.valor) })));
    setAcciones(r.acciones.map((a) => ({ tipo: a.tipo, valor: "id" in a ? a.id : a.valor })));
  }
  async function guardar(e: React.FormEvent) {
    e.preventDefault(); setOcupado(true);
    const datos = await peticionIntegracion(`${ruta}${editando ? `/${editando}` : ""}`, editando ? "PATCH" : "POST", {
      nombre, evento, condiciones: condiciones.map((c) => ({ tipo: c.tipo, valor: ["fuera_horario", "contacto_nuevo"].includes(c.tipo) ? c.valor === "true" : c.valor })),
      acciones: acciones.map((a) => a.tipo === "cambiar_estado" ? { tipo: a.tipo, valor: a.valor } : { tipo: a.tipo, id: a.valor }),
    });
    if (datos) { limpiar(); await cargar(); toast("Regla guardada", "ok"); }
    setOcupado(false);
  }
  async function actuar(r: Regla, accion: "activar" | "eliminar" | "probar" | "ejecuciones") {
    if (accion === "eliminar" && !await confirmar({ mensaje: `¿Eliminar la regla «${r.nombre}»?`, peligro: true })) return;
    setOcupado(true);
    if (accion === "probar") {
      const datos = await peticionIntegracion<Simulacion>(`${ruta}/${r.id}/probar`, "POST");
      if (datos) setSimulacion({ ...datos, nombre: r.nombre });
    } else if (accion === "ejecuciones") {
      const datos = await peticionIntegracion<Ejecucion[]>(`${ruta}/${r.id}/ejecuciones`);
      if (datos) setBitacora({ nombre: r.nombre, filas: datos });
    } else {
      const datos = await peticionIntegracion(`${ruta}/${r.id}`, accion === "eliminar" ? "DELETE" : "PATCH", accion === "activar" ? { activo: !r.activo } : undefined);
      if (datos && accion === "eliminar" && editando === r.id) limpiar();
      await cargar();
    }
    setOcupado(false);
  }
  return <section className="surface p-4 space-y-4" aria-label="Reglas de automatización">
    <h2 className="font-semibold">Reglas de automatización</h2>
    <p className="text-sm text-muted-foreground">Hasta 25 reglas. Máximo 20 ejecuciones por conversación y hora. Las respuestas rápidas de WhatsApp y Messenger requieren ventana de 24 h abierta.</p>
    {!cargado && <p role="status">Cargando reglas…</p>}
    {cargado && !lista.length && <p className="text-sm">Aún no hay reglas.</p>}
    {lista.map((r) => <article key={r.id} className="border border-border rounded-lg p-3 space-y-2">
      <p className="font-medium">{r.nombre} · {r.activo ? "Activa" : "Inactiva"}</p>
      <p className="text-xs text-muted-foreground">{r.evento} · {r.condiciones.length} condiciones · {r.acciones.length} acciones</p>
      <div className="flex flex-wrap gap-2">
        <Boton disabled={ocupado} onClick={() => editar(r)}>Editar</Boton>
        <Boton disabled={ocupado} onClick={() => actuar(r, "activar")}>{r.activo ? "Desactivar" : "Activar"}</Boton>
        <Boton disabled={ocupado} onClick={() => actuar(r, "probar")}>Probar</Boton>
        <Boton disabled={ocupado} onClick={() => actuar(r, "ejecuciones")}>Bitácora</Boton>
        <Boton disabled={ocupado} onClick={() => actuar(r, "eliminar")}>Eliminar</Boton>
      </div>
    </article>)}
    <form onSubmit={guardar} className="space-y-3">
      <h3 className="font-medium">{editando ? "Editar regla" : "Nueva regla"}</h3>
      <label className="block text-sm">Nombre<input required maxLength={100} className="block w-full rounded border border-input bg-background p-2" value={nombre} onChange={(e) => setNombre(e.target.value)} /></label>
      <label className="block text-sm">Cuando ocurra<select className="block w-full rounded border border-input bg-background p-2" value={evento} onChange={(e) => setEvento(e.target.value)}>
        {["conversacion.creada", "conversacion.estado_cambiado", "mensaje.recibido"].map((v) => <option key={v}>{v}</option>)}
      </select></label>
      <EditorFilasRegla filas={condiciones} cambiar={setCondiciones} opciones={opciones} />
      <EditorFilasRegla acciones filas={acciones} cambiar={setAcciones} opciones={opciones} />
      <div className="flex flex-wrap gap-2">
        <Boton type="submit" disabled={ocupado || !acciones.length || (!editando && lista.length >= 25)}>Guardar regla</Boton>
        {editando && <Boton type="button" onClick={limpiar}>Cancelar edición</Boton>}
        <Boton type="button" disabled={ocupado} onClick={cargar}>Actualizar opciones</Boton>
      </div>
    </form>
    {simulacion && <div role="status" className="border border-border rounded p-3 space-y-2">
      <h3 className="font-medium">Simulación de {simulacion.nombre}</h3>
      <p className="text-sm">Ejemplo: WhatsApp, estado {simulacion.contexto.estado}, contacto nuevo, dentro del horario. Mensaje: «{simulacion.contexto.texto}».</p>
      <p className="text-sm">{simulacion.cumple ? "Se cumplen las condiciones. Haría lo siguiente:" : "No se cumplen todas las condiciones."}</p>
      <ul className="list-disc pl-5 text-sm">{simulacion.acciones.map((a, i) => <li key={i}>{TIPOS_ACCION.find(([tipo]) => tipo === a.tipo)?.[1]}: {"id" in a ? a.id : a.valor}</li>)}</ul>
      <p className="text-xs text-muted-foreground">{simulacion.aviso}</p>
      <Boton onClick={() => setSimulacion(null)}>Cerrar simulación</Boton>
    </div>}
    {bitacora && <div className="space-y-2">
      <h3 className="font-medium">Últimas ejecuciones: {bitacora.nombre}</h3>
      {!bitacora.filas.length && <p className="text-sm">Sin ejecuciones.</p>}
      {bitacora.filas.map((f) => <p key={f.id} className="text-xs border-b border-border py-2">{new Date(f.creadoEn).toLocaleString("es-MX")} · Conversación {f.conversacionId} · {f.resultado}: {f.detalle}</p>)}
      <Boton onClick={() => setBitacora(null)}>Cerrar bitácora</Boton>
    </div>}
  </section>;
}
