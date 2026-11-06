"use client";

import { useState } from "react";
import { IconoCanal } from "@/components/chat/IconoCanal";
import { MetaCanales } from "@/components/config/MetaCanales";
import { CanalExterno, type CanalExternoDatos } from "@/components/config/CanalExterno";

type TipoCanal = "cloud_api" | "messenger" | "instagram";

export function Canales({ canales, metaRevision = false }: { canales: CanalExternoDatos[]; metaRevision?: boolean }) {
  const [tipo, setTipo] = useState<TipoCanal>("cloud_api");
  return <div className="max-w-2xl space-y-5">
    <div>
      <p className="mb-2 text-sm font-medium">Tipo de canal</p>
      <div role="tablist" aria-label="Tipo de canal" className="grid grid-cols-3 gap-1.5 sm:gap-2">
        {(["cloud_api", "messenger", "instagram"] as const).map((opcion) => {
          const habilitada = opcion === "cloud_api" || metaRevision;
          const nombre = opcion === "cloud_api" ? "WhatsApp" : opcion === "messenger" ? "Messenger" : "Instagram";
          return <button key={opcion} type="button" role="tab" aria-selected={tipo === opcion} aria-controls="panel-tipo-canal"
            disabled={!habilitada} onClick={() => setTipo(opcion)}
            className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg border px-1.5 py-2.5 text-center text-xs font-medium leading-tight transition-colors sm:flex-row sm:gap-2 sm:px-3 sm:text-sm ${tipo === opcion ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-foreground hover:bg-muted"} disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`}>
            <IconoCanal proveedor={opcion} /><span>{nombre}</span>
            {!habilitada && <span className="text-[12px] font-normal">Próximamente</span>}
          </button>;
        })}
      </div>
    </div>
    <div id="panel-tipo-canal" role="tabpanel">
      {tipo === "cloud_api" ? <MetaCanales canales={canales.filter((c) => c.proveedor === "cloud_api")} />
        : <CanalExterno key={tipo} tipo={tipo} />}
    </div>
    {canales.filter((c) => c.proveedor !== "cloud_api").map((canal) => <CanalExterno key={canal.id} canal={canal} />)}
    <details className="surface p-4">
      <summary className="cursor-pointer text-sm font-medium">Avanzado: canal API</summary>
      <div className="mt-4"><CanalExterno tipo="api" /></div>
    </details>
  </div>;
}
