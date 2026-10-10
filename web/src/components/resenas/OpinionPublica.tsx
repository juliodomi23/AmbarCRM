"use client";

import { useState } from "react";

/** Estrellas → guarda y salta a Google. El destino lo manda el servidor; la estrella no cambia el camino. */
export function OpinionPublica({ slug, nombre, origen }: { slug: string; nombre: string; origen: string }) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [sobre, setSobre] = useState(0);

  async function elegir(calificacion: number) {
    if (enviando) return;
    setEnviando(true);
    setError("");
    try {
      const respuesta = await fetch(`/api/public/opinion/${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calificacion, origen }),
      });
      const datos = await respuesta.json().catch(() => ({}));
      if (!respuesta.ok || typeof datos.url !== "string") throw new Error(datos.error ?? "No pudimos guardar tu opinión");
      window.location.assign(datos.url);
    } catch (e) {
      setError((e as Error).message);
      setEnviando(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-2xl font-bold">¿Cómo fue tu experiencia en {nombre}?</h1>
      <div className="flex gap-1" onMouseLeave={() => setSobre(0)}>
        {[1, 2, 3, 4, 5].map((estrella) => (
          <button
            key={estrella}
            type="button"
            disabled={enviando}
            aria-label={`${estrella} ${estrella === 1 ? "estrella" : "estrellas"}`}
            onMouseEnter={() => setSobre(estrella)}
            onClick={() => void elegir(estrella)}
            className={`text-5xl transition-transform hover:scale-110 disabled:opacity-60 ${estrella <= sobre ? "text-amber-400" : "text-muted-foreground"}`}
          >
            ★
          </button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        {enviando ? "Un momento, te llevamos a Google…" : "Toca una estrella y te llevamos a Google para dejar tu reseña."}
      </p>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </main>
  );
}
