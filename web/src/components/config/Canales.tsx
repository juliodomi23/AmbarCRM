"use client";

import { useState } from "react";
import { MetaCanales } from "@/components/config/MetaCanales";
import { CanalExterno, type CanalExternoDatos } from "@/components/config/CanalExterno";

export function Canales({ canales }: { canales: CanalExternoDatos[] }) {
  const [tipo, setTipo] = useState("cloud_api");
  const canalesDelTipo = canales.filter((canal) => canal.proveedor === tipo);
  return <div className="space-y-5">
    <label className="block max-w-2xl space-y-1 text-sm font-medium">
      <span>Tipo de canal</span>
      <select className="w-full rounded-lg border border-input bg-background px-3 py-2" value={tipo} onChange={(e) => setTipo(e.target.value)}>
        <option value="cloud_api">WhatsApp</option><option value="messenger">Messenger</option><option value="instagram">Instagram</option><option value="api">API</option>
      </select>
    </label>
    {tipo === "messenger" && <p className="max-w-2xl text-sm text-muted-foreground">Conecta una página con Facebook o configura sus credenciales manualmente. Solo un administrador puede hacerlo.</p>}
    {tipo === "instagram" && <p className="max-w-2xl text-sm text-muted-foreground">Instagram requiere una cuenta profesional vinculada a una página y una conexión manual con credenciales de tu app de Meta. Valida el acceso a mensajes con una cuenta de prueba antes de usarlo con clientes.</p>}
    {tipo === "cloud_api" ? <MetaCanales canales={canalesDelTipo} />
      : <>
        <CanalExterno key={tipo} tipo={tipo as "api" | "messenger" | "instagram"} />
        {canalesDelTipo.length > 0 && <h3 className="text-sm font-semibold">Conexiones existentes</h3>}
        {canalesDelTipo.map((canal) => <CanalExterno key={canal.id} canal={canal} />)}
      </>}
  </div>;
}
