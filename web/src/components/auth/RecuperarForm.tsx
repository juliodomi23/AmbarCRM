"use client";

import { useState } from "react";
import { Boton, Campo } from "@/components/ui";

export function RecuperarForm({ orgInicial }: { orgInicial: string }) {
  const [org, setOrg] = useState(orgInicial);
  const [email, setEmail] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [error, setError] = useState("");

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setOcupado(true);
    setError("");
    try {
      const respuesta = await fetch("/api/auth/recuperar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ org, email }) });
      if (!respuesta.ok) throw new Error();
      const datos = await respuesta.json();
      setMensaje(datos.mensaje);
    } catch {
      setError("No se pudo procesar la solicitud. Inténtalo de nuevo.");
    } finally {
      setOcupado(false);
    }
  }

  if (mensaje) return <p role="status" className="text-sm text-muted-foreground">{mensaje}</p>;
  return (
    <form onSubmit={enviar} className="space-y-4">
      <p className="text-sm text-muted-foreground">Escribe la organización y el correo que usas para entrar.</p>
      <Campo label="Organización" name="org" autoComplete="organization" required maxLength={100} value={org} onChange={(evento) => setOrg(evento.target.value)} />
      <Campo label="Correo electrónico" name="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(evento) => setEmail(evento.target.value)} />
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Boton type="submit" disabled={ocupado} className="w-full">{ocupado ? "Enviando…" : "Enviar instrucciones"}</Boton>
    </form>
  );
}
