"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Toaster } from "@/components/Toaster";
import { PushSetup } from "@/components/PushSetup";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CommandPalette } from "@/components/CommandPalette";
import type { BrandConfig } from "@/lib/brand";

type NavItem = {
  href: string;
  label: string;
  icon: string | string[];
  soloAdmin?: boolean;
  contador?: "noLeidos" | "tareasVencidas";
};
type NavGrupo = { titulo?: string; items: NavItem[] };
type Contadores = { noLeidos: number; tareasVencidas: number };

const INICIO: NavItem = {
  href: "/",
  label: "Inicio",
  icon: "M3 12l9-9 9 9M5 10v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V10",
};
const CHAT: NavItem = {
  href: "/chat",
  label: "Chat",
  contador: "noLeidos",
  icon: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
};
const EMBUDOS: NavItem = {
  href: "/embudos",
  label: "Embudos",
  icon: "M3 5h18l-7 8v5l-4 2v-7z",
};
const TAREAS: NavItem = {
  href: "/tareas",
  label: "Tareas",
  contador: "tareasVencidas",
  icon: "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
};
const GRUPOS: NavGrupo[] = [
  { items: [INICIO] },
  {
    titulo: "Conversaciones",
    items: [
      CHAT,
      {
        href: "/personal",
        label: "Personal",
        icon:
          "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06" +
          "a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78" +
          " 1.06-1.06a5.5 5.5 0 0 0 0-7.78z",
      },
    ],
  },
  {
    titulo: "Ventas",
    items: [
      EMBUDOS,
      {
        href: "/contactos",
        label: "Contactos",
        icon: "M20 21a8 8 0 0 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
      },
      TAREAS,
    ],
  },
  {
    titulo: "Gestión",
    items: [
      {
        href: "/difusion",
        label: "Difusión",
        icon: "M3 11v2l13 4V7L3 11zM16 9a3 3 0 0 1 0 6",
        soloAdmin: true,
      },
      {
        href: "/configuracion",
        label: "Configuración",
        soloAdmin: true,
        icon: [
          "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
          "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83" +
            "l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21" +
            "a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33" +
            "l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82" +
            " 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9" +
            "a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06" +
            "a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09" +
            "a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06" +
            "a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9" +
            "a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09" +
            "a1.65 1.65 0 0 0-1.51 1z",
        ],
      },
    ],
  },
];
const MOVIL = [INICIO, CHAT, EMBUDOS, TAREAS];

function Icono({
  d,
  className = "h-5 w-5 shrink-0",
}: {
  d: string | string[];
  className?: string;
}) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {(Array.isArray(d) ? d : [d]).map((p, i) => (
        <path key={i} d={p} />
      ))}
    </svg>
  );
}
function esActivo(href: string, pathname: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function AppShell({
  children,
  usuario,
  marca,
  contadoresIniciales,
}: {
  children: React.ReactNode;
  usuario: { nombre: string; rol: "admin" | "agente" };
  marca: BrandConfig;
  contadoresIniciales: Contadores;
}) {
  const pathname = usePathname();
  const [drawer, setDrawer] = useState(false);
  const [colapsada, setColapsada] = useState(false);
  const [usuarioAbierto, setUsuarioAbierto] = useState(false);
  const [paleta, setPaleta] = useState(false);
  const [contadores, setContadores] = useState(contadoresIniciales);
  const [modulos, setModulos] = useState<NavItem[]>([]);
  const visible = (item: NavItem) => !item.soloAdmin || usuario.rol === "admin";
  // Zona fija: el servidor corre en UTC y el navegador en hora local; si no coinciden,
  // React marca error de hidratación (#418) y el saludo sale mal.
  // ponytail: zona de México fija; tomarla de los ajustes de la org si hay clientes en otras zonas.
  const zona = "America/Mexico_City";
  const fecha = new Intl.DateTimeFormat("es-MX", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: zona,
  }).format(new Date());
  const hora = Number(
    new Intl.DateTimeFormat("es-MX", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: zona,
    }).format(new Date()),
  );
  const saludo =
    hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches";

  useEffect(() => {
    setColapsada(localStorage.getItem("ambar-sidebar") === "compacta");
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaleta(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    fetch("/api/modulos")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) =>
        setModulos(
          (d?.modulos ?? [])
            .filter((m: any) => m.activo)
            .map((m: any) => ({
              href: m.ruta,
              label: m.nombre,
              icon: m.icono,
            })),
        ),
      );
  }, []);

  useEffect(() => {
    let activo = true;
    const refrescar = async () => {
      const res = await fetch("/api/shell");
      if (activo && res.ok) setContadores(await res.json());
    };
    const timer = window.setInterval(refrescar, 30000);
    const stream = new EventSource("/api/stream");
    stream.onmessage = refrescar;
    window.addEventListener("focus", refrescar);
    return () => {
      activo = false;
      clearInterval(timer);
      stream.close();
      window.removeEventListener("focus", refrescar);
    };
  }, []);

  function alternarSidebar() {
    setColapsada((actual) => {
      localStorage.setItem("ambar-sidebar", actual ? "amplia" : "compacta");
      return !actual;
    });
  }

  const renderSidebar = (movil = false) => (
    <aside
      className={[
        "flex h-full flex-col bg-primary text-primary-foreground",
        "transition-[width] duration-200",
        movil ? "w-72" : colapsada ? "w-20" : "w-64",
      ].join(" ")}
    >
      <div
        className={[
          "flex h-16 items-center gap-3 border-b border-white/10",
          colapsada && !movil ? "justify-center px-2" : "px-4",
        ].join(" ")}
      >
        {marca.logo ? (
          <Image
            unoptimized
            width={38}
            height={38}
            src={marca.logo}
            alt=""
            className="h-10 w-10 shrink-0 rounded-xl bg-white/90 object-contain p-1"
          />
        ) : (
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/15 font-display font-bold">
            {marca.nombre[0]}
          </span>
        )}
        {(!colapsada || movil) && (
          <span className="min-w-0 flex-1 truncate font-display font-bold">
            {marca.nombre}
          </span>
        )}
        {!movil && (
          <button
            onClick={alternarSidebar}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg hover:bg-white/10"
            aria-label={colapsada ? "Expandir menú" : "Contraer menú"}
          >
            <span
              className={`transition-transform ${colapsada ? "rotate-180" : ""}`}
            >
              ‹
            </span>
          </button>
        )}
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {[
          ...GRUPOS,
          ...(modulos.length ? [{ titulo: "Módulos", items: modulos }] : []),
        ].map((grupo, gi) => (
          <div key={gi} className="space-y-1">
            {grupo.titulo && (!colapsada || movil) && (
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[.14em] text-white/50">
                {grupo.titulo}
              </p>
            )}
            {grupo.items.filter(visible).map((item) => {
              const activo = esActivo(item.href, pathname);
              const badge = item.contador ? contadores[item.contador] : 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setDrawer(false)}
                  title={colapsada && !movil ? item.label : undefined}
                  aria-current={activo ? "page" : undefined}
                  className={[
                    "relative flex min-h-11 items-center gap-3 rounded-xl",
                    "px-3 text-sm font-medium transition-colors",
                    activo
                      ? [
                          "bg-white/15 text-white before:absolute",
                          "before:-left-3 before:h-6 before:w-1",
                          "before:rounded-r-full before:bg-white",
                        ].join(" ")
                      : "text-white/75 hover:bg-white/10 hover:text-white",
                  ].join(" ")}
                >
                  <Icono d={item.icon} />
                  {(!colapsada || movil) && (
                    <span className="flex-1">{item.label}</span>
                  )}
                  {badge > 0 && (
                    <span
                      className={[
                        "tnum grid h-5 min-w-5 place-items-center rounded-full",
                        "bg-white px-1 text-[10px] font-bold text-primary",
                        colapsada && !movil
                          ? "absolute right-0.5 top-0.5"
                          : "",
                      ].join(" ")}
                    >
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3">
        <button
          onClick={() => setUsuarioAbierto(!usuarioAbierto)}
          className={[
            "flex min-h-11 w-full items-center gap-3 rounded-xl",
            "p-2 text-left hover:bg-white/10",
            colapsada && !movil ? "justify-center" : "",
          ].join(" ")}
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/15 text-xs font-bold">
            {usuario.nombre.slice(0, 2).toUpperCase()}
          </span>
          {(!colapsada || movil) && (
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">
                {usuario.nombre}
              </span>
              <span className="block text-[11px] capitalize text-white/60">
                {usuario.rol}
              </span>
            </span>
          )}
        </button>
        {usuarioAbierto && (
          <div className="mt-2 rounded-xl bg-card p-1 text-foreground shadow-pop">
            <ThemeToggle />
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className={[
                "flex min-h-10 w-full items-center rounded-lg px-3 text-sm",
                "text-muted-foreground hover:bg-muted hover:text-foreground",
              ].join(" ")}
            >
              Cerrar sesión
            </button>
          </div>
        )}
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <div className="hidden md:block">{renderSidebar()}</div>
      {drawer && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            className="absolute inset-0 bg-foreground/40"
            aria-label="Cerrar menú"
            onClick={() => setDrawer(false)}
          />
          <div className="absolute inset-y-0 left-0">{renderSidebar(true)}</div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center gap-3 border-b bg-card/95 px-4 backdrop-blur md:px-6">
          <button
            onClick={() => setDrawer(true)}
            className="grid h-10 w-10 place-items-center rounded-lg hover:bg-muted md:hidden"
            aria-label="Abrir menú"
          >
            <Icono d="M4 6h16M4 12h16M4 18h16" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold md:text-base">
              {saludo}, {usuario.nombre.split(" ")[0]}
            </p>
            <p className="hidden text-xs capitalize text-muted-foreground sm:block">
              {fecha}
            </p>
          </div>
          <button
            onClick={() => setPaleta(true)}
            className={[
              "hidden h-10 min-w-56 items-center gap-2 rounded-xl border",
              "bg-background px-3 text-left text-sm text-muted-foreground",
              "shadow-soft hover:border-primary/40 md:flex",
            ].join(" ")}
          >
            <Icono
              d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15z"
              className="h-4 w-4"
            />
            <span className="flex-1">Buscar…</span>
            <kbd className="rounded border bg-card px-1.5 py-0.5 text-[10px]">
              ⌘K
            </kbd>
          </button>
          <Link
            href="/embudos?nueva=1"
            className={[
              "hidden min-h-10 items-center rounded-xl bg-primary px-4",
              "text-sm font-semibold text-primary-foreground shadow-glow",
              "hover:opacity-90 sm:flex",
            ].join(" ")}
          >
            Nueva oportunidad
          </Link>
        </header>
        <main className="flex-1 overflow-auto pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
          {children}
        </main>
        <nav
          className={[
            "fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t",
            "bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur",
            "md:hidden",
          ].join(" ")}
        >
          {(modulos.length ? [...MOVIL.slice(0, 3), modulos[0]] : MOVIL).map(
            (item) => {
              const activo = esActivo(item.href, pathname);
              const badge = item.contador ? contadores[item.contador] : 0;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={[
                    "relative flex min-h-14 flex-col items-center",
                    "justify-center gap-0.5 text-[10px] font-medium",
                    activo ? "text-primary" : "text-muted-foreground",
                  ].join(" ")}
                >
                  <Icono d={item.icon} className="h-5 w-5" />
                  {item.label}
                  {badge > 0 && (
                    <span
                      className={[
                        "tnum absolute right-1/4 top-1 grid h-4 min-w-4",
                        "place-items-center rounded-full bg-destructive",
                        "px-1 text-[9px] text-white",
                      ].join(" ")}
                    >
                      {badge > 99 ? "99+" : badge}
                    </span>
                  )}
                </Link>
              );
            },
          )}
          <button
            onClick={() => setDrawer(true)}
            className={[
              "flex min-h-14 flex-col items-center justify-center gap-0.5",
              "text-[10px] font-medium text-muted-foreground",
            ].join(" ")}
          >
            <Icono d="M4 6h16M4 12h16M4 18h16" className="h-5 w-5" />
            Más
          </button>
        </nav>
      </div>
      <CommandPalette abierto={paleta} onClose={() => setPaleta(false)} />
      <Toaster />
      <PushSetup />
    </div>
  );
}
