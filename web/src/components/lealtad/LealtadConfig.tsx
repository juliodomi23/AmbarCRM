"use client";

import { useEffect, useState } from "react";
import { Boton } from "@/components/ui";
import { toast } from "@/components/Toaster";

type Plantilla = { name: string; language: string; status?: string };

/** Conexión con Aurum y plantilla para avisar premios fuera de la ventana de 24 h. */
export function LealtadConfig({ modulo, canales }: { modulo: any; canales: any[] }) {
  const aurum = modulo.config?.aurum as { slug?: string; estado?: string; error?: string } | undefined;
  const [slug, setSlug] = useState(aurum?.slug ?? "");
  const [clave, setClave] = useState("");
  const [conectando, setConectando] = useState(false);
  const [plantillas, setPlantillas] = useState<Plantilla[]>([]);
  const [plantilla, setPlantilla] = useState(String(modulo.config?.plantillaPremio?.name ?? ""));
  const canalId = String(canales[0]?.id ?? "");

  useEffect(() => {
    if (!canalId) return;
    void fetch(`/api/meta/templates?canalId=${encodeURIComponent(canalId)}`)
      .then((res) => res.json())
      .then((data) =>
        setPlantillas((data.plantillas ?? []).filter((item: Plantilla) => item.status === "APPROVED")),
      );
  }, [canalId]);

  async function conectar() {
    setConectando(true);
    const res = await fetch("/api/lealtad/conexion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, clave }),
    });
    const data = await res.json().catch(() => ({}));
    setConectando(false);
    setClave("");
    toast(res.ok ? "Aurum conectado" : (data.error ?? "No se pudo conectar"), res.ok ? "ok" : "error");
    if (res.ok) location.reload();
  }

  async function desconectar() {
    const res = await fetch("/api/lealtad/conexion", { method: "DELETE" });
    toast(res.ok ? "Aurum desconectado" : "No se pudo desconectar", res.ok ? "ok" : "error");
    if (res.ok) location.reload();
  }

  async function guardarPlantilla() {
    const elegida = plantillas.find((item) => item.name === plantilla);
    const res = await fetch("/api/modulos", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clave: "lealtad",
        config: { plantillaPremio: elegida ? { name: elegida.name, language: elegida.language } : null },
      }),
    });
    toast(res.ok ? "Plantilla guardada" : "No se pudo guardar", res.ok ? "ok" : "error");
  }

  return (
    <div className="mt-4 space-y-4 border-t border-border pt-4">
      {aurum?.slug && (
        <p className="text-sm">
          Conectado a <b>{aurum.slug}</b>{" "}
          {aurum.estado === "error" ? (
            <span className="text-red-600">· {aurum.error ?? "con error"}: vuelve a conectar</span>
          ) : (
            <span className="text-green-700">· funcionando</span>
          )}
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Identificador del negocio en Aurum</span>
          <input
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="mi-barberia"
            className="w-full rounded-lg border p-2"
          />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">Clave del dueño en Aurum</span>
          <input
            type="password"
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            autoComplete="off"
            className="w-full rounded-lg border p-2"
          />
        </label>
      </div>
      <div className="flex gap-2">
        <Boton onClick={conectar} disabled={conectando || !slug || !clave}>
          {aurum?.slug ? "Reconectar" : "Conectar Aurum"}
        </Boton>
        {aurum?.slug && (
          <Boton variante="ghost" onClick={desconectar}>
            Desconectar
          </Boton>
        )}
      </div>
      <label className="block space-y-1">
        <span className="text-sm font-medium">Plantilla para avisar premios (opcional)</span>
        <select
          value={plantilla}
          onChange={(e) => setPlantilla(e.target.value)}
          className="w-full rounded-lg border p-2"
        >
          <option value="">Sin plantilla: solo se avisa si la ventana de 24 h está abierta</option>
          {plantillas.map((item) => (
            <option key={`${item.name}-${item.language}`} value={item.name}>
              {item.name} · {item.language}
            </option>
          ))}
        </select>
        <span className="block text-xs text-muted-foreground">
          Variables: {"{{1}}"} nombre del cliente, {"{{2}}"} premio ganado.
        </span>
      </label>
      <Boton variante="ghost" onClick={guardarPlantilla}>
        Guardar plantilla
      </Boton>
    </div>
  );
}
