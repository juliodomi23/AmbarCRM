"use client";
import { useEffect, useState } from "react";
import { Boton } from "@/components/ui";
import { confirmar } from "@/components/Confirmador";
import { toast } from "@/components/Toaster";
import { EVENTOS_CRM } from "@/lib/eventos-crm";
import { peticionIntegracion } from "./integraciones-cliente";

type Webhook = { id: string; url: string; eventos: string[]; activo: boolean; ultimoEstado: string | null; ultimoError: string | null };
const ruta = "/api/webhooks-salientes";

export function WebhooksSalientes() {
  const [lista, setLista] = useState<Webhook[]>([]);
  const [url, setUrl] = useState("");
  const [eventos, setEventos] = useState<string[]>(["mensaje.recibido"]);
  const [secreto, setSecreto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [cargado, setCargado] = useState(false);
  async function cargar() {
    const datos = await peticionIntegracion<Webhook[]>(ruta);
    if (datos) setLista(datos);
    setCargado(true);
  }
  useEffect(() => { void cargar(); }, []);
  async function crear(e: React.FormEvent) {
    e.preventDefault(); setOcupado(true); setSecreto("");
    const datos = await peticionIntegracion<Webhook & { secreto: string }>(ruta, "POST", { url, eventos });
    if (datos) { setSecreto(datos.secreto); setUrl(""); await cargar(); }
    setOcupado(false);
  }
  async function actuar(webhook: Webhook, accion: "activar" | "probar" | "eliminar") {
    if (accion === "eliminar" && !await confirmar({ mensaje: "¿Eliminar este webhook saliente?", peligro: true })) return;
    setOcupado(true);
    const datos = await peticionIntegracion<{ ok?: boolean }>(`${ruta}/${webhook.id}${accion === "probar" ? "/probar" : ""}`,
      accion === "probar" ? "POST" : accion === "eliminar" ? "DELETE" : "PATCH", accion === "activar" ? { activo: !webhook.activo } : undefined);
    if (datos && accion === "probar") toast(datos.ok ? "Prueba entregada" : "El receptor no aceptó la prueba", datos.ok ? "ok" : "error");
    await cargar(); setOcupado(false);
  }
  return <section className="surface p-4 space-y-4" aria-label="Webhooks salientes">
    <h2 className="font-semibold">Webhooks salientes</h2>
    <p className="text-sm text-muted-foreground">Recibe eventos firmados en n8n. Máximo 10 destinos por empresa.</p>
    {!cargado && <p role="status">Cargando destinos…</p>}
    {cargado && lista.length === 0 && <p className="text-sm">Aún no hay webhooks.</p>}
    {lista.map((w) => <article key={w.id} className="border border-border rounded-lg p-3 space-y-2">
      <p className="break-all text-sm font-medium">{w.url}</p>
      <p className="text-xs text-muted-foreground">{w.eventos.join(", ")}</p>
      <p className="text-sm">{w.activo ? "Activo" : "Inactivo"} · Último envío: {w.ultimoEstado ?? "sin envíos"}</p>
      {w.ultimoError && <p className="text-sm text-destructive">{w.ultimoError}</p>}
      <div className="flex flex-wrap gap-2">
        <Boton disabled={ocupado} onClick={() => actuar(w, "activar")}>{w.activo ? "Desactivar" : "Activar"}</Boton>
        <Boton disabled={ocupado || !w.activo} onClick={() => actuar(w, "probar")}>Probar</Boton>
        <Boton disabled={ocupado} onClick={() => actuar(w, "eliminar")}>Eliminar</Boton>
      </div>
    </article>)}
    <form onSubmit={crear} className="space-y-3">
      <label className="block text-sm">URL HTTPS<input required type="url" value={url} onChange={(e) => setUrl(e.target.value)} maxLength={2048} placeholder="https://n8n.ejemplo.com/webhook/crm" className="mt-1 w-full rounded border border-input bg-background p-2" /></label>
      <fieldset className="space-y-1"><legend className="text-sm font-medium">Eventos</legend>
        {EVENTOS_CRM.filter((e) => e !== "mensaje.enviado").map((evento) => <label key={evento} className="flex gap-2 text-sm">
          <input type="checkbox" checked={eventos.includes(evento)} onChange={(e) => setEventos(e.target.checked ? [...eventos, evento] : eventos.filter((v) => v !== evento))} />{evento}
        </label>)}
      </fieldset>
      <Boton disabled={ocupado || lista.length >= 10 || eventos.length === 0} type="submit">Agregar webhook</Boton>
    </form>
    {secreto && <div role="status" className="rounded border border-primary p-3 space-y-2">
      <p className="text-sm font-medium">Copia este secreto ahora. Solo se muestra una vez.</p>
      <code className="block break-all select-all text-sm">{secreto}</code>
      <Boton onClick={() => setSecreto("")}>Ya lo copié</Boton>
    </div>}
  </section>;
}

