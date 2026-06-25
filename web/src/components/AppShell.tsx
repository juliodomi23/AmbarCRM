"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { Toaster } from "@/components/Toaster";

type NavItem = { href: string; label: string; icon: string; soloAdmin?: boolean };

const NAV: NavItem[] = [
  { href: "/", label: "Inicio", icon: "M3 12l9-9 9 9M5 10v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V10" },
  { href: "/embudos", label: "Embudos", icon: "M4 5h16M4 12h16M4 19h10" },
  { href: "/chat", label: "Chat", icon: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" },
  { href: "/grupos", label: "Grupos", icon: "M17 20h5v-2a4 4 0 0 0-3-3.87M9 20H4v-2a4 4 0 0 1 3-3.87m6-1.13a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 11a4 4 0 0 0-3-3.87M1 11a4 4 0 0 1 3-3.87" },
  { href: "/personal", label: "Personal", icon: "M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" },
  { href: "/contactos", label: "Contactos", icon: "M17 20h5v-2a4 4 0 0 0-3-3.87M9 20H4v-2a4 4 0 0 1 3-3.87m6-1.13a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" },
  { href: "/tareas", label: "Tareas", icon: "M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" },
  { href: "/difusion", label: "Difusión", icon: "M4 4l16 8-16 8 4-8-4-8z", soloAdmin: true },
  { href: "/configuracion", label: "Configuración", icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z", soloAdmin: true }
];

function Icono({ d }: { d: string }) {
  return (
    <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
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
  const items = NAV.filter((n) => !n.soloAdmin || usuario.rol === "admin");

  const Sidebar = (
    <aside className="flex h-full w-64 flex-col bg-navy text-white">
      <div className="px-5 py-5 text-xl font-bold">AmbarCRM</div>
      <nav className="flex-1 space-y-1 px-3">
        {items.map((n) => {
          const activo = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
          const badge = n.href === "/tareas" && tareasPendientes > 0 ? tareasPendientes : 0;
          return (
            <Link
              key={n.href}
              href={n.href}
              onClick={() => setAbierto(false)}
              className={`flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                activo ? "bg-white/15 text-white" : "text-white/80 hover:bg-white/10 hover:text-white"
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

      {/* Drawer móvil */}
      {abierto && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setAbierto(false)} />
          <div className="absolute left-0 top-0 h-full">{Sidebar}</div>
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4 md:hidden">
          <button onClick={() => setAbierto(true)} aria-label="Menú">
            <Icono d="M4 6h16M4 12h16M4 18h16" />
          </button>
          <span className="font-bold text-navy">AmbarCRM</span>
        </header>
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
      <Toaster />
    </div>
  );
}
