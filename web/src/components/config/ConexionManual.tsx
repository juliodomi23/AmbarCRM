"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Boton, Campo } from "@/components/ui";
import { toast } from "@/components/Toaster";

type DatosWebhook = { callbackUrl: string | null; verifyToken: string | null; appSecretGlobal: boolean };

/** Conexión manual (WABA ID + Phone Number ID + token), como Chatwoot. Plegada para no confundir al cliente. */
export function ConexionManual() {
  const router = useRouter();
  const [abierta, setAbierta] = useState(false);
  const [webhook, setWebhook] = useState<DatosWebhook | null>(null);
  const [form, setForm] = useState({ nombre: "", wabaId: "", phoneNumberId: "", token: "", appSecret: "" });
  const [guardando, setGuardando] = useState(false);
  const cambiar = (campo: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [campo]: event.target.value });

  async function abrir() {
    setAbierta(!abierta);
    if (webhook) return;
    const response = await fetch("/api/wa/manual");
    if (response.ok) setWebhook(await response.json());
  }

  async function conectar(event: React.FormEvent) {
    event.preventDefault();
    setGuardando(true);
    const response = await fetch("/api/wa/manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form)
    });
    const data = await response.json().catch(() => ({}));
    setGuardando(false);
    if (!response.ok) return toast(data.error || "No se pudo conectar", "error");
    toast(data.aviso || `Conectado: ${data.nombre}${data.telefono ? ` (${data.telefono})` : ""}`, data.aviso ? "error" : "ok");
    setForm({ nombre: "", wabaId: "", phoneNumberId: "", token: "", appSecret: "" });
    router.refresh();
  }

  const copiar = (texto: string | null) => texto && navigator.clipboard.writeText(texto).then(() => toast("Copiado", "ok"));

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <button type="button" onClick={abrir} className="flex w-full items-center justify-between text-left">
        <span>
          <span className="block font-semibold text-foreground">Conexión manual (avanzado)</span>
          <span className="block text-xs text-muted-foreground">
            Con WABA ID, Phone Number ID y token de tu propia app de Meta, sin el botón de Meta.
          </span>
        </span>
        <span aria-hidden="true" className="text-muted-foreground">{abierta ? "▲" : "▼"}</span>
      </button>

      {abierta && (
        <div className="space-y-4">
          <ol className="list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
            <li>En tu app de Meta (developers.facebook.com) agrega el producto WhatsApp.</li>
            <li>
              En WhatsApp → Configuración → Webhook pega la URL y el token de abajo, y suscríbete al campo{" "}
              <b>messages</b>.
            </li>
            <li>
              Crea un usuario del sistema en el Business Manager con permisos <b>whatsapp_business_messaging</b> y{" "}
              <b>whatsapp_business_management</b>, y genera un token <b>permanente</b>.
            </li>
            <li>Copia el WABA ID y el Phone Number ID de WhatsApp → Configuración de la API.</li>
            <li>El App Secret está en Configuración de la app → Básica.</li>
          </ol>

          <div className="grid gap-2 rounded-lg bg-background p-3 text-xs">
            <p className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">URL de devolución de llamada:</span>
              <code className="break-all text-foreground">{webhook?.callbackUrl ?? "Configura NEXTAUTH_URL"}</code>
              {webhook?.callbackUrl && (
                <button type="button" onClick={() => copiar(webhook.callbackUrl)} className="text-primary hover:underline">Copiar</button>
              )}
            </p>
            <p className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground">Token de verificación:</span>
              <code className="break-all text-foreground">{webhook?.verifyToken ?? "Configura META_WEBHOOK_VERIFY_TOKEN"}</code>
              {webhook?.verifyToken && (
                <button type="button" onClick={() => copiar(webhook.verifyToken)} className="text-primary hover:underline">Copiar</button>
              )}
            </p>
          </div>

          <form onSubmit={conectar} className="grid gap-3 sm:grid-cols-2">
            <Campo label="Nombre del canal (opcional)" value={form.nombre} onChange={cambiar("nombre")} placeholder="WhatsApp ventas" />
            <Campo label="WABA ID" value={form.wabaId} onChange={cambiar("wabaId")} inputMode="numeric" required />
            <Campo label="Phone Number ID" value={form.phoneNumberId} onChange={cambiar("phoneNumberId")} inputMode="numeric" required />
            <Campo
              label={webhook?.appSecretGlobal ? "App Secret (si es otra app de Meta)" : "App Secret de tu app"}
              value={form.appSecret}
              onChange={cambiar("appSecret")}
              type="password"
              autoComplete="off"
              required={webhook ? !webhook.appSecretGlobal : false}
            />
            <div className="sm:col-span-2">
              <Campo label="Token permanente" value={form.token} onChange={cambiar("token")} type="password" autoComplete="off" required />
            </div>
            <div className="sm:col-span-2 flex items-center gap-3">
              <Boton type="submit" disabled={guardando}>{guardando ? "Validando con Meta…" : "Conectar"}</Boton>
              <span className="text-xs text-muted-foreground">Se valida con Meta y se guarda cifrado.</span>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
