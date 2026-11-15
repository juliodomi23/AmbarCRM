"use client";

import { useState } from "react";
import { pantallaInicial } from "@/lib/pantalla-inicial";

export function CambiarPasswordForm({ nombre }: { nombre: string }) {
  const [nueva, setNueva] = useState("");
  const [repetida, setRepetida] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (nueva !== repetida) return setError("Las contraseñas nuevas no coinciden");
    if (nueva.length < 8) return setError("La contraseña debe tener al menos 8 caracteres");
    setCargando(true);
    const res = await fetch("/api/cuenta/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nueva }),
    });
    const datos = await res.json().catch(() => ({}));
    setCargando(false);
    if (!res.ok) return setError(datos.error ?? "No se pudo cambiar la contraseña");
    window.location.assign(await pantallaInicial());
  }

  return (
    <div className="min-h-screen grid place-items-center bg-mesh bg-background px-4">
      <form onSubmit={onSubmit} className="surface surface-pop animate-fade-up w-full max-w-sm space-y-5 rounded-2xl p-6 sm:p-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-primary">Cambia tu contraseña</h1>
          <p className="text-sm text-muted-foreground">Hola{ nombre ? `, ${nombre}` : ""}. Es tu primer acceso: crea una contraseña nueva para continuar.</p>
        </div>

        <div className="space-y-1">
          <label htmlFor="nueva" className="text-sm font-medium text-muted-foreground">Contraseña nueva (mínimo 8 caracteres)</label>
          <input
            id="nueva"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            className="w-full rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground px-3 py-2 outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="repetida" className="text-sm font-medium text-muted-foreground">Repite la contraseña nueva</label>
          <input
            id="repetida"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={repetida}
            onChange={(e) => setRepetida(e.target.value)}
            className="w-full rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground px-3 py-2 outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={cargando}
          className="w-full rounded-lg bg-primary py-2.5 font-medium text-primary-foreground transition duration-150 hover:bg-primary/90 hover:shadow-glow active:scale-[.99] disabled:opacity-60"
        >
          {cargando ? "Guardando." : "Cambiar contraseña"}
        </button>
      </form>
    </div>
  );
}
