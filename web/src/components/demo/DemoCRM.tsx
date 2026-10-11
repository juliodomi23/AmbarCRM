"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { BRAND_PRESETS, variablesMarca, type BrandPreset } from "@/lib/brand";
import {
  CONVERSACIONES,
  CONTACTOS,
  DemoVertical,
  DemoVista,
  NAVEGACION_DEMO,
  OPORTUNIDADES_INICIALES,
  PASOS_RECORRIDO,
  TAREAS_INICIALES,
  VERTICALES,
} from "./demo-data";

/** Personalización que se ve en toda la demo: marca, nombre y qué módulos están prendidos. */
type Personalizacion = {
  preset: BrandPreset;
  setPreset: (preset: BrandPreset) => void;
  nombre: string;
  setNombre: (nombre: string) => void;
  apagadas: Set<string>;
  alternar: (clave: string) => void;
  restablecer: () => void;
};
type Notificar = (mensaje: string) => void;

/** Secciones del menú que una empresa puede apagar; Inicio, Chat y Configuración son el núcleo. */
const SECCIONES_OPCIONALES: DemoVista[] = ["embudo", "contactos", "tareas", "difusion", "automatizaciones", "modulos"];
const PERSONALIZACION_INICIAL = {
  preset: "ambar-rojo" as BrandPreset,
  nombre: "Clínica Horizonte",
  vertical: "clinica" as DemoVertical,
};
const CLAVE_PERSONALIZACION = "ambar-demo-personalizacion";

const iniciales = (texto: string) => (texto.match(/\p{L}+/gu) ?? []).slice(0, 2).map((p) => p[0].toUpperCase()).join("") || "AR";
const contarModulosActivos = (apagadas: Set<string>) => new Set(
  VERTICALES.flatMap((giro) => giro.modulos.filter((modulo) => !apagadas.has(`${giro.id}:${modulo.nombre}`)).map((modulo) => modulo.nombre)),
).size;

function Interruptor({ activo, onClick, etiqueta }: { activo: boolean; onClick: () => void; etiqueta: string }) {
  return (
    <button type="button" role="switch" aria-checked={activo} aria-label={etiqueta} onClick={onClick} className={`relative h-6 w-11 shrink-0 rounded-full transition ${activo ? "bg-primary" : "bg-muted-foreground/30"}`}>
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${activo ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

const ICONOS: Record<string, string | string[]> = {
  inicio: "M3 12l9-9 9 9M5 10v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V10",
  chat: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
  embudo: "M3 5h18l-7 8v5l-4 2v-7z",
  contactos: "M20 21a8 8 0 0 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  tareas: "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  difusion: "M3 11v2l13 4V7L3 11zM16 9a3 3 0 0 1 0 6",
  automatizaciones: [
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    "M19 12h3M2 12h3M12 2v3M12 19v3M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1M18.4 18.4l-2.1-2.1M7.7 7.7L5.6 5.6",
  ],
  modulos: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  configuracion: [
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
    "M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.8 1.2V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-2.8-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3.2 14H3a2 2 0 0 1 0-4h.1A1.7 1.7 0 0 0 4.4 7.2l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 3.2V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 2.8 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 20.8 10h.2a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  ],
  buscar: "M21 21l-4.4-4.4M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z",
  menu: "M4 6h16M4 12h16M4 18h16",
  cerrar: "M18 6L6 18M6 6l12 12",
  check: "M20 6L9 17l-5-5",
  flecha: "M5 12h14M13 6l6 6-6 6",
  brillo: "M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z",
  escudo: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4",
  reloj: "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z",
};

function Icono({
  nombre,
  className = "h-5 w-5",
}: {
  nombre: keyof typeof ICONOS | string;
  className?: string;
}) {
  const paths = ICONOS[nombre] ?? ICONOS.modulos;
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {(Array.isArray(paths) ? paths : [paths]).map((path, index) => (
        <path key={index} d={path} />
      ))}
    </svg>
  );
}

function Avatar({ nombre, grande = false }: { nombre: string; grande?: boolean }) {
  const iniciales = nombre
    .split(" ")
    .slice(0, 2)
    .map((parte) => parte[0])
    .join("");
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full bg-primary/10 font-bold text-primary ${
        grande ? "h-11 w-11 text-sm" : "h-9 w-9 text-xs"
      }`}
      aria-hidden="true"
    >
      {iniciales}
    </span>
  );
}

function Badge({ children, tono = "primary" }: { children: React.ReactNode; tono?: "primary" | "success" | "warning" | "info" }) {
  const clases = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
    info: "bg-info/10 text-info",
  };
  return <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${clases[tono]}`}>{children}</span>;
}

function EncabezadoVista({ ceja, titulo, descripcion, accion }: { ceja: string; titulo: string; descripcion: string; accion?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-bold uppercase tracking-[.16em] text-primary">{ceja}</p>
        <h1 className="mt-1 text-2xl font-bold md:text-3xl">{titulo}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{descripcion}</p>
      </div>
      {accion}
    </div>
  );
}

function BotonPrimario({ children, onClick, disabled = false }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-glow transition hover:-translate-y-0.5 hover:opacity-95 disabled:translate-y-0 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function AvisoDemo({ mensaje, cerrar }: { mensaje: string; cerrar: () => void }) {
  return (
    <div role="status" className="fixed bottom-4 right-4 z-[60] flex max-w-[calc(100vw-2rem)] items-start gap-3 rounded-2xl bg-foreground px-4 py-3 text-sm text-background shadow-pop sm:max-w-sm">
      <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-success" />
      <p className="min-w-0 flex-1">{mensaje}</p>
      <button type="button" onClick={cerrar} aria-label="Cerrar aviso" className="grid h-6 w-6 shrink-0 place-items-center rounded-md hover:bg-background/10"><Icono nombre="cerrar" className="h-3.5 w-3.5" /></button>
    </div>
  );
}

function MiniGrafica({ valores }: { valores: number[] }) {
  const maximo = Math.max(...valores);
  return (
    <div className="flex h-10 items-end gap-1" aria-hidden="true">
      {valores.map((valor, index) => (
        <span
          key={index}
          className="w-2 rounded-t-sm bg-primary/70"
          style={{ height: `${Math.max(18, (valor / maximo) * 100)}%`, opacity: 0.45 + index * 0.07 }}
        />
      ))}
    </div>
  );
}

function VistaInicio({ irA, apagadas }: { irA: (vista: DemoVista) => void; apagadas: Set<string> }) {
  const actividad = [
    ["Mariana escribió por WhatsApp", "La conversación se asignó a Ana", "Hace 2 min"],
    ["Oportunidad movida a Propuesta", "Academia Prisma · $24,700", "Hace 18 min"],
    ["Cita confirmada", "Consulta inicial · mañana 16:30", "Hace 34 min"],
    ["Pago registrado", "Ruta Maya Tours · $4,500", "Hace 1 h"],
  ];
  return (
    <div className="space-y-6">
      <EncabezadoVista
        ceja="Resumen operativo"
        titulo="Todo el negocio, en contexto"
        descripcion="Datos ficticios para recorrer las funciones del CRM sin conectar una cuenta real."
        accion={<BotonPrimario onClick={() => irA("chat")}>Ver chat en vivo <Icono nombre="flecha" className="h-4 w-4" /></BotonPrimario>}
      />

      <div className="stagger grid grid-cols-2 gap-3 xl:grid-cols-5">
        {[
          ["Chats abiertos", "24", "+12% esta semana", [2, 4, 3, 6, 5, 8]],
          ["Sin responder", "3", "2 requieren atención", [6, 5, 5, 3, 4, 2]],
          ["Oportunidades", "38", "5 etapas activas", [2, 3, 5, 4, 7, 8]],
          ["Valor del embudo", "$428,600", "+$62,400 este mes", [3, 4, 4, 6, 7, 9]],
          ["Satisfacción", "4.8 / 5", "47 respuestas", [7, 7, 8, 8, 9, 9]],
        ].map(([titulo, valor, detalle, datos]) => {
          const destino: DemoVista | null = titulo === "Chats abiertos" || titulo === "Sin responder"
            ? "chat"
            : titulo === "Oportunidades" || titulo === "Valor del embudo"
              ? "embudo"
              : null;
          const contenido = <><div className="flex items-start justify-between gap-2"><p className="text-xs font-semibold text-muted-foreground">{String(titulo)}</p><MiniGrafica valores={datos as number[]} /></div><p className="tnum mt-3 text-2xl font-bold">{String(valor)}</p><p className="mt-1 text-xs text-muted-foreground">{String(detalle)}</p></>;
          return destino && !apagadas.has(destino)
            ? <button key={String(titulo)} onClick={() => irA(destino)} className="surface surface-lift min-h-36 p-4 text-left transition hover:-translate-y-1 hover:border-primary/30">{contenido}</button>
            : <div key={String(titulo)} className="surface min-h-36 p-4 text-left">{contenido}</div>;
        })}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_.75fr]">
        <section className="surface p-5">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <h2 className="font-bold">Embudo comercial</h2>
              <p className="text-xs text-muted-foreground">Valor activo por etapa</p>
            </div>
            {!apagadas.has("embudo") && <button onClick={() => irA("embudo")} className="text-sm font-semibold text-primary hover:underline">Abrir tablero</button>}
          </div>
          <div className="space-y-4">
            {[
              ["Nuevo", 12, 98400, 56],
              ["Calificado", 9, 121600, 69],
              ["Propuesta", 7, 142300, 81],
              ["Negociación", 4, 66300, 38],
            ].map(([nombre, cantidad, valor, ancho]) => (
              <div key={String(nombre)}>
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="font-semibold">{nombre} <span className="font-normal text-muted-foreground">· {cantidad}</span></span>
                  <span className="tnum text-muted-foreground">${Number(valor).toLocaleString("es-MX")}</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-brand-gradient" style={{ width: `${ancho}%` }} /></div>
              </div>
            ))}
          </div>
        </section>

        <section className="surface p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-bold">Actividad reciente</h2>
              <p className="text-xs text-muted-foreground">Actualizaciones del equipo</p>
            </div>
            <span className="relative flex h-3 w-3"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/50" /><span className="relative inline-flex h-3 w-3 rounded-full bg-success" /></span>
          </div>
          <div className="space-y-1">
            {actividad.map(([titulo, detalle, tiempo]) => (
              <div key={titulo} className="flex gap-3 rounded-xl p-2.5 hover:bg-muted/60">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />
                <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{titulo}</p><p className="truncate text-xs text-muted-foreground">{detalle}</p></div>
                <span className="whitespace-nowrap text-[10px] text-muted-foreground">{tiempo}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="surface overflow-hidden">
        <div className="grid gap-6 bg-mesh p-5 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <Badge tono="info">{contarModulosActivos(apagadas)} módulos activos</Badge>
            <h2 className="mt-3 text-xl font-bold">Adapta el CRM al giro del negocio</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Clínica, automotriz, inmobiliaria, retail, legal, viajes y educación comparten clientes, ventas y conversaciones.</p>
          </div>
          {!apagadas.has("modulos") && <BotonPrimario onClick={() => irA("modulos")}>Explorar módulos</BotonPrimario>}
        </div>
      </section>
    </div>
  );
}

function VistaChat({ notificar }: { notificar: Notificar }) {
  const [seleccionada, setSeleccionada] = useState(1);
  const [busqueda, setBusqueda] = useState("");
  const [texto, setTexto] = useState("");
  const [notaInterna, setNotaInterna] = useState(false);
  const [mensajes, setMensajes] = useState<Array<{ propio: boolean; texto: string; hora: string; interno?: boolean }>>([
    { propio: false, texto: "Hola, ¿tienen lugar mañana por la tarde?", hora: "10:41" },
    { propio: true, texto: "¡Hola, Mariana! Sí, tenemos espacio a las 4:30 o 6:00. ¿Cuál te funciona mejor?", hora: "10:42" },
    { propio: false, texto: "A las 4:30, por favor.", hora: "10:42" },
  ]);
  const contacto = CONVERSACIONES.find((item) => item.id === seleccionada) ?? CONVERSACIONES[0];
  const conversaciones = CONVERSACIONES.filter((item) => `${item.nombre} ${item.mensaje} ${item.etiqueta}`.toLowerCase().includes(busqueda.toLowerCase()));

  function seleccionarConversacion(id: number) {
    const siguiente = CONVERSACIONES.find((item) => item.id === id) ?? CONVERSACIONES[0];
    setSeleccionada(id);
    setMensajes([
      { propio: false, texto: siguiente.mensaje, hora: siguiente.hora },
      { propio: true, texto: `Gracias, ${siguiente.nombre.split(" ")[0]}. Ya estoy revisando tu mensaje.`, hora: "Ahora" },
    ]);
    setTexto("");
    setNotaInterna(false);
  }

  function enviar() {
    if (!texto.trim()) return;
    setMensajes((actuales) => [...actuales, { propio: true, texto: texto.trim(), hora: "Ahora", interno: notaInterna }]);
    setTexto("");
    setNotaInterna(false);
  }

  return (
    <div className="space-y-5">
      <EncabezadoVista ceja="Conversaciones" titulo="Bandeja compartida" descripcion="Atiende, asigna y da seguimiento sin perder el contexto comercial." />
      <div className="surface grid min-h-[680px] overflow-hidden lg:grid-cols-[300px_minmax(0,1fr)_280px]">
        <aside className="border-b border-border lg:border-b-0 lg:border-r">
          <div className="border-b p-3">
            <label className="flex min-h-10 items-center gap-2 rounded-xl border bg-background px-3 text-muted-foreground">
              <Icono nombre="buscar" className="h-4 w-4" />
              <input value={busqueda} onChange={(event) => setBusqueda(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none" placeholder="Buscar conversación…" />
            </label>
            <div className="mt-3 flex gap-2 text-xs"><Badge>Todos 24</Badge><Badge tono="warning">Sin asignar 3</Badge></div>
          </div>
          <div className="max-h-60 overflow-auto lg:max-h-[590px]">
            {conversaciones.map((conversacion) => (
              <button key={conversacion.id} onClick={() => seleccionarConversacion(conversacion.id)} className={`flex w-full gap-3 border-b p-3 text-left transition hover:bg-muted/60 ${seleccionada === conversacion.id ? "bg-primary/5 shadow-[inset_3px_0_0_hsl(var(--primary))]" : ""}`}>
                <Avatar nombre={conversacion.nombre} />
                <span className="min-w-0 flex-1"><span className="flex justify-between gap-2"><strong className="truncate text-sm">{conversacion.nombre}</strong><span className="text-[10px] text-muted-foreground">{conversacion.hora}</span></span><span className="mt-0.5 block truncate text-xs text-muted-foreground">{conversacion.mensaje}</span><span className="mt-1.5 flex items-center justify-between"><Badge tono="info">{conversacion.etiqueta}</Badge>{conversacion.noLeidos > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">{conversacion.noLeidos}</span>}</span></span>
              </button>
            ))}
            {conversaciones.length === 0 && <p className="p-5 text-center text-xs text-muted-foreground">No hay conversaciones que coincidan.</p>}
          </div>
        </aside>

        <section className="flex min-w-0 flex-col bg-surface/35">
          <header className="flex items-center gap-3 border-b bg-card p-3 sm:p-4">
            <Avatar nombre={contacto.nombre} />
            <div className="min-w-0 flex-1"><h2 className="truncate text-sm font-bold">{contacto.nombre}</h2><p className="text-xs text-muted-foreground">Asignada a Ana · en línea</p></div>
            <Badge tono="success">24 h · 21:34</Badge>
          </header>
          <div className="flex-1 space-y-3 overflow-auto p-4 sm:p-6">
            <div className="mx-auto w-fit rounded-full bg-muted px-3 py-1 text-[10px] text-muted-foreground">Hoy</div>
            {mensajes.map((mensaje, index) => (
              <div key={index} className={`flex ${mensaje.propio ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[82%] rounded-2xl px-3.5 py-2.5 text-sm shadow-soft ${mensaje.interno ? "rounded-br-sm border border-warning/25 bg-warning/10 text-foreground" : mensaje.propio ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-card"}`}>
                  {mensaje.interno && <p className="mb-1 text-[10px] font-bold uppercase tracking-wide opacity-75">Nota interna</p>}<p>{mensaje.texto}</p><p className={`mt-1 text-right text-[10px] ${mensaje.propio && !mensaje.interno ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{mensaje.hora}{mensaje.propio && !mensaje.interno ? " · ✓✓" : ""}</p>
                </div>
              </div>
            ))}
            <div className="mx-auto flex max-w-md items-center gap-2 rounded-xl border border-info/25 bg-info/5 px-3 py-2 text-xs text-info"><Icono nombre="reloj" className="h-4 w-4" /> Puedes enviar mensajes libres durante 21 h 34 min.</div>
          </div>
          <div className="border-t bg-card p-3">
            <div className="mb-2 flex flex-wrap gap-2">
              <button onClick={() => { setNotaInterna(false); setTexto(`Claro, ${contacto.nombre.split(" ")[0]}. Agendé tu cita para mañana a las 4:30. Te llegará un recordatorio antes de la cita.`); }} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold text-primary hover:bg-primary/5"><Icono nombre="brillo" className="h-4 w-4" /> Sugerir con IA</button>
              <button onClick={() => { setNotaInterna(false); setTexto(`Hola, ${contacto.nombre.split(" ")[0]}. Te escribimos para dar seguimiento a tu solicitud. ¿Podemos ayudarte con algo más?`); }} className="min-h-9 rounded-lg border px-3 text-xs font-semibold hover:bg-muted">Plantilla</button>
              <button aria-pressed={notaInterna} onClick={() => setNotaInterna((actual) => !actual)} className={`min-h-9 rounded-lg border px-3 text-xs font-semibold ${notaInterna ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"}`}>Nota interna</button>
            </div>
            <div className="flex items-end gap-2 rounded-xl border bg-background p-2 focus-within:border-primary/50">
              <textarea value={texto} onChange={(event) => setTexto(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); enviar(); } }} rows={2} className="min-h-12 flex-1 resize-none bg-transparent px-2 py-1 text-sm outline-none" placeholder="Escribe un mensaje…" />
              <button onClick={enviar} aria-label="Enviar mensaje" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><Icono nombre="flecha" className="h-4 w-4" /></button>
            </div>
          </div>
        </section>

        <aside className="hidden border-l bg-card p-4 lg:block">
          <Avatar nombre={contacto.nombre} grande />
          <h3 className="mt-3 font-bold">{contacto.nombre}</h3>
          <p className="text-xs text-muted-foreground">+52 961 142 8890</p>
          <div className="mt-4 flex flex-wrap gap-2"><Badge>Cita</Badge><Badge tono="warning">Interesada</Badge></div>
          <div className="mt-5 space-y-4 text-sm">
            <div><p className="text-xs font-semibold text-muted-foreground">Responsable</p><p className="mt-1">Ana Torres</p></div>
            <div><p className="text-xs font-semibold text-muted-foreground">Oportunidad</p><p className="mt-1">Consulta inicial · $1,200</p></div>
            <div><p className="text-xs font-semibold text-muted-foreground">Campos propios</p><p className="mt-1">Preferencia: Por la tarde</p><p>Acepta promociones: Sí</p></div>
          </div>
          <button onClick={() => notificar(`En la versión real, esto abre la agenda para crear una cita de ${contacto.nombre}.`)} className="mt-5 w-full rounded-xl border py-2 text-sm font-semibold text-primary hover:bg-primary/5">+ Crear cita</button>
          <button onClick={() => notificar(`Tarea ficticia preparada para dar seguimiento a ${contacto.nombre}.`)} className="mt-2 w-full rounded-xl border py-2 text-sm font-semibold hover:bg-muted">+ Crear tarea</button>
        </aside>
      </div>
    </div>
  );
}

function VistaEmbudo({ notificar }: { notificar: Notificar }) {
  const etapas = ["Nuevo", "Calificado", "Propuesta", "Negociación"];
  const [oportunidades, setOportunidades] = useState(OPORTUNIDADES_INICIALES);
  function crearOportunidad() {
    setOportunidades((actuales) => [...actuales, { id: Math.max(...actuales.map((item) => item.id)) + 1, nombre: "Nuevo prospecto", empresa: "Empresa de demostración", valor: 12500, etapa: "Nuevo", dias: 0 }]);
    notificar("Se agregó una oportunidad ficticia en la etapa Nuevo.");
  }
  function avanzar(id: number) {
    setOportunidades((actuales) => actuales.map((item) => {
      if (item.id !== id) return item;
      const indice = etapas.indexOf(item.etapa);
      return { ...item, etapa: etapas[Math.min(indice + 1, etapas.length - 1)], dias: 0 };
    }));
  }
  return (
    <div className="space-y-5">
      <EncabezadoVista ceja="Ventas" titulo="Embudo comercial" descripcion="Haz clic en “Avanzar” para simular el movimiento de una oportunidad." accion={<BotonPrimario onClick={crearOportunidad}>+ Nueva oportunidad</BotonPrimario>} />
      <div className="flex gap-4 overflow-x-auto pb-3">
        {etapas.map((etapa) => {
          const items = oportunidades.filter((item) => item.etapa === etapa);
          const total = items.reduce((suma, item) => suma + item.valor, 0);
          return (
            <section key={etapa} className="w-[280px] shrink-0 rounded-2xl bg-surface p-3">
              <header className="mb-3 flex items-center justify-between px-1"><div><h2 className="text-sm font-bold">{etapa}</h2><p className="tnum text-xs text-muted-foreground">${total.toLocaleString("es-MX")} · {items.length}</p></div><span className="h-2.5 w-2.5 rounded-full bg-primary" /></header>
              <div className="space-y-3">
                {items.map((item) => (
                  <article key={item.id} className="surface surface-lift p-3">
                    <div className="flex items-start gap-2"><Avatar nombre={item.nombre} /><div className="min-w-0 flex-1"><h3 className="truncate text-sm font-bold">{item.nombre}</h3><p className="truncate text-xs text-muted-foreground">{item.empresa}</p></div></div>
                    <div className="mt-3 flex items-center justify-between"><span className="tnum text-sm font-bold text-success">${item.valor.toLocaleString("es-MX")}</span><span className="text-[10px] text-muted-foreground">{item.dias} días aquí</span></div>
                    <div className="mt-3 flex gap-2"><button onClick={() => notificar(`${item.nombre} · ${item.empresa} · $${item.valor.toLocaleString("es-MX")}. En la versión real se abre su detalle completo.`)} className="min-h-8 flex-1 rounded-lg border text-xs font-semibold hover:bg-muted">Abrir</button>{etapa !== etapas.at(-1) && <button onClick={() => avanzar(item.id)} className="min-h-8 flex-1 rounded-lg bg-primary/10 text-xs font-semibold text-primary hover:bg-primary/15">Avanzar →</button>}</div>
                  </article>
                ))}
                {items.length === 0 && <div className="rounded-xl border border-dashed p-5 text-center text-xs text-muted-foreground">Arrastra o avanza una oportunidad aquí</div>}
              </div>
            </section>
          );
        })}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="surface p-4"><p className="text-xs text-muted-foreground">Conversión del mes</p><p className="tnum mt-1 text-2xl font-bold">31%</p></div>
        <div className="surface p-4"><p className="text-xs text-muted-foreground">Primera respuesta</p><p className="tnum mt-1 text-2xl font-bold">8 min</p></div>
        <div className="surface p-4"><p className="text-xs text-muted-foreground">Ganado este mes</p><p className="tnum mt-1 text-2xl font-bold text-success">$184,200</p></div>
      </div>
    </div>
  );
}

function VistaContactos({ notificar }: { notificar: Notificar }) {
  const [busqueda, setBusqueda] = useState("");
  const [listaContactos, setListaContactos] = useState(CONTACTOS);
  const contactos = listaContactos.filter((item) => `${item.nombre} ${item.empresa} ${item.telefono}`.toLowerCase().includes(busqueda.toLowerCase()));
  function crearContacto() {
    setListaContactos((actuales) => [...actuales, { nombre: "Andrea Demo", telefono: "+52 961 000 0000", empresa: "Empresa de demostración", responsable: "Julio", etiqueta: "Nuevo", ultima: "Ahora" }]);
    setBusqueda("");
    notificar("Se agregó un contacto ficticio a la tabla.");
  }
  return (
    <div className="space-y-5">
      <EncabezadoVista ceja="Ventas" titulo="Contactos" descripcion="Una ficha central con conversaciones, oportunidades, tareas, etiquetas y campos personalizados." accion={<BotonPrimario onClick={crearContacto}>+ Nuevo contacto</BotonPrimario>} />
      <div className="surface overflow-hidden">
        <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between">
          <label className="flex min-h-10 w-full max-w-sm items-center gap-2 rounded-xl border bg-background px-3"><Icono nombre="buscar" className="h-4 w-4 text-muted-foreground" /><input value={busqueda} onChange={(event) => setBusqueda(event.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Buscar por nombre, empresa o teléfono…" /></label>
          <div className="flex gap-2"><button onClick={() => notificar("En la versión real, esto valida un CSV antes de importar contactos.")} className="min-h-10 rounded-xl border px-3 text-sm font-semibold hover:bg-muted">Importar CSV</button><button onClick={() => notificar("La versión real descarga un CSV con los filtros y campos visibles.")} className="min-h-10 rounded-xl border px-3 text-sm font-semibold hover:bg-muted">Exportar</button></div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-muted/60 text-xs text-muted-foreground"><tr><th className="px-4 py-3 font-semibold">Contacto</th><th className="px-4 py-3 font-semibold">Empresa</th><th className="px-4 py-3 font-semibold">Etiqueta</th><th className="px-4 py-3 font-semibold">Responsable</th><th className="px-4 py-3 font-semibold">Última actividad</th><th className="px-4 py-3" /></tr></thead>
            <tbody className="divide-y">
              {contactos.map((contacto) => (
                <tr key={contacto.telefono} className="hover:bg-muted/35"><td className="px-4 py-3"><div className="flex items-center gap-3"><Avatar nombre={contacto.nombre} /><div><p className="font-semibold">{contacto.nombre}</p><p className="text-xs text-muted-foreground">{contacto.telefono}</p></div></div></td><td className="px-4 py-3">{contacto.empresa}</td><td className="px-4 py-3"><Badge tono="info">{contacto.etiqueta}</Badge></td><td className="px-4 py-3">{contacto.responsable}</td><td className="px-4 py-3 text-muted-foreground">{contacto.ultima}</td><td className="px-4 py-3"><button onClick={() => notificar(`${contacto.nombre}: ${contacto.telefono}, responsable ${contacto.responsable}. En la versión real se abre su ficha.`)} className="font-semibold text-primary hover:underline">Abrir</button></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {["Campos personalizados", "Importación y exportación", "Expediente por giro"].map((titulo, index) => <div key={titulo} className="surface p-4"><span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 font-bold text-primary">{index + 1}</span><h3 className="mt-3 font-bold">{titulo}</h3><p className="mt-1 text-xs text-muted-foreground">{["Texto, número, fecha, opción y sí/no, con validación.", "CSV seguro y compatible con las columnas propias.", "El mismo contacto se convierte en paciente, cliente o alumno."][index]}</p></div>)}
      </div>
    </div>
  );
}

function VistaTareas({ notificar }: { notificar: Notificar }) {
  const [tareas, setTareas] = useState(TAREAS_INICIALES);
  function crearTarea() {
    setTareas((actuales) => [...actuales, { id: Math.max(...actuales.map((item) => item.id)) + 1, titulo: "Contactar al nuevo prospecto", fecha: "Mañana · 11:00", responsable: "Julio", lista: false }]);
    notificar("Se agregó una tarea ficticia al seguimiento del equipo.");
  }
  return (
    <div className="space-y-5">
      <EncabezadoVista ceja="Seguimiento" titulo="Tareas del equipo" descripcion="Cada pendiente tiene fecha, responsable y contexto comercial." accion={<BotonPrimario onClick={crearTarea}>+ Nueva tarea</BotonPrimario>} />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <section className="surface overflow-hidden">
          <div className="border-b p-4"><h2 className="font-bold">Pendientes de hoy</h2><p className="text-xs text-muted-foreground">Marca una tarea para simular su cierre.</p></div>
          <div className="divide-y">
            {tareas.map((tarea) => (
              <label key={tarea.id} className="flex cursor-pointer items-center gap-3 p-4 hover:bg-muted/40"><input type="checkbox" checked={tarea.lista} onChange={() => setTareas((actuales) => actuales.map((item) => item.id === tarea.id ? { ...item, lista: !item.lista } : item))} className="h-5 w-5 accent-[hsl(var(--primary))]" /><span className="min-w-0 flex-1"><span className={`block text-sm font-semibold ${tarea.lista ? "text-muted-foreground line-through" : ""}`}>{tarea.titulo}</span><span className="text-xs text-muted-foreground">{tarea.fecha}</span></span><Badge tono={tarea.lista ? "success" : "warning"}>{tarea.lista ? "Lista" : tarea.responsable}</Badge></label>
            ))}
          </div>
        </section>
        <aside className="space-y-3">
          <div className="surface p-5"><p className="text-xs text-muted-foreground">Completadas</p><p className="tnum mt-1 text-3xl font-bold">{tareas.filter((item) => item.lista).length}<span className="text-base text-muted-foreground"> / {tareas.length}</span></p><div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-success transition-all" style={{ width: `${(tareas.filter((item) => item.lista).length / tareas.length) * 100}%` }} /></div></div>
          <div className="surface p-5"><h3 className="font-bold">Automatiza el seguimiento</h3><p className="mt-1 text-sm text-muted-foreground">n8n y los bots pueden crear tareas, mover etapas y mandar recordatorios mediante la API.</p><Badge tono="info">API v1 estilo Chatwoot</Badge></div>
        </aside>
      </div>
    </div>
  );
}

function VistaDifusion() {
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [audiencia, setAudiencia] = useState("frecuentes");
  const [plantilla, setPlantilla] = useState("promocion");
  function simular() {
    setEnviando(true);
    window.setTimeout(() => { setEnviando(false); setEnviado(true); }, 900);
  }
  return (
    <div className="space-y-5">
      <EncabezadoVista ceja="Campañas" titulo="Difusión segmentada" descripcion="Envía plantillas aprobadas a contactos etiquetados y respeta las reglas de la ventana de 24 horas." />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <section className="surface p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold">Audiencia<select value={audiencia} onChange={(event) => { setAudiencia(event.target.value); setEnviado(false); }} className="mt-2 min-h-11 w-full rounded-xl border bg-background px-3 font-normal"><option value="frecuentes">Etiqueta: Clientes frecuentes (126)</option><option value="seguimiento">Etiqueta: Seguimiento (48)</option></select></label>
            <label className="text-sm font-semibold">Plantilla<select value={plantilla} onChange={(event) => { setPlantilla(event.target.value); setEnviado(false); }} className="mt-2 min-h-11 w-full rounded-xl border bg-background px-3 font-normal"><option value="promocion">promocion_octubre · aprobada</option><option value="seguimiento">seguimiento_cotizacion · aprobada</option></select></label>
          </div>
          <div className="mt-5 rounded-2xl bg-surface p-4"><p className="text-xs font-semibold uppercase tracking-[.14em] text-muted-foreground">Vista previa · {audiencia === "frecuentes" ? "126 destinatarios" : "48 destinatarios"}</p><div className="mt-3 max-w-md rounded-2xl rounded-bl-sm bg-card p-4 text-sm shadow-soft">{plantilla === "promocion" ? <>Hola Mariana, este mes tenemos <strong>20% en valoración inicial</strong> para clientes frecuentes. Responde “Quiero” y te damos los detalles.</> : <>Hola Mariana, ¿pudiste revisar la cotización? Responde a este mensaje y con gusto resolvemos tus dudas.</>}<p className="mt-2 text-right text-[10px] text-muted-foreground">10:42</p></div></div>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">Solo datos ficticios. Esta acción no envía mensajes reales.</p><BotonPrimario onClick={simular} disabled={enviando || enviado}>{enviando ? "Simulando envío…" : enviado ? "Campaña preparada ✓" : "Simular campaña"}</BotonPrimario></div>
        </section>
        <aside className="space-y-3">
          <div className="surface p-5"><h3 className="font-bold">Antes de enviar</h3><ul className="mt-3 space-y-3 text-sm text-muted-foreground">{["Plantilla aprobada", "126 contactos con consentimiento", "Variables completas", "Contador diario disponible"].map((item) => <li key={item} className="flex gap-2"><span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-success/10 text-success"><Icono nombre="check" className="h-3 w-3" /></span>{item}</li>)}</ul></div>
          <div className="surface p-5"><p className="text-xs text-muted-foreground">Rendimiento de ejemplo</p><div className="mt-3 grid grid-cols-3 gap-2 text-center"><div><p className="tnum font-bold">126</p><p className="text-[10px] text-muted-foreground">Enviados</p></div><div><p className="tnum font-bold">118</p><p className="text-[10px] text-muted-foreground">Entregados</p></div><div><p className="tnum font-bold">83</p><p className="text-[10px] text-muted-foreground">Leídos</p></div></div></div>
        </aside>
      </div>
    </div>
  );
}

function VistaAutomatizaciones() {
  const iniciales = [
    ["Asignación automática", "El chat nuevo va al agente activo con menos conversaciones.", true],
    ["Lead automático", "Cada contacto nuevo crea una oportunidad en el embudo.", true],
    ["Mensaje de bienvenida", "Saluda al iniciar la primera conversación.", true],
    ["Fuera de horario", "Responde con el horario configurado, máximo cada 4 horas.", true],
    ["Encuesta CSAT", "Solicita una calificación al cerrar el chat.", true],
    ["Auto-resolver", "Cierra conversaciones inactivas después de 48 horas.", false],
    ["Recordatorios de citas", "Envía una plantilla antes de cada cita.", true],
    ["Bot conectado a n8n", "Entrega mensajes y recibe acciones por la API v1.", false],
  ] as const;
  const [activas, setActivas] = useState<Record<string, boolean>>(Object.fromEntries(iniciales.map(([nombre, , activa]) => [nombre, activa])));
  const totalActivas = Object.values(activas).filter(Boolean).length;
  return (
    <div className="space-y-5">
      <EncabezadoVista ceja="Operación" titulo="Automatizaciones" descripcion="Activa y desactiva flujos para ver cómo cada negocio define su operación." accion={<Badge tono="success">{totalActivas} de {iniciales.length} activas</Badge>} />
      <div className="grid gap-3 md:grid-cols-2">
        {iniciales.map(([nombre, descripcion]) => (
          <article key={nombre} className="surface flex items-center gap-4 p-4"><span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${activas[nombre] ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"}`}><Icono nombre="automatizaciones" /></span><div className="min-w-0 flex-1"><h3 className="font-bold">{nombre}</h3><p className="text-xs text-muted-foreground">{descripcion}</p></div><button type="button" role="switch" aria-checked={activas[nombre]} aria-label={`${activas[nombre] ? "Desactivar" : "Activar"} ${nombre}`} onClick={() => setActivas((actuales) => ({ ...actuales, [nombre]: !actuales[nombre] }))} className={`relative h-7 w-12 shrink-0 rounded-full transition ${activas[nombre] ? "bg-success" : "bg-muted"}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-card shadow transition ${activas[nombre] ? "left-6" : "left-1"}`} /></button></article>
        ))}
      </div>
      <section className="surface grid gap-5 p-5 md:grid-cols-[1fr_auto] md:items-center"><div><Badge tono="info">n8n + API v1</Badge><h2 className="mt-3 text-lg font-bold">Bots que conocen el negocio</h2><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Pueden responder, etiquetar, mover el embudo, crear citas y devolver la conversación a una persona. Cada bot tiene un token acotado a su empresa y canal.</p></div><div className="rounded-xl bg-surface px-4 py-3 font-mono text-xs text-muted-foreground">POST /api/v1/accounts/…/messages</div></section>
    </div>
  );
}

function VistaModulos({ vertical, setVertical, apagadas, nombre, notificar }: { vertical: DemoVertical; setVertical: (vertical: DemoVertical) => void; apagadas: Set<string>; nombre: string; notificar: Notificar }) {
  const actual = VERTICALES.find((item) => item.id === vertical) ?? VERTICALES[0];
  const totalModulos = contarModulosActivos(apagadas);
  return (
    <div className="space-y-5">
      <EncabezadoVista ceja={`${totalModulos} módulos activos`} titulo={`Módulos de ${nombre || "tu negocio"}`} descripcion="El núcleo es el mismo; cada empresa activa solo las funciones que necesita." />
      <div className="flex gap-2 overflow-x-auto pb-1">
        {VERTICALES.map((item) => <button key={item.id} onClick={() => setVertical(item.id)} className={`min-h-10 shrink-0 rounded-xl px-4 text-sm font-semibold transition ${vertical === item.id ? "bg-primary text-primary-foreground shadow-glow" : "border bg-card hover:border-primary/40"}`}>{item.nombre}</button>)}
      </div>
      <section className="surface overflow-hidden">
        <div className="grid gap-6 bg-mesh p-5 md:grid-cols-[1fr_auto] md:items-center md:p-7"><div><Badge>{actual.nombre}</Badge><h2 className="mt-3 text-2xl font-bold">{actual.descripcion}</h2><p className="mt-2 max-w-2xl text-sm text-muted-foreground">“{actual.frase}”</p></div><div className="grid grid-cols-3 gap-2">{actual.metricas.map((metrica) => <div key={metrica.etiqueta} className="rounded-xl border bg-card/85 p-3 text-center shadow-soft"><p className="tnum text-lg font-bold">{metrica.valor}</p><p className="mt-1 text-[10px] text-muted-foreground">{metrica.etiqueta}</p></div>)}</div></div>
        <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-3">
          {actual.modulos.map((modulo, index) => { const apagado = apagadas.has(`${vertical}:${modulo.nombre}`); return <article key={modulo.nombre} className={`group rounded-2xl border p-4 transition hover:-translate-y-1 hover:border-primary/35 hover:shadow-lift ${apagado ? "opacity-55" : ""}`}><div className="flex items-start justify-between"><span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 font-bold text-primary">{index + 1}</span>{apagado ? <Badge>Apagado</Badge> : <Badge tono="success">Activo</Badge>}</div><h3 className="mt-4 font-bold">{modulo.nombre}</h3><p className="mt-1 min-h-10 text-sm text-muted-foreground">{modulo.descripcion}</p><button disabled={apagado} onClick={() => notificar(`${modulo.nombre}: ${modulo.descripcion} En la versión real se abre el flujo operativo completo.`)} className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary disabled:cursor-not-allowed disabled:text-muted-foreground">{apagado ? "Módulo apagado" : "Ver flujo"} {!apagado && <Icono nombre="flecha" className="h-4 w-4 transition-transform group-hover:translate-x-1" />}</button></article>; })}
        </div>
      </section>
      <div className="grid gap-3 md:grid-cols-4">
        {[
          ["CRM y agenda", "Clientes, Citas, Reservas y Lealtad"],
          ["Datos conectados", "Sin duplicar contactos entre módulos"],
          ["Permisos por puesto", "Clínico y legal con acceso restringido"],
          ["Concurrencia segura", "Cupos, inventario y saldos validados"],
        ].map(([titulo, detalle]) => <div key={titulo} className="surface p-4"><Icono nombre="escudo" className="h-5 w-5 text-primary" /><h3 className="mt-3 text-sm font-bold">{titulo}</h3><p className="mt-1 text-xs text-muted-foreground">{detalle}</p></div>)}
      </div>
    </div>
  );
}

function VistaConfiguracion({ p, vertical }: { p: Personalizacion; vertical: DemoVertical }) {
  const [tab, setTab] = useState("Marca");
  const tabs = ["Marca", "Módulos", "Canal WhatsApp", "Usuarios", "Embudos", "Plantillas", "Bots", "IA"];
  const giro = VERTICALES.find((item) => item.id === vertical) ?? VERTICALES[0];
  const moduloVistaPrevia = giro.modulos.find((modulo) => !p.apagadas.has(`${vertical}:${modulo.nombre}`));
  const filaModulo = (clave: string, nombre: string, descripcion: string) => (
    <div key={clave} className="flex items-center gap-4 rounded-xl border p-4">
      <div className="min-w-0 flex-1"><p className="text-sm font-semibold">{nombre}</p><p className="text-xs text-muted-foreground">{descripcion}</p></div>
      <Interruptor activo={!p.apagadas.has(clave)} onClick={() => p.alternar(clave)} etiqueta={`${p.apagadas.has(clave) ? "Activar" : "Apagar"} ${nombre}`} />
    </div>
  );
  return (
    <div className="space-y-5">
      <EncabezadoVista ceja="Administración" titulo="Configuración de la empresa" descripcion="Personaliza la operación sin crear una versión distinta del sistema. Pruébalo: los cambios se ven al instante en toda la demo." accion={<button type="button" onClick={p.restablecer} className="min-h-10 rounded-xl border px-4 text-sm font-semibold hover:bg-muted">Restablecer demo</button>} />
      <div className="surface overflow-hidden lg:grid lg:grid-cols-[230px_1fr]">
        <nav className="flex gap-1 overflow-x-auto border-b p-3 lg:block lg:space-y-1 lg:border-b-0 lg:border-r">
          {tabs.map((item) => <button key={item} onClick={() => setTab(item)} className={`min-h-10 shrink-0 rounded-xl px-3 text-left text-sm font-semibold lg:w-full ${tab === item ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>{item}</button>)}
        </nav>
        <div className="p-5 md:p-7">
          <Badge>{tab}</Badge>
          {tab === "Marca" ? (
            <div className="mt-5 grid gap-6 md:grid-cols-[1fr_280px]">
              <div className="space-y-4">
                <label className="block text-sm font-semibold">Nombre del negocio<input value={p.nombre} onChange={(e) => p.setNombre(e.target.value)} maxLength={40} className="mt-2 min-h-11 w-full rounded-xl border bg-background px-3 font-normal" /></label>
                <div>
                  <p className="text-sm font-semibold">Preset visual</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {(Object.keys(BRAND_PRESETS) as BrandPreset[]).map((clave) => (
                      <button key={clave} type="button" onClick={() => p.setPreset(clave)} aria-pressed={p.preset === clave} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition ${p.preset === clave ? "border-primary bg-primary/5 text-primary" : "hover:bg-muted"}`}>
                        <span className="h-3.5 w-3.5 rounded-full" style={{ background: `linear-gradient(135deg, ${BRAND_PRESETS[clave].primario}, ${BRAND_PRESETS[clave].acento})` }} />
                        {BRAND_PRESETS[clave].nombre}
                      </button>
                    ))}
                  </div>
                </div>
                <p className="rounded-xl bg-info/5 p-3 text-xs text-info">La marca también aparece en el inicio de sesión, reservas públicas y aplicación instalada.</p>
              </div>
              <div className="rounded-2xl bg-primary p-4 text-primary-foreground shadow-pop transition-colors">
                <div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white/15 font-bold">{iniciales(p.nombre)}</span><strong className="truncate">{p.nombre || "Tu negocio"}</strong></div>
                <div className="mt-5 space-y-2"><div className="rounded-xl bg-white/15 px-3 py-2 text-sm">Inicio</div><div className="rounded-xl px-3 py-2 text-sm opacity-75">Chat</div><div className="rounded-xl px-3 py-2 text-sm opacity-75">{moduloVistaPrevia?.nombre ?? "Sin módulos activos"}</div></div>
              </div>
            </div>
          ) : tab === "Módulos" ? (
            <div className="mt-5 space-y-6">
              <div>
                <h2 className="text-lg font-bold">Secciones del menú</h2>
                <p className="mt-1 text-sm text-muted-foreground">Apágalas y desaparecen del menú lateral al instante. Inicio, Chat y Configuración son el núcleo.</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {NAVEGACION_DEMO.filter((item) => SECCIONES_OPCIONALES.includes(item.vista)).map((item) => filaModulo(item.vista, item.etiqueta, item.grupo))}
                </div>
              </div>
              <div>
                <h2 className="text-lg font-bold">Módulos del giro · {giro.nombre}</h2>
                <p className="mt-1 text-sm text-muted-foreground">Cada empresa activa solo lo que usa. Cambia de giro en «Módulos por giro».</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {giro.modulos.map((modulo) => filaModulo(`${vertical}:${modulo.nombre}`, modulo.nombre, modulo.descripcion))}
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-5"><h2 className="text-xl font-bold">{tab}</h2><p className="mt-2 max-w-2xl text-sm text-muted-foreground">{({"Canal WhatsApp":"Conecta números, revisa el estado y administra la incorporación desde Meta.",Usuarios:"Crea administradores y agentes, asigna puestos y desactiva accesos cuando sea necesario.",Embudos:"Define varios procesos comerciales con etapas, colores y orden propio.",Plantillas:"Administra respuestas rápidas y plantillas de mensaje con variables validadas.",Bots:"Registra integraciones con token propio y alcance por canal.",IA:"Escribe instrucciones del negocio para sugerencias de respuesta revisadas por una persona.",Módulos:"Activa funciones por empresa y restringe las áreas sensibles por puesto."} as Record<string,string>)[tab]}</p><div className="mt-6 grid gap-3 sm:grid-cols-2">{["Configuración aislada por empresa", "Cambios auditables", "Validación en servidor", "Permisos administrativos"].map((item) => <div key={item} className="flex items-center gap-3 rounded-xl border p-4"><span className="grid h-8 w-8 place-items-center rounded-full bg-success/10 text-success"><Icono nombre="check" className="h-4 w-4" /></span><span className="text-sm font-semibold">{item}</span></div>)}</div></div>
          )}
        </div>
      </div>
      <section className="surface grid gap-5 p-5 md:grid-cols-3">
        <div><Icono nombre="escudo" className="h-6 w-6 text-success" /><h3 className="mt-3 font-bold">Aislamiento multiempresa</h3><p className="mt-1 text-xs text-muted-foreground">PostgreSQL RLS impide leer o escribir filas de otra organización.</p></div>
        <div><Icono nombre="escudo" className="h-6 w-6 text-success" /><h3 className="mt-3 font-bold">Secretos cifrados</h3><p className="mt-1 text-xs text-muted-foreground">Tokens de Meta con AES-256-GCM y contraseñas con hash.</p></div>
        <div><Icono nombre="escudo" className="h-6 w-6 text-success" /><h3 className="mt-3 font-bold">Respaldos diarios</h3><p className="mt-1 text-xs text-muted-foreground">Copias automáticas con retención y procedimiento de restauración.</p></div>
      </section>
    </div>
  );
}

function ContenidoVista({ vista, irA, vertical, setVertical, p, notificar }: { vista: DemoVista; irA: (vista: DemoVista) => void; vertical: DemoVertical; setVertical: (vertical: DemoVertical) => void; p: Personalizacion; notificar: Notificar }) {
  if (vista === "inicio") return <VistaInicio irA={irA} apagadas={p.apagadas} />;
  if (vista === "chat") return <VistaChat notificar={notificar} />;
  if (vista === "embudo") return <VistaEmbudo notificar={notificar} />;
  if (vista === "contactos") return <VistaContactos notificar={notificar} />;
  if (vista === "tareas") return <VistaTareas notificar={notificar} />;
  if (vista === "difusion") return <VistaDifusion />;
  if (vista === "automatizaciones") return <VistaAutomatizaciones />;
  if (vista === "modulos") return <VistaModulos vertical={vertical} setVertical={setVertical} apagadas={p.apagadas} nombre={p.nombre} notificar={notificar} />;
  return <VistaConfiguracion p={p} vertical={vertical} />;
}

export function DemoCRM() {
  const [vista, setVista] = useState<DemoVista>("inicio");
  const [vertical, setVertical] = useState<DemoVertical>(PERSONALIZACION_INICIAL.vertical);
  const [menu, setMenu] = useState(false);
  const [recorrido, setRecorrido] = useState<number | null>(0);
  const [preset, setPreset] = useState<BrandPreset>(PERSONALIZACION_INICIAL.preset);
  const [nombre, setNombre] = useState(PERSONALIZACION_INICIAL.nombre);
  const [apagadas, setApagadas] = useState<Set<string>>(() => new Set());
  const [personalizacionHidratada, setPersonalizacionHidratada] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    if (!aviso) return;
    const temporizador = window.setTimeout(() => setAviso(null), 4500);
    return () => window.clearTimeout(temporizador);
  }, [aviso]);

  useEffect(() => {
    try {
      const guardada = window.localStorage.getItem(CLAVE_PERSONALIZACION);
      if (guardada) {
        const datos = JSON.parse(guardada) as { preset?: string; nombre?: string; vertical?: string; apagadas?: unknown };
        if (datos.preset && datos.preset in BRAND_PRESETS) setPreset(datos.preset as BrandPreset);
        if (typeof datos.nombre === "string") setNombre(datos.nombre.slice(0, 40));
        if (VERTICALES.some((giro) => giro.id === datos.vertical)) setVertical(datos.vertical as DemoVertical);
        if (Array.isArray(datos.apagadas)) setApagadas(new Set(datos.apagadas.filter((clave): clave is string => typeof clave === "string")));
      }
    } catch {
      window.localStorage.removeItem(CLAVE_PERSONALIZACION);
    } finally {
      setPersonalizacionHidratada(true);
    }
  }, []);

  useEffect(() => {
    if (!personalizacionHidratada) return;
    try {
      window.localStorage.setItem(CLAVE_PERSONALIZACION, JSON.stringify({ preset, nombre, vertical, apagadas: [...apagadas] }));
    } catch {
      // La demo sigue funcionando aunque el navegador bloquee el almacenamiento local.
    }
  }, [apagadas, nombre, personalizacionHidratada, preset, vertical]);

  useEffect(() => {
    if (apagadas.has(vista)) setVista("inicio");
  }, [apagadas, vista]);

  const alternar = (clave: string) => setApagadas((prev) => { const sig = new Set(prev); if (sig.has(clave)) sig.delete(clave); else sig.add(clave); return sig; });
  function restablecer() {
    setPreset(PERSONALIZACION_INICIAL.preset);
    setNombre(PERSONALIZACION_INICIAL.nombre);
    setVertical(PERSONALIZACION_INICIAL.vertical);
    setApagadas(new Set());
    setMenu(false);
    setVista("inicio");
    setRecorrido(0);
    setAviso("La demo volvió a su configuración inicial.");
    try {
      window.localStorage.removeItem(CLAVE_PERSONALIZACION);
    } catch {
      // El estado en memoria también se restablece si no hay almacenamiento disponible.
    }
  }
  const personalizacion: Personalizacion = { preset, setPreset, nombre, setNombre, apagadas, alternar, restablecer };
  const navegacion = NAVEGACION_DEMO.filter((item) => !apagadas.has(item.vista));
  const pasosRecorrido = PASOS_RECORRIDO.filter((paso) => !apagadas.has(paso.vista));
  const paleta = BRAND_PRESETS[preset];
  const estiloMarca = { ...variablesMarca({ nombre: paleta.nombre, logo: null, colorPrimario: paleta.primario, colorAcento: paleta.acento, preset }), "--brand-primary-foreground-dark": "220 25% 10%" } as CSSProperties;
  const tituloVista = useMemo(() => NAVEGACION_DEMO.find((item) => item.vista === vista)?.etiqueta ?? "Inicio", [vista]);

  function irA(nuevaVista: DemoVista) {
    setVista(apagadas.has(nuevaVista) ? "inicio" : nuevaVista);
    setMenu(false);
  }

  function iniciarRecorrido() {
    setRecorrido(0);
    setVista(pasosRecorrido[0].vista);
  }

  function moverRecorrido(direccion: 1 | -1) {
    if (recorrido == null) return;
    const siguiente = recorrido + direccion;
    if (siguiente >= pasosRecorrido.length) {
      setRecorrido(null);
      return;
    }
    const valido = Math.max(0, siguiente);
    setRecorrido(valido);
    setVista(pasosRecorrido[valido].vista);
  }

  const grupos = [...new Set(navegacion.map((item) => item.grupo))];
  const sidebar = (
    <aside className="flex h-full w-72 flex-col bg-primary text-primary-foreground">
      <div className="flex h-16 items-center gap-3 border-b border-white/10 px-4">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/15 font-display text-sm font-bold">{iniciales(nombre)}</span>
        <div className="min-w-0 flex-1"><p className="truncate font-display font-bold">{nombre || "Tu negocio"}</p><p className="text-[10px] uppercase tracking-[.15em] text-primary-foreground/60">Demo interactiva</p></div>
        <button onClick={() => setMenu(false)} aria-label="Cerrar menú" className="grid h-9 w-9 place-items-center rounded-lg hover:bg-white/10 md:hidden"><Icono nombre="cerrar" /></button>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {grupos.map((grupo) => (
          <div key={grupo || "inicio"} className="mb-4">
            {grupo && <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[.14em] text-primary-foreground/60">{grupo}</p>}
            <div className="space-y-1">
              {navegacion.filter((item) => item.grupo === grupo).map((item) => <button key={item.vista} onClick={() => irA(item.vista)} className={`relative flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium transition ${vista === item.vista ? "bg-white/15 text-primary-foreground before:absolute before:-left-3 before:h-6 before:w-1 before:rounded-r-full before:bg-primary-foreground" : "text-primary-foreground/75 hover:bg-white/10 hover:text-primary-foreground"}`}><Icono nombre={item.icono} /><span className="flex-1">{item.etiqueta}</span>{item.vista === "chat" && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-white px-1 text-[10px] font-bold text-primary">3</span>}</button>)}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3"><div className="flex items-center gap-3 rounded-xl p-2"><span className="grid h-9 w-9 place-items-center rounded-full bg-white/15 text-xs font-bold">JD</span><div><p className="text-sm font-semibold">Julio Demo</p><p className="text-[11px] text-primary-foreground/60">Administrador</p></div></div></div>
    </aside>
  );

  return (
    <div className="marca-local min-h-screen bg-background text-foreground" style={estiloMarca}>
      <div className="flex min-h-screen">
        <div className="hidden h-screen shrink-0 md:block">{sidebar}</div>
        {menu && <div className="fixed inset-0 z-50 md:hidden"><button className="absolute inset-0 bg-foreground/45" onClick={() => setMenu(false)} aria-label="Cerrar menú" /><div className="absolute inset-y-0 left-0">{sidebar}</div></div>}

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex min-h-10 items-center justify-between gap-3 border-b bg-primary/5 px-4 py-2 text-xs">
            <p className="flex items-center gap-2 font-semibold"><span className="h-2 w-2 rounded-full bg-success" /> Entorno seguro · datos 100% ficticios</p>
            <div className="flex items-center gap-3"><div className="hidden items-center gap-1.5 sm:flex" role="group" aria-label="Color de marca">{(Object.keys(BRAND_PRESETS) as BrandPreset[]).map((clave) => <button key={clave} type="button" onClick={() => setPreset(clave)} title={BRAND_PRESETS[clave].nombre} aria-label={`Color de marca: ${BRAND_PRESETS[clave].nombre}`} aria-pressed={preset === clave} className={`h-5 w-5 rounded-full border-2 transition hover:scale-110 ${preset === clave ? "border-foreground" : "border-transparent"}`} style={{ background: `linear-gradient(135deg, ${BRAND_PRESETS[clave].primario}, ${BRAND_PRESETS[clave].acento})` }} />)}</div><div className="w-10"><ThemeToggle compact /></div><button onClick={iniciarRecorrido} className="hidden font-bold text-primary hover:underline sm:inline">Reiniciar recorrido</button><Link href="/login" className="font-bold text-primary hover:underline">Ir al acceso real</Link></div>
          </div>
          <header className="flex h-16 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur md:px-6">
            <button onClick={() => setMenu(true)} aria-label="Abrir menú" className="grid h-10 w-10 place-items-center rounded-xl border md:hidden"><Icono nombre="menu" /></button>
            <div className="min-w-0 flex-1"><p className="truncate font-bold">{tituloVista}</p><p className="hidden text-xs text-muted-foreground sm:block">Explora y haz clic: nada se guarda ni se envía.</p></div>
            <button onClick={iniciarRecorrido} className="hidden min-h-10 items-center gap-2 rounded-xl border px-3 text-sm font-semibold hover:bg-muted lg:inline-flex"><Icono nombre="brillo" className="h-4 w-4 text-primary" /> Recorrido guiado</button>
            {!apagadas.has("embudo") && vista !== "embudo" && <BotonPrimario onClick={() => irA("embudo")}>+ Oportunidad</BotonPrimario>}
          </header>
          <main className="flex-1 overflow-auto p-4 pb-28 md:p-6 md:pb-28 xl:p-8"><div className="mx-auto max-w-[1500px]"><ContenidoVista vista={vista} irA={irA} vertical={vertical} setVertical={setVertical} p={personalizacion} notificar={setAviso} /></div></main>
        </div>
      </div>

      {recorrido != null && pasosRecorrido[recorrido] && (
        <section aria-live="polite" className="fixed inset-x-3 bottom-3 z-40 mx-auto max-w-2xl rounded-2xl border border-primary/20 bg-card/95 p-4 shadow-pop backdrop-blur md:bottom-5">
          <div className="flex items-start gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-foreground">{recorrido + 1}</span><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><p className="text-[10px] font-bold uppercase tracking-[.15em] text-primary">Recorrido · {recorrido + 1} de {pasosRecorrido.length}</p><button onClick={() => setRecorrido(null)} aria-label="Cerrar recorrido" className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground hover:bg-muted"><Icono nombre="cerrar" className="h-4 w-4" /></button></div><h2 className="mt-1 font-bold">{pasosRecorrido[recorrido].titulo}</h2><p className="mt-1 text-xs text-muted-foreground">{pasosRecorrido[recorrido].descripcion}</p><div className="mt-3 flex items-center justify-between"><div className="flex gap-1">{pasosRecorrido.map((_, index) => <span key={index} className={`h-1.5 rounded-full transition-all ${index === recorrido ? "w-6 bg-primary" : "w-1.5 bg-muted"}`} />)}</div><div className="flex gap-2"><button onClick={() => moverRecorrido(-1)} disabled={recorrido === 0} className="min-h-9 rounded-lg border px-3 text-xs font-semibold disabled:opacity-40">Atrás</button><button onClick={() => moverRecorrido(1)} className="min-h-9 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground">{recorrido === pasosRecorrido.length - 1 ? "Terminar" : "Siguiente"}</button></div></div></div></div>
        </section>
      )}
      {aviso && <AvisoDemo mensaje={aviso} cerrar={() => setAviso(null)} />}
    </div>
  );
}
