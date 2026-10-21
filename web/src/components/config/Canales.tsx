"use client";

import { useState } from "react";
import { MetaCanales } from "@/components/config/MetaCanales";
import { CanalExterno, type CanalExternoDatos } from "@/components/config/CanalExterno";

export function Canales({ canales, metaRevision = false }: { canales: CanalExternoDatos[]; metaRevision?: boolean }) {
  const [tipo, setTipo] = useState("cloud_api");
  return <div className="space-y-5">
    <label className="block max-w-2xl space-y-1 text-sm font-medium">
      <span>Tipo de canal</span>
      <select className="w-full rounded-lg border border-input bg-background px-3 py-2" value={tipo} onChange={(e) => setTipo(e.target.value)}>
        <option value="cloud_api">WhatsApp</option><option value="messenger" disabled={!metaRevision}>Messenger{metaRevision ? "" : " (próximamente)"}</option><option value="instagram" disabled={!metaRevision}>Instagram{metaRevision ? "" : " (próximamente)"}</option><option value="api">API</option>
      </select>
    </label>
    {tipo === "cloud_api" ? <MetaCanales canales={canales.filter((c) => c.proveedor === "cloud_api")} />
      : <CanalExterno key={tipo} tipo={tipo as "api" | "messenger" | "instagram"} />}
    {canales.filter((c) => c.proveedor !== "cloud_api").map((canal) => <CanalExterno key={canal.id} canal={canal} />)}
  </div>;
}
