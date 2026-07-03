"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Toaster } from "@/components/Toaster";
import { PushSetup } from "@/components/PushSetup";

type NavItem = { href: string; label: string; icon: string | string[]; soloAdmin?: boolean };
type NavGrupo = { titulo?: string; items: NavItem[] };

const INICIO: NavItem = { href: "/", label: "Inicio", icon: "M3 12l9-9 9 9M5 10v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V10" };
const CHAT: NavItem = { href: "/chat", label: "Chat", icon: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" };
const EMBUDOS: NavItem = { href: "/embudos", label: "Embudos", icon: "M3 5h18l-7 8v5l-4 2v-7z" };
const TAREAS: NavItem = { href: "/tareas", label: "Tareas", icon: "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" };

// Menú completo, agrupado para reducir la carga visual del cliente.
const GRUPOS: NavGrupo[] = [
  { items: [INICIO] },
  {
    titulo: "Conversaciones",
    items: [
      CHAT,
      { href: "/grupos", label: "Grupos", icon: "M17 20h5v-2a4 4 0 0 0-3-3.87M9 20H4v-2a4 4 0 0 1 3-3.87m6-1.13a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 11a4 4 0 0 0-3-3.87M1 11a4 4 0 0 1 3-3.87" },
      { href: "/personal", label: "Personal", icon: "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" }
    ]
  },
  {
    titulo: "Ventas",
    items: [
      EMBUDOS,
      { href: "/contactos", label: "Contactos", icon: "M20 21a8 8 0 0 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" },
      TAREAS
    ]
  },
  {
    titulo: "Administración",
    items: [
      { href: "/difusion", label: "Difusión", icon: "M3 11v2l13 4V7L3 11zM16 9a3 3 0 0 1 0 6", soloAdmin: true },
      {
        href: "/configuracion",
        label: "Configuración",
        soloAdmin: true,
        icon: [
          "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
          "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
        ]
      }
    ]
  }
];

// Lo más usado por el cliente, accesible a un toque en móvil (la barra inferior).
const MOVIL_PRIMARIOS: NavItem[] = [INICIO, CHAT, EMBUDOS, TAREAS];

function Icono({ d, className = "h-5 w-5 shrink-0" }: { d: string | string[]; className?: string }) {
  const paths = Array.isArray(d) ? d : [d];
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      {paths.map((p, i) => <path key={i} d={p} />)}
    </svg>
  );
}

function esActivo(href: string, pathname: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function AppShell({
  children,
  usuario,
  tareasPendientes = 0
}: {
  children: React.ReactNode;
  usuario: { nombre: string; rol: "admin" | "agente" };
  tareasPendientes?: number;
}) {
  const pathname = usePathname();
  const [abierto, setAbierto] = useState(false);
  const visible = (n: NavItem) => !n.soloAdmin || usuario.rol === "admin";

  const Sidebar = (
    <aside className="flex h-full w-64 flex-col bg-navy text-white">
      <div className="px-5 py-5 text-xl font-bold">
        Ambar<span className="text-amber-400">CRM</span>
      </div>
      <nav className="flex-1 space-y-4 overflow-y-auto px-3 pb-4">
        {GRUPOS.map((grupo, gi) => {
          const items = grupo.items.filter(visible);
          if (items.length === 0) return null;
          return (
            <div key={gi} className="space-y-1">
              {grupo.titulo && (
                <p className="px-3 pt-1 text-[11px] font-semibold uppercase tracking-wider text-white/40">{grupo.titulo}</p>
              )}
              {items.map((n) => {
                const activo = esActivo(n.href, pathname);
                const badge = n.href === "/tareas" && tareasPendientes > 0 ? tareasPendientes : 0;
                return (
                  <Link
                    key={n.href}
                    href={n.href}
                    onClick={() => setAbierto(false)}
                    aria-current={activo ? "page" : undefined}
                    className={`relative flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                      activo
                        ? "bg-white/15 text-white before:absolute before:left-0 before:top-1/2 before:h-5 before:w-1 before:-translate-y-1/2 before:rounded-r before:bg-amber-400"
                        : "text-white/80 hover:bg-white/10 hover:text-white"
                    }`}
                  >
                    <Icono d={n.icon} />
                    <span className="flex-1">{n.label}</span>
                    {badge > 0 && (
                      <span className="grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                        {badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>
      <div className="border-t border-white/10 p-4">
        <div className="mb-2 text-sm">
          <p className="font-medium">{usuario.nombre}</p>
          <p className="text-xs text-white/70 capitalize">{usuario.rol}</p>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-full cursor-pointer rounded-lg bg-white/10 py-2.5 text-sm hover:bg-white/20 min-h-[44px]"
        >
          Cerrar sesión
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar fijo en desktop */}
      <div className="hidden md:block">{Sidebar}</div>

      {/* Drawer móvil (botón "Más") */}
      {abierto && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setAbierto(false)} />
          <div className="absolute left-0 top-0 h-full">{Sidebar}</div>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 md:hidden">
          <span className="font-bold text-navy">Ambar<span className="text-ambar">CRM</span></span>
        </header>

        {/* pb para que la barra inferior no tape el contenido en móvil (+ safe-area iOS) */}
        <main className="flex-1 overflow-auto pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">{children}</main>

        {/* Barra inferior de pestañas (solo móvil) */}
        <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
          {MOVIL_PRIMARIOS.map((n) => {
            const activo = esActivo(n.href, pathname);
            const badge = n.href === "/tareas" && tareasPendientes > 0 ? tareasPendientes : 0;
            return (
              <Link
                key={n.href}
                href={n.href}
                aria-current={activo ? "page" : undefined}
                className={`relative flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium ${
                  activo ? "text-navy" : "text-slate-500"
                }`}
              >
                <Icono d={n.icon} className="h-5 w-5" />
                {n.label}
                {badge > 0 && (
                  <span className="absolute right-1/4 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                    {badge}
                  </span>
                )}
              </Link>
            );
          })}
          <button
            onClick={() => setAbierto(true)}
            className="flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium text-slate-500"
            aria-label="Más opciones"
          >
            <Icono d="M4 6h16M4 12h16M4 18h16" className="h-5 w-5" />
            Más
          </button>
        </nav>
      </div>
      <Toaster />
      <PushSetup />
    </div>
  );
}
