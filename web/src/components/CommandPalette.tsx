"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Resultado = {
  id: string;
  tipo: string;
  titulo: string;
  detalle: string;
  href: string;
};
const accesos = [
  ["Inicio", "/"],
  ["Chat", "/chat"],
  ["Embudos", "/embudos"],
  ["Contactos", "/contactos"],
  ["Tareas", "/tareas"],
  ["Difusión", "/difusion"],
  ["Configuración", "/configuracion"],
  ["Nuevo contacto", "/contactos?nuevo=1"],
  ["Nueva oportunidad", "/embudos?nueva=1"],
  ["Nueva tarea", "/tareas?nueva=1"],
] as const;

export function CommandPalette({
  abierto,
  onClose,
}: {
  abierto: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<Resultado[]>([]);
  const [cargando, setCargando] = useState(false);
  const [modulos, setModulos] = useState<[string, string][]>([]);
  useEffect(() => {
    if (abierto)
      fetch("/api/modulos")
        .then((r) => r.json())
        .then((d) =>
          setModulos(
            (d.modulos ?? [])
              .filter((m: any) => m.activo)
              .map((m: any) => [m.nombre, m.ruta]),
          ),
        );
  }, [abierto]);

  useEffect(() => {
    if (!abierto) {
      setQ("");
      setResultados([]);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [abierto, onClose]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResultados([]);
      return;
    }
    setCargando(true);
    const timer = window.setTimeout(async () => {
      const res = await fetch(`/api/buscar?q=${encodeURIComponent(q.trim())}`);
      const data = res.ok ? await res.json() : { resultados: [] };
      setResultados(data.resultados);
      setCargando(false);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [q]);

  if (!abierto) return null;
  const ir = (href: string) => {
    onClose();
    router.push(href);
  };
  const filtrados = [...accesos, ...modulos].filter(
    ([nombre]) => !q || nombre.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div
      className="fixed inset-0 z-[70] flex items-start justify-center bg-foreground/35 px-4 pt-[12vh] backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Paleta de comandos"
        onMouseDown={(e) => e.stopPropagation()}
        className="surface-pop w-full max-w-xl overflow-hidden rounded-2xl border bg-card animate-pop"
      >
        <div className="flex items-center gap-3 border-b px-4">
          <svg
            className="h-5 w-5 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Busca contactos, conversaciones o pantallas…"
            className="h-14 flex-1 bg-transparent text-sm outline-none"
          />
          <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            ESC
          </kbd>
        </div>
        <div className="max-h-[55vh] overflow-y-auto p-2">
          {cargando && (
            <div className="space-y-2 p-2">
              <div className="skeleton h-10" />
              <div className="skeleton h-10" />
            </div>
          )}
          {!cargando &&
            resultados.map((r) => (
              <button
                key={r.id}
                onClick={() => ir(r.href)}
                className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left hover:bg-muted"
              >
                <span className="rounded bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary">
                  {r.tipo}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {r.titulo}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {r.detalle}
                  </span>
                </span>
              </button>
            ))}
          {!cargando && filtrados.length > 0 && (
            <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Navegación y acciones
            </p>
          )}
          {!cargando &&
            filtrados.map(([nombre, href]) => (
              <button
                key={nombre}
                onClick={() => ir(href)}
                className={[
                  "flex min-h-10 w-full items-center justify-between",
                  "rounded-lg px-3 text-left text-sm hover:bg-muted",
                ].join(" ")}
              >
                <span>{nombre}</span>
                <span className="text-muted-foreground">↗</span>
              </button>
            ))}
          {!cargando &&
            q.length >= 2 &&
            resultados.length === 0 &&
            filtrados.length === 0 && (
              <p className="p-8 text-center text-sm text-muted-foreground">
                No encontramos resultados para “{q}”.
              </p>
            )}
        </div>
      </section>
    </div>
  );
}
