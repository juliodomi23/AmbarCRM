"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boton, Campo } from "@/components/ui";
import { toast } from "@/components/Toaster";
import { confirmar } from "@/components/Confirmador";
import { MessengerFacebook } from "./MessengerFacebook";

export type CanalExternoDatos = { id: string; nombre: string; proveedor: string; webhookUrl?: string | null; pageId?: string | null; appId?: string | null; tieneAppSecret?: boolean; estado: string; errorAutorizacion?: string | null };

export function CanalExterno({ canal, tipo = "api" }: { canal?: CanalExternoDatos; tipo?: "api" | "messenger" }) {
  const esMessenger = (canal?.proveedor ?? tipo) === "messenger";
  const router = useRouter();
  const [nombre, setNombre] = useState(canal?.nombre ?? "");
  const [webhook, setWebhook] = useState(canal?.webhookUrl ?? "");
  const [pageId, setPageId] = useState(canal?.pageId ?? "");
  const [token, setToken] = useState("");
  const [appId, setAppId] = useState(canal?.appId ?? "");
  const [appSecret, setAppSecret] = useState("");
  const [secretos, setSecretos] = useState<{ apiKey: string; secret: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  async function desconectar() {
    if (!canal || !esMessenger || guardando) return;
    setGuardando(true);
    try {
      const continuar = await confirmar({
        titulo: `Desconectar ${canal.nombre}`,
        mensaje: "Se cancelará la suscripción en Facebook; el historial se conserva.",
        confirmar: "Desconectar",
      });
      if (!continuar) return;
      const borrarDatos = await confirmar({
        titulo: "¿Borrar también las conversaciones?",
        mensaje: "Se borran los chats de esta página y sus mensajes. No se puede deshacer. Si conservas el historial, la desconexión continúa sin borrarlo.",
        confirmar: "Borrar conversaciones",
        cancelar: "Conservar historial",
      });
      const res = await fetch(`/api/canales/${canal.id}`, {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ borrarDatos }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return toast(data.error || "No se pudo desconectar. El canal se conservó; vuelve a intentarlo.", "error");
      const historial = borrarDatos ? "Conversaciones borradas." : "El historial se conservó.";
      toast(data.desuscrito === false ? `${data.motivo} ${historial}` : `Página desconectada de Facebook. ${historial}`, "ok");
      router.refresh();
    } catch {
      toast("No se pudo desconectar de Facebook. Vuelve a intentarlo.", "error");
    } finally { setGuardando(false); }
  }
  async function guardar(regenerar = false, quitarApp = false) {
    setGuardando(true);
    try {
      const res = await fetch(canal ? `/api/canales/${canal.id}` : "/api/canales", {
        method: canal ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proveedor: esMessenger ? "messenger" : "api", nombre, webhook_url: webhook, regenerar,
          page_id: pageId, page_access_token: token || undefined,
          app_id: appId || undefined, app_secret: appSecret || undefined, quitar_app: quitarApp || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo guardar el canal");
      if (data.apiKey) setSecretos({ apiKey: data.apiKey, secret: data.secret });
      setToken("");
      setAppSecret("");
      if (quitarApp) setAppId("");
      toast(esMessenger ? "Página de Messenger conectada" : "Canal API guardado", "ok");
      router.refresh();
    } catch (e) { toast(e instanceof Error ? e.message : "No se pudo guardar", "error"); }
    finally { setGuardando(false); }
  }
  return <section className="surface max-w-2xl space-y-3 p-4">
    <h3 className="font-semibold">{canal ? `${esMessenger ? "Messenger" : "API"} · ${canal.nombre}` : `Nuevo canal ${esMessenger ? "Messenger" : "API"}`}</h3>
    {canal?.errorAutorizacion && <p className="text-sm text-destructive" role="alert">{canal.errorAutorizacion}</p>}
    {esMessenger && <MessengerFacebook canalId={canal?.id} pageId={canal?.pageId} nombre={nombre} appPropia={Boolean(appId || appSecret || canal?.tieneAppSecret)} />}
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void guardar(); }}>
      <Campo label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required maxLength={150} />
      {esMessenger ? <>
        <Campo label="ID de la página (page_id)" value={pageId} onChange={(e) => setPageId(e.target.value)} required />
        <Campo label={canal ? "Token de la página (vacío para conservar)" : "Token de acceso de la página"} type="password" autoComplete="new-password" value={token} onChange={(e) => setToken(e.target.value)} required={!canal} />
        <Campo label="ID de la app de Meta (opcional)" value={appId} onChange={(e) => setAppId(e.target.value)} maxLength={40} />
        <Campo label="App Secret (opcional; vacío para conservar)" type="password" autoComplete="new-password" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} maxLength={8192} />
        <p className="text-xs text-muted-foreground">Si la página usa otra app de Meta, indica su ID y App Secret. Sin valores propios se usan los del CRM.</p>
      </> : <Campo label="Webhook de salida (https)" type="url" value={webhook} onChange={(e) => setWebhook(e.target.value)} required />}
      <div className="flex gap-2"><Boton type="submit" disabled={guardando}>Guardar</Boton>
        {canal && esMessenger && (canal.appId || canal.tieneAppSecret) && <Boton type="button" disabled={guardando} onClick={() => void guardar(false, true)}>Quitar app propia</Boton>}
        {canal && !esMessenger && <Boton type="button" disabled={guardando} onClick={() => void guardar(true)}>Regenerar credenciales</Boton>}</div>
      {canal && esMessenger && <Boton type="button" variante="danger" disabled={guardando} onClick={() => void desconectar()}>Desconectar</Boton>}
    </form>
    {secretos && <div className="space-y-2 rounded border border-border p-3 text-sm" role="status">
      <p>Guarda estas credenciales. Se muestran una sola vez.</p>
      <p>Clave de entrada (x-api-key): <code className="break-all select-all">{secretos.apiKey}</code></p>
      <p>Secreto de firma: <code className="break-all select-all">{secretos.secret}</code></p>
      <Boton onClick={() => setSecretos(null)}>Ya las guardé</Boton>
    </div>}
  </section>;
}
