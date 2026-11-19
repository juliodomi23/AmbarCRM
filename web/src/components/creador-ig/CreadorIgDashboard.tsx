"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, EncabezadoPagina } from "@/components/ui";

type CuentaInstagram = {
  id: string;
  nombre: string;
  instagramId: string;
  username: string | null;
};

type PerfilInstagram = {
  username: string;
  followersCount: number;
  mediaCount: number;
  profilePictureUrl: string | null;
};

type MediaInstagram = {
  id: string;
  caption: string | null;
  mediaType: string;
  mediaUrl: string | null;
  thumbnailUrl: string | null;
  permalink: string;
  timestamp: string;
  likeCount: number;
  commentsCount: number;
};

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function fechaCorta(iso: string): string {
  if (!iso) return "";
  const parts = iso.split("T")[0].split("-");
  if (parts.length !== 3) return "";
  const dia = parts[2];
  const mesNum = Number(parts[1]) - 1;
  if (mesNum < 0 || mesNum >= MESES_CORTOS.length) return "";
  return `${dia} ${MESES_CORTOS[mesNum]}`;
}

function resumenCaption(caption: string | null): string {
  if (!caption || !caption.trim()) return "";
  const lines = caption.trim().split("\n").map((l) => l.trim()).filter(Boolean);
  const firstTwo = lines.slice(0, 2).join(" ");
  return firstTwo.length > 100 ? `${firstTwo.slice(0, 97)}…` : firstTwo;
}

export function CreadorIgDashboard() {
  const [cuentas, setCuentas] = useState<CuentaInstagram[]>([]);
  const [cargandoCuentas, setCargandoCuentas] = useState(true);
  const [errorCuentas, setErrorCuentas] = useState("");
  const [cuentaActivaId, setCuentaActivaId] = useState<string | null>(null);
  const [perfil, setPerfil] = useState<PerfilInstagram | null>(null);
  const [media, setMedia] = useState<MediaInstagram[]>([]);
  const [cargandoMedia, setCargandoMedia] = useState(false);
  const [errorMedia, setErrorMedia] = useState("");

  // Load accounts
  useEffect(() => {
    const control = new AbortController();
    setCargandoCuentas(true);
    fetch("/api/creador-ig/cuentas", { signal: control.signal, cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error("No se pudieron cargar las cuentas de Instagram.");
        return (await res.json()) as { cuentas: CuentaInstagram[] };
      })
      .then((resultado) => {
        if (control.signal.aborted) return;
        setCuentas(resultado.cuentas ?? []);
        setCuentaActivaId((resultado.cuentas ?? [])[0]?.id ?? null);
        setErrorCuentas("");
      })
      .catch((e: unknown) => {
        if (!control.signal.aborted) setErrorCuentas(e instanceof Error ? e.message : "No se pudieron cargar las cuentas de Instagram.");
      })
      .finally(() => {
        if (!control.signal.aborted) setCargandoCuentas(false);
      });
    return () => control.abort();
  }, []);

  // Load profile + media for the active account
  useEffect(() => {
    if (!cuentaActivaId) {
      setPerfil(null);
      setMedia([]);
      return;
    }
    const control = new AbortController();
    setCargandoMedia(true);
    setErrorMedia("");
    fetch(`/api/creador-ig/media?canalId=${encodeURIComponent(cuentaActivaId)}`, {
      signal: control.signal,
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("No se pudieron cargar los datos de Instagram.");
        const json = await res.json();
        if (control.signal.aborted) return;
        const resultado = json as { perfil?: PerfilInstagram | null; media: MediaInstagram[] };
        setPerfil(resultado.perfil ?? null);
        setMedia(resultado.media ?? []);
        setErrorMedia("");
      })
      .catch((e: unknown) => {
        if (!control.signal.aborted) setErrorMedia(e instanceof Error ? e.message : "No se pudieron cargar los datos de Instagram.");
      })
      .finally(() => {
        if (!control.signal.aborted) setCargandoMedia(false);
      });
    return () => control.abort();
  }, [cuentaActivaId]);

  if (errorCuentas) {
    return (
      <div className="mx-auto w-full max-w-[1440px] space-y-6 p-4 md:p-6 lg:p-8">
        <EncabezadoPagina eyebrow="Marketing y crecimiento" titulo="Creador IG" descripcion="Contenido y métricas básicas de las cuentas de Instagram conectadas." />
        <div role="alert" className="surface space-y-3 p-6">
          <h2 className="font-semibold">No pudimos cargar las cuentas</h2>
          <p className="text-sm text-muted-foreground">{errorCuentas}</p>
        </div>
      </div>
    );
  }

  if (!cargandoCuentas && cuentas.length === 0) {
    return (
      <div className="mx-auto w-full max-w-[1440px] space-y-6 p-4 md:p-6 lg:p-8">
        <EncabezadoPagina eyebrow="Marketing y crecimiento" titulo="Creador IG" descripcion="Contenido y métricas básicas de las cuentas de Instagram conectadas." />
        <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-border bg-card p-6 text-center">
          <div className="max-w-md">
            <h2 className="text-lg font-semibold">No hay cuentas de Instagram conectadas</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Conecta una cuenta de Instagram desde Configuración para ver su contenido y métricas básicas.
            </p>
            <Link href="/configuracion?tab=canal" className="mt-5 inline-flex rounded-lg bg-primary px-3 py-2 text-sm font-medium hover:bg-primary/90 transition">
              Ir a configurar Instagram
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1440px] space-y-6 p-4 md:p-6 lg:p-8">
      <EncabezadoPagina
        eyebrow="Marketing y crecimiento"
        titulo="Creador IG"
        descripcion="Contenido y métricas básicas de las cuentas de Instagram conectadas."
        acciones={<Badge tono="primary" punto>{cargandoCuentas ? "Cargando..." : "Solo lectura"}</Badge>}
      />

      {/* Account selector */}
      <div className="flex flex-wrap gap-2 mb-3 border-b border-border/70 pb-3">
        {cargandoCuentas ? (
          <div className="text-sm text-muted-foreground">Cargando cuentas…</div>
        ) : (
          <select
            value={cuentaActivaId ?? ""}
            onChange={(e) => setCuentaActivaId(e.target.value)}
            className="rounded-lg border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            <option value="">Selecciona cuenta</option>
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}{c.username ? ` (@${c.username})` : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      {cargandoMedia ? (
        <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">Cargando contenido de Instagram…</div>
      ) : errorMedia ? (
        <div role="alert" className="surface space-y-3 p-6">
          <h2 className="font-semibold">No pudimos cargar el contenido</h2>
          <p className="text-sm text-muted-foreground">{errorMedia}</p>
        </div>
      ) : !cuentaActivaId ? (
        <div className="grid min-h-64 place-items-center rounded-2xl border border-dashed border-border bg-card p-6 text-sm text-muted-foreground">Selecciona una cuenta para ver su contenido.</div>
      ) : (
        <>
          {/* Profile card */}
          {perfil && (
            <section className="surface p-4" aria-label="Perfil de Instagram">
              <div className="flex items-center gap-4">
                {perfil.profilePictureUrl && (
                  <img src={perfil.profilePictureUrl} alt={perfil.username} className="w-12 h-12 rounded-full object-cover" />
                )}
                <div>
                  <p className="text-sm font-medium">{perfil.username}</p>
                  <p className="text-xs text-muted-foreground">{perfil.followersCount} seguidores</p>
                  <p className="text-xs text-muted-foreground">{perfil.mediaCount} publicaciones</p>
                </div>
              </div>
            </section>
          )}

          {/* Empty media message */}
          {!perfil && media.length === 0 && (
            <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed border-border bg-card p-6 text-center">
              <div className="max-w-md">
                <p className="text-sm text-muted-foreground">
                  No pudimos leer esta cuenta de Instagram o todavía no tiene publicaciones. Si el problema sigue, vuelve a conectar la cuenta desde Configuración.
                </p>
              </div>
            </div>
          )}

          {perfil && media.length === 0 && (
            <div className="grid min-h-48 place-items-center rounded-2xl border border-dashed border-border bg-card p-6 text-center">
              <p className="text-sm text-muted-foreground">
                Esta cuenta todavía no tiene publicaciones.
              </p>
            </div>
          )}

          {/* Media grid */}
          {media.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Publicaciones recientes">
              {media.map((m) => {
                const thumbnail = m.thumbnailUrl ?? m.mediaUrl ?? "";
                const caption = resumenCaption(m.caption ?? "");
                const permalink = m.permalink ?? "";
                const date = fechaCorta(m.timestamp ?? "");
                const likeCount = m.likeCount ?? 0;
                const commentsCount = m.commentsCount ?? 0;

                return (
                  <div key={m.id} className="bg-card border border-border rounded-lg shadow-sm overflow-hidden">
                    {thumbnail && (
                      <img src={thumbnail} alt={m.caption ?? ""} className="aspect-square w-full object-cover" />
                    )}
                    <div className="p-4 flex flex-col">
                      {caption && <h4 className="text-sm font-semibold truncate">{caption}</h4>}
                      <p className="text-sm text-muted-foreground">{likeCount} me gusta · {commentsCount} comentarios</p>
                      {date && <p className="text-xs text-muted-foreground">{date}</p>}
                      {permalink && (
                        <a href={permalink} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block underline underline-offset-2 text-sm font-medium hover:underline">
                          Ver en Instagram
                        </a>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}