"use client";

import { useState } from "react";
import Link from "next/link";
import { Boton, Campo } from "@/components/ui";

export function RestablecerForm({ token }: { token: string }) {
  const [nueva, setNueva] = useState("");
  const [repetida, setRepetida] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [completo, setCompleto] = useState(false);
  const [error, setError] = useState("");

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setError("");
    if (nueva !== repetida) return setError("Las contraseñas no coinciden.");
    setOcupado(true);
    try {
      const respuesta = await fetch("/api/auth/restablecer", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, nueva }) });
      const datos = await respuesta.json();
      if (!respuesta.ok) return setError(datos.error ?? "No se pudo cambiar la contraseña.");
      setNueva("");
      setRepetida("");
      setCompleto(true);
    } catch {
      setError("No se pudo cambiar la contraseña. Inténtalo de nuevo.");
    } finally {
      setOcupado(false);
    }
  }

  if (completo) return <p role="status" className="text-sm text-muted-foreground">Tu contraseña fue cambiada. Ya puedes iniciar sesión con la nueva contraseña.</p>;
  return (
    <form onSubmit={enviar} className="space-y-4">
      <Campo label="Contraseña nueva (mínimo 8 caracteres)" name="nueva" type="password" autoComplete="new-password" required minLength={8} value={nueva} onChange={(evento) => setNueva(evento.target.value)} />
      <Campo label="Repite la contraseña nueva" name="repetida" type="password" autoComplete="new-password" required minLength={8} value={repetida} onChange={(evento) => setRepetida(evento.target.value)} />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Boton type="submit" disabled={ocupado} className="w-full">{ocupado ? "Guardando…" : "Cambiar contraseña"}</Boton>
      <Link href="/recuperar" className="block text-center text-sm text-primary hover:underline">Solicitar un enlace nuevo</Link>
    </form>
  );
}
