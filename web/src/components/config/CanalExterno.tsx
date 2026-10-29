"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boton, Campo } from "@/components/ui";
import { toast } from "@/components/Toaster";
import { confirmar } from "@/components/Confirmador";
import { MessengerFacebook } from "./MessengerFacebook";
import { nombreVisibleCanal } from "@/lib/channel/tipo-canal";
import { IconoCanal } from "@/components/chat/IconoCanal";
import { mensajeConexionMeta } from "@/lib/meta/mensaje-conexion";

export type CanalExternoDatos = { id: string; nombre: string; proveedor: string; webhookUrl?: string | null; pageId?: string | null; instagramId?: string | null; login?: string | null; username?: string | null; appId?: string | null; tieneAppSecret?: boolean; estado: string; errorAutorizacion?: string | null };

export function CanalExterno({ canal, tipo = "api" }: { canal?: CanalExternoDatos; tipo?: "api" | "messenger" | "instagram" }) {
  const proveedor = canal?.proveedor ?? tipo;
  const esMessenger = proveedor === "messenger";
  const esInstagram = proveedor === "instagram";
  const esMeta = esMessenger || esInstagram;
  const nombreCanal = esInstagram ? "Instagram" : esMessenger ? "Messenger" : "API";
  const router = useRouter();
  const [nombre, setNombre] = useState(canal?.nombre ?? "");
  const [webhook, setWebhook] = useState(canal?.webhookUrl ?? "");
  const [pageId, setPageId] = useState(canal?.pageId ?? "");
  const [instagramId, setInstagramId] = useState(canal?.instagramId ?? "");
  const [token, setToken] = useState("");
  const [appId, setAppId] = useState(canal?.appId ?? "");
  const [appSecret, setAppSecret] = useState("");
  const [secretos, setSecretos] = useState<{ apiKey: string; secret: string } | null>(null);
  const [guardando, setGuardando] = useState(false);
  async function desconectar() {
    if (!canal || !esMeta || guardando) return;
    setGuardando(true);
    try {
      const continuar = await confirmar({
        titulo: `Desconectar ${canal.nombre}`,
        mensaje: canal.login === "instagram" ? "Se cancelará la suscripción en Instagram; el historial se conserva." : "Se cancelará la suscripción en Facebook; el historial se conserva.",
        confirmar: "Desconectar",
      });
      if (!continuar) return;
      const borrarDatos = await confirmar({
        titulo: "¿Borrar también las conversaciones?",
        mensaje: "Se borran los chats de esta página y sus mensajes. No se puede deshacer. Si conservas el historial, la desconexión continúa sin borrarlo.",
        confirmar: "Borrar conversaciones",
        cancelar: "Conservar historial",
      });
      const retirar = (forzar = false) => fetch(`/api/canales/${canal.id}`, {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ borrarDatos, ...(forzar ? { forzar: true } : {}) }),
      });
      let res = await retirar();
      let data = await res.json().catch(() => ({}));
      if (res.status === 502) {
        const forzar = await confirmar({
          titulo: `${canal.login === "instagram" ? "Instagram" : "Facebook"} no permitió cancelar la suscripción. ¿Retirar solo del CRM?`,
          mensaje: canal.login === "instagram" ? "La suscripción puede seguir activa en Instagram. Revoca el acceso desde la configuración de la cuenta. Se respetará tu elección sobre conservar o borrar las conversaciones."
            : "La suscripción puede seguir activa en Facebook. Tendrás que quitar la app desde la configuración de la página. Se respetará tu elección sobre conservar o borrar las conversaciones.",
          confirmar: "Retirar solo del CRM",
          cancelar: "Conservar canal",
        });
        if (!forzar) return;
        res = await retirar(true);
        data = await res.json().catch(() => ({}));
      }
      if (!res.ok) return toast(data.error || "No se pudo desconectar. El canal se conservó; vuelve a intentarlo.", "error");
      const historial = borrarDatos ? "Conversaciones borradas." : "El historial se conservó.";
      const resultado = data.forzado ? `Retiro forzado. ${data.motivo}` : data.desuscrito === false ? data.motivo : canal.login === "instagram" ? "Cuenta desconectada de Instagram." : "Página desconectada de Facebook.";
      toast(`${resultado} ${historial}`, "ok");
      router.refresh();
    } catch {
      toast(`No se pudo desconectar de ${canal.login === "instagram" ? "Instagram" : "Facebook"}. Vuelve a intentarlo.`, "error");
    } finally { setGuardando(false); }
  }
  async function guardar(regenerar = false, quitarApp = false) {
    setGuardando(true);
    try {
      const res = await fetch(canal ? `/api/canales/${canal.id}` : "/api/canales", {
        method: canal ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proveedor, nombre, webhook_url: webhook, regenerar,
          page_id: pageId, instagram_id: esInstagram ? instagramId : undefined, page_access_token: token || undefined,
          app_id: appId || undefined, app_secret: appSecret || undefined, quitar_app: quitarApp || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "No se pudo guardar el canal");
      if (data.apiKey) setSecretos({ apiKey: data.apiKey, secret: data.secret });
      setToken("");
      setAppSecret("");
      if (quitarApp) setAppId("");
      toast(esMeta ? `${nombreCanal} conectado` : "Canal API guardado", "ok");
      router.refresh();
    } catch (e) { toast(e instanceof Error ? e.message : "No se pudo guardar", "error"); }
    finally { setGuardando(false); }
  }
  return <section className="surface max-w-2xl space-y-3 p-4">
    <div className="flex flex-wrap items-center gap-2">
      <h3 className="inline-flex min-w-0 items-center gap-2 font-semibold"><IconoCanal proveedor={proveedor} /><span className="break-words">{canal ? esMeta ? nombreVisibleCanal(canal.nombre, proveedor) : `${nombreCanal} · ${canal.nombre}` : `Nuevo canal ${nombreCanal}`}</span></h3>
    </div>
    {canal && esMeta && (canal.errorAutorizacion ? <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-center text-destructive" role="alert">
      <p className="font-semibold">Requiere reconexión</p>
      <p className="mt-1 text-sm">{mensajeConexionMeta(canal.errorAutorizacion, esInstagram ? "Instagram" : "Messenger")}</p>
    </div> : canal.estado === "conectado" ? <div className="rounded-lg border border-success/30 bg-success/10 p-4 text-center text-success" role="status">
      <svg className="mx-auto mb-2 h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="m8 12 2.5 2.5L16 9" /></svg>
      <p className="font-semibold">¡Conectado con éxito!</p>
      <p className="mt-1 break-words text-sm">{esInstagram && canal.username ? `@${canal.username.replace(/^@/, "")}` : canal.nombre}</p>
    </div> : <p className="rounded-lg border border-border bg-muted p-3 text-center text-sm text-muted-foreground" role="status">Desconectado</p>)}
    {esMeta && <MessengerFacebook proveedor={esInstagram ? "instagram" : "messenger"} canalId={canal?.id} pageId={canal?.pageId} nombre={nombre} login={canal?.login} appPropia={esMessenger && Boolean(appId || appSecret || canal?.tieneAppSecret)} />}
    {canal?.login !== "instagram" && <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void guardar(); }}>
      <Campo label="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required maxLength={150} />
      {esMeta ? <>
        {esInstagram && <Campo label="ID de la cuenta de Instagram (instagram_id)" value={instagramId} onChange={(e) => setInstagramId(e.target.value)} required maxLength={40} />}
        <Campo label="ID de la página (page_id)" value={pageId} onChange={(e) => setPageId(e.target.value)} required />
        <Campo label={canal ? "Token de la página (vacío para conservar)" : "Token de acceso de la página"} type="password" autoComplete="new-password" value={token} onChange={(e) => setToken(e.target.value)} required={!canal} />
        <Campo required={esInstagram} label={esInstagram ? "ID de la app de Meta" : "ID de la app de Meta (opcional)"} value={appId} onChange={(e) => setAppId(e.target.value)} maxLength={40} />
        <Campo required={esInstagram && !canal} label={esInstagram ? "App Secret (vacío para conservar al editar)" : "App Secret (opcional; vacío para conservar)"} type="password" autoComplete="new-password" value={appSecret} onChange={(e) => setAppSecret(e.target.value)} maxLength={8192} />
        <p className="text-xs text-muted-foreground">{esInstagram
          ? "Conecta una cuenta profesional enlazada a esta página, con el token de página y la app propia del cliente. Los mensajes libres requieren una entrada del cliente en las últimas 24 h. Human Agent requiere habilitación de Meta."
          : "Si la página usa otra app de Meta, indica su ID y App Secret. Sin valores propios se usan los del CRM."}</p>
      </> : <Campo label="Webhook de salida (https)" type="url" value={webhook} onChange={(e) => setWebhook(e.target.value)} required />}
      <div className="flex gap-2"><Boton type="submit" disabled={guardando}>Guardar</Boton>
        {canal && esMessenger && (canal.appId || canal.tieneAppSecret) && <Boton type="button" disabled={guardando} onClick={() => void guardar(false, true)}>Quitar app propia</Boton>}
        {canal && !esMeta && <Boton type="button" disabled={guardando} onClick={() => void guardar(true)}>Regenerar credenciales</Boton>}</div>
    </form>}
    {canal && esMeta && <Boton type="button" variante="danger" disabled={guardando} onClick={() => void desconectar()}>Desconectar</Boton>}
    {secretos && <div className="space-y-2 rounded border border-border p-3 text-sm" role="status">
      <p>Guarda estas credenciales. Se muestran una sola vez.</p>
      <p>Clave de entrada (x-api-key): <code className="break-all select-all">{secretos.apiKey}</code></p>
      <p>Secreto de firma: <code className="break-all select-all">{secretos.secret}</code></p>
      <Boton onClick={() => setSecretos(null)}>Ya las guardé</Boton>
    </div>}
  </section>;
}
