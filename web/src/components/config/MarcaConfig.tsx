"use client";

import { ChangeEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { BRAND_PRESETS, BrandPreset, contraste, normalizarMarca, textoSobre } from "@/lib/brand";
import { Boton, Campo } from "@/components/ui";
import { toast } from "@/components/Toaster";

const MAX_LOGO = 300 * 1024;

export function MarcaConfig({ ajustes }: { ajustes: Record<string, unknown> }) {
  const router = useRouter();
  const inicial = normalizarMarca(ajustes);
  const [marca, setMarca] = useState(inicial);
  const [guardando, setGuardando] = useState(false);
  const ratio = useMemo(() => contraste(marca.colorPrimario, textoSobre(marca.colorPrimario)), [marca.colorPrimario]);

  function elegirPreset(preset: BrandPreset) {
    const p = BRAND_PRESETS[preset];
    setMarca((actual) => ({ ...actual, preset, colorPrimario: p.primario, colorAcento: p.acento }));
  }

  function cargarLogo(event: ChangeEvent<HTMLInputElement>) {
    const archivo = event.target.files?.[0];
    if (!archivo) return;
    if (!/[\/](png|webp|svg\+xml)$/i.test(archivo.type) || archivo.size > MAX_LOGO) {
      toast("El logo debe ser PNG, WEBP o SVG y pesar máximo 300 KB", "error");
      event.target.value = "";
      return;
    }
    const lector = new FileReader();
    lector.onload = () => setMarca((actual) => ({ ...actual, logo: String(lector.result) }));
    lector.readAsDataURL(archivo);
  }

  async function guardar() {
    setGuardando(true);
    const res = await fetch("/api/ajustes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        marcaNombre: marca.nombre,
        marcaLogo: marca.logo ?? "",
        marcaColorPrimario: marca.colorPrimario,
        marcaColorAcento: marca.colorAcento,
        marcaPreset: marca.preset
      })
    });
    setGuardando(false);
    if (!res.ok) return toast((await res.json().catch(() => ({}))).error ?? "No se pudo guardar la marca", "error");
    toast("Marca actualizada");
    router.refresh();
  }

  return (
    <div className="grid max-w-5xl gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="surface space-y-5 p-5">
        <div>
          <h2 className="font-semibold">Identidad del cliente</h2>
          <p className="text-sm text-muted-foreground">Personaliza nombre, logo y colores sin afectar los datos ni las integraciones.</p>
        </div>
        <Campo label="Nombre de marca" value={marca.nombre} maxLength={80} onChange={(e) => setMarca({ ...marca, nombre: e.target.value })} />
        <div>
          <label className="mb-1 block text-sm font-medium">Logo</label>
          <input type="file" accept="image/png,image/webp,image/svg+xml" onChange={cargarLogo} className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded-lg file:border-0 file:bg-muted file:px-3 file:py-2 file:font-medium file:text-foreground" />
          <p className="mt-1 text-xs text-muted-foreground">PNG, WEBP o SVG; máximo 300 KB.</p>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">Presets</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {(Object.entries(BRAND_PRESETS) as [BrandPreset, (typeof BRAND_PRESETS)[BrandPreset]][]).map(([id, preset]) => (
              <button key={id} type="button" onClick={() => elegirPreset(id)} aria-pressed={marca.preset === id} className={`flex min-h-11 items-center gap-2 rounded-lg border px-3 text-left text-sm ${marca.preset === id ? "border-primary bg-primary/5" : "hover:bg-muted"}`}>
                <span className="h-4 w-4 rounded-full" style={{ background: preset.primario }} />{preset.nombre}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {(["colorPrimario", "colorAcento"] as const).map((campo) => (
            <label key={campo} className="text-sm font-medium">
              {campo === "colorPrimario" ? "Color primario" : "Color de acento"}
              <span className="mt-1 flex items-center gap-2 rounded-lg border bg-card p-2">
                <input type="color" value={marca[campo]} onChange={(e) => setMarca({ ...marca, [campo]: e.target.value.toUpperCase() })} className="h-8 w-10 cursor-pointer border-0 bg-transparent" />
                <input value={marca[campo]} pattern="#[0-9A-Fa-f]{6}" onChange={(e) => setMarca({ ...marca, [campo]: e.target.value.toUpperCase() })} className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none" />
              </span>
            </label>
          ))}
        </div>
        <p className={`rounded-lg px-3 py-2 text-sm ${ratio >= 4.5 ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
          Contraste del botón: <span className="tnum font-semibold">{ratio.toFixed(2)}:1</span> — {ratio >= 4.5 ? "cumple WCAG AA" : "elige un color con mayor contraste"}.
        </p>
        <Boton type="button" onClick={guardar} disabled={guardando}>{guardando ? "Guardando…" : "Guardar marca"}</Boton>
      </section>
      <aside className="surface overflow-hidden">
        <div className="flex min-h-[420px]">
          <div className="w-28 p-3 text-white" style={{ background: marca.colorPrimario }}>
            {marca.logo ? <Image unoptimized width={36} height={36} src={marca.logo} alt="" className="mb-3 h-9 w-9 rounded-lg bg-white/90 object-contain p-1" /> : <div className="mb-3 grid h-9 w-9 place-items-center rounded-lg bg-white/15 font-bold">{marca.nombre[0] || "A"}</div>}
            <p className="truncate text-xs font-semibold">{marca.nombre || "Mi empresa"}</p>
            <div className="mt-6 space-y-2 text-[10px] text-white/80"><p className="rounded bg-white/15 p-2">Inicio</p><p className="p-2">Chat</p><p className="p-2">Contactos</p></div>
          </div>
          <div className="flex-1 bg-background p-4">
            <p className="text-xs text-muted-foreground">Vista previa</p>
            <h3 className="mt-1 font-semibold">Panel principal</h3>
            <div className="mt-4 rounded-xl border bg-card p-3 shadow-soft"><p className="text-xs text-muted-foreground">Conversaciones</p><p className="tnum mt-1 text-2xl font-bold">24</p></div>
            <button type="button" className="mt-4 rounded-lg px-3 py-2 text-xs font-semibold" style={{ background: marca.colorPrimario, color: textoSobre(marca.colorPrimario) }}>Nueva conversación</button>
            <span className="ml-2 inline-block h-3 w-3 rounded-full" style={{ background: marca.colorAcento }} />
          </div>
        </div>
      </aside>
    </div>
  );
}
