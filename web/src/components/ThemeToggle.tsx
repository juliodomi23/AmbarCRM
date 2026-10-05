"use client";

import { useEffect, useState } from "react";

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [dark, setDark] = useState(false);

  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);

  function toggle() {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("ambar-theme", next ? "dark" : "light");
    setDark(next);
  }

  return (
    <button type="button" onClick={toggle} className="flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" aria-label={dark ? "Activar modo claro" : "Activar modo oscuro"}>
      <span aria-hidden="true">{dark ? "☀" : "☾"}</span>
      {!compact && <span>{dark ? "Modo claro" : "Modo oscuro"}</span>}
    </button>
  );
}
