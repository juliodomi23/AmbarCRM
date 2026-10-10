"use client";

import { useState } from "react";
import { destinoTrasGuardar } from "@/lib/resenas";

/** Estrellas → intenta guardar y salta a Google siempre. El destino lo manda el servidor; la estrella y el resultado del guardado no lo cambian. */
export function OpinionPublica({ slug, nombre, origen, enlaceGoogle }: { slug: string; nombre: string; origen: string; enlaceGoogle: string }) {
  const [enviando, setEnviando] = useState(false);
  const [sobre, setSobre] = useState(0);

  async function elegir(calificacion: number) {
    if (enviando) return;
    setEnviando(true);
    let resultado: { status: number } | Error;
    try {
      const respuesta = await fetch(`/api/public/opinion/${encodeURIComponent(slug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calificacion, origen }),
        signal: AbortSignal.timeout(3000),
      });
      resultado = { status: respuesta.status };
    } catch (e) {
      resultado = e instanceof Error ? e : new Error("sin red");
    }
    window.location.assign(destinoTrasGuardar(resultado, enlaceGoogle));
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
    </main>
  );
}
