"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Boton, Campo, EncabezadoPagina } from "@/components/ui";
import { toast } from "@/components/Toaster";

type Perfil = { nombre: string; email: string; rol: string; puesto: string };

async function enviar(url: string, method: string, body: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const d = await res.json().catch(() => ({}));
  return { ok: res.ok, error: (d.error as string | undefined) ?? "No se pudo guardar" };
}

export function PerfilCliente({ perfil }: { perfil: Perfil }) {
  const router = useRouter();
  const { update } = useSession();
  const [nombre, setNombre] = useState(perfil.nombre);
  const [email, setEmail] = useState(perfil.email);
  const [actualCorreo, setActualCorreo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repetida, setRepetida] = useState("");

  const cambiaCorreo = email.trim().toLowerCase() !== perfil.email;

  async function guardarDatos(e: React.FormEvent) {
    e.preventDefault();
    setGuardando(true);
    const r = await enviar("/api/cuenta/perfil", "PATCH", { nombre, email, actual: actualCorreo });
    setGuardando(false);
    if (!r.ok) return toast(r.error, "error");
    setActualCorreo("");
    await update();
    router.refresh();
    toast("Perfil actualizado");
  }

  async function guardarPassword(e: React.FormEvent) {
    e.preventDefault();
    if (nueva !== repetida) return toast("Las contraseñas nuevas no coinciden", "error");
    setGuardando(true);
    const r = await enviar("/api/cuenta/password", "POST", { actual, nueva });
    setGuardando(false);
    if (!r.ok) return toast(r.error, "error");
    setActual("");
    setNueva("");
    setRepetida("");
    toast("Contraseña actualizada");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <EncabezadoPagina titulo="Mi perfil" descripcion="Tus datos de acceso y cómo te ve tu equipo." />

      <form onSubmit={guardarDatos} className="surface space-y-4 p-5">
        <h2 className="text-base font-semibold text-foreground">Datos personales</h2>
        <Campo label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={80} required />
        <Campo label="Correo" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        {cambiaCorreo && (
          <Campo
            label="Contraseña actual (para confirmar el cambio de correo)"
            type="password"
            autoComplete="current-password"
            value={actualCorreo}
            onChange={(e) => setActualCorreo(e.target.value)}
            required
          />
        )}
        <p className="text-xs text-muted-foreground">
          Rol: <span className="capitalize">{perfil.rol}</span>
          {perfil.puesto ? ` · Puesto: ${perfil.puesto}` : ""}. Los cambia un administrador.
        </p>
        <Boton type="submit" disabled={guardando}>Guardar cambios</Boton>
      </form>

      <form onSubmit={guardarPassword} className="surface space-y-4 p-5">
        <h2 className="text-base font-semibold text-foreground">Contraseña</h2>
        <Campo label="Contraseña actual" type="password" autoComplete="current-password" value={actual} onChange={(e) => setActual(e.target.value)} required />
        <Campo label="Contraseña nueva (mínimo 8 caracteres)" type="password" autoComplete="new-password" minLength={8} value={nueva} onChange={(e) => setNueva(e.target.value)} required />
        <Campo label="Repite la contraseña nueva" type="password" autoComplete="new-password" minLength={8} value={repetida} onChange={(e) => setRepetida(e.target.value)} required />
        <Boton type="submit" disabled={guardando}>Cambiar contraseña</Boton>
      </form>
    </div>
  );
}
