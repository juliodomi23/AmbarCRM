"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [org, setOrg] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  // La liga que se comparte al cliente trae su org: /login?org=clinica-x
  useEffect(() => {
    const o = new URLSearchParams(window.location.search).get("org");
    if (o) setOrg(o);
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setCargando(true);
    const res = await signIn("credentials", {
      email,
      password,
      ...(org.trim() ? { orgSlug: org.trim().toLowerCase() } : {}),
      redirect: false
    });
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
          <h1 className="text-2xl font-bold text-navy">
            Ambar<span className="text-ambar">CRM</span>
          </h1>
          <p className="text-sm text-slate-500">Tus ventas y tu WhatsApp, en un solo lugar</p>
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

        <div className="space-y-1">
          <label htmlFor="org" className="text-sm font-medium text-slate-600">
            Organización <span className="font-normal text-slate-400">(opcional)</span>
          </label>
          <input
            id="org"
            type="text"
            value={org}
            onChange={(e) => setOrg(e.target.value)}
            placeholder="Solo si te dieron una"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:ring-2 focus:ring-navy/40"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}. Revisa tu correo y contraseña.
          </p>
        )}

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
