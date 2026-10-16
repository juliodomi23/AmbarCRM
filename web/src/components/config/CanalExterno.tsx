"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boton, Campo } from "@/components/ui";
import { toast } from "@/components/Toaster";

export type CanalExternoDatos = { id: string; nombre: string; proveedor: string; webhookUrl?: string | null; pageId?: string | null; estado: string; errorAutorizacion?: string | null };

export function CanalExterno({ canal }: { canal?: CanalExternoDatos }) {
  const router = useRouter();
  const [nombre, setNombre] = useState(canal?.nombre ?? "");
  const [webhook, setWebhook] = useState(canal?.webhookUrl ?? "");
  const [secretos, setSecretos] = useState<{ apiKey: string; secret: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  async function guardar(regenerar = false) {
    setGuardando(true);
    try {
      const res = await fetch(canal ? `/api/canales/${canal.id}` : "/api/canales", {
        method: canal ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proveedor: "api", nombre, webhook_url: webhook, regenerar }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo guardar el canal");
      if (data.apiKey) setSecretos({ apiKey: data.apiKey, secret: data.secret });
      toast("Canal API guardado", "ok");
      router.refresh();
    } catch (e) { toast(e instanceof Error ? e.message : "No se pudo guardar", "error"); }
    finally { setGuardando(false); }
  }
  return <section className="surface max-w-2xl space-y-3 p-4">
    <h3 className="font-semibold">{canal ? `API · ${canal.nombre}` : "Nuevo canal API"}</h3>
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void guardar(); }}>
      <Campo label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required maxLength={150} />
      <Campo label="Webhook de salida (https)" type="url" value={webhook} onChange={(e) => setWebhook(e.target.value)} required />
      <div className="flex gap-2"><Boton type="submit" disabled={guardando}>Guardar</Boton>
        {canal && <Boton type="button" disabled={guardando} onClick={() => void guardar(true)}>Regenerar credenciales</Boton>}</div>
    </form>
    {secretos && <div className="space-y-2 rounded border border-border p-3 text-sm" role="status">
      <p>Guarda estas credenciales. Se muestran una sola vez.</p>
      <p>Clave de entrada (x-api-key): <code className="break-all select-all">{secretos.apiKey}</code></p>
      <p>Secreto de firma: <code className="break-all select-all">{secretos.secret}</code></p>
      <Boton onClick={() => setSecretos(null)}>Ya las guardé</Boton>
    </div>}
  </section>;
}
