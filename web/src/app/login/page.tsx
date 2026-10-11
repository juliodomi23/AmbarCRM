"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import Image from "next/image";
import { BrandRuntime } from "@/components/BrandRuntime";
import { DEFAULT_BRAND, BrandConfig } from "@/lib/brand";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verPassword, setVerPassword] = useState(false);
  const [org, setOrg] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const [marca, setMarca] = useState<BrandConfig>(DEFAULT_BRAND);

  // La liga que se comparte al cliente trae su org: /login?org=clinica-x
  useEffect(() => {
    const queryOrg = new URLSearchParams(window.location.search).get("org");
    const subdominio = window.location.hostname.split(".").length > 2 ? window.location.hostname.split(".")[0] : "";
    const o = queryOrg || subdominio;
    if (o) {
      setOrg(o);
      fetch(`/api/public/brand?slug=${encodeURIComponent(o)}`)
        .then((res) => res.ok ? res.json() : DEFAULT_BRAND)
        .then(setMarca)
        .catch(() => setMarca(DEFAULT_BRAND));
    }
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
    // Carga completa: el layout raíz se vuelve a renderizar con la sesión y aplica la marca de la org.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- recarga completa a propósito
    else window.location.assign("/embudos");
  }

  return (
    <div className="min-h-screen grid place-items-center bg-mesh bg-background px-4">
      <BrandRuntime marca={marca} />
      <form
        onSubmit={onSubmit}
        className="surface surface-pop animate-fade-up w-full max-w-sm space-y-5 rounded-2xl p-6 sm:p-8"
      >
        <div className="text-center">
          {marca.logo ? <Image unoptimized width={192} height={56} src={marca.logo} alt={`Logo de ${marca.nombre}`} className="mx-auto mb-3 h-14 max-w-48 object-contain" /> : null}
          <h1 className="text-2xl font-bold text-primary">{marca.nombre}</h1>
          <p className="text-sm text-muted-foreground">Tus ventas y tu WhatsApp, en un solo lugar</p>
        </div>

        <div className="space-y-1">
          <label htmlFor="email" className="text-sm font-medium text-muted-foreground">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground px-3 py-2 outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        <div className="space-y-1">
          <label htmlFor="password" className="text-sm font-medium text-muted-foreground">Contraseña</label>
          <div className="relative">
            <input
              id="password"
              type={verPassword ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground px-3 py-2 pr-10 outline-none focus:ring-2 focus:ring-primary/40"
            />
            <button
              type="button"
              onClick={() => setVerPassword(!verPassword)}
              aria-label={verPassword ? "Ocultar contraseña" : "Ver contraseña"}
              className="absolute inset-y-0 right-0 grid w-10 place-items-center text-muted-foreground hover:text-foreground"
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
          <label htmlFor="org" className="text-sm font-medium text-muted-foreground">
            Organización <span className="font-normal text-muted-foreground">(opcional)</span>
          </label>
          <input
            id="org"
            type="text"
            value={org}
            onChange={(e) => setOrg(e.target.value)}
            placeholder="Solo si te dieron una"
            className="w-full rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground px-3 py-2 outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}. Revisa tu correo y contraseña.
          </p>
        )}

        <button
          type="submit"
          disabled={cargando}
          className="w-full rounded-lg bg-primary py-2.5 font-medium text-primary-foreground transition duration-150 hover:bg-primary/90 hover:shadow-glow active:scale-[.99] disabled:opacity-60"
        >
          {cargando ? "Entrando…" : "Entrar"}
        </button>

        <div className="relative flex items-center gap-3 py-1">
          <span className="h-px flex-1 bg-border" />
          <span className="text-[10px] font-semibold uppercase tracking-[.14em] text-muted-foreground">
            ¿Quieres conocerlo primero?
          </span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <Link
          href="/demo"
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-primary/25 bg-primary/5 px-4 text-sm font-semibold text-primary transition hover:border-primary/50 hover:bg-primary/10"
        >
          Explorar demo interactiva
          <span aria-hidden="true">→</span>
        </Link>
        <p className="text-center text-xs text-muted-foreground">
          Sin registro · datos ficticios · 22 módulos
        </p>

        {/* Marca de versión: si en producción no coincide con el último push, el deploy no corrió. */}
        <p className="text-center text-[10px] text-muted-foreground/60">v2026-07-04</p>
      </form>
    </div>
  );
}
