"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCargando(true);
    const res = await signIn("credentials", { email, password, redirect: false });
    setCargando(false);
    if (res?.error) setError("Credenciales incorrectas");
    else router.push("/embudos");
  }

  return (
    <div className="min-h-screen grid place-items-center bg-navy px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm bg-white rounded-2xl shadow-xl p-8 space-y-5"
      >
        <div className="text-center">
          <h1 className="text-2xl font-bold text-navy">AmbarCRM</h1>
          <p className="text-sm text-slate-500">Inicia sesión para continuar</p>
        </div>

        <div className="space-y-1">
          <label htmlFor="email" className="text-sm font-medium text-slate-600">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-navy/40"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="password" className="text-sm font-medium text-slate-600">Contraseña</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-navy/40"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={cargando}
          className="w-full rounded-lg bg-navy py-2.5 font-medium text-white hover:bg-navy/90 disabled:opacity-60"
        >
          {cargando ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}
