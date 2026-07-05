"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verPassword, setVerPassword] = useState(false);
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
          <div className="relative">
            <input
              id="password"
              type={verPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-300 px-3 py-2 pr-10 outline-none focus:ring-2 focus:ring-navy/40"
            />
            <button
              type="button"
              onClick={() => setVerPassword(!verPassword)}
              aria-label={verPassword ? "Ocultar contraseña" : "Ver contraseña"}
              className="absolute inset-y-0 right-0 grid w-10 place-items-center text-slate-400 hover:text-slate-600"
            >
              {verPassword ? (
                // ojo tachado
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <path d="M1 1l22 22" />
                </svg>
              ) : (
                // ojo
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
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

        {/* Marca de versión: si en producción no coincide con el último push, el deploy no corrió. */}
        <p className="text-center text-[10px] text-slate-300">v2026-07-04</p>
      </form>
    </div>
  );
}
